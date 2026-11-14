import { bySeat, findPlayer, potTotal } from '../../shared/engine';
import { Qr } from '../components/Qr';
import { outcomeLine } from '../components/Stage';
import { Num } from '../components/Num';
import { seatStatus } from '../components/Seats';
import { useWakeLock } from '../lib/device-features';
import { fmt, NEXT_CARDS, roomUrl, STREET_NAMES } from '../lib/format';
import { useTable } from '../lib/table';

export function Display({ onExit }: { onExit: () => void }) {
  const { room, game, member, away, nameOf, conn } = useTable();
  useWakeLock(true);
  const actor = findPlayer(game, game.toActId);
  const pot = game.phase === 'done' ? game.results.reduce((s, r) => s + r.amount, 0) : potTotal(game);
  const freshStreet = game.phase === 'betting' && game.street > 0 && game.players.every((p) => !p.acted) && game.currentBet === 0;

  let headline = '';
  if (game.phase === 'lobby') headline = 'QR 찍고 들어오세요';
  else if (game.phase === 'betting' && actor) headline = freshStreet ? NEXT_CARDS[game.street] : `${actor.name} 차례`;
  else if (game.phase === 'showdown') headline = game.runout ? '모두 올인. 남은 카드 다 까요.' : '카드 공개!';
  else if (game.phase === 'done') {
    headline = outcomeLine(game, nameOf);
  }

  return (
    <div className="display" data-phase={game.phase}>
      <a className="skip-link" href="#display-main">
        팟으로 바로가기
      </a>
      <header className="display-top">
        <span className="big-code">
          <span className="sr-only">테이블 코드 {room.code.split('').join(' ')}</span>
          <span aria-hidden="true">{room.code}</span>
        </span>
        <span className="display-phase">
          {game.handNo > 0 ? `${game.handNo}번째 판 · ` : ''}
          {game.phase === 'betting' ? STREET_NAMES[game.street] : game.phase === 'lobby' ? '대기실' : game.phase === 'showdown' ? '쇼다운' : '판 종료'}
        </span>
        <button className="link-btn" onClick={onExit}>
          큰 화면 끄기
        </button>
      </header>

      <section id="display-main" className="display-center" tabIndex={-1}>
        <div className="display-pot">
          <span className="label">{game.phase === 'done' ? '지급됨' : '팟'}</span>
          <Num value={pot} className="display-pot-amount" />
        </div>
        <p className="display-headline" aria-live="polite" key={headline}>
          {headline}
        </p>
        {game.phase === 'betting' && game.currentBet > 0 && <p className="display-sub num">현재 베팅 {fmt(game.currentBet)}</p>}
        {conn.status !== 'open' && <p className="display-sub">다시 연결 중…</p>}
      </section>

      <ul className="display-seats">
        {bySeat(game).map((p) => {
          const status = seatStatus(p, game.phase, away(p.id), !!member(p.id)?.manual);
          const hand = game.phase === 'betting' || game.phase === 'showdown';
          return (
            <li
              key={p.id}
              className="display-seat"
              data-acting={game.toActId === p.id || undefined}
              data-dim={(hand && (!p.inHand || p.folded)) || undefined}
            >
              <span className="display-seat-name">
                {p.name}
                {hand && game.buttonId === p.id && <span className="tag">D</span>}
              </span>
              <Num value={p.stack} className="display-seat-stack" />
              <span className="display-seat-foot">
                {hand && p.bet > 0 ? <span className="num">베팅 {fmt(p.bet)}</span> : <span />}
                {status && <span className="muted">{status}</span>}
              </span>
            </li>
          );
        })}
      </ul>

      <footer className="display-foot">
        <Qr value={roomUrl(room.code)} size={112} label={`${room.code} 테이블 참가 QR 코드`} />
        <ol className="display-log">
          {room.log.slice(-4).map((l) => (
            <li key={l.id}>{l.text}</li>
          ))}
        </ol>
      </footer>
    </div>
  );
}
