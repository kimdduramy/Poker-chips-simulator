import { describe, expect, it } from 'vitest';
import { act, award, boardCards, startHand, type Game } from '../shared/engine';
import { table } from './helpers';

const step = (g: Game, kind: 'call' | 'check' | 'fold') => act(g, g.toActId!, { kind });

/** 지금 스트리트에서 남은 사람 모두 콜/체크 */
function closeStreet(g: Game): Game {
  const street = g.street;
  let s = g;
  while (s.phase === 'betting' && s.street === street) {
    const p = s.players.find((x) => x.id === s.toActId)!;
    s = step(s, s.currentBet > p.bet ? 'call' : 'check');
  }
  return s;
}

describe('boardCards: how many shared cards should be on the table', () => {
  it('is 0 in the lobby and preflop, then 3 / 4 / 5 by street, and 5 at showdown', () => {
    let g = table([1000, 1000, 1000]);
    expect(boardCards(g)).toBe(0);
    g = startHand(g);
    expect(boardCards(g)).toBe(0);
    g = closeStreet(g);
    expect(boardCards(g)).toBe(3);
    g = closeStreet(g);
    expect(boardCards(g)).toBe(4);
    g = closeStreet(g);
    expect(boardCards(g)).toBe(5);
    g = closeStreet(g);
    expect(g.phase).toBe('showdown');
    expect(boardCards(g)).toBe(5);
    g = award(g, Object.fromEntries(g.pots.map((p) => [p.id, ['p0']])));
    expect(g.phase).toBe('done');
    expect(boardCards(g)).toBe(5);
  });

  it('stays where the hand stopped when everyone else folds', () => {
    let g = startHand(table([1000, 1000, 1000]));
    g = closeStreet(g);
    expect(boardCards(g)).toBe(3);
    g = act(g, g.toActId!, { kind: 'raise', amount: 50 });
    g = step(g, 'fold');
    g = step(g, 'fold');
    expect(g.phase).toBe('done');
    expect(boardCards(g)).toBe(3);
  });

  it('shows all 5 when an all-in runs the board out early', () => {
    let g = startHand(table([1000, 1000]));
    g = act(g, g.toActId!, { kind: 'raise', amount: 1000 });
    g = step(g, 'call');
    expect(g.phase).toBe('showdown');
    expect(g.runout).toBe(true);
    expect(boardCards(g)).toBe(5);
  });
});
