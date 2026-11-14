import { useState, type FormEvent } from 'react';
import { bySeat, handInProgress, LIMITS } from '../../shared/engine';
import { ledger, netsInCents, settleUp } from '../../shared/settle';
import { setSoundEnabled, soundEnabled } from '../lib/device';
import { fmt, money, signed, signedMoney } from '../lib/format';
import { useTable } from '../lib/table';
import { Icon } from './Icon';
import { Invite } from './Invite';
import { Sheet } from './Sheet';

export type SheetName = 'menu' | 'invite' | 'settings' | 'players' | 'settle' | null;

interface Props {
  open: SheetName;
  setOpen: (s: SheetName) => void;
  onDisplay: () => void;
  onLeft: () => void;
}

export function Sheets({ open, setOpen, onDisplay, onLeft }: Props) {
  const { room } = useTable();
  const close = () => setOpen(null);
  return (
    <>
      <Sheet open={open === 'menu'} onClose={close} title="메뉴">
        <Menu setOpen={setOpen} onDisplay={onDisplay} onLeft={onLeft} />
      </Sheet>
      <Sheet open={open === 'invite'} onClose={close} title="친구 초대">
        <Invite code={room.code} qrSize={220} />
      </Sheet>
      <Sheet open={open === 'settings'} onClose={close} title="게임 설정">
        <SettingsForm onDone={close} />
      </Sheet>
      <Sheet open={open === 'players'} onClose={close} title="플레이어">
        <Players />
      </Sheet>
      <Sheet open={open === 'settle'} onClose={close} title="정산">
        <Settle />
      </Sheet>
    </>
  );
}

function Menu({ setOpen, onDisplay, onLeft }: { setOpen: (s: SheetName) => void; onDisplay: () => void; onLeft: () => void }) {
  const { room, game, me, isHost, run, busy, v, away } = useTable();
  const [sound, setSound] = useState(soundEnabled);
  const [confirmLeave, setConfirmLeave] = useState(false);
  const inHand = !!me?.inHand && handInProgress(game);
  const hostAway = !isHost && (!room.hostId || away(room.hostId));

  const item = (label: string, onClick: () => void, opts: { note?: string; danger?: boolean; disabled?: boolean } = {}) => (
    <li>
      <button className="menu-item" data-danger={opts.danger || undefined} onClick={onClick} disabled={opts.disabled || busy}>
        <span>{label}</span>
        {opts.note && <span className="menu-note">{opts.note}</span>}
      </button>
    </li>
  );

  return (
    <div className="menu">
      <ul className="menu-group">
        {room.undoLabel && item('되돌리기', () => run({ type: 'undo', v }).then((ok) => ok && setOpen(null)), { note: room.undoLabel })}
        {item('친구 초대', () => setOpen('invite'), { note: room.code })}
        {item('정산', () => setOpen('settle'))}
        {item('큰 화면 모드', onDisplay, { note: '테이블 가운데 두는 화면' })}
      </ul>

      {me && (
        <ul className="menu-group">
          {item(me.sittingOut ? '싯인' : '싯아웃', () => run({ type: 'sit', out: !me.sittingOut }), {
            note: inHand ? '다음 핸드부터' : undefined,
          })}
          {me.stack === 0 &&
            item(`$리바이 {fmt(game.settings.startingStack)}`, () => run({ type: 'rebuy' }), {
              disabled: inHand,
              note: inHand ? '이번 핸드 후' : undefined,
            })}
          <li>
            <button
              className="menu-item"
              aria-pressed={sound}
              onClick={() => {
                setSoundEnabled(!sound);
                setSound(!sound);
              }}
            >
              <span>내 차례 알림음</span>
              <span className="menu-note">{sound ? '켬' : '끔'}</span>
            </button>
          </li>
        </ul>
      )}

      {(isHost || hostAway) && (
        <ul className="menu-group">
          {isHost && item('게임 설정', () => setOpen('settings'))}
          {isHost && item('플레이어·스택 관리', () => setOpen('players'))}
          {hostAway && item('방장 넘겨받기', () => run({ type: 'takeHost' }))}
        </ul>
      )}

      {me && (
        <ul className="menu-group">
          {confirmLeave ? (
            <li className="confirm-row">
              <span>{isHost ? '방장이 나가면 모두에게 테이블이 닫혀요.' : inHand ? '이번 핸드는 폴드 처리돼요.' : '테이블에서 나갈까요?'}</span>
              <button className="btn btn-quiet btn-sm" onClick={() => setConfirmLeave(false)}>
                취소
              </button>
              <button
                className="btn btn-danger btn-sm"
                disabled={busy}
                onClick={async () => {
                  if (await run({ type: 'leave' })) onLeft();
                }}
              >
                나가기
              </button>
            </li>
          ) : (
            item(isHost ? '테이블 닫고 나가기' : '테이블 나가기', () => setConfirmLeave(true), { danger: true })
          )}
        </ul>
      )}
    </div>
  );
}

