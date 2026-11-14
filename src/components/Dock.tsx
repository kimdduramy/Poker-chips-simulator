import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import {
  bySeat,
  eligibleForHand,
  findPlayer,
  legalActions,
  potTotal,
  shareOut,
  type ActionKind,
  type Legal,
  type Player,
} from '../../shared/engine';
import { fmt } from '../lib/format';
import { useTable } from '../lib/table';
import { useShake } from '../lib/motion';
import { Icon } from './Icon';
import { Num } from './Num';

const ACT_FOR_AFTER_MS = 15_000;

export function Dock() {
  const shaking = useShake();
  return (
    <div className="dock-shake" data-shake={shaking || undefined}>
      <DockBody />
    </div>
  );
}

function DockBody() {
  const { game, you, me, room, serverNow, away, member } = useTable();
  const [actingFor, setActingFor] = useState<string | null>(null);

  const actorId = game.toActId;
  useEffect(() => setActingFor(null), [actorId, game.phase]);

  if (game.phase === 'lobby') return <LobbyDock />;
  if (game.phase === 'showdown') return <AwardPanel />;
  if (game.phase === 'done') return <ResultsPanel />;

  if (you.legal && me) return <ActionPanel legal={you.legal} player={me} />;

  const actor = findPlayer(game, actorId);
  const actorMember = member(actorId);
  const waited = room.turnStartedAt ? serverNow - room.turnStartedAt : 0;
  const canActFor = !!actor && !!me && (actorMember?.manual || (away(actorId) && waited >= ACT_FOR_AFTER_MS));

  if (actingFor && actor && actingFor === actor.id) {
    const legal = legalActions(game, actor.id);
    if (legal) {
      return <ActionPanel legal={legal} player={actor} actingFor onCancel={() => setActingFor(null)} />;
    }
  }

  return (
    <div className="dock">
      <MyStatus />
      {canActFor && actor && (
        <button className="btn btn-quiet btn-lg btn-block" onClick={() => setActingFor(actor.id)}>
          {actor.name} 대신 하기
        </button>
      )}
    </div>
  );
}

function MyStatus() {
  const { game, me, run, busy } = useTable();
  if (!me) return null;
  const inHand = me.inHand && (game.phase === 'betting' || game.phase === 'showdown');
  let note: string;
  if (!inHand) note = me.stack === 0 ? '버스트' : me.sittingOut ? '싯아웃' : '다음 핸드부터 참여';
  else if (me.folded) note = '폴드';
  else if (me.allIn) note = '올인';
  else note = me.committed > 0 ? `이번 핸드 ${fmt(me.committed)} 베팅` : '핸드 참여 중';
  const canRebuy = me.stack === 0 && !inHand;
  return (
    <div className="my-status">
      <div>
        <span className="label">내 스택</span>
        <Num value={me.stack} className="my-stack" />
      </div>
      <div className="my-note">
        <span>{note}</span>
        {canRebuy && (
          <button className="btn btn-quiet btn-sm" disabled={busy} onClick={() => run({ type: 'rebuy' })}>
            리바이 {fmt(game.settings.startingStack)}
          </button>
        )}
      </div>
    </div>
  );
}

// ---------------- your turn ----------------

interface ActionProps {
  legal: Legal;
  player: Player;
  actingFor?: boolean;
  onCancel?: () => void;
}

