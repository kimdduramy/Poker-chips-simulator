import { describe, expect, it } from 'vitest';
import { act, dealLockMs, startHand, type Game } from '../shared/engine';
import { dealerTip } from '../src/lib/dealer';
import { table } from './helpers';

function closeStreet(g: Game): Game {
  const street = g.street;
  let s = g;
  while (s.phase === 'betting' && s.street === street) {
    const p = s.players.find((x) => x.id === s.toActId)!;
    s = act(s, p.id, { kind: s.currentBet > p.bet ? 'call' : 'check' });
  }
  return s;
}

describe('dealerTip: what the dealer should do right now', () => {
  it('walks through dealing, burning and showing down', () => {
    let g = startHand(table([1000, 1000, 1000]));
    expect(dealerTip(g)).toEqual({ text: '2장씩 나눠줘요 · SB부터 한 장씩', now: true });
    g = act(g, g.toActId!, { kind: 'call' });
    expect(dealerTip(g)).toEqual({ text: '베팅이 끝나면 플랍 3장', now: false });
    g = closeStreet(g);
    expect(dealerTip(g)).toEqual({ text: '1장 버리고 플랍 3장 펼치기', now: true });
    g = act(g, g.toActId!, { kind: 'check' });
    expect(dealerTip(g)?.now).toBe(false);
    g = closeStreet(g);
    expect(dealerTip(g)?.text).toBe('1장 버리고 턴 1장 펼치기');
    g = closeStreet(g);
    expect(dealerTip(g)?.text).toBe('1장 버리고 리버 1장 펼치기');
    g = closeStreet(g);
    expect(g.phase).toBe('showdown');
    expect(dealerTip(g)).toEqual({ text: '마지막에 베팅한 사람부터 카드 공개', now: true });
  });

  it('asks for the rest of the board on an all-in run-out', () => {
    let g = startHand(table([1000, 1000]));
    g = act(g, g.toActId!, { kind: 'raise', amount: 1000 });
    g = act(g, g.toActId!, { kind: 'call' });
    expect(dealerTip(g)).toEqual({ text: '남은 플랍 · 턴 · 리버 펼치기 · 장마다 1장 버리고', now: true });
  });
});

describe('dealLockMs: how long betting waits for the dealer', () => {
  it('locks at each new deal and unlocks once anyone acts', () => {
    let g = startHand(table([1000, 1000, 1000]));
    expect(dealLockMs(g)).toBe(3900); // 1.5초 + 3명 × 0.8초
    const first = g.toActId!;
    g = act(g, first, { kind: 'call' });
    expect(dealLockMs(g)).toBe(0);
    g = closeStreet(g);
    expect(g.street).toBe(1);
    expect(dealLockMs(g)).toBe(4000); // 플랍
    g = closeStreet(g);
    expect(dealLockMs(g)).toBe(2500); // 턴
    g = closeStreet(g);
    expect(dealLockMs(g)).toBe(2500); // 리버
  });

  it('stays between 3 and 8 seconds for the opening deal', () => {
    expect(dealLockMs(startHand(table([1000, 1000])))).toBe(3100);
    expect(dealLockMs(startHand(table(Array(10).fill(1000))))).toBe(8000);
  });
});
