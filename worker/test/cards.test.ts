import { describe, expect, it } from 'vitest';
import { evaluate, winnersOf } from '../../shared/cards';
import { api, type Client, table } from './client';

/** 차례인 사람이 콜할 게 있으면 콜, 없으면 체크하면서 핸드 끝까지 */
async function checkDown(clients: Client[]) {
  for (let i = 0; i < 40; i++) {
    const g = clients[0].state.room.game;
    if (g.phase !== 'betting') return;
    const actor = clients.find((c) => c.state.you.id === g.toActId)!;
    const legal = actor.state.you.legal!;
    await actor.ok({ type: 'act', v: actor.state.v, kind: legal.canCall ? 'call' : 'check' });
    await clients[0].settle();
  }
  throw new Error('hand did not finish');
}

describe('card mode', () => {
  it('is chosen when the table is made and shows up in the room info', async () => {
    const { code, clients } = await table(['Ana', 'Ben'], { cardMode: true });
    expect(clients[0].state.room.cardMode).toBe(true);
    expect(await (await api(`/api/rooms/${code}`)).json()).toMatchObject({ cardMode: true });
    const plain = await table(['Cy', 'Di']);
    expect(plain.clients[0].state.room.cardMode).toBe(false);
  });

  it('deals two private cards to each player and never sends them to anyone else', async () => {
    const { clients, idOf } = await table(['Ana', 'Ben', 'Cy'], { cardMode: true });
    const [ana, ben, cy] = clients;
    const from = clients.map((c) => c.messages.length);
    await ana.ok({ type: 'start', v: ana.state.v });
    await Promise.all(clients.map((c) => c.settle()));

    const holes = clients.map((c) => c.state.you.hole!);
    for (const h of holes) expect(h).toHaveLength(2);
    expect(new Set(holes.flat()).size).toBe(6);
    expect(ana.state.room.board).toEqual([]);

    // 다른 사람에게 간 메시지 어디에도 내 카드가 없어야 해요
    clients.forEach((c, i) => {
      const wire = c.messages.slice(from[i]).map((m) => JSON.stringify(m)).join('\n');
      holes.forEach((h, j) => {
        if (j === i) return;
        for (const card of h) expect(wire).not.toContain(`"${card}"`);
      });
    });
    expect(ben.state.you.id).toBe(idOf(ben));
    expect(cy.state.room.game).not.toHaveProperty('deal');
  });

  it('opens the board street by street and pays the best hand at showdown', async () => {
    const { clients } = await table(['Ana', 'Ben', 'Cy'], { cardMode: true });
    const [ana] = clients;
    await ana.ok({ type: 'start', v: ana.state.v });
    await ana.settle();
    const holes = new Map(clients.map((c) => [c.state.you.id!, c.state.you.hole!]));

    const seen: number[] = [];
    for (let i = 0; i < 40 && ana.state.room.game.phase === 'betting'; i++) {
      const g = ana.state.room.game;
      seen.push(ana.state.room.board.length);
      const actor = clients.find((c) => c.state.you.id === g.toActId)!;
      await actor.ok({ type: 'act', v: actor.state.v, kind: actor.state.you.legal!.canCall ? 'call' : 'check' });
      await Promise.all(clients.map((c) => c.settle()));
    }
    expect([...new Set(seen)]).toEqual([0, 3, 4, 5]);

    const room = ana.state.room;
    expect(room.game.phase).toBe('done');
    expect(room.board).toHaveLength(5);
    expect(room.shown.map((s) => s.id).sort()).toEqual([...holes.keys()].sort());
    for (const s of room.shown) expect(s.cards).toEqual(holes.get(s.id));

    const expected = winnersOf([...holes].map(([id, h]) => ({ id, value: evaluate([...h, ...room.board]) })));
    expect([...new Set(room.game.results.map((r) => r.id))].sort()).toEqual(expected.sort());
    const total = room.game.players.reduce((sum, p) => sum + p.stack, 0);
    expect(total).toBe(3000);
    expect(room.log.some((l) => l.kind === 'win')).toBe(true);
  });

  it('a hand won by folds shows no cards', async () => {
    const { clients } = await table(['Ana', 'Ben'], { cardMode: true });
    const [ana] = clients;
    await ana.ok({ type: 'start', v: ana.state.v });
    await ana.settle();
    const actor = clients.find((c) => c.state.you.id === ana.state.room.game.toActId)!;
    await actor.ok({ type: 'act', v: actor.state.v, kind: 'fold' });
    const room = (await ana.settle()).room;
    expect(room.game.phase).toBe('done');
    expect(room.shown).toEqual([]);
    expect(room.board).toEqual([]);
  });

  it('undo works inside a hand but never back into the previous hand', async () => {
    const { clients } = await table(['Ana', 'Ben'], { cardMode: true });
    const [ana] = clients;
    await ana.ok({ type: 'start', v: ana.state.v });
    await ana.settle();
    const hole = ana.state.you.hole;
    const actor = clients.find((c) => c.state.you.id === ana.state.room.game.toActId)!;
    await actor.ok({ type: 'act', v: actor.state.v, kind: 'call' });
    await ana.ok({ type: 'undo', v: (await ana.settle()).v });
    expect((await ana.settle()).you.hole).toEqual(hole);

    await checkDown(clients);
    await ana.ok({ type: 'next', v: (await ana.settle()).v });
    const reply = await ana.request({ type: 'undo', v: (await ana.settle()).v });
    expect(reply).toMatchObject({ type: 'err', code: 'INVALID' });
  });

  it('the host cannot pick winners by hand', async () => {
    const { clients } = await table(['Ana', 'Ben'], { cardMode: true });
    const [ana] = clients;
    await ana.ok({ type: 'start', v: ana.state.v });
    const reply = await ana.request({ type: 'award', v: (await ana.settle()).v, winners: { 0: [ana.state.you.id!] } });
    expect(reply).toMatchObject({ type: 'err' });
  });
});