function ActionPanel({ legal, player, actingFor, onCancel }: ActionProps) {
  const { game, run, busy, v } = useTable();
  const [raising, setRaising] = useState(false);
  const pot = potTotal(game);
  const opening = game.currentBet === 0;
  const openLabel = opening ? '벳' : '레이즈';

  const act = (kind: ActionKind, amount?: number) =>
    run({ type: 'act', v, kind, ...(amount !== undefined ? { amount } : {}), ...(actingFor ? { playerId: player.id } : {}) });

  useEffect(() => setRaising(false), [v]);

  useEffect(() => {
    if (raising) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.metaKey || e.ctrlKey || e.altKey || (e.target as HTMLElement)?.closest('input, textarea, dialog[open]')) return;
      const k = e.key.toLowerCase();
      if (k === 'f' && legal.canFold) void act('fold');
      else if (k === 'c') void act(legal.canCheck ? 'check' : 'call');
      else if (k === 'r' && legal.canRaise) setRaising(true);
      else return;
      e.preventDefault();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  });

  if (raising && legal.canRaise) {
    return (
      <RaisePanel
        legal={legal}
        pot={pot}
        currentBet={game.currentBet}
        bb={game.settings.bb}
        opening={opening}
        busy={busy}
        onBack={() => setRaising(false)}
        onConfirm={(amount) => act('raise', amount)}
      />
    );
  }

  const callText = legal.callIsAllIn ? `올인 ${fmt(legal.callAmount)}` : `콜 ${fmt(legal.callAmount)}`;
  const buttons = [
    legal.canFold && { key: 'fold', label: '폴드', hint: 'F', cls: 'btn-turn-quiet', onClick: () => act('fold') },
    legal.canCheck
      ? { key: 'check', label: '체크', hint: 'C', cls: 'btn-turn-main', onClick: () => act('check') }
      : { key: 'call', label: callText, hint: 'C', cls: 'btn-turn-main', onClick: () => act('call') },
    legal.canRaise && { key: 'raise', label: openLabel, hint: 'R', cls: 'btn-turn-quiet', onClick: () => setRaising(true) },
  ].filter(Boolean) as { key: string; label: string; hint: string; cls: string; onClick: () => void }[];

  return (
    <div className="dock dock-turn" data-acting-for={actingFor || undefined} role="region" aria-label={actingFor ? `${player.name} 대신 하는 중` : '내 차례'}>
      <div className="turn-head">
        <div>
          <span className="turn-title">{actingFor ? `${player.name} 대신 하는 중` : '내 차례'}</span>
          <span className="turn-sub">스택 {fmt(player.stack)}</span>
        </div>
        {actingFor && (
          <button className="icon-btn" onClick={onCancel} aria-label="대신 하기 그만두기">
            <Icon name="close" />
          </button>
        )}
      </div>
      <div className="turn-buttons" data-count={buttons.length}>
        {buttons.map((b) => (
          <button key={b.key} className={`btn btn-turn ${b.cls}`} onClick={b.onClick} disabled={busy}>
            {b.label}
            <kbd className="kbd">{b.hint}</kbd>
          </button>
        ))}
      </div>
    </div>
  );
}

interface RaiseProps {
  legal: Legal;
  pot: number;
  currentBet: number;
  bb: number;
  opening: boolean;
  busy: boolean;
  onBack: () => void;
  onConfirm: (amount: number) => void;
}

function RaisePanel({ legal, pot, currentBet, bb, opening: isBet, busy, onBack, onConfirm }: RaiseProps) {
  const min = legal.minRaiseTo;
  const max = legal.maxRaiseTo;
  const [amount, setAmount] = useState(min);
  const [text, setText] = useState(String(min));
  const inputRef = useRef<HTMLInputElement>(null);

  const clamp = (n: number) => Math.max(min, Math.min(max, Math.round(n)));
  const set = (n: number) => {
    const c = clamp(n);
    setAmount(c);
    setText(String(c));
  };

  const presets = useMemo(() => {
    const potAfterCall = pot + legal.toCall;
    const opening = currentBet === 0;
    const half = opening ? pot / 2 : currentBet + potAfterCall / 2;
    const full = opening ? pot : currentBet + potAfterCall;
    return [
      { label: '최소', value: min },
      { label: '1/2 팟', value: clamp(half) },
      { label: '팟', value: clamp(full) },
      { label: '올인', value: max },
    ];
  }, [pot, legal.toCall, currentBet, min, max]);

  const typed = Number(text);
  const valid = Number.isSafeInteger(typed) && typed <= max && (typed >= min || typed === max);
  const final = valid ? typed : amount;
  const allIn = final === max;
  const confirm = () => {
    if (valid && !busy) onConfirm(final);
  };

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onBack();
      else if (e.key === 'Enter') confirm();
      else if (e.key === 'ArrowUp' && e.target !== inputRef.current) set(final + bb);
      else if (e.key === 'ArrowDown' && e.target !== inputRef.current) set(final - bb);
      else if (e.key.toLowerCase() === 'a' && e.target !== inputRef.current) set(max);
      else return;
      e.preventDefault();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  });

  return (
    <div className="dock dock-turn dock-raise">
      <div className="raise-top">
        <button className="icon-btn" onClick={onBack} aria-label="뒤로">
          <Icon name="back" />
        </button>
        <label className="raise-amount">
          <span className="turn-sub">{isBet ? '벳' : '레이즈 총액'}</span>
          <input
            ref={inputRef}
            className="raise-input num"
            inputMode="numeric"
            pattern="[0-9]*"
            value={text}
            aria-invalid={!valid}
            onChange={(e) => {
              const digits = e.target.value.replace(/\D/g, '').slice(0, 10);
              setText(digits);
              const n = Number(digits);
              if (digits && n >= min && n <= max) setAmount(n);
            }}
            onBlur={() => set(Number(text) || min)}
            onFocus={(e) => e.target.select()}
          />
        </label>
        <div className="stepper">
          <button className="icon-btn" onClick={() => set(final - bb)} disabled={final <= min} aria-label={`${bb} 빼기`}>
            <Icon name="minus" />
          </button>
          <button className="icon-btn" onClick={() => set(final + bb)} disabled={final >= max} aria-label={`${bb} 더하기`}>
            <Icon name="plus" />
          </button>
        </div>
      </div>

      <input
        type="range"
        className="slider"
        min={min}
        max={max}
        step={1}
        value={final}
        onChange={(e) => set(Number(e.target.value))}
        aria-label="금액"
        style={{ ['--fill' as string]: `${max === min ? 100 : ((final - min) / (max - min)) * 100}%` }}
      />

      <div className="presets">
        {presets.map((p) => (
          <button
            key={p.label}
            className="preset"
            data-on={final === p.value || undefined}
            aria-pressed={final === p.value}
            onClick={() => set(p.value)}
          >
            {p.label}
          </button>
        ))}
      </div>

      <button className="btn btn-turn btn-turn-main btn-block" onClick={confirm} disabled={!valid || busy}>
        {allIn ? `올인 ${fmt(max)}` : `${isBet ? '벳' : '레이즈'} ${fmt(final)}`}
      </button>
    </div>
  );
}

