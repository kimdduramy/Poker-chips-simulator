import { describe, expect, it } from 'vitest';
import * as Majiang from '@kobalab/majiang-core';
import { MjDriver, type MjLog } from '../shared/mahjong/driver';
import { buildMjRecords, formatMjHistory } from '../shared/mahjong/record';
import { doraOf, newWall, sortTiles, tileName, tilesOf, type Tile } from '../shared/mahjong/tiles';
import { DEFAULT_MJ_RULES, type MjRules } from '../shared/mahjong/view';

/** 'm23p456z44' → ['m2','m3','p4',…] */
const P = (s: string): Tile[] => tilesOf(s.replace(/\s+/g, ''));

const PLAYERS = ['Ana', 'Ben', 'Cy', 'Di'].map((name, i) => ({ id: `p${i}aaaaaaa`, name }));
const RULES: MjRules = { ...DEFAULT_MJ_RULES, aka: false };

/**
 * 손패(동1국이라 0번 자리가 친)와 뽑을 순서를 정해 majiang-core 순서의 패산을 만들어요.
 * majiang-core는 끝에서부터 뽑고(13장씩 자리 순서대로, 그다음 쯔모), 앞 14장이 왕패예요. 5번째(4번)가 도라 표시패.
 */
function arranged(hands: string[], draws: string[] = [], indicator = 'z5'): Tile[] {
  const pool = newWall(false);
  const take = (t: Tile) => {
    const i = pool.indexOf(t);
    if (i === -1) throw new Error(`패가 모자라요: ${t}`);
    pool.splice(i, 1);
    return t;
  };
  const ind = take(indicator);
  const seq = [...hands.flatMap((h) => P(h).map(take)), ...draws.flatMap((d) => P(d).map(take))];
  if (seq.length - draws.flatMap(P).length !== 52) throw new Error('손패는 13장씩이에요');
  // 도라 표시패가 아닌 나머지 중 발(z6)은 손패에 안 들어오게 맨 앞쪽에 둬요
  const dead = [...pool.splice(0, 4), ind, ...pool.splice(0, 9)];
  return [...dead, ...pool, ...seq.reverse()];
}

/** 아무 역도 텐파이도 아닌 손패들 (서로 겹치지 않게) */
const NOTEN = ['m147p147s147z1234', 'm258p258s258z1234', 'm369p369s369z1237', 'm147p258s369z5577'];

function driver(hands: string[], draws: string[] = [], rules = RULES) {
  const walls: Tile[][] = [];
  const d = MjDriver.start(rules, PLAYERS, () => {
    if (walls.length > 0) return newWall(rules.aka); // 다음 국부터는 정렬된 패산이어도 괜찮아요
    walls.push(arranged(hands, draws));
    return walls[0];
  });
  return d;
}

/** 지금 고를 사람이 한 명이면 그 사람 */
const only = (d: MjDriver) => {
  const p = d.pending();
  expect(p).toHaveLength(1);
  return p[0];
};

