// majiang-core의 Game을 서버에서 한 수씩 진행시키는 운전석이에요. (서버 전용: 화면 번들에는 안 들어가요)
//
// Game은 원래 setTimeout으로 혼자 굴러가며 네 자리에 메시지를 보내고 대답을 기다려요.
// 여기서는 sync 모드로 두고, 대답은 우리가 직접 넣어요.
//   - 고를 게 없는 자리(남의 쯔모, 론할 수 없는 버림패 등)는 바로 빈 대답을 넣어요.
//   - 고를 게 있는 자리는 사람이 버튼을 누를 때까지(봇이면 봇이 고를 때까지) 기다려요.
//   - 국이 끝나면(화료·유국) 방장이 "다음 국"을 누를 때까지 기다려요.
//
// 저장은 "국마다 쓴 패산 + 지금까지의 대답 목록(MjLog)"만 해요. 다시 불러오거나 되돌리면 처음부터 다시 진행해요.
// 패산은 국 번호마다 한 번만 만들고 기억해서, 되돌린 뒤 다시 해도 같은 패가 나와요.

import * as Majiang from '@kobalab/majiang-core';
import type { Game, GameMessage, Reply, Rule } from '@kobalab/majiang-core';
import { bare, sortTiles, tilesOf, type Tile } from './tiles';
import { MJ_PLAYERS, type MjAction, type MjFinal, type MjLegal, type MjPrivate, type MjResult, type MjRules, type MjView } from './view';

/** 기록되는 한 수: 어느 자리가 무엇을 골랐는지, 또는 국 끝 확인(다음 국) */
export type MjStep = { seat: number; action: MjAction } | { ack: true };

export interface MjLog {
  rules: MjRules;
  players: { id: string; name: string }[];
  /** 국마다 쓴 패산 136장 (섞인 순서 그대로). majiang-core 순서: 앞 14장이 왕패, 끝에서부터 뽑아요. */
  walls: Tile[][];
  steps: MjStep[];
}

export class MjRuleError extends Error {
  constructor(
    public code: 'PHASE' | 'NOT_TURN' | 'INVALID',
    message: string,
  ) {
    super(message);
  }
}

const fail = (code: MjRuleError['code'], message: string): never => {
  throw new MjRuleError(code, message);
};

/** 우리 규칙 → majiang-core 규칙. 나머지(유국·트비·오라스 그만두기 등)는 majiang-core 기본값이에요. */
export function coreRule(r: MjRules): Rule {
  return Majiang.rule({
    配給原点: r.startPoints,
    場数: r.length === 'east' ? 1 : 2,
    赤牌: r.aka ? { m: 1, p: 1, s: 1 } : { m: 0, p: 0, s: 0 },
    クイタンあり: r.kuitan,
  });
}

const DECIDING = ['zimo', 'gangzimo', 'fulou', 'dapai', 'gang'];

export class MjDriver {
  readonly log: MjLog;
  private readonly game: Game;
  private readonly newWall: () => Tile[];
  private wallIndex = 0;
  private results: MjResult[] = [];
  private final: MjFinal | null = null;
  private lastDiscard: { seat: number; tile: Tile } | null = null;

  /**
   * log를 처음부터 다시 진행해서 그 상태를 만들어요.
   * newWall은 기록에 없는 새 국의 패산이 필요할 때만 불러요 (서버는 crypto로 섞어요).
   */
  constructor(log: MjLog, newWall: () => Tile[]) {
    if (log.players.length !== MJ_PLAYERS) fail('INVALID', `마작은 ${MJ_PLAYERS}명이 있어야 시작해요`);
    this.log = { ...log, walls: [...log.walls], steps: [] };
    this.newWall = newWall;
    const self = this;
    // 새 국을 나눌 때 우리 패산을 쓰게 해요
    class G extends Majiang.Game {
      qipai() {
        super.qipai(self.nextShan());
      }
    }
    const players = log.players.map((_, id) => ({ action: (msg: GameMessage) => this.onMessage(id, msg) }));
    this.game = new G(players, undefined, coreRule(log.rules), 'chip-poker');
    this.game._sync = true;
    this.game.kaiju(0);
    this.settle();
    for (const step of log.steps) this.replay(step);
  }

  static start(rules: MjRules, players: { id: string; name: string }[], newWall: () => Tile[]) {
    return new MjDriver({ rules, players, walls: [], steps: [] }, newWall);
  }

  private nextShan() {
    const rule = this.game._rule;
    let wall = this.log.walls[this.wallIndex];
    if (!wall) {
      wall = this.newWall();
      this.log.walls.push(wall);
    }
    this.wallIndex += 1;
    if (wall.length !== 136) fail('INVALID', '패산은 136장이어야 해요');
    const shan = new Majiang.Shan(rule);
    shan._pai = [...wall];
    shan._baopai = [shan._pai[4]];
    shan._fubaopai = rule.裏ドラあり ? [shan._pai[9]] : null;
    return shan;
  }