// ---------------- showdown ----------------

function AwardPanel() {
  const { isHost } = useTable();
  return isHost ? <HostAwardPanel /> : <WaitForHost what="승자를 고르는" />;
}

/** 방장이 아닌 사람에게: 방장이 진행 중이라는 안내 + 방장이 자리를 비웠으면 넘겨받기 */
function WaitForHost({ what, children }: { what: string; children?: ReactNode }) {
  const { room, nameOf, away, run, busy } = useTable();
  const hostAway = !room.hostId || away(room.hostId);
  return (
    <div className="dock">
      {children}
      <p className="dock-wait">{room.hostId ? `방장(${nameOf(room.hostId)})이 ${what} 중이에요` : '방장이 없어요'}</p>
      {hostAway && (
        <button className="btn btn-quiet btn-lg btn-block" disabled={busy} onClick={() => run({ type: 'takeHost' })}>
          방장 넘겨받기
        </button>
      )}
    </div>
  );
}

function HostAwardPanel() {
  const { game, run, busy, v, nameOf } = useTable();
  const open = game.pots.filter((p) => !p.paid);
  const [picks, setPicks] = useState<Record<number, string[]>>({});
  const [touched, setTouched] = useState<Record<number, boolean>>({});

  const toggle = (potId: number, id: string) => {
    const index = open.findIndex((p) => p.id === potId);
    const current = picks[potId] ?? [];
    const nextPick = current.includes(id) ? current.filter((x) => x !== id) : [...current, id];
    const next = { ...picks, [potId]: nextPick };
    // Whoever wins a pot usually has the best hand among everyone in later side pots too.
    open.slice(index + 1).forEach((later) => {
      if (touched[later.id]) return;
      next[later.id] = nextPick.filter((x) => later.eligible.includes(x));
    });
    setPicks(next);
    setTouched({ ...touched, [potId]: true });
  };

  const complete = open.every((p) => (picks[p.id] ?? []).length > 0);
  const potName = (i: number) => (open.length === 1 ? '팟' : i === 0 ? '메인 팟' : `사이드 팟 ${i}`);
  const only = open.length === 1 ? (picks[open[0].id] ?? []) : null;
  const payLabel = !complete
    ? '승자를 선택하세요'
    : only && only.length === 1
      ? `${nameOf(only[0])}에게 ${fmt(open[0].amount)} 지급`
      : only && only.length > 1
        ? `${only.length}명 스플릿 · ${fmt(open[0].amount)}`
        : '팟 지급';

  return (
    <div className="dock dock-award">
      <div className="turn-head">
        <div>
          <span className="turn-title">누가 이겼나요?</span>
          <span className="turn-sub">승자를 모두 선택하세요. 2명 이상이면 스플릿돼요.</span>
        </div>
      </div>
      <div className="pots">
        {open.map((pot, i) => {
          const picked = picks[pot.id] ?? [];
          const cut = shareOut(game, pot.amount, picked);
          const take = new Map(cut.map((c) => [c.id, c.amount]));
          const seats = bySeat(game).filter((p) => pot.eligible.includes(p.id));
          return (
            <fieldset key={pot.id} className="pot-pick">
              <legend>
                <span>{potName(i)}</span>
                <span className="num">{fmt(pot.amount)}</span>
              </legend>
              <div className="win-list">
                {seats.map((p) => {
                  const on = picked.includes(p.id);
                  return (
                    <button key={p.id} className="win-row" aria-pressed={on} onClick={() => toggle(pot.id, p.id)}>
                      <span className="win-box">{on && <Icon name="check" size={15} />}</span>
                      <span className="win-name">{nameOf(p.id)}</span>
                      <span className="win-take num">{on ? `+${fmt(take.get(p.id) ?? 0)}` : picked.length > 0 ? '–' : ''}</span>
                    </button>
                  );
                })}
              </div>
              {picked.length > 1 && <p className="win-note">{chopNote(cut, nameOf)}</p>}
            </fieldset>
          );
        })}
      </div>
      <button
        className="btn btn-primary btn-xl btn-block"
        disabled={!complete || busy}
        onClick={() => run({ type: 'award', v, winners: Object.fromEntries(open.map((p) => [p.id, picks[p.id]])) })}
      >
        {payLabel}
      </button>
    </div>
  );
}

