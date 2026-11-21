import type { CSSProperties, ReactNode } from 'react';
import { boardCards, bySeat, findPlayer, potTotal, type Game, type Player } from '../../shared/engine';
import { dealerTip } from '../lib/dealer';
import { fmt } from '../lib/format';
import { useTable } from '../lib/table';
import { Num } from './Num';
import { CardZone } from './PlayingCard';
import { useHandFocus } from '../lib/handFocus';
import { ScrollBox } from './ScrollBox';
import type { ShownHand } from '../../shared/protocol';

export function outcomeLine(game: Game, nameOf: (id: string) => string, shown: ShownHand[] = []) {
  const winners = [...new Set(game.results.map((r) => r.id))];
  if (winners.length === 0) return '핸드 종료';
  const names = winners.map(nameOf);
  // 카드 모드: 이긴 족보도 같이 (예: 'Ana 승리 · 플러시 (A 하이)')
  const hand = shown.find((s) => s.id === winners[0])?.label;
  if (hand) {
    if (winners.length > 1) {
      const contested = game.pots.filter((pot) => pot.eligible.length > 1);
      const everyPotSplit = contested.every((pot) => game.results.filter((r) => r.potId === pot.id).length > 1);
      if (!everyPotSplit) return `${names.join(', ')} 팟 획득`;
      return `${names.join(', ')} 스플릿 · ${hand}`;
    }
    return `${names[0]} 승리 · ${hand}`;
  }
  if (winners.length > 1) {
    const contested = game.pots.filter((pot) => pot.eligible.length > 1);
    const everyPotSplit = contested.every((pot) => game.results.filter((r) => r.potId === pot.id).length > 1);
    return everyPotSplit ? `${names.join(', ')} 스플릿` : `${names.join(', ')} 팟 획득`;
  }
  const folders = game.players.filter((p) => p.folded).length;
  const walk = game.street === 0 && winners[0] === game.bbId && folders === game.players.length - 1 && game.lastAction?.kind === 'fold';
  return walk ? `${names[0]} 워크 (전원 폴드)` : `${names[0]} 승리`;
}

/**
 * 팟 옆 작은 카드 5장
 * - open: 이미 깔린 카드 (흰색)
 * - deal: 지금 깔 카드 (흰색 + 노란 테두리) — '플랍 오픈' 같은 안내가 뜬 순간, 또는 올인 런아웃
 * - next: 이번 베팅이 끝나면 깔릴 카드 (반투명)
 * - off: 아직 먼 카드 (점선)
 */
function BoardCards({ game, dealing }: { game: Game; dealing: boolean }) {
  if (game.phase === 'lobby') return null;
  const open = boardCards(game);
  const before = [0, 0, 3, 4][game.street];
  const atStreet = [0, 3, 4, 5][game.street];
  const dealFrom = dealing ? before : game.phase === 'showdown' && game.runout ? atStreet : open;
  const next = game.phase === 'betting' && !dealing && game.street < 3 ? [3, 4, 5][game.street] : open;
  const state = (i: number) => (i < dealFrom ? 'open' : i < open ? 'deal' : i < next ? 'next' : 'off');
  const label =
    open === 0 ? '보드 카드 아직 없음 (프리플랍)' : `보드 카드 ${open}장${dealFrom < open ? `, 지금 ${open - dealFrom}장 깔 차례` : ''}`;
  return (
    <span className="board-cards" role="img" aria-label={label}>
      {[0, 1, 2, 3, 4].map((i) => (
        <span key={i} className="board-card" data-state={state(i)} />
      ))}
    </span>
  );
}

