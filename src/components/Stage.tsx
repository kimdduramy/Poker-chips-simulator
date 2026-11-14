import type { ReactNode } from 'react';
import { findPlayer, potTotal, type Game } from '../../shared/engine';
import { fmt, NEXT_CARDS } from '../lib/format';
import { useTable } from '../lib/table';
import { Num } from './Num';

export function outcomeLine(game: Game, nameOf: (id: string) => string) {
  const winners = [...new Set(game.results.map((r) => r.id))];
  if (winners.length === 0) return '판 종료';
  const names = winners.map(nameOf);
  if (winners.length > 1) {
    const contested = game.pots.filter((pot) => pot.eligible.length > 1);
    const everyPotSplit = contested.every((pot) => game.results.filter((r) => r.potId === pot.id).length > 1);
    return everyPotSplit ? `${names.join(', ')} 나눠 가짐` : `${names.join(', ')} 팟 가져감`;
  }
  const folders = game.players.filter((p) => p.folded).length;
  const walk = game.street === 0 && winners[0] === game.bbId && folders === game.players.length - 1 && game.lastAction?.kind === 'fold';
  return walk ? `${names[0]} 그냥 가져감 (모두 폴드)` : `${names[0]} 승리`;
}

export function Stage() {
  const { game, you, nameOf, room } = useTable();
  const pot = game.phase === 'done' ? game.results.reduce((s, r) => s + r.amount, 0) : potTotal(game);
  const actor = findPlayer(game, game.toActId);
  const freshStreet =
    game.phase === 'betting' && game.street > 0 && game.players.every((p) => !p.acted) && game.currentBet === 0;

  let line: ReactNode = null;
  let lineKey: string = game.phase;
  if (game.phase === 'betting' && actor) {
    const toCall = game.currentBet - actor.bet;
    lineKey = `${game.street}-${actor.id}`;
    line = (
      <>
        {freshStreet && <span className="deal-hint">{NEXT_CARDS[game.street]}</span>}
        <span>
          {actor.id === you.id ? '지금 내' : actor.name} 차례{toCall > 0 ? ` · 콜하려면 ${fmt(toCall)}` : ''}
        </span>
      </>
    );
  } else if (game.phase === 'showdown') {
    line = <span>{game.runout ? '모두 올인. 남은 카드 다 까요.' : '카드 공개!'}</span>;
  } else if (game.phase === 'done') {
    line = <span>{outcomeLine(game, nameOf)}</span>;
  }

  const last = room.log.at(-1);

  return (
    <section className="stage" aria-label="팟">
      <span className="label">{game.phase === 'done' ? '지급됨' : '팟'}</span>
      <Num value={pot} className="pot-amount" />
      <div className="stage-line" key={lineKey}>
        {line}
      </div>
      {game.phase === 'showdown' && game.pots.length > 1 && (
        <ul className="pot-breakdown">
          {game.pots.map((p, i) => (
            <li key={p.id}>
              <span>{i === 0 ? '메인' : `사이드 ${i}`}</span>
              <span className="num">{fmt(p.amount)}</span>
              <span className="muted">{p.paid ? '돌려줌' : `${p.eligible.length}명`}</span>
            </li>
          ))}
        </ul>
      )}
      {game.phase === 'betting' && last && last.kind !== 'hand' && (
        <p className="last-action" key={last.id}>
          {last.text}
        </p>
      )}
    </section>
  );
}
