import { describe, expect, it } from 'vitest';
import { cryptoRandInt, newDeck, rankOf, shuffle, suitOf, type Card } from '../shared/cards';

/**
 * 섞기 공정성: 서버와 똑같이 cryptoRandInt로 섞고(사람마다 2장, 보드 5장) 이론 확률과 비교해요.
 * 무작위라서 허용 범위를 넉넉히(표준편차의 5배) 잡아, 망가진 섞기는 잡고 정상은 거의 실패하지 않게 했어요.
 */
const N = 40_000;
const decks: Card[][] = Array.from({ length: N }, () => shuffle(newDeck(), cryptoRandInt));

/** 비율이 이론값에서 표준편차 5배 안에 있는지 */
function near(hits: number, trials: number, p: number) {
  const sd = Math.sqrt((p * (1 - p)) / trials);
  expect(Math.abs(hits / trials - p), `실제 ${(hits / trials).toFixed(4)}, 이론 ${p.toFixed(4)}`).toBeLessThan(5 * sd);
}

const C = (n: number, k: number) => {
  let r = 1;
  for (let i = 0; i < k; i++) r = (r * (n - i)) / (i + 1);
  return r;
};

describe('shuffle fairness', () => {
  it('every card is equally likely at every position (chi-square)', () => {
    const idx = new Map(newDeck().map((c, i) => [c, i]));
    const counts = Array.from({ length: 52 }, () => new Array(52).fill(0));
    for (const d of decks) d.forEach((c, i) => counts[i][idx.get(c)!]++);
    const expected = N / 52;
    let chi = 0;
    for (const row of counts) for (const o of row) chi += (o - expected) ** 2 / expected;
    const df = 51 * 51;
    // 카이제곱 평균 df, 표준편차 sqrt(2 df) ≈ 72: 5배 밖이면 치우친 거예요
    expect(Math.abs(chi - df)).toBeLessThan(5 * Math.sqrt(2 * df));
  });

  it('hole cards are suited and paired as often as they should be', () => {
    let suited = 0;
    let paired = 0;
    for (const d of decks) {
      const a = d[51];
      const b = d[50]; // 서버처럼 끝에서 pop
      if (suitOf(a) === suitOf(b)) suited++;
      if (rankOf(a) === rankOf(b)) paired++;
    }
    near(suited, N, 12 / 51);
    near(paired, N, 3 / 51);
  });

  it('boards show 3+, 4+ cards of one suit at the right rate', () => {
    let three = 0;
    let four = 0;
    for (const d of decks) {
      const board = d.slice(0, 5);
      const count: Record<string, number> = {};
      for (const c of board) count[suitOf(c)] = (count[suitOf(c)] ?? 0) + 1;
      const most = Math.max(...Object.values(count));
      if (most >= 3) three++;
      if (most >= 4) four++;
    }
    // 정확한 값: 무늬별 장수 조합을 모두 세요
    let p3 = 0;
    let p4 = 0;
    for (let a = 0; a <= 5; a++)
      for (let b = 0; b <= 5 - a; b++)
        for (let c = 0; c <= 5 - a - b; c++) {
          const d = 5 - a - b - c;
          const pr = (C(13, a) * C(13, b) * C(13, c) * C(13, d)) / C(52, 5);
          const m = Math.max(a, b, c, d);
          if (m >= 3) p3 += pr;
          if (m >= 4) p4 += pr;
        }
    near(three, N, p3);
    near(four, N, p4);
  });

  it('neighbouring cards and consecutive hands are independent', () => {
    let sameSuit = 0;
    let samePlace = 0;
    for (let k = 0; k < N; k++) {
      const d = decks[k];
      for (let i = 0; i < 51; i++) if (suitOf(d[i]) === suitOf(d[i + 1])) sameSuit++;
      // 직전 핸드와 같은 자리에 같은 카드가 나오는 비율: 1/52 이어야 해요
      if (k > 0) for (let i = 0; i < 52; i++) if (decks[k - 1][i] === d[i]) samePlace++;
    }
    near(sameSuit, N * 51, 12 / 51);
    near(samePlace, (N - 1) * 52, 1 / 52);
  });

  it('cryptoRandInt has no modulo bias', () => {
    // 52처럼 2의 거듭제곱이 아닌 수에서도 고르게
    const n = 52;
    const counts = new Array(n).fill(0);
    const draws = 260_000;
    for (let i = 0; i < draws; i++) counts[cryptoRandInt(n)]++;
    const expected = draws / n;
    let chi = 0;
    for (const o of counts) chi += (o - expected) ** 2 / expected;
    expect(Math.abs(chi - (n - 1))).toBeLessThan(5 * Math.sqrt(2 * (n - 1)));
  });
});