describe('majiang-core through our driver', () => {
  it('deals 13 each, the dealer draws, 69 left in the wall, dora from the dead wall', () => {
    const d = driver(NOTEN, ['z5']);
    const v = d.publicView();
    expect(v.phase).toBe('play');
    expect(v.seats.map((s) => s.handCount)).toEqual([14, 13, 13, 13]);
    expect(v.seats.map((s) => s.wind)).toEqual([0, 1, 2, 3]);
    expect(v.dealer).toBe(0);
    expect(v.turn).toBe(0);
    expect(v.wallLeft).toBe(69);
    expect(v.dora).toEqual(['z5']);
    expect(v.seats.every((s) => s.points === 25000)).toBe(true);
    expect(d.pending()).toEqual([0]);
    const mine = d.privateView(0);
    expect(mine.hand).toEqual(sortTiles(P(NOTEN[0])));
    expect(mine.drawn).toBe('z5');
    expect(mine.legal?.discard).toContain('z5_');
    expect(d.privateView(1).legal).toBeNull();
  });

  it('never puts anyone’s hand in the public view', () => {
    const d = driver(NOTEN, ['z5']);
    const json = JSON.stringify(d.publicView());
    for (const h of NOTEN) expect(json).not.toContain(h);
    expect(json).not.toMatch(/"hand"|shoupai|_pai|walls/);
  });

  it('a discard passes the turn to the next seat, who draws', () => {
    const d = driver(NOTEN, ['z5', 'm9']);
    d.act(0, { kind: 'discard', tile: 'z5_' });
    const v = d.publicView();
    expect(v.turn).toBe(1);
    expect(v.seats[0].river).toEqual(['z5_']);
    expect(d.privateView(1).drawn).toBe('m9');
    expect(() => d.act(0, { kind: 'discard', tile: 'm1' })).toThrow('내 차례가 아니에요');
    expect(() => d.act(1, { kind: 'discard', tile: 's9' })).toThrow('그 패는 버릴 수 없어요');
  });

  it('tsumo shows only when the drawn tile completes the hand (menzen tsumo is a yaku)', () => {
    // Ana: m23 p456 s789 s222 z44 → 1m·4m 대기. 두 번째 쯔모에 4m
    const d = driver(['m23p456s789s222z44', ...NOTEN.slice(1)], ['z5', 'm9', 'p9', 's9', 'm4']);
    expect(d.legal(0)?.tsumo).toBe(false);
    d.act(0, { kind: 'discard', tile: 'z5_' });
    for (const seat of [1, 2, 3]) d.act(seat, { kind: 'discard', tile: d.legal(seat)!.discard.at(-1)! });
    expect(d.privateView(0).drawn).toBe('m4');
    expect(d.legal(0)?.tsumo).toBe(true);
    d.act(0, { kind: 'tsumo' });
    const v = d.publicView();
    expect(v.phase).toBe('result');
    const win = v.results[0];
    expect(win).toMatchObject({ kind: 'win', seat: 0, from: null, tile: 'm4' });
    if (win.kind !== 'win') throw new Error();
    expect(win.yaku.map((y) => y.name)).toContain('門前清自摸和');
  });

  it('no ron button for a closed hand without a yaku', () => {
    // Ben: m23 p456 s789 s222 z44 (역 없음) → Ana가 4m을 버려도 론 못 해요
    const d = driver([NOTEN[0], 'm23p456s789s222z44', NOTEN[2], NOTEN[3]], ['m4']);
    d.act(0, { kind: 'discard', tile: 'm4_' });
    expect(d.publicView().claiming).toBe(false);
    expect(d.pending()).toEqual([1]);
    expect(d.legal(1)?.ron).toBe(false);
  });

  it('ron with tanyao + pinfu pays 2,000 (2 han 30 fu, non-dealer)', () => {
    const d = driver([NOTEN[0], 'm23p456p678s345s88', NOTEN[2], NOTEN[3]], ['m4']);
    expect(d.privateView(1).waits.sort()).toEqual(['m1', 'm4']);
    d.act(0, { kind: 'discard', tile: 'm4_' });
    expect(d.publicView().claiming).toBe(true);
    expect(d.pending()).toEqual([1]);
    expect(d.legal(1)).toMatchObject({ ron: true, pass: true });
    d.act(1, { kind: 'ron' });
    const win = d.publicView().results[0];
    if (win.kind !== 'win') throw new Error('expected win');
    expect(win).toMatchObject({ seat: 1, from: 0, tile: 'm4', han: 2, fu: 30, points: 2000 });
    expect(win.yaku.map((y) => y.name).sort()).toEqual(['平和', '断幺九'].sort());
    expect(win.deltas).toEqual([-2000, 2000, 0, 0]);
    // 다음 국을 누르면 점수가 반영되고 친이 넘어가요
    d.ack();
    const v = d.publicView();
    expect(v.seats.map((s) => s.points)).toEqual([23000, 27000, 25000, 25000]);
    expect(v.dealer).toBe(1);
    expect(v.honba).toBe(0);
  });

  it('a discard you already made of your wait means no ron (furiten)', () => {
    // Ben이 1m을 버린 뒤 23m 대기 → 4m이 나와도 론 못 해요
    const d = driver([NOTEN[0], 'm123p456p678s345s8', NOTEN[2], NOTEN[3]], ['z5', 's8', 'z6', 'z6', 'm4']);
    d.act(0, { kind: 'discard', tile: 'z5_' });
    d.act(1, { kind: 'discard', tile: 'm1' });
    expect(d.privateView(1).waits.sort()).toEqual(['m1', 'm4']);
    expect(d.privateView(1).furiten).toBe(true);
    d.act(2, { kind: 'discard', tile: 'z6_' });
    d.act(3, { kind: 'discard', tile: 'z6_' });
    d.act(0, { kind: 'discard', tile: 'm4_' });
    expect(d.publicView().claiming).toBe(false);
    expect(d.pending()).toEqual([1]);
  });

  it('passing on a ron blocks ron until your next discard', () => {
    const d = driver([NOTEN[0], 'm23p456p678s345s88', NOTEN[2], NOTEN[3]], ['m4', 'z6', 'm4']);
    d.act(0, { kind: 'discard', tile: 'm4_' });
    d.act(1, { kind: 'pass' });
    expect(d.privateView(1).drawn).toBe('z6');
    d.act(1, { kind: 'discard', tile: 'z6_' });
    // Ben이 버렸으니 풀렸어요: Cy의 4m은 론할 수 있어요
    d.act(2, { kind: 'discard', tile: 'm4_' });
    expect(d.pending()).toEqual([1]);
    expect(d.legal(1)?.ron).toBe(true);
  });

  it('exhaustive draw after the wall runs out; noten pays tenpai 3,000 split', () => {
    const d = driver([NOTEN[0], 'm23p456p678s345s88', NOTEN[2], NOTEN[3]]);
    let discards = 0;
    while (d.phase === 'play') {
      const seat = d.pending()[0];
      const legal = d.legal(seat)!;
      d.act(seat, legal.pass ? { kind: 'pass' } : { kind: 'discard', tile: legal.discard.at(-1)! });
      if (!legal.pass) discards++;
    }
    expect(discards).toBe(70);
    const v = d.publicView();
    expect(v.wallLeft).toBe(0);
    const r = v.results[0];
    expect(r).toMatchObject({ kind: 'draw', name: '荒牌平局' });
    if (r.kind !== 'draw') throw new Error();
    expect(r.shown[1]).not.toBeNull();
    expect(r.shown[0]).toBeNull();
    expect(r.deltas).toEqual([-1000, 3000, -1000, -1000]);
    d.ack();
    expect(d.publicView().honba).toBe(1);
    expect(d.publicView().dealer).toBe(1);
  });

  it('replaying the log rebuilds the exact same state without new walls', () => {
    const d = driver(NOTEN, ['z5', 'm9', 'p9', 's9']);
    d.act(0, { kind: 'discard', tile: 'z5_' });
    d.act(1, { kind: 'discard', tile: 'm9_' });
    const copy = new MjDriver(structuredClone(d.log), () => {
      throw new Error('새 패산을 만들면 안 돼요');
    });
    expect(copy.publicView()).toEqual(d.publicView());
    for (let s = 0; s < 4; s++) expect(copy.privateView(s)).toEqual(d.privateView(s));
  });

  it('undo = replay a shorter log; the same wall comes back', () => {
    const d = driver(NOTEN, ['z5', 'm9']);
    const before = structuredClone(d.log);
    d.act(0, { kind: 'discard', tile: 'z5_' });
    const back = new MjDriver(before, () => {
      throw new Error('새 패산을 만들면 안 돼요');
    });
    expect(back.privateView(0).drawn).toBe('z5');
    expect(back.publicView().turn).toBe(0);
  });

  it('bots play until a person has to choose', () => {
    const d = driver(NOTEN, ['z5', 'm9', 'p9', 's9', 'z6']);
    d.act(0, { kind: 'discard', tile: 'z5_' });
    d.runBots((seat) => seat !== 0);
    expect(only(d)).toBe(0);
    expect(d.privateView(0).drawn).toBe('z6');
    expect(d.publicView().seats.slice(1).map((s) => s.river.length)).toEqual([1, 1, 1]);
  });

  it('a whole east-only game played by bots ends with final points that add up', () => {
    const d = MjDriver.start({ ...DEFAULT_MJ_RULES, length: 'east' }, PLAYERS, () => newWallShuffled());
    for (let i = 0; i < 40 && d.phase !== 'end'; i++) {
      d.runBots(() => true);
      if (d.phase === 'result') d.ack();
    }
    const v = d.publicView();
    expect(v.phase).toBe('end');
    expect(v.final!.points.reduce((a, b) => a + b, 0)).toBe(100000);
    expect([...v.final!.rank].sort()).toEqual([1, 2, 3, 4]);
  });

  it('random play never loses or makes up a tile', () => {
    for (let game = 0; game < 30; game++) {
      const d = MjDriver.start(DEFAULT_MJ_RULES, PLAYERS, () => newWallShuffled());
      for (let i = 0; d.phase === 'play' && i < 500; i++) {
        const seat = d.pending()[0];
        const legal = d.legal(seat)!;
        const pick = legal.discard[Math.floor(Math.random() * legal.discard.length)];
        d.act(seat, legal.ron ? { kind: 'ron' } : legal.tsumo ? { kind: 'tsumo' } : legal.pass ? { kind: 'pass' } : { kind: 'discard', tile: pick });
        const v = d.publicView();
        const inHands = v.seats.reduce((n, s) => n + s.handCount, 0);
        const rivers = v.seats.reduce((n, s) => n + s.river.length, 0);
        if (v.phase === 'play') expect(inHands + rivers + v.wallLeft + 14).toBe(136);
      }
      expect(d.phase).toBe('result');
    }
  });
});

