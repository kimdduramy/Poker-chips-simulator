// 카드 모드 쇼다운: 앱이 카드를 알고 있으니 팟마다 승자를 직접 정해서 지급해요.
import { evaluate, winnersOf, type Card, type HandValue } from './cards';
import { award, boardCards, livePlayers, type Game } from './engine';

export interface Deal {
  handNo: number;
  /** 보드 5장 (아직 안 깐 카드 포함, 서버에만 있어요) */
  board: Card[];
  /** 플레이어별 홀카드 2장 */
  hole: Record<string, Card[]>;
}

/** 지금 모두에게 보여도 되는 보드 카드 */
export function visibleBoard(g: Game, deal: Deal | null | undefined): Card[] {
  if (!deal || deal.handNo !== g.handNo || g.handNo === 0) return [];
  return deal.board.slice(0, boardCards(g));
}

export function handValue(deal: Deal, id: string): HandValue | null {
  const hole = deal.hole[id];
  return hole ? evaluate([...hole, ...deal.board]) : null;
}

/** 쇼다운에 왔으면 남은 팟을 족보대로 나눠 주고, 카드를 깐 사람을 기록해요. */
export function autoAward(g: Game, deal: Deal): Game {
  if (g.phase !== 'showdown' || deal.handNo !== g.handNo) return g;
  const live = livePlayers(g).map((p) => p.id);
  const values = new Map(live.map((id) => [id, handValue(deal, id)]));
  const winners: Record<string, string[]> = {};
  for (const pot of g.pots.filter((p) => !p.paid)) {
    const hands = pot.eligible.flatMap((id) => {
      const value = values.get(id);
      return value ? [{ id, value }] : [];
    });
    // 카드가 없는 사람만 남는 일은 없어야 하지만, 그래도 팟이 멈추지 않게 나눠 줘요
    winners[String(pot.id)] = hands.length > 0 ? winnersOf(hands) : pot.eligible;
  }
  const next = award(g, winners);
  next.reveal = live.length > 1 ? live : null;
  return next;
}