export function Stage() {
  const { game, you, nameOf, room } = useTable();
  const focus = useHandFocus();
  const held = room.shown.find((s) => s.id === focus);
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
        <span className="act-line">
          <span className="act-who">
            <span className="act-name">{actor.id === you.id ? '내' : actor.name}</span> 액션
          </span>
          {toCall > 0 && <span className="act-call">콜 {fmt(toCall)}</span>}
        </span>
      </>
    );
  } else if (game.phase === 'showdown') {
    line = <span>{game.runout ? '올인 런아웃' : '핸드를 공개하세요'}</span>;
  } else if (game.phase === 'done' && held) {
    lineKey = `held-${held.id}`;
    line = <span className="held-line">{`${held.id === you.id ? '내 패' : held.name} ${held.label}`}</span>;
  } else if (game.phase === 'done') {
    line = <span>{outcomeLine(game, nameOf, room.shown)}</span>;
  }

  const last = room.log.at(-1);
  // 카드 모드에서 스트리트가 막 넘어갔으면 띠를 띄우지 않으니, 그 스트리트를 끝낸 행동을 여기에 남겨요 (예: 'Cy 체크 → 턴')
  const lastAction = room.log.findLast((e) => e.kind === 'action');
  const lastLine =
    !last
      ? null
      : last.kind !== 'hand'
        ? last.text
        : room.cardMode && freshStreet && lastAction && lastAction.id === last.id - 1
          ? `${lastAction.text} → ${last.text}`
          : null;

  return (
    <section className="stage" aria-label="팟">
      <div className="stage-top">
        <div className="stage-main">
          <div className="stage-label-row">
            <span className="label">{game.phase === 'done' ? '지급됨' : '팟'}</span>
            {!room.cardMode && <BoardCards game={game} dealing={freshStreet} />}
          </div>
          {/* 자리 수가 많아지면 글자를 줄여서 오른쪽 표 크기가 변하지 않게 */}
          <span className="pot-fit" style={{ '--pot-chars': Math.max(3, fmt(pot).length) } as CSSProperties}>
            <Num value={pot} className="pot-amount" />
          </span>
          <div className="stage-line" key={lineKey}>
            {line}
          </div>
        </div>
        {game.phase === 'betting' && <BetBoard game={game} youId={you.id} />}
      </div>
      <CardZone />
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
      {!room.cardMode && <DealerBar game={game} youId={you.id} />}
      {/* 베팅 중에는 줄을 항상 차지해서, 문구가 생기고 사라질 때 아래가 들썩이지 않게 */}
      {game.phase === 'betting' && (
        <p className="last-action" key={lastLine ? last?.id : 'none'}>
          {lastLine ?? '\u00a0'}
        </p>
      )}
    </section>
  );
}

function DealerBar({ game, youId }: { game: Game; youId: string | null }) {
  const tip = dealerTip(game);
  if (!tip) return null;
  const dealer = findPlayer(game, game.buttonId);
  const who = dealer ? (dealer.id === youId ? '딜러 (나)' : `딜러 ${dealer.name}`) : '딜러';
  return (
    <p className="dealer-bar" data-now={tip.now || undefined} key={tip.text}>
      <span className="dealer-who">{who}</span>
      <span className="dealer-tip">{tip.text}</span>
    </p>
  );
}

/** 콜하려면 더 내야 할 칩: 스택보다 많으면 남은 칩만큼(올인)만 낼 수 있어요. */
function owes(game: Game, p: Player): string {
  if (!p.inHand) return '–';
  if (p.folded) return '폴드';
  if (p.allIn) return '올인';
  return fmt(Math.min(Math.max(0, game.currentBet - p.bet), p.stack));
}

/** 팟 옆 표: 참가자별로 지금 내야 할 칩과 이번 판에 낸 칩. 내용이 많으면 안에서 스크롤돼요. */
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
            <th className="num">
              콜<span className="wide-only"> 금액</span>
            </th>
            <th className="num">
              <span className="wide-only">총 베팅</span>
              <span className="narrow-only">총액</span>
            </th>
          </tr>
        </thead>
      </table>
      <ScrollBox className="bet-board-scroll">
      <table aria-label="베팅 현황">
        <BoardCols />
        <tbody>
          {rows.map((p) => {
            // 이번 핸드에 지금까지 낸 칩 전부 (블라인드 포함)
            const total = p.committed;
            return (
              <tr key={p.id} data-acting={game.toActId === p.id || undefined} data-dim={p.folded || !p.inHand || undefined}>
                <th scope="row">
                  <span className="bet-board-name">{p.name}</span>
                  {p.id === youId && <span className="bet-board-you">나</span>}
                </th>
                <td className="num">{owes(game, p)}</td>
                <td className="num">{total > 0 ? fmt(total) : '–'}</td>
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
      <col style={{ width: '38%' }} />
      <col style={{ width: '27%' }} />
      <col style={{ width: '35%' }} />
    </colgroup>
  );
}