/** Spells out an uneven chop so nobody has to count the odd chips themselves. */
function chopNote(cut: { id: string; amount: number }[], nameOf: (id: string) => string) {
  const low = Math.min(...cut.map((c) => c.amount));
  const odd = cut.filter((c) => c.amount > low);
  if (odd.length === 0) return `${cut.length}명 스플릿, 1인당 ${fmt(low)}.`;
  const names = odd.map((c) => nameOf(c.id));
  const list = names.join(', ');
  return `1인당 ${fmt(low)}. 오드 칩은 버튼 왼쪽부터 ${list}에게.`;
}

// ---------------- hand over ----------------

function ResultsPanel() {
  const { game, run, busy, v, room, me, isHost } = useTable();
  const ready = game.players.filter(eligibleForHand).length >= 2;
  const iAmOut = me && me.stack === 0;
  const rebuy = iAmOut && (
    <button className="btn btn-quiet btn-lg btn-block" disabled={busy} onClick={() => run({ type: 'rebuy' })}>
      리바이 {fmt(game.settings.startingStack)}
    </button>
  );

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.target as HTMLElement)?.closest('input, textarea, dialog[open]')) return;
      if (e.key.toLowerCase() === 'n' && isHost && ready && !busy) {
        e.preventDefault();
        void run({ type: 'next', v });
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  });

  if (!isHost) return <WaitForHost what="다음 핸드를 준비하는">{rebuy}</WaitForHost>;

  return (
    <div className="dock dock-done">
      {rebuy}
      <div className="done-actions">
        {room.undoLabel && (
          <button className="btn btn-quiet btn-lg" disabled={busy} onClick={() => run({ type: 'undo', v })} aria-label="지급 되돌리기">
            <Icon name="undo" />
          </button>
        )}
        <button className="btn btn-primary btn-xl grow" disabled={!ready || busy} onClick={() => run({ type: 'next', v })}>
          {ready ? '다음 핸드 시작' : '스택이 있는 플레이어가 2명 이상 필요해요'}
          {ready && <kbd className="kbd">N</kbd>}
        </button>
      </div>
    </div>
  );
}

// ---------------- lobby ----------------

function LobbyDock() {
  const { game, isHost, room, run, busy, v, nameOf, away } = useTable();
  const ready = game.players.filter(eligibleForHand).length >= 2;
  if (!isHost) {
    const hostAway = !room.hostId || away(room.hostId);
    return (
      <div className="dock">
        <p className="dock-wait">
          {room.hostId ? `${nameOf(room.hostId)}님이 첫 핸드를 시작하길 기다리는 중` : '방장을 기다리는 중'}
        </p>
        {hostAway && (
          <button className="btn btn-quiet btn-lg btn-block" disabled={busy} onClick={() => run({ type: 'takeHost' })}>
            방장 넘겨받기
          </button>
        )}
      </div>
    );
  }
  return (
    <div className="dock">
      <button className="btn btn-primary btn-xl btn-block" disabled={!ready || busy} onClick={() => run({ type: 'start', v })}>
        {ready ? '첫 핸드 시작' : '플레이어가 1명 더 필요해요'}
      </button>
    </div>
  );
}
