import { describe, expect, it } from 'vitest';
import { act, rebuy, repay, RuleError, setStack, startHand, type Game } from '../shared/engine';
import { ledger } from '../shared/settle';
import { table } from './helpers';

const fold = (g: Game, id: string) => act(g, id, { kind: 'fold' });
function expectRule(fn: () => unknown, code: string) {
  try {
    fn();
  } catch (e) {
    expect(e).toBeInstanceOf(RuleError);
    expect((e as RuleError).code).toBe(code);
    return;
  }
  throw new Error(`expected ${code}`);
}

const p = (g: ReturnType<typeof table>, id: string) => g.players.find((x) => x.id === id)!;

describe('bank: rebuys are loans you can pay back', () => {
  it('records a loan on rebuy and repaying keeps the net result the same', () => {
    let g = table([1000, 1000, 1000]);
    g = setStack(g, 'p0', 0);
    g = rebuy(g, 'p0');
    expect(p(g, 'p0')).toMatchObject({ stack: 1000, loan: 1000 });
    g = setStack(g, 'p0', 2500); // won some hands
    const netBefore = ledger(g).find((r) => r.id === 'p0')!.net;

    g = repay(g, 'p0', 600);
    expect(p(g, 'p0')).toMatchObject({ stack: 1900, loan: 400 });
    expect(ledger(g).find((r) => r.id === 'p0')!.net).toBe(netBefore);

    g = repay(g, 'p0', 400);
    expect(p(g, 'p0').loan).toBe(0);
    expectRule(() => repay(g, 'p0', 1), 'INVALID');
  });

  it('refuses bad amounts and waits until the hand is over', () => {
    let g = table([1000, 1000, 1000]);
    g = setStack(g, 'p0', 0);
    g = rebuy(g, 'p0');
    expectRule(() => repay(g, 'p0', 0), 'INVALID');
    expectRule(() => repay(g, 'p0', 1001), 'INVALID');
    expectRule(() => repay(g, 'p1', 10), 'INVALID');
    g = startHand(g);
    expectRule(() => repay(g, 'p0', 100), 'PHASE');
    g = fold(g, g.toActId!);
    g = fold(g, g.toActId!);
    expect(repay(g, 'p0', 100).players.find((x) => x.id === 'p0')!.loan).toBe(900);
  });

  it('cannot pay back more than the stack', () => {
    let g = table([1000, 1000]);
    g = setStack(g, 'p0', 0);
    g = rebuy(g, 'p0');
    g = setStack(g, 'p0', 300);
    expectRule(() => repay(g, 'p0', 500), 'INVALID');
    expect(repay(g, 'p0', 300).players[0].stack).toBe(0);
  });
});
