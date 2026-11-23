import { useEffect, useState } from 'react';
import { formatMjHistory } from '../../shared/mahjong/record';
import { cardRankText, cardSuitSymbol, isRed, type Card } from '../../shared/cards';
import { findPlayer } from '../../shared/engine';
import type { HandRecord } from '../../shared/protocol';
import { fetchHistory } from '../lib/api';
import { deviceToken } from '../lib/device';
import { fmt } from '../lib/format';
import { formatHistory } from '../lib/handHistory';
import { useTable } from '../lib/table';
import { toast } from './Toast';

/**
 * 메뉴 → 기록: 핸드마다 기보로 보여줘요 (새 핸드가 위).
 * 진행 중인 핸드는 지금 화면 정보로, 끝난 핸드는 서버 기록(공개 정보)으로 그려요.
 * 맨 위 버튼으로 누구나 기보를 글로 복사할 수 있고, 디버그 코드를 넣으면 모두의 시작 패까지 복사돼요.
 */
export function GameLog() {
  const { room, game } = useTable();
  const [hands, setHands] = useState<HandRecord[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  // 핸드가 끝나거나 새로 시작하면 다시 받아요
  const doneKey = `${game.handNo}:${game.phase === 'done'}`;

  useEffect(() => {
    let alive = true;
    fetchHistory(room.code, deviceToken())
      .then((r) => alive && (setHands(r.hands), setError(null)))
      .catch((e) => alive && setError((e as Error).message));
    return () => {
      alive = false;
    };
  }, [room.code, doneKey]);

  const live = useLiveHand();
  const finished = [...(hands ?? [])].reverse().filter((h) => h.handNo !== live?.handNo);
  const all = live ? [live, ...finished] : finished;

  return (
    <div className="game-log">
      <CopyHistory />
      {error && <p className="form-error">{error}</p>}
      {all.length === 0 ? (
        <p className="muted">{hands === null && !error ? '불러오는 중…' : '아직 기록이 없어요.'}</p>
      ) : (
        all.map((h) => <HandView key={h.handNo} hand={h} live={h === live} />)
      )}
      <p className="hint">기호 읽는 법은 도움말 → 용어 → 기록에 있어요.</p>
    </div>
  );
}

/** 지금 진행 중인(또는 방금 끝나 아직 기록을 못 받은) 핸드를 화면 정보로 */
function useLiveHand(): HandRecord | null {
  const { room, game, nameOf } = useTable();
  if (game.handNo === 0 || game.phase === 'lobby') return null;
  const name = (id: string) => findPlayer(game, id)?.name ?? nameOf(id);
  const totals = new Map<string, number>();
  if (game.phase === 'done') for (const r of game.results) totals.set(r.id, (totals.get(r.id) ?? 0) + r.amount);
  return {
    handNo: game.handNo,
    startedAt: Date.now(),
    cardMode: room.cardMode,
    sb: game.settings.sb,
    bb: game.settings.bb,
    button: game.buttonId ? name(game.buttonId) : '',
    actions: (game.actions ?? []).map((a) => ({ street: a.street, name: name(a.id), kind: a.kind, to: a.to, allIn: a.allIn })),
    board: room.board,
    shown: room.shown.map((s) => ({ name: s.name, cards: s.cards, category: -1, label: s.label })),
    winners: [...totals].map(([id, amount]) => ({ name: name(id), amount })),
  };
}

const STREET_LABEL = ['P', 'F', 'T', 'R'];
const STREET_NAME = ['프리플랍', '플랍', '턴', '리버'];

function CardText({ card }: { card: Card }) {
  return (
    <span className="nt-card" data-red={isRed(card) || undefined}>
      {cardRankText(card)}
      {cardSuitSymbol(card)}
    </span>
  );
}

function actionCode(a: HandRecord['actions'][number], betBefore: boolean) {
  const bang = a.allIn ? '!' : '';
  if (a.kind === 'check') return 'x';
  if (a.kind === 'fold') return 'f';
  if (a.kind === 'call') return `c${bang}`;
  return `${a.street > 0 && !betBefore ? 'b' : 'r'}${fmt(a.to)}${bang}`;
}

/** 한 핸드: 머리줄 + 스트리트마다 한 줄 + 쇼다운/승자 */
function HandView({ hand: h, live }: { hand: HandRecord; live: boolean }) {
  const boardFor = [[], h.board.slice(0, 3), h.board.slice(3, 4), h.board.slice(4, 5)];
  const won = new Map(h.winners.map((w) => [w.name, w.amount]));
  // 행동이 있거나 카드가 깔린 스트리트만 (올인 런아웃이면 카드만 있는 줄)
  const streets = [0, 1, 2, 3].filter((st) => h.actions.some((a) => a.street === st) || boardFor[st].length > 0);

  return (
    <section className="nt-hand" aria-label={`핸드 ${h.handNo}`}>
      <header className="nt-head">
        <span className="nt-no">#{h.handNo}</span>
        <span className="nt-meta">
          블라인드 {fmt(h.sb)}/{fmt(h.bb)}
        </span>
        {h.button && <span className="nt-meta">D {h.button}</span>}
        {live && h.winners.length === 0 && <span className="nt-live">진행 중</span>}
      </header>
      <ol className="nt-streets">
        {streets.map((st) => {
          let bet = false;
          return (
            <li key={st} className="nt-street">
              <span className="nt-st" title={STREET_NAME[st]}>
                {STREET_LABEL[st]}
              </span>
              <span className="nt-body">
                {boardFor[st].length > 0 && (
                  <span className="nt-board">
                    {boardFor[st].map((c) => (
                      <CardText key={c} card={c} />
                    ))}
                  </span>
                )}
                {h.actions
                  .filter((a) => a.street === st)
                  .map((a, i) => {
                    const code = actionCode(a, bet);
                    if (a.kind === 'raise') bet = true;
                    return (
                      <span key={i} className="nt-act">
                        <span className="nt-name">{a.name}</span>
                        <span className="nt-code" data-k={code[0]} data-allin={a.allIn || undefined}>
                          {code}
                        </span>
                      </span>
                    );
                  })}
              </span>
            </li>
          );
        })}
      </ol>
      {(h.shown.length > 0 || h.winners.length > 0) && (
        <ul className="nt-result">
          {h.shown.map((s) => (
            <li key={s.name} className="nt-res" data-won={won.has(s.name) || undefined}>
              <span className="nt-st">SD</span>
              <span className="nt-name">{s.name}</span>
              <span className="nt-board">
                {s.cards.map((c) => (
                  <CardText key={c} card={c} />
                ))}
              </span>
              <span className="nt-label">{s.label}</span>
              {won.has(s.name) && <span className="nt-won">+{fmt(won.get(s.name)!)}</span>}
            </li>
          ))}
          {h.winners
            .filter((w) => !h.shown.some((s) => s.name === w.name))
            .map((w) => (
              <li key={w.name} className="nt-res" data-won>
                <span className="nt-st">*</span>
                <span className="nt-name">{w.name}</span>
                <span className="nt-won">+{fmt(w.amount)}</span>
              </li>
            ))}
        </ul>
      )}
    </section>
  );
}

/**
 * 기록 복사: 누구나 공개 정보 기보를 복사해요.
 * 디버그 복사: 디버그 코드(방 코드를 거꾸로)를 넣으면 모두의 시작 패(H 줄)까지 복사돼요.
 * 클립보드가 막힌 브라우저에서는 글 상자를 띄워 직접 복사하게 해요.
 */
function CopyHistory() {
  const { room } = useTable();
  const [busy, setBusy] = useState(false);
  const [fallback, setFallback] = useState<string | null>(null);
  const [debugOpen, setDebugOpen] = useState(false);
  const [code, setCode] = useState('');

  const copy = async (debug?: string) => {
    setBusy(true);
    try {
      const r = await fetchHistory(room.code, deviceToken(), debug);
      if (r.gameType === 'mahjong') {
        const rounds = r.mjRounds ?? [];
        if (!rounds.length) {
          toast('아직 끝난 국이 없어요');
          return;
        }
        const text = formatMjHistory(r.code, rounds);
        try {
          await navigator.clipboard.writeText(text);
          toast(`${rounds.length}국 ${r.debug ? '디버그 ' : ''}기보를 복사했어요`);
          setFallback(null);
        } catch {
          setFallback(text);
        }
        if (r.debug) {
          setDebugOpen(false);
          setCode('');
        }
        return;
      }
      if (!r.hands.length) {
        toast('아직 끝난 핸드가 없어요');
        return;
      }
      const text = formatHistory(r.code, r.cardMode, r.hands);
      try {
        await navigator.clipboard.writeText(text);
        toast(`핸드 ${r.hands.length}판 ${r.debug ? '디버그 ' : ''}기록을 복사했어요`);
        setFallback(null);
      } catch {
        setFallback(text);
      }
      if (r.debug) {
        setDebugOpen(false);
        setCode('');
      }
    } catch (e) {
      toast((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="history-copy">
      <div className="history-copy-row">
        <button className="btn btn-quiet grow" onClick={() => copy()} disabled={busy}>
          {busy ? '가져오는 중…' : '기록 복사'}
        </button>
        <button className="link-btn" onClick={() => setDebugOpen((o) => !o)} aria-expanded={debugOpen}>
          디버그 복사
        </button>
      </div>
      {debugOpen && (
        <form
          className="history-debug"
          onSubmit={(e) => {
            e.preventDefault();
            if (code.trim()) void copy(code);
          }}
        >
          <input
            className="text-input"
            value={code}
            onChange={(e) => setCode(e.target.value.toUpperCase())}
            placeholder="디버그 코드"
            aria-label="디버그 코드"
            autoCapitalize="characters"
            autoComplete="off"
            maxLength={16}
            autoFocus
          />
          <button className="btn btn-primary" disabled={busy || !code.trim()}>
            복사
          </button>
        </form>
      )}
      {fallback && (
        <textarea className="text-input history-text" readOnly value={fallback} rows={8} onFocus={(e) => e.currentTarget.select()} aria-label="핸드 기록" />
      )}
    </div>
  );
}