  // ---------- Game이 보내는 메시지 ----------

  private onMessage(id: number, msg: GameMessage) {
    if (id !== 0) return; // 같은 일이 네 자리에 다 와요. 한 번만 보면 돼요.
    const m = this.game._model;
    const seatOf = (l: number) => m.player_id[l];
    const bySeat = (arr: number[]) => {
      const out = new Array<number>(MJ_PLAYERS).fill(0);
      arr.forEach((v, l) => (out[seatOf(l)] = v));
      return out;
    };
    if (msg.qipai) {
      this.results = [];
      this.lastDiscard = null;
    } else if (msg.dapai) {
      this.lastDiscard = { seat: seatOf(msg.dapai.l), tile: bare(msg.dapai.p) };
    } else if (msg.zimo || msg.gangzimo || msg.fulou) {
      this.lastDiscard = null;
    } else if (msg.hule) {
      const h = msg.hule;
      const tiles = tilesOf(h.shoupai);
      this.results.push({
        kind: 'win',
        seat: seatOf(h.l),
        from: h.baojia === null ? null : seatOf(h.baojia),
        hand: h.shoupai,
        tile: tiles[tiles.length - 1],
        yaku: (h.hupai ?? []).map((y) => ({ name: y.name, han: y.fanshu })),
        fu: h.fu ?? 0,
        han: h.fanshu ?? 0,
        yakuman: h.damanguan ?? 0,
        points: h.defen,
        deltas: bySeat(h.fenpei),
        uraDora: h.fubaopai,
      });
    } else if (msg.pingju) {
      const p = msg.pingju;
      const shown = new Array<string | null>(MJ_PLAYERS).fill(null);
      p.shoupai.forEach((s, l) => (shown[seatOf(l)] = s || null));
      this.results.push({ kind: 'draw', name: p.name, shown, deltas: bySeat(p.fenpei) });
    } else if (msg.jieju) {
      this.final = { points: [...msg.jieju.defen], rank: [...msg.jieju.rank] };
    }
  }

  // ---------- 진행 ----------

  private windOf(seat: number) {
    return this.game._model.player_id.indexOf(seat);
  }

  get status() {
    return this.game._status;
  }

  get phase(): MjView['phase'] {
    const st = this.game._status;
    return st === 'jieju' ? 'end' : st === 'hule' || st === 'pingju' ? 'result' : 'play';
  }

  /** 이 자리가 지금 무언가 골라야 하나요 (이미 대답했으면 아니에요) */
  private needs(seat: number): boolean {
    const g = this.game;
    if (g._reply[seat]) return false;
    const l = this.windOf(seat);
    const lunban = g._model.lunban;
    switch (g._status) {
      case 'zimo':
      case 'gangzimo':
      case 'fulou':
        return l === lunban;
      case 'dapai':
      case 'gang':
        return l !== lunban && g.allow_hule(l);
      default:
        return false;
    }
  }

  /** 고를 게 없는 자리는 바로 대답하고, 다 대답했으면 다음으로 넘어가요. 사람(또는 봇)이 고를 차례에서 멈춰요. */
  private settle() {
    const g = this.game;
    for (let guard = 0; guard < 1000; guard++) {
      const st = g._status;
      if (st === 'jieju' || st === 'hule' || st === 'pingju') return;
      let waiting = false;
      for (let seat = 0; seat < MJ_PLAYERS; seat++) {
        if (g._reply[seat]) continue;
        if (this.needs(seat)) waiting = true;
        else g.reply(seat, {});
      }
      if (waiting) return;
      g.next();
    }
    throw new Error('mahjong driver did not settle');
  }

  /** 지금 골라야 하는 자리들 */
  pending(): number[] {
    if (!DECIDING.includes(this.game._status)) return [];
    return [0, 1, 2, 3].filter((seat) => this.needs(seat));
  }

  legal(seat: number): MjLegal | null {
    if (!this.needs(seat)) return null;
    const g = this.game;
    const st = g._status;
    if (st === 'dapai' || st === 'gang') return { discard: [], tsumo: false, ron: true, pass: true, abort: false };
    return {
      discard: g.get_dapai(),
      tsumo: st !== 'fulou' && g.allow_hule(),
      ron: false,
      pass: false,
      abort: st === 'zimo' && g.allow_pingju(),
    };
  }

  /** 사람·봇이 고른 것 넣기. 안 되는 것이면 MjRuleError. */
  act(seat: number, action: MjAction) {
    const reply = this.toReply(seat, action);
    this.log.steps.push({ seat, action });
    this.game.reply(seat, reply);
    this.settle();
  }

  /** 국이 끝난 화면에서 다음 국으로 (게임이 끝났으면 최종 결과로) */
  ack() {
    if (this.phase !== 'result') fail('PHASE', '아직 이번 국이 끝나지 않았어요');
    this.log.steps.push({ ack: true });
    this.ackNow();
  }

