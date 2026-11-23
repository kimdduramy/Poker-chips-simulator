import { describe, expect, it } from 'vitest';
import type { MjAction } from '../../shared/mahjong/view';
import { debugCode } from '../../shared/debugCode';
import { api, Client, createRoom, table, tokenFor } from './client';

const NAMES = ['Ana', 'Ben', 'Cy', 'Di'];


describe('mahjong table', () => {
  it('is chosen when the table is made and takes at most four seats', async () => {
    const { code, clients } = await table(NAMES, { gameType: 'mahjong' });
    expect(clients[0].state.room.gameType).toBe('mahjong');
    expect(clients[0].state.room.mjRules).toMatchObject({ startPoints: 25000, length: 'south', aka: true, kuitan: true });
    expect(await (await api(`/api/rooms/${code}`)).json()).toMatchObject({ gameType: 'mahjong', phase: 'lobby' });
    const fifth = await Client.connect(code, tokenFor(9));
    const reply = await fifth.request({ type: 'join', name: 'Eve' });
    expect(reply).toMatchObject({ type: 'err', message: '좌석이 꽉 찼어요' });

    const plain = await table(['Cy', 'Di']);
    expect(plain.clients[0].state.room.gameType).toBe('holdem');
    expect(plain.clients[0].state.room.mj).toBeNull();
  });

  it('needs four people to start', async () => {
    const { clients } = await table(NAMES.slice(0, 3), { gameType: 'mahjong' });
    const reply = await clients[0].request({ type: 'start', v: clients[0].state.v });
    expect(reply).toMatchObject({ type: 'err' });
  });

  it('deals 13 to each, sends each hand only to its owner', async () => {
    const { clients } = await table(NAMES, { gameType: 'mahjong' });
    const from = clients.map((c) => c.messages.length);
    await clients[0].ok({ type: 'start', v: clients[0].state.v });
    await Promise.all(clients.map((c) => c.settle()));

    const mine = clients.map((c) => c.state.you.mj!);
    expect(mine.map((m) => m.seat)).toEqual([0, 1, 2, 3]);
    expect(mine.map((m) => m.hand.length)).toEqual([13, 13, 13, 13]);
    expect(mine[0].drawn).not.toBeNull();
    expect(mine.slice(1).every((m) => m.drawn === null)).toBe(true);

    const room = clients[0].state.room.mj!;
    expect(room.phase).toBe('play');
    expect(room.wallLeft).toBe(69);
    expect(room.dora).toHaveLength(1);
    expect(room.seats.map((s) => s.handCount)).toEqual([14, 13, 13, 13]);

    // 다른 사람에게 간 메시지에는 내 손패가 통째로 들어 있지 않아요
    clients.forEach((c, i) => {
      for (const m of c.messages.slice(from[i])) {
        if (m.type !== 'state') continue;
        expect(m.you.mj?.seat ?? i).toBe(i);
        expect(JSON.stringify(m.room)).not.toMatch(/"hand":|"walls"|"steps"|shoupai|haipai/);
      }
    });
  });

  it('turns go around as people discard; out-of-turn is refused', async () => {
    const { clients } = await table(NAMES, { gameType: 'mahjong' });
    await clients[0].ok({ type: 'start', v: clients[0].state.v });
    await clients[0].settle();
    const [ana, ben] = clients;
    const wrong = await ben.request({ type: 'mj', v: ben.state.v, action: { kind: 'discard', tile: ben.state.you.mj!.hand[0] } });
    expect(wrong).toMatchObject({ type: 'err', code: 'NOT_TURN' });

    const drawn = ana.state.you.mj!.drawn!;
    await ana.ok({ type: 'mj', v: ana.state.v, action: { kind: 'discard', tile: `${drawn}_` } });
    await Promise.all(clients.map((c) => c.settle()));
    const room = ana.state.room.mj!;
    expect(room.seats[0].river).toEqual([`${drawn}_`]);
    // 누가 론할 수 있으면 기다리고, 아니면 Ben이 뽑아요
    if (!room.claiming) {
      expect(room.turn).toBe(1);
      expect(ben.state.you.mj!.drawn).not.toBeNull();
    }
  });

  it('phone-less seats play themselves, and undo brings back the same tile', async () => {
    const code = await createRoom(undefined, { gameType: 'mahjong' });
    const host = await Client.connect(code, tokenFor(1));
    await host.ok({ type: 'join', name: 'Ana' });
    for (const name of ['봇1', '봇2', '봇3']) await host.ok({ type: 'addSeat', name });
    await host.ok({ type: 'start', v: host.state.v });
    await host.settle();
    const first = host.state.you.mj!;
    expect(first.drawn).not.toBeNull();

    await host.ok({ type: 'mj', v: host.state.v, action: { kind: 'discard', tile: `${first.drawn}_` } });
    await host.settle();
    const after = host.state.room.mj!;
    // 봇이 다 두고 다시 내 차례이거나, 그 사이 누가 이겼어요
    if (after.phase === 'play') {
      expect(after.turn).toBe(0);
      expect(after.seats.slice(1).every((s) => s.river.length === 1)).toBe(true);
      expect(host.state.you.mj!.drawn).not.toBeNull();
    } else {
      expect(after.phase).toBe('result');
    }

    await host.ok({ type: 'undo', v: host.state.v });
    await host.settle();
    expect(host.state.you.mj!.drawn).toBe(first.drawn);
    expect(host.state.you.mj!.hand).toEqual(first.hand);
    expect(host.state.room.mj!.seats[0].river).toEqual([]);

    await host.ok({ type: 'redo', v: host.state.v });
    await host.settle();
    expect(host.state.room.mj).toEqual(after);
  });

  it('a whole game with bots reaches the end, then goes back to the lobby', async () => {
    const code = await createRoom(undefined, { gameType: 'mahjong' });
    let host = await Client.connect(code, tokenFor(1));
    await host.ok({ type: 'join', name: 'Ana' });
    for (const name of ['봇1', '봇2', '봇3']) await host.ok({ type: 'addSeat', name });
    await host.ok({ type: 'mjRules', v: host.state.v, rules: { startPoints: 25000, length: 'east', aka: true, kuitan: true } });
    await host.ok({ type: 'start', v: host.state.v });
    for (let i = 0; i < 2000; i++) {
      // 연결 하나당 초당 8번까지라서, 빨리 두는 테스트는 가끔 새로 연결해요
      if (i % 15 === 14) {
        host.ws.close();
        host = await Client.connect(code, tokenFor(1));
      }
      await host.settle();
      const mj = host.state.room.mj!;
      if (mj.phase === 'end') break;
      if (mj.phase === 'result') {
        await host.ok({ type: 'next', v: host.state.v });
        continue;
      }
      const legal = host.state.you.mj!.legal!;
      const action: MjAction = legal.tsumo ? { kind: 'tsumo' } : legal.ron ? { kind: 'ron' } : legal.pass ? { kind: 'pass' } : { kind: 'discard', tile: legal.discard.at(-1)! };
      await host.ok({ type: 'mj', v: host.state.v, action });
    }
    const end = host.state.room.mj!;
    expect(end.phase).toBe('end');
    expect(end.final!.points.reduce((a, b) => a + b, 0)).toBe(100000);
    expect(host.state.room.log.some((l) => l.text.startsWith('게임 끝'))).toBe(true);

    // 기보: 끝난 국만, 배패는 디버그 코드가 있을 때만
    type History = { gameType: string; mjRounds: { haipai?: string[]; discards: string[][] }[] };
    const pub = (await (await api(`/api/rooms/${code}/history`, { headers: { 'x-token': tokenFor(1) } })).json()) as History;
    expect(pub.gameType).toBe('mahjong');
    expect(pub.mjRounds.length).toBeGreaterThanOrEqual(4);
    expect(pub.mjRounds.every((r) => r.haipai === undefined)).toBe(true);
    const dbg = (await (
      await api(`/api/rooms/${code}/history`, { headers: { 'x-token': tokenFor(1), 'x-debug-code': debugCode(code) } })
    ).json()) as History;
    expect(dbg.mjRounds[0].haipai).toHaveLength(4);
    await host.ok({ type: 'next', v: host.state.v });
    expect((await host.settle()).room.mj).toBeNull();
  });

  it('rules can only change in the lobby', async () => {
    const { clients } = await table(NAMES, { gameType: 'mahjong' });
    const [ana, ben] = clients;
    const rules = { startPoints: 30000, length: 'east' as const, aka: false, kuitan: false };
    expect(await ben.request({ type: 'mjRules', v: ben.state.v, rules })).toMatchObject({ type: 'err', code: 'FORBIDDEN' });
    await ana.ok({ type: 'mjRules', v: ana.state.v, rules });
    expect((await ana.settle()).room.mjRules).toEqual(rules);
    await ana.ok({ type: 'start', v: ana.state.v });
    await ana.settle();
    expect(ana.state.room.mj!.seats.every((s) => s.points === 30000)).toBe(true);
    expect(await ana.request({ type: 'mjRules', v: ana.state.v, rules })).toMatchObject({ type: 'err', code: 'PHASE' });
  });
});