function newWallShuffled() {
  const w = newWall(true);
  for (let i = w.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [w[i], w[j]] = [w[j], w[i]];
  }
  return w;
}

describe('tiles', () => {
  it('names tiles in Korean', () => {
    expect(tileName('m3')).toBe('3만');
    expect(tileName('p0')).toBe('빨간 5통');
    expect(tileName('s7_')).toBe('7삭');
    expect(tileName('z1')).toBe('동');
    expect(tileName('z7')).toBe('중');
  });

  it('dora follows the indicator, wrapping 9→1, 북→동, 중→백, matching majiang-core', () => {
    for (const p of ['m3', 'm9', 'p0', 's9', 'z1', 'z4', 'z5', 'z7']) {
      expect(doraOf(p)).toBe(Majiang.Shan.zhenbaopai(p));
    }
  });

  it('our wall has the same tiles as majiang-core’s Shan', () => {
    for (const aka of [true, false]) {
      const shan = new Majiang.Shan(Majiang.rule({ 赤牌: aka ? { m: 1, p: 1, s: 1 } : { m: 0, p: 0, s: 0 } }));
      expect(sortTiles(newWall(aka))).toEqual(sortTiles(shan._pai));
    }
  });
});

// 로그 타입이 저장 가능한 순수 JSON인지
it('the log survives JSON', () => {
  const d = driver(NOTEN, ['z5']);
  d.act(0, { kind: 'discard', tile: 'z5_' });
  const log: MjLog = JSON.parse(JSON.stringify(d.log));
  expect(new MjDriver(log, () => newWall(false)).publicView()).toEqual(d.publicView());
});

