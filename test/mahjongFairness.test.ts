import { describe, expect, it } from 'vitest';
import { randomWall } from '../shared/mahjong/tiles';

/**
 * 마작 패산 섞기 공정성: 서버와 똑같이 randomWall(crypto 섞기)로 만들고 이론 확률과 비교해요.
 * 허용 범위는 표준편차의 5배라서, 망가진 섞기는 잡고 정상은 거의 실패하지 않아요.
 * majiang-core 순서: 끝에서부터 13장씩 자리 순서대로 나눠요.
 */
const N = 20_000;
const walls = Array.from({ length: N }, () => randomWall(true));
const kind = (t: string) => 'mpsz'.indexOf(t[0]) * 9 + ((Number(t[1]) || 5) - 1);

function near(hits: number, trials: number, p: number) {
  const sd = Math.sqrt((p * (1 - p)) / trials);
  expect(Math.abs(hits / trials - p), `실제 ${(hits / trials).toFixed(4)}, 이론 ${p.toFixed(4)}`).toBeLessThan(5 * sd);
}

describe('mahjong wall fairness', () => {
  it('every kind is equally likely at every one of the 136 places (chi-square)', () => {
    const counts = Array.from({ length: 136 }, () => new Array(34).fill(0));
    for (const w of walls) w.forEach((t, i) => counts[i][kind(t)]++);
    const expected = (N * 4) / 136;
    let chi = 0;
    for (const row of counts) for (const o of row) chi += (o - expected) ** 2 / expected;
    const df = 135 * 33;
    expect(Math.abs(chi - df)).toBeLessThan(5 * Math.sqrt(2 * df));
  });

  it('each seat’s starting hand gets a red five as often as it should', () => {
    // 13장 중 빨간 5가 하나라도 있을 확률 = 1 - C(133,13)/C(136,13)
    let none = 1;
    for (let k = 0; k < 13; k++) none *= (133 - k) / (136 - k);
    for (let seat = 0; seat < 4; seat++) {
      let red = 0;
      for (const w of walls) {
        const hand = w.slice(136 - 13 * (seat + 1), 136 - 13 * seat);
        if (hand.some((t) => t[0] !== 'z' && t[1] === '0')) red++;
      }
      near(red, N, 1 - none);
    }
  });

  it('the dora indicator is any kind with equal chance', () => {
    const counts = new Array(34).fill(0);
    for (const w of walls) counts[kind(w[4])]++;
    for (const c of counts) near(c, N, 1 / 34);
  });
});