function SettingsForm({ onDone }: { onDone: () => void }) {
  const { game, run, busy, v } = useTable();
  const current = game.pendingSettings ?? game.settings;
  const [sb, setSb] = useState(String(current.sb));
  const [bb, setBb] = useState(String(current.bb));
  const [stack, setStack] = useState(String(current.startingStack));

  const n = (s: string) => (s.trim() === '' ? NaN : Number(s));
  const sbN = n(sb);
  const bbN = n(bb);
  const stackN = n(stack);
  // 현금 환산 기능은 쓰지 않아요: 칩 점수로만 정산
  const priceCents = 0;
  const error =
    !Number.isSafeInteger(bbN) || bbN < 1 || bbN > LIMITS.maxBlind
      ? '빅 블라인드는 1 이상의 정수여야 해요'
      : !Number.isSafeInteger(sbN) || sbN < 0 || sbN > bbN
        ? '스몰 블라인드는 0 이상, 빅 블라인드 이하여야 해요'
        : !Number.isSafeInteger(stackN) || stackN < bbN || stackN > LIMITS.maxStack
          ? '시작 스택은 빅 블라인드 이상이어야 해요'
          : null;

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (error) return;
    const ok = await run({
      type: 'settings',
      v,
      settings: { sb: sbN, bb: bbN, startingStack: stackN, buyInPrice: priceCents },
    });
    if (ok) onDone();
  };

  return (
    <form className="stack-form" onSubmit={submit}>
      <div className="field-row">
        <NumberField id="sb" label="스몰 블라인드" value={sb} onChange={setSb} />
        <NumberField id="bb" label="빅 블라인드" value={bb} onChange={setBb} />
      </div>
      <NumberField id="stack" label="시작 스택" value={stack} onChange={setStack} hint="리바이 금액도 같아요" />
      {handInProgress(game) && <p className="hint">변경 사항은 다음 핸드부터 적용돼요.</p>}
      {error && (
        <p className="form-error" role="alert">
          {error}
        </p>
      )}
      <button className="btn btn-primary btn-xl btn-block" disabled={!!error || busy}>
        저장
      </button>
    </form>
  );
}

function NumberField(props: {
  id: string;
  label: string;
  value: string;
  onChange: (s: string) => void;
  hint?: string;
  placeholder?: string;
  decimal?: boolean;
}) {
  return (
    <div className="field">
      <label htmlFor={props.id} className="field-label">
        {props.label}
      </label>
      <input
        id={props.id}
        className="text-input num"
        inputMode={props.decimal ? 'decimal' : 'numeric'}
        value={props.value}
        placeholder={props.placeholder}
        onChange={(e) => props.onChange(e.target.value.replace(props.decimal ? /[^\d.]/g : /\D/g, ''))}
      />
      {props.hint && <span className="hint">{props.hint}</span>}
    </div>
  );
}

