import type { ReactNode } from 'react';
import { boardCards, bySeat, findPlayer, potTotal, type Game, type Player } from '../../shared/engine';
import { fmt, NEXT_CARDS } from '../lib/format';
import { useTable } from '../lib/table';
import { Num } from './Num';
import { ScrollBox } from './ScrollBox';

export function outcomeLine(game: Game, nameOf: (id: string) => string) {
  const winners = [...new Set(game.results.map((r) => r.id))];
  if (winners.length === 0) return '핸드 종료';
  const names = winners.map(nameOf);
  if (winners.length > 1) {
    const contested = game.pots.filter((pot) => pot.eligible.length > 1);
    const everyPotSplit = contested.every((pot) => game.results.filter((r) => r.potId === pot.id).length > 1);
    return everyPotSplit ? `${names.join(', ')} 스플릿` : `${names.join(', ')} 팟 획득`;
  }
  const folders = game.players.filter((p) => p.folded).length;
  const walk = game.street === 0 && winners[0] === game.bbId && folders === game.players.length - 1 && game.lastAction?.kind === 'fold';
  return walk ? `${names[0]} 워크 (전원 폴드)` : `${names[0]} 승리`;
}

/** 팟 옆 작은 카드 5장: 깔린 만큼 켜져요. 막 깔 차례인 카드는 깜빡여요. */
function BoardCards({ game, dealing }: { game: Game; dealing: boolean }) {
  if (game.phase === 'lobby') return null;
  const open = boardCards(game);
  const fresh = dealing ? [0, 3, 1, 1][game.street] : 0;
  const label = open === 0 ? '보드 카드 아직 없음 (프리플랍)' : `보드 카드 ${open}장 공개`;
  return (
    <span className="board-cards" role="img" aria-label={label}>
      {[0, 1, 2, 3, 4].map((i) => (
        <span
          key={i}
          className="board-card"
          data-on={i < open || undefined}
          data-new={(i < open && i >= open - fresh) || undefined}
        />
      ))}
    </span>
  );
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
        <span className="act-line">
          <span>{actor.id === you.id ? '내' : actor.name} 액션</span>
          {toCall > 0 && <span className="act-call">콜 {fmt(toCall)}</span>}
        </span>
      </>
    );
  } else if (game.phase === 'showdown') {
    line = <span>{game.runout ? '올인 · 런아웃' : '핸드를 공개하세요'}</span>;
  } else if (game.phase === 'done') {
    line = <span>{outcomeLine(game, nameOf)}</span>;
  }

  const last = room.log.at(-1);

  return (
    <section className="stage" aria-label="팟">
      <div className="stage-top">
        <div className="stage-main">
          <div className="stage-label-row">
            <span className="label">{game.phase === 'done' ? '지급됨' : '팟'}</span>
            <BoardCards game={game} dealing={freshStreet} />
          </div>
          <Num value={pot} className="pot-amount" />
          <div className="stage-line" key={lineKey}>
            {line}
          </div>
        </div>
        {game.phase === 'betting' && <BetBoard game={game} youId={you.id} />}
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

/** 콜하려면 더 내야 할 칩: 스택보다 많으면 남은 칩만큼(올인)만 낼 수 있어요. */
function owes(game: Game, p: Player): string {
  if (!p.inHand) return '–';
  if (p.folded) return '폴드';
  if (p.allIn) return '올인';
  return fmt(Math.min(Math.max(0, game.currentBet - p.bet), p.stack));
}

/** 팟 옆 표: 참가자별로 지금 내야 할 칩과 방금 추가로 넣은 칩. 내용이 많으면 안에서 스크롤돼요. */
function BetBoard({ game, youId }: { game: Game; youId: string | null }) {
  const rows = bySeat(game).filter((p) => p.inHand || p.committed > 0);
  return (
    <div className="bet-board" role="region" aria-label="참가자별 베팅 현황">
      {/* 머리줄은 스크롤 영역 밖에 따로 두어 내용이 그 밑으로 비치지 않게 */}
      <table className="bet-board-head" aria-hidden="true">
        <BoardCols />
        <thead>
          <tr>
            <th>플레이어</th>
            <th className="num">콜 금액</th>
            <th className="num">직전 베팅</th>
          </tr>
        </thead>
      </table>
      <ScrollBox className="bet-board-scroll">
      <table aria-label="베팅 현황">
        <BoardCols />
        <tbody>
          {rows.map((p) => {
            const added = p.lastPaid ?? 0;
            return (
              <tr key={p.id} data-acting={game.toActId === p.id || undefined} data-dim={p.folded || !p.inHand || undefined}>
                <th scope="row">
                  <span className="bet-board-name">{p.name}</span>
                  {p.id === youId && <span className="bet-board-you">나</span>}
                </th>
                <td className="num">{owes(game, p)}</td>
                <td className="num">{added > 0 ? `+${fmt(added)}` : '–'}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
      </ScrollBox>
    </div>
  );
}

/** 머리줄 표와 내용 표의 칸 너비를 똑같이 맞춰요. */
function BoardCols() {
  return (
    <colgroup>
      <col style={{ width: '42%' }} />
      <col style={{ width: '27%' }} />
      <col style={{ width: '31%' }} />
    </colgroup>
  );
}