  private ackNow() {
    const g = this.game;
    for (let seat = 0; seat < MJ_PLAYERS; seat++) if (!g._reply[seat]) g.reply(seat, {});
    g.next();
    this.settle();
  }

  private replay(step: MjStep) {
    if ('ack' in step) {
      this.log.steps.push(step);
      this.ackNow();
    } else this.act(step.seat, step.action);
  }

  private toReply(seat: number, action: MjAction): Reply {
    if (this.phase !== 'play') fail('PHASE', '지금은 할 수 없어요');
    const legal = this.legal(seat) ?? fail('NOT_TURN', '내 차례가 아니에요');
    switch (action.kind) {
      case 'discard':
        if (!legal.discard.includes(action.tile)) fail('INVALID', '그 패는 버릴 수 없어요');
        return { dapai: action.tile };
      case 'tsumo':
        if (!legal.tsumo) fail('INVALID', '쯔모할 수 없어요');
        return { hule: '-' };
      case 'ron':
        if (!legal.ron) fail('INVALID', '론할 수 없어요');
        return { hule: '-' };
      case 'pass':
        if (!legal.pass) fail('INVALID', '넘길 게 없어요');
        return {};
      case 'abort':
        if (!legal.abort) fail('INVALID', '구종구패가 아니에요');
        return { daopai: '-' };
    }
  }

  // ---------- 봇 (6단계에서 majiang-ai로 바꿔요) ----------

  /** 아주 단순한 봇: 이길 수 있으면 이기고, 아니면 뽑은 패를 그대로 버리고, 론 기회는… 이길 수 있으니 론해요. */
  botAction(seat: number): MjAction | null {
    const legal = this.legal(seat);
    if (!legal) return null;
    if (legal.tsumo) return { kind: 'tsumo' };
    if (legal.ron) return { kind: 'ron' };
    if (legal.discard.length > 0) return { kind: 'discard', tile: legal.discard[legal.discard.length - 1] };
    return legal.pass ? { kind: 'pass' } : null;
  }

  /** 봇 자리가 고를 차례면 계속 대신 골라요. 사람 차례가 되면 멈춰요. */
  runBots(isBot: (seat: number) => boolean) {
    for (let guard = 0; guard < 2000 && this.phase === 'play'; guard++) {
      const seat = this.pending().find(isBot);
      if (seat === undefined) return;
      const action = this.botAction(seat);
      if (!action) return;
      this.act(seat, action);
    }
  }

  // ---------- 화면에 보낼 것 ----------

  publicView(): MjView {
    const g = this.game;
    const m = g._model;
    const st = g._status;
    const final = st === 'jieju' ? this.final : null;
    return {
      phase: this.phase,
      rules: this.log.rules,
      roundWind: m.zhuangfeng,
      kyoku: m.jushu,
      honba: m.changbang,
      kyotaku: m.lizhibang,
      roundNo: this.wallIndex,
      dealer: m.player_id[0],
      seats: this.log.players.map((p, seat) => {
        const l = this.windOf(seat);
        const sp = m.shoupai[l];
        return {
          id: p.id,
          name: p.name,
          points: final ? final.points[seat] : m.defen[seat],
          wind: l,
          handCount: sp ? tilesOf(sp.toString()).length : 0,
          drawn: !!sp?._zimo && sp._zimo.length <= 2,
          river: m.he[l] ? [...m.he[l]._pai] : [],
          melds: sp ? [...sp._fulou] : [],
          riichi: !!sp?.lizhi,
        };
      }),
      wallLeft: m.shan ? m.shan.paishu : 0,
      dora: m.shan ? [...m.shan.baopai] : [],
      turn: m.lunban >= 0 ? m.player_id[m.lunban] : m.player_id[0],
      claiming: (st === 'dapai' || st === 'gang') && this.pending().length > 0,
      lastDiscard: this.phase === 'play' ? this.lastDiscard : null,
      results: this.results,
      final,
    };
  }

  privateView(seat: number): MjPrivate {
    const g = this.game;
    const l = this.windOf(seat);
    const sp = g._model.shoupai[l];
    const tiles = tilesOf(sp.toString());
    const holding = !!sp._zimo && sp._zimo.length <= 2;
    const hand = holding ? tiles.slice(0, -1) : tiles;
    const tenpai = !holding && this.phase === 'play' && sp._zimo === null && Majiang.Util.xiangting(sp) === 0;
    const waits = tenpai ? Majiang.Util.tingpai(sp) : [];
    const river = g._model.he[l];
    return {
      seat,
      hand: sortTiles(hand),
      drawn: holding ? tiles[tiles.length - 1] : null,
      melds: [...sp._fulou],
      legal: this.phase === 'play' ? this.legal(seat) : null,
      waits,
      furiten: waits.length > 0 && (!g._neng_rong[l] || waits.some((p) => river.find(p))),
    };
  }

  /** 디버그·기보용: majiang-core가 남긴 패보 (모두의 배패 포함). 화면에 그대로 보내면 안 돼요. */
  get paipu() {
    return this.game._paipu;
  }
}