function Players() {
  const { game, room, run, busy, v, member } = useTable();
  const [name, setName] = useState('');
  const [editing, setEditing] = useState<string | null>(null);
  const [stack, setStack] = useState('');
  const hand = handInProgress(game);

  const addSeat = async (e: FormEvent) => {
    e.preventDefault();
    if (name.trim() && (await run({ type: 'addSeat', name: name.trim() }))) setName('');
  };

  return (
    <div className="players">
      <ul className="player-rows">
        {bySeat(game).map((p) => {
          const m = member(p.id);
          const locked = hand && p.inHand;
          return (
            <li key={p.id} className="player-row">
              <div className="player-line">
                <span className="lobby-name">
                  {p.name}
                  {room.hostId === p.id && <span className="tag">방장</span>}
                  {m?.manual && <span className="tag">폰 없음</span>}
                </span>
                <span className="num">{fmt(p.stack)}</span>
              </div>
              {editing === p.id ? (
                <form
                  className="inline-form"
                  onSubmit={async (e) => {
                    e.preventDefault();
                    const value = Number(stack);
                    if (!Number.isSafeInteger(value) || value < 0) return;
                    if (await run({ type: 'setStack', v, playerId: p.id, stack: value })) setEditing(null);
                  }}
                >
                  <input
                    className="text-input num"
                    inputMode="numeric"
                    value={stack}
                    autoFocus
                    aria-label={`${p.name}의 새 스택`}
                    onChange={(e) => setStack(e.target.value.replace(/\D/g, ''))}
                  />
                  <button className="btn btn-primary btn-sm" disabled={busy || stack === ''}>
                    적용
                  </button>
                  <button type="button" className="btn btn-quiet btn-sm" onClick={() => setEditing(null)}>
                    취소
                  </button>
                </form>
              ) : (
                <div className="player-actions">
                  <button
                    className="btn btn-quiet btn-sm"
                    disabled={busy || locked}
                    title={locked ? '이번 핸드 후' : undefined}
                    onClick={() => {
                      setEditing(p.id);
                      setStack(String(p.stack));
                    }}
                  >
                    스택 수정
                  </button>
                  <button className="btn btn-quiet btn-sm" disabled={busy} onClick={() => run({ type: 'sit', out: !p.sittingOut, playerId: p.id })}>
                    {p.sittingOut ? '싯인' : '싯아웃'}
                  </button>
                  {m && !m.manual && room.hostId !== p.id && (
                    <button className="btn btn-quiet btn-sm" disabled={busy} onClick={() => run({ type: 'transferHost', playerId: p.id })}>
                      방장 넘기기
                    </button>
                  )}
                  {room.hostId !== p.id && (
                    <button className="btn btn-danger-quiet btn-sm" disabled={busy} onClick={() => run({ type: 'kick', playerId: p.id })}>
                      내보내기
                    </button>
                  )}
                </div>
              )}
            </li>
          );
        })}
      </ul>
      {hand && <p className="hint">핸드에 참여 중인 플레이어의 스택은 핸드가 끝난 뒤에 수정할 수 있어요.</p>}
      <form className="inline-form add-seat" onSubmit={addSeat}>
        <label htmlFor="seat-name" className="field-label">
          폰 없는 사람 추가
        </label>
        <div className="join-row">
          <input
            id="seat-name"
            className="text-input"
            value={name}
            maxLength={24}
            placeholder="이름"
            onChange={(e) => setName(e.target.value)}
          />
          <button className="btn btn-quiet btn-lg" disabled={busy || !name.trim()}>
            <Icon name="plus" size={18} /> 추가
          </button>
        </div>
        <span className="hint">테이블의 누구나 이 사람 대신 베팅할 수 있어요.</span>
      </form>
    </div>
  );
}

function Settle() {
  const { game, nameOf } = useTable();
  const rows = ledger(game);
  const price = game.settings.buyInPrice;
  const cents = netsInCents(rows, price, game.settings.startingStack);
  const useCash = price > 0;
  const transfers = settleUp(rows.map((r) => ({ id: r.id, net: useCash ? (cents.get(r.id) ?? 0) : r.net })));
  const name = (id: string) => rows.find((r) => r.id === id)?.name ?? nameOf(id);

  if (rows.length === 0) return <p className="muted">아직 아무도 플레이하지 않았어요.</p>;

  return (
    <div className="settle">
      <table className="ledger">
        <thead>
          <tr>
            <th scope="col">이름</th>
            <th scope="col" className="num">
              바이인
            </th>
            <th scope="col" className="num">
              스택
            </th>
            <th scope="col" className="num">
              손익
            </th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.id} data-sign={Math.sign(r.net)}>
              <th scope="row">
                {r.name}
                {r.departed && <span className="tag">나감</span>}
              </th>
              <td className="num">{fmt(r.buyIn)}</td>
              <td className="num">{fmt(r.stack)}</td>
              <td className="num net">{useCash ? signedMoney(cents.get(r.id) ?? 0) : signed(r.net)}</td>
            </tr>
          ))}
        </tbody>
      </table>

      <h3 className="settle-title">{transfers.length ? '이렇게 주고받으면 끝' : '전원 본전. 수상한데요?'}</h3>
      {transfers.length > 0 && (
        <ul className="transfers">
          {transfers.map((t, i) => (
            <li key={i}>
              <span>
                <strong>{name(t.from)}</strong> → <strong>{name(t.to)}</strong>
              </span>
              <span className="num">{useCash ? money(t.amount) : `${fmt(t.amount)}칩`}</span>
            </li>
          ))}
        </ul>
      )}
      {handInProgress(game) && <p className="hint">지금 팟에 들어간 칩은 낸 사람 몫으로 계산해요.</p>}
    </div>
  );
}