describe('mahjong kifu', () => {
  it('keeps only finished rounds; starting hands and draws only for debug', () => {
    const d = driver([NOTEN[0], 'm23p456p678s345s88', NOTEN[2], NOTEN[3]], ['m4']);
    const names = PLAYERS.map((p) => p.name);
    expect(buildMjRecords(d.paipu.log, 0, names, false)).toEqual([]); // 아직 진행 중
    d.act(0, { kind: 'discard', tile: 'm4_' });
    d.act(1, { kind: 'ron' });
    const pub = buildMjRecords(d.paipu.log, 0, names, false);
    expect(pub).toHaveLength(1);
    expect(pub[0]).toMatchObject({ round: '동1국', honba: 0, dealer: 'Ana', dora: ['z5'] });
    expect(pub[0].haipai).toBeUndefined();
    expect(pub[0].draws).toBeUndefined();
    expect(pub[0].discards[0]).toEqual(['m4_']);
    expect(pub[0].results[0]).toMatchObject({ kind: 'win', winner: 'Ben', from: 'Ana', fu: 30, han: 2, points: 2000, deltas: [-2000, 2000, 0, 0] });
    const dbg = buildMjRecords(d.paipu.log, 0, names, true);
    expect(dbg[0].haipai![1]).toBe('m23p456678s34588');
    expect(dbg[0].draws![0]).toEqual(['m4']);

    const text = formatMjHistory('ABCD', pub);
    expect(text).toContain('P1 = Ana, P2 = Ben, P3 = Cy, P4 = Di');
    expect(text).toContain('# 동1국 0본장 친:P1 도라표시:z5');
    expect(text).toContain('D P1 m4_');
    expect(text).toMatch(/= P2 론←P1 .* · (핑후1 탕야오1|탕야오1 핑후1) · 30부2판 2000 · P1 -2000 P2 \+2000 P3 0 P4 0/);
    expect(text).not.toContain('H P1');
  });
});
