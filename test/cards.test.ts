import { createRequire } from 'node:module';
import { describe, expect, it } from 'vitest';
import { evaluate, newDeck, shuffle, winnersOf, type Card } from '../shared/cards';
import { mulberry32 } from './helpers';

// 정답 비교용: 많이 쓰이는 JS 족보 판정기 (테스트에서만 써요)
const { Hand } = createRequire(import.meta.url)('pokersolver') as {
  Hand: {
    solve(cards: string[]): unknown;
    winners(hands: unknown[]): unknown[];
  };
};

const h = (s: string) => evaluate(s.split(' ') as Card[]);

describe('evaluate', () => {
  it('names every category', () => {
    expect(h('As Ks Qs Js Ts 2d 3c').label).toBe('로열 플러시');
    expect(h('9h 8h 7h 6h 5h Ad Ac').label).toBe('스트레이트 플러시 (9 하이)');
    expect(h('Kd Kc Kh Ks 3d 3c 2h').label).toBe('포카드 (K)');
    expect(h('Qs Qh Qd 7c 7h 2s 3s').label).toBe('풀하우스 (Q, 7)');
    expect(h('Ad Jd 8d 5d 2d Kc Qh').label).toBe('플러시 (A 하이)');
    expect(h('Tc 9d 8s 7h 6c 2d 2h').label).toBe('스트레이트 (10 하이)');
    expect(h('8s 8h 8d Kc 4h 2s 3c').label).toBe('트리플 (8)');
    expect(h('Js Jd 4c 4h As 2d 7c').label).toBe('투페어 (J, 4)');
    expect(h('Th Tc Ad 7s 3c 2d 5h').label).toBe('원페어 (10)');
    expect(h('As Jd 8c 6h 2s 3d 4c').label).toBe('하이카드 (A)');
  });

  it('handles the wheel and steel wheel as five-high', () => {
    const wheel = h('Ah 2c 3d 4s 5h Kd Qc');
    expect(wheel.label).toBe('스트레이트 (5 하이)');
    expect(wheel.best).toEqual(['5h', '4s', '3d', '2c', 'Ah']);
    expect(h('6c 2c 3d 4s 5h Kd Qc').score).toBeGreaterThan(wheel.score);
    expect(h('Ac 2c 3c 4c 5c Kd Qh').label).toBe('스트레이트 플러시 (5 하이)');
  });

  it('picks the best of three pairs and kickers', () => {
    const v = h('Ah Ad Kc Kd 2s 2h 9c');
    expect(v.label).toBe('투페어 (A, K)');
    expect(v.best.map((c) => c[0])).toEqual(['A', 'A', 'K', 'K', '9']);
  });

  it('plays the board as a tie', () => {
    const board = 'As Ks Qs Js Ts';
    expect(winnersOf([
      { id: 'a', value: h(`${board} 2c 3d`) },
      { id: 'b', value: h(`${board} 4c 5d`) },
    ])).toEqual(['a', 'b']);
  });

  it('agrees with pokersolver on random showdowns', () => {
    const rand = mulberry32(7);
    const randInt = (n: number) => Math.floor(rand() * n);
    for (let round = 0; round < 3000; round++) {
      const deck = shuffle(newDeck(), randInt);
      const players = 2 + (round % 7);
      const board = deck.slice(0, 5);
      const hands = Array.from({ length: players }, (_, i) => [...board, deck[5 + i * 2], deck[6 + i * 2]]);
      const mine = winnersOf(hands.map((cards, i) => ({ id: String(i), value: evaluate(cards) })));
      const solved = hands.map((cards) => Hand.solve(cards));
      const theirs = Hand.winners(solved).map((w) => String(solved.indexOf(w)));
      expect(mine.sort(), hands.map((c) => c.join(' ')).join(' | ')).toEqual(theirs.sort());
    }
  });
});

describe('deck', () => {
  it('has 52 distinct cards and shuffling keeps them', () => {
    const deck = newDeck();
    expect(new Set(deck).size).toBe(52);
    const rand = mulberry32(1);
    const mixed = shuffle(deck, (n) => Math.floor(rand() * n));
    expect([...mixed].sort()).toEqual([...deck].sort());
    expect(mixed).not.toEqual(deck);
  });
});

describe('made cards', () => {
  const made = (s: string) => h(s).made.map((c) => c[0]).sort().join('');
  it('keeps only the cards that make the hand, not the kickers', () => {
    expect(made('Th Tc Ad 7s 3c 2d 5h')).toBe('TT');
    expect(made('Js Jd 4c 4h As 2d 7c')).toBe('44JJ');
    expect(made('8s 8h 8d Kc 4h 2s 3c')).toBe('888');
    expect(made('Kd Kc Kh Ks 3d 3c 2h')).toBe('KKKK');
    expect(made('As Jd 8c 6h 2s 3d 4c')).toBe('A');
    expect(h('Qs Qh Qd 7c 7h 2s 3s').made).toHaveLength(5);
    expect(h('Ad Jd 8d 5d 2d Kc Qh').made).toHaveLength(5);
    expect(h('Ah 2c 3d 4s 5h Kd Qc').made).toHaveLength(5);
  });
});
