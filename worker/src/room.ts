import { DurableObject } from 'cloudflare:workers';
import {
  act,
  addPlayer,
  award,
  repay,
  createGame,
  dealLockMs,
  findPlayer,
  handInProgress,
  legalActions,
  rebuy,
  removePlayer,
  RuleError,
  setSeatOrder,
  setSittingOut,
  setStack,
  startHand,
  updateSettings,
  type Game,
  type Settings,
  bySeat,
} from '../../shared/engine';
import { cryptoRandInt, newDeck, shuffle } from '../../shared/cards';
import { cleanName, sameName } from '../../shared/names';
import { isDebugCode } from '../../shared/debugCode';
import { autoAward, handValue, visibleBoard, type Deal } from '../../shared/showdown';
import {
  AWAY_AFTER_MS,
  MAX_MESSAGE_BYTES,
  parseClientMessage,
  PING,
  PONG,
  type ClaimView,
  type Envelope,
  type ErrorCode,
  type HandRecord,
  type LogEntry,
  type LogKind,
  type MemberView,
  type RoomView,
  type ServerMessage,
  type ShownHand,
} from '../../shared/protocol';
import { MjDriver, MjRuleError, type MjLog, type MjStep } from '../../shared/mahjong/driver';
import { randomWall, roundName, tileName } from '../../shared/mahjong/tiles';
import { buildMjRecords } from '../../shared/mahjong/record';
import { DEFAULT_MJ_RULES, MJ_PLAYERS, type MjRules, type MjView } from '../../shared/mahjong/view';
import type { GameType } from '../../shared/protocol';
import type { Env } from './index';

export const DEFAULT_SETTINGS: Settings = { sb: 5, bb: 10, startingStack: 1000, buyInPrice: 0 };
/** 폰 시계 차이로 버튼이 막 풀린 순간 누른 게 거절되지 않게 조금 봐줘요 */
const DEAL_GRACE_MS = 400;
export const IDLE_TTL_MS = 12 * 60 * 60 * 1000;
const UNDO_DEPTH = 30;
const LOG_KEEP = 100;
const LOG_SEND = 100;
const HANDS_KEEP = 50;
const MAX_SOCKETS = 40;
const MAX_MEMBERS = 10;
const RATE_PER_SEC = 8;
const RATE_BURST = 20;
const STREETS = ['프리플랍', '플랍', '턴', '리버'];
const MJ_LABEL = { tsumo: '쯔모', ron: '론', pass: '론 넘김', abort: '구종구패 유국' } as const;

interface Member {
  id: string;
  name: string;
  tokenHash: string | null;
  manual: boolean;
  joinedAt: number;
}

interface Claim extends ClaimView {
  tokenHash: string;
  connId: string;
}

/**
 * 마작 되돌리기: 기록(MjLog)은 대답 목록이라, 몇 수까지였는지(steps)만 기억하면 돼요.
 * 다시 하기는 잘라낸 수들(append)을 기억해요. 게임 시작·끝처럼 기록이 통째로 바뀔 때만 기록 전체(log)를 둬요.
 */
type MjSnap = { steps: number } | { append: MjStep[] } | { log: MjLog | null };

interface Snapshot {
  label: string;
  game: Game;
  mj?: MjSnap;
}

interface Stored {
  code: string;
  createdAt: number;
  lastActivity: number;
  hostId: string | null;
  members: Member[];
  game: Game;
  v: number;
  log: LogEntry[];
  logSeq: number;
  claims: Claim[];
  turnStartedAt: number | null;
  turnId: string | null;
  /** 딜러가 카드를 까는 동안 베팅을 막는 시각과, 그게 어느 핸드·스트리트였는지 */
  dealUntil?: number | null;
  dealKey?: string | null;
  /** 카드 모드: 앱이 카드를 나눠주고 족보로 승자를 정해요 (테이블을 만들 때 정해요) */
  cardMode?: boolean;
  /** 카드 모드: 이번 핸드에 나눠준 카드. 절대 그대로 내보내지 않아요. */
  deal?: Deal | null;
  /** 끝난 핸드 기록 (최근 HANDS_KEEP판) */
  hands?: HandRecord[];
  /** 이번 핸드가 시작된 기록 줄 번호 */
  handLogFrom?: number;
  /** 게임 종류 (테이블을 만들 때 정해요). 예전 테이블에는 없어서 홀덤이에요. */
  gameType?: GameType;
  /** 마작: 다음 게임 규칙 */
  mjRules?: MjRules;
}

interface Attachment {
  connId: string;
  memberId: string | null;
  tokenHash: string | null;
  openedAt: number;
}

class Reject extends Error {
  constructor(
    public code: ErrorCode,
    message: string,
  ) {
    super(message);
  }
}

const deny = (code: ErrorCode, message: string): never => {
  throw new Reject(code, message);
};

export const randomId = (bytes = 8) =>
  [...crypto.getRandomValues(new Uint8Array(bytes))].map((b) => b.toString(16).padStart(2, '0')).join('');

async function sha256(input: string) {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(input));
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, '0')).join('');
}

const fmt = (n: number) => n.toLocaleString('en-US');

export class Room extends DurableObject<Env> {
  private s: Stored | null = null;
  private undo: Snapshot[] = [];
  /** 되돌린 상태들: 다시 하기(redo)로 앞으로 갈 수 있어요. 새 변경이 생기면 비워요. */
  private redo: Snapshot[] = [];
  private alarmAt: number | null = null;
  /** 마작 기록: 국마다 쓴 패산과 대답 목록. 따로 저장해요 ('mj' 키). 절대 그대로 내보내지 않아요. */
  private mjLog: MjLog | null = null;
  /** mjLog를 진행시킨 majiang-core 판 (메모리에만, 필요할 때 기록에서 다시 만들어요) */
  private mjDriver: MjDriver | null = null;
  /** Set when the host leaves: the table closes for everyone once the reply is sent. */
  private closeAfterReply = false;
  private buckets = new Map<string, { tokens: number; at: number; strikes: number }>();
  private lastMsg = new Map<string, number>();

  constructor(ctx: DurableObjectState, env: Env) {
    super(ctx, env);
    ctx.setWebSocketAutoResponse(new WebSocketRequestResponsePair(PING, PONG));
    void ctx.blockConcurrencyWhile(async () => {
      this.s = (await ctx.storage.get<Stored>('room')) ?? null;
      this.undo = (await ctx.storage.get<Snapshot[]>('undo')) ?? [];
      this.redo = (await ctx.storage.get<Snapshot[]>('redo')) ?? [];
      this.mjLog = (await ctx.storage.get<MjLog | null>('mj')) ?? null;
      this.alarmAt = await ctx.storage.getAlarm();
    });
  }

  // ---------- HTTP ----------

  async fetch(request: Request): Promise<Response> {
    const url = new URL(request.url);
    const route = url.pathname.split('/').pop();

    if (route === 'init' && request.method === 'POST') {
      if (this.s) return new Response('exists', { status: 409 });
      const { code, cardMode, gameType } = (await request.json()) as { code: string; cardMode?: boolean; gameType?: GameType };
      const mahjong = gameType === 'mahjong';
      const now = Date.now();
      this.s = {
        code,
        createdAt: now,
        lastActivity: now,
        hostId: null,
        members: [],
        game: createGame(DEFAULT_SETTINGS),
        v: 1,
        log: [],
        logSeq: 0,
        claims: [],
        turnStartedAt: null,
        turnId: null,
        dealUntil: null,
        dealKey: null,
        cardMode: cardMode === true && !mahjong,
        deal: null,
        gameType: mahjong ? 'mahjong' : 'holdem',
        mjRules: mahjong ? { ...DEFAULT_MJ_RULES } : undefined,
      };
      this.mjLog = null;
      this.mjDriver = null;
      this.undo = [];
      this.redo = [];
      this.persist();
      return Response.json({ code }, { status: 201 });
    }

    if (!this.s) return new Response('not found', { status: 404 });

    // 핸드 기록: 이 테이블에 앉은 사람만 (기기 토큰으로 확인). 공개된 정보만 보내요.
    // 디버그 코드(x-debug-code)가 맞으면 모두의 시작 패(holes)까지 보내요. 틀리면 거절.
    if (route === 'history') {
      const token = request.headers.get('x-token') ?? '';
      if (!/^[a-f0-9]{64}$/.test(token)) return new Response('forbidden', { status: 403 });
      const hash = await sha256(`${this.s.code}:${token}`);
      if (!this.s.members.some((m) => m.tokenHash === hash)) return new Response('forbidden', { status: 403 });
      const asked = request.headers.get('x-debug-code');
      if (asked !== null && !isDebugCode(this.s.code, asked)) return new Response('bad code', { status: 401 });
      const debug = asked !== null;
      const hands = (this.s.hands ?? []).map((h) => (debug ? h : { ...h, holes: undefined }));
      // 마작: 끝난 국만. 배패·쯔모는 디버그 코드가 맞을 때만.
      const mj = this.mj;
      const mjRounds = mj ? buildMjRecords(mj.paipu.log, 0, mj.log.players.map((p) => p.name), debug).slice(-HANDS_KEEP) : [];
      return Response.json(
        { code: this.s.code, cardMode: !!this.s.cardMode, gameType: this.gameType, debug, hands, mjRounds },
        { headers: { 'cache-control': 'no-store' } },
      );
    }

    if (route === 'info') {
      return Response.json({
        code: this.s.code,
        phase: this.gameType === 'mahjong' ? (this.mj?.phase ?? 'lobby') : this.s.game.phase,
        cardMode: !!this.s.cardMode,
        gameType: this.gameType,
        players: this.s.members.map((m) => m.name),
      });
    }

    if (route === 'ws') {
      if (request.headers.get('Upgrade') !== 'websocket') {
        return new Response('Expected WebSocket', { status: 426 });
      }
      if (this.ctx.getWebSockets().length >= MAX_SOCKETS) {
        return new Response('Table is crowded', { status: 503 });
      }
      const pair = new WebSocketPair();
      const [client, server] = Object.values(pair);
      this.ctx.acceptWebSocket(server);
      const att: Attachment = { connId: randomId(), memberId: null, tokenHash: null, openedAt: Date.now() };
      server.serializeAttachment(att);
      return new Response(null, { status: 101, webSocket: client });
    }

    return new Response('not found', { status: 404 });
  }

  // ---------- WebSocket ----------

  async webSocketMessage(ws: WebSocket, message: string | ArrayBuffer) {
    if (typeof message !== 'string' || message.length > MAX_MESSAGE_BYTES) {
      ws.close(1009, 'Message too large');
      return;
    }
    const att = ws.deserializeAttachment() as Attachment;
    if (!this.s) {
      this.send(ws, { type: 'closed', reason: 'expired' });
      ws.close(4004, 'Room expired');
      return;
    }
    if (!this.takeToken(att.connId)) {
      const b = this.buckets.get(att.connId);
      if (b && b.strikes > 20) ws.close(4008, 'Too many messages');
      else this.send(ws, { type: 'err', code: 'RATE', message: '너무 빨라요. 천천히 눌러 주세요' });
      return;
    }
    this.lastMsg.set(att.connId, Date.now());

    const msg = parseClientMessage(message);
    if (!msg) {
      this.send(ws, { type: 'err', code: 'INVALID', message: '잘못된 요청이에요' });
      return;
    }
    try {
      await this.handle(ws, att, msg);
      if (msg.seq !== undefined) this.send(ws, { type: 'ok', seq: msg.seq });
      if (this.closeAfterReply) {
        this.closeAfterReply = false;
        await this.closeTable(ws);
      }
    } catch (e) {
      if (e instanceof Reject || e instanceof RuleError || e instanceof MjRuleError) {
        const code = e.code as ErrorCode;
        this.send(ws, { type: 'err', seq: msg.seq, code, message: e.message });
        if (code === 'STALE') this.sendState(ws);
      } else {
        console.error('room error', e);
        this.send(ws, { type: 'err', seq: msg.seq, code: 'INVALID', message: '문제가 생겼어요' });
      }
    }
  }

  async webSocketClose(ws: WebSocket) {
    this.dropConnection(ws);
  }

  async webSocketError(ws: WebSocket) {
    this.dropConnection(ws);
  }

  /** Ends the table: everyone else is told the host closed it, then the room is wiped. */
  private async closeTable(leaver: WebSocket) {
    for (const ws of this.ctx.getWebSockets()) {
      if (ws !== leaver) this.send(ws, { type: 'closed', reason: 'ended' });
      try {
        ws.close(4005, 'Table closed by host');
      } catch {
        // already closed
      }
    }
    this.s = null;
    this.undo = [];
    this.redo = [];
    this.mjLog = null;
    this.mjDriver = null;
    this.alarmAt = null;
    await this.ctx.storage.deleteAlarm();
    await this.ctx.storage.deleteAll();
  }

  async alarm() {
    if (!this.s) return;
    const deadline = this.s.lastActivity + IDLE_TTL_MS;
    if (Date.now() < deadline) {
      this.alarmAt = deadline;
      await this.ctx.storage.setAlarm(deadline);
      return;
    }
    for (const ws of this.ctx.getWebSockets()) {
      this.send(ws, { type: 'closed', reason: 'expired' });
      try {
        ws.close(4004, 'Room expired');
      } catch {
        // already closed
      }
    }
    this.s = null;
    this.undo = [];
    this.redo = [];
    this.mjLog = null;
    this.mjDriver = null;
    this.alarmAt = null;
    await this.ctx.storage.deleteAll();
  }

  // ---------- dispatch ----------

  private async handle(ws: WebSocket, att: Attachment, msg: Envelope) {
    const s = this.s as Stored;
    if (msg.type === 'hello') {
      att.tokenHash = await sha256(`${s.code}:${msg.token}`);
      att.memberId = s.members.find((m) => m.tokenHash === att.tokenHash)?.id ?? null;
      ws.serializeAttachment(att);
      this.broadcast();
      return;
    }
    if (!att.tokenHash) deny('FORBIDDEN', '먼저 연결해 주세요');

    const me = att.memberId ? s.members.find((m) => m.id === att.memberId) : undefined;
    const requireMember = () => me ?? deny('FORBIDDEN', '먼저 테이블에 참가해 주세요');
    const requireHost = () => {
      const m = requireMember();
      if (s.hostId !== m.id) deny('FORBIDDEN', '방장만 할 수 있어요');
      return m;
    };
    const checkV = (v: number) => {
      if (v !== s.v) deny('STALE', '테이블이 바뀌었어요. 다시 시도해 주세요.');
    };
    const nameOf = (id: string) => s.members.find((m) => m.id === id)?.name ?? findPlayer(s.game, id)?.name ?? '누군가';
    /** Self, the host, or anyone acting for a seat without a present player. */
    const requireControl = (targetId: string | undefined) => {
      const m = requireMember();
      const id = targetId ?? m.id;
      if (id === m.id || s.hostId === m.id) return id;
      const target = s.members.find((x) => x.id === id) ?? deny('INVALID', '없는 플레이어예요');
      if (!this.isAway(target)) deny('FORBIDDEN', `${target.name}님이 아직 자리에 있어요`);
      return id;
    };

    switch (msg.type) {
      case 'join': {
        if (me) deny('INVALID', '이미 앉아 있어요');
        const name = this.uniqueName(msg.name);
        if (s.members.length >= this.maxMembers) deny('INVALID', '좌석이 꽉 찼어요');
        const member: Member = { id: randomId(), name, tokenHash: att.tokenHash, manual: false, joinedAt: Date.now() };
        s.game = addPlayer(s.game, member.id, name);
        s.members.push(member);
        s.hostId ??= member.id;
        s.claims = s.claims.filter((c) => c.connId !== att.connId);
        for (const other of this.ctx.getWebSockets()) {
          const oa = other.deserializeAttachment() as Attachment;
          if (oa.tokenHash === att.tokenHash) {
            oa.memberId = member.id;
            other.serializeAttachment(oa);
          }
        }
        this.log('table', `${name} 입장`);
        this.commit();
        return;
      }
      case 'addSeat': {
        requireHost();
        const name = this.uniqueName(msg.name);
        if (s.members.length >= this.maxMembers) deny('INVALID', '좌석이 꽉 찼어요');
        const member: Member = { id: randomId(), name, tokenHash: null, manual: true, joinedAt: Date.now() };
        s.game = addPlayer(s.game, member.id, name);
        s.members.push(member);
        this.log('table', `${name} 입장 (폰 없음)`);
        this.commit();
        return;
      }
      case 'claim': {
        if (me) deny('INVALID', '이미 앉아 있어요');
        const target = s.members.find((m) => m.id === msg.playerId) ?? deny('INVALID', '없는 플레이어예요');
        const othersHere = s.members.some((m) => m.id !== target.id && !this.isAway(m));
        const targetHere = !target.manual && !this.isAway(target);
        if (!othersHere && !targetHere) {
          this.applyClaim(target, att.tokenHash as string);
          this.log('table', `${target.name} 새 기기로 복귀`);
          this.commit();
          return;
        }
        s.claims = s.claims.filter((c) => c.connId !== att.connId);
        s.claims.push({
          id: randomId(),
          playerId: target.id,
          at: Date.now(),
          tokenHash: att.tokenHash as string,
          connId: att.connId,
        });
        this.commit();
        return;
      }
      case 'cancelClaim': {
        s.claims = s.claims.filter((c) => c.connId !== att.connId);
        this.commit();
        return;
      }
      case 'resolveClaim': {
        const m = requireMember();
        const claim = s.claims.find((c) => c.id === msg.claimId) ?? deny('INVALID', '이미 처리된 요청이에요');
        s.claims = s.claims.filter((c) => c.id !== claim.id);
        const target = s.members.find((x) => x.id === claim.playerId);
        if (msg.allow && target) {
          this.applyClaim(target, claim.tokenHash);
          this.log('table', `${m.name}님이 ${target.name}의 자리를 새 기기로 옮김`);
        } else {
          for (const other of this.ctx.getWebSockets()) {
            const oa = other.deserializeAttachment() as Attachment;
            if (oa.connId === claim.connId) {
              this.send(other, { type: 'err', code: 'FORBIDDEN', message: '테이블에서 요청을 거절했어요' });
            }
          }
        }
        this.commit();
        return;
      }
      case 'start': {
        requireHost();
        checkV(msg.v);
        if (this.gameType === 'mahjong') {
          this.mjStart();
          return;
        }
        if (s.game.phase !== 'lobby') deny('PHASE', '이미 게임이 시작됐어요');
        this.mutate('게임 시작', (g) => startHand(g));
        return;
      }
      case 'next': {
        // 핸드 진행(다음 핸드·승자 지급·되돌리기)은 방장만. 방장이 자리를 비우면 takeHost로 넘겨받아요.
        requireHost();
        checkV(msg.v);
        if (this.gameType === 'mahjong') {
          this.mjNext();
          return;
        }
        if (s.game.phase !== 'done') deny('PHASE', '아직 핸드가 끝나지 않았어요');
        this.mutate('다음 핸드 시작', (g) => startHand(g));
        return;
      }
      case 'act': {
        const m = requireMember();
        checkV(msg.v);
        if (this.gameType === 'mahjong') deny('INVALID', '마작 테이블이에요');
        if (s.dealUntil && Date.now() < s.dealUntil - DEAL_GRACE_MS) {
          deny('PHASE', '딜러가 카드를 까는 중이에요. 잠깐만요!');
        }
        const actorId = msg.playerId ?? m.id;
        if (actorId !== m.id) {
          const target = s.members.find((x) => x.id === actorId) ?? deny('INVALID', '없는 플레이어예요');
          if (!this.isAway(target)) deny('FORBIDDEN', `${target.name}님이 아직 자리에 있어요`);
        }
        const before = s.game;
        const after = act(before, actorId, { kind: msg.kind, amount: msg.amount });
        const text = this.describeAction(before, after, actorId);
        const suffix = actorId !== m.id ? ` (${m.name} 대신)` : '';
        this.mutate(text + suffix, () => after, 'action');
        return;
      }
      case 'award': {
        requireHost();
        checkV(msg.v);
        if (this.gameType === 'mahjong') deny('INVALID', '마작 테이블이에요');
        this.mutate('팟 지급', (g) => award(g, msg.winners));
        return;
      }
      case 'undo': {
        const m = requireHost();
        checkV(msg.v);
        const peek = this.undo.at(-1) ?? deny('INVALID', '되돌릴 게 없어요');
        this.guardCardUndo(peek.game);
        const snap = this.undo.pop() as Snapshot;
        this.redo.push({ label: snap.label, game: s.game, ...(snap.mj ? { mj: this.applyMj(snap.mj) } : {}) });
        if (this.redo.length > UNDO_DEPTH) this.redo.shift();
        s.game = this.withCards(this.reconcile(snap.game));
        s.v += 1;
        this.log('undo', `${m.name} 되돌림: ${snap.label}`);
        this.commit();
        return;
      }
      case 'redo': {
        const m = requireHost();
        checkV(msg.v);
        const peek = this.redo.at(-1) ?? deny('INVALID', '다시 할 게 없어요');
        this.guardCardUndo(peek.game);
        const snap = this.redo.pop() as Snapshot;
        this.undo.push({ label: snap.label, game: s.game, ...(snap.mj ? { mj: this.applyMj(snap.mj) } : {}) });
        if (this.undo.length > UNDO_DEPTH) this.undo.shift();
        s.game = this.withCards(this.reconcile(snap.game));
        s.v += 1;
        this.log('undo', `${m.name} 다시 하기: ${snap.label}`);
        this.commit();
        return;
      }
      case 'sit': {
        const id = requireControl(msg.playerId);
        this.mutate(`${nameOf(id)} ${msg.out ? '싯아웃' : '싯인'}`, (g) => setSittingOut(g, id, msg.out), 'table');
        return;
      }
      case 'rebuy': {
        const id = requireControl(msg.playerId);
        this.mutate(
          `${nameOf(id)} 리바이 ${fmt(s.game.settings.startingStack)}`,
          (g) => rebuy(g, id),
          'table',
        );
        return;
      }
      case 'repay': {
        // 빚은 본인만 갚을 수 있어요
        const m = requireMember();
        this.mutate(`${m.name} 은행에 ${fmt(msg.amount)} 갚음`, (g) => repay(g, m.id, msg.amount), 'table');
        return;
      }
      case 'leave': {
        const m = requireMember();
        // 방장이 직접 나가면 옛 방이 남지 않도록 테이블을 모두에게 닫아요.
        // (방장이 그냥 끊긴 경우에는 takeHost로 다른 사람이 넘겨받을 수 있어요.)
        if (s.hostId === m.id) {
          this.closeAfterReply = true;
          return;
        }
        this.removeMember(m, 'left');
        return;
      }
      case 'kick': {
        const host = requireHost();
        if (msg.playerId === host.id) deny('INVALID', '나가기를 이용해 주세요');
        const target = s.members.find((x) => x.id === msg.playerId) ?? deny('INVALID', '없는 플레이어예요');
        this.removeMember(target, 'kicked');
        return;
      }
      case 'settings': {
        requireHost();
        checkV(msg.v);
        const pending = s.game.phase === 'betting' || s.game.phase === 'showdown';
        const { sb, bb, startingStack } = msg.settings;
        this.mutate(
          `블라인드 ${fmt(sb)}/${fmt(bb)}, 시작 스택 ${fmt(startingStack)}${pending ? ' (다음 핸드부터)' : ''}`,
          (g) => updateSettings(g, msg.settings),
          'table',
        );
        return;
      }
      case 'setStack': {
        requireHost();
        checkV(msg.v);
        this.mutate(
          `${nameOf(msg.playerId)} 스택 ${fmt(msg.stack)}(으)로 수정`,
          (g) => setStack(g, msg.playerId, msg.stack),
          'table',
        );
        return;
      }
      case 'seatOrder': {
        requireHost();
        checkV(msg.v);
        if (this.mj) deny('PHASE', '게임 중에는 자리를 바꿀 수 없어요');
        this.mutate('좌석 순서 변경', (g) => setSeatOrder(g, msg.ids), 'table');
        return;
      }
      case 'transferHost': {
        const host = requireHost();
        const target = s.members.find((x) => x.id === msg.playerId) ?? deny('INVALID', '없는 플레이어예요');
        if (target.manual) deny('INVALID', '폰 없는 자리예요');
        s.hostId = target.id;
        this.log('table', `${host.name} → ${target.name} 방장 넘김`);
        this.commit();
        return;
      }
      case 'mj': {
        const m = requireMember();
        checkV(msg.v);
        const mj = this.mj ?? deny('PHASE', '아직 게임이 시작되지 않았어요');
        const seat = this.mjSeat(m.id);
        if (seat === -1) deny('FORBIDDEN', '이 판에 앉은 사람이 아니에요');
        const a = msg.action;
        const label = `${m.name} ${a.kind === 'discard' ? `${tileName(a.tile)} 버림` : MJ_LABEL[a.kind]}`;
        this.mjMutate(label, () => mj.act(seat, msg.action));
        return;
      }
      case 'mjAuto': {
        // 자리 비운 사람 차례를 대신 넘겨요: 뽑은 패를 그대로 버리거나 론 기회를 넘겨요
        const m = requireMember();
        checkV(msg.v);
        const mj = this.mj ?? deny('PHASE', '아직 게임이 시작되지 않았어요');
        const seat = this.mjSeat(msg.playerId);
        if (seat === -1) deny('INVALID', '이 판에 앉은 사람이 아니에요');
        const target = s.members.find((x) => x.id === msg.playerId);
        if (target && !this.isAway(target)) deny('FORBIDDEN', `${target.name}님이 아직 자리에 있어요`);
        const legal = mj.legal(seat) ?? deny('NOT_TURN', '그 자리는 지금 고를 게 없어요');
        const action = legal.pass
          ? { kind: 'pass' as const }
          : { kind: 'discard' as const, tile: legal.discard[legal.discard.length - 1] };
        this.mjMutate(`${nameOf(msg.playerId)} 대신 넘김 (${m.name})`, () => mj.act(seat, action));
        return;
      }
      case 'mjRules': {
        requireHost();
        checkV(msg.v);
        if (this.gameType !== 'mahjong') deny('INVALID', '마작 테이블이 아니에요');
        if (this.mj) deny('PHASE', '게임 중에는 규칙을 바꿀 수 없어요');
        s.mjRules = msg.rules;
        s.v += 1;
        const r = msg.rules;
        this.log(
          'table',
          `규칙: ${r.length === 'east' ? '동풍전' : '반장전'}, 시작 ${fmt(r.startPoints)}점, 적도라 ${r.aka ? '있음' : '없음'}, 쿠이탕 ${r.kuitan ? '있음' : '없음'}`,
        );
        this.commit();
        return;
      }
      case 'takeHost': {
        const m = requireMember();
        if (m.manual) deny('FORBIDDEN', '할 수 없어요');
        const host = s.members.find((x) => x.id === s.hostId);
        if (host && !this.isAway(host)) deny('FORBIDDEN', `${host.name}님이 아직 방장이에요`);
        s.hostId = m.id;
        this.log('table', `${m.name} 새 방장`);
        this.commit();
        return;
      }
    }
  }

  // ---------- state changes ----------

  private mutate(label: string, fn: (g: Game) => Game, kind: LogKind = 'hand') {
    const s = this.s as Stored;
    const before = s.game;
    const after = this.withCards(fn(before));
    this.undo.push({ label, game: before });
    this.redo = [];
    if (this.undo.length > UNDO_DEPTH) this.undo.shift();
    s.game = after;
    s.v += 1;
    this.logTransition(before, after, label, kind);
    this.commit();
  }

  private logTransition(before: Game, after: Game, label: string, kind: LogKind) {
    const s = this.s as Stored;
    const name = (id: string | null) => findPlayer(after, id)?.name ?? s.members.find((m) => m.id === id)?.name ?? '';
    if (after.handNo !== before.handNo) {
      this.log('hand', `핸드 #${after.handNo} · 버튼 ${name(after.buttonId)}`);
      s.handLogFrom = s.logSeq;
    } else if (kind !== 'hand') {
      this.log(kind, label);
    }
    if (after.phase === 'betting' && after.handNo === before.handNo && after.street !== before.street) {
      this.log('hand', STREETS[after.street]);
    }
    if (after.phase === 'showdown' && before.phase !== 'showdown') {
      this.log('hand', after.runout ? '올인 런아웃' : '쇼다운');
    }
    if (after.results.length > 0 && after.phase === 'done' && before.phase !== 'done') {
      const totals = new Map<string, number>();
      for (const r of after.results) totals.set(r.id, (totals.get(r.id) ?? 0) + r.amount);
      const deal = s.deal && s.deal.handNo === after.handNo ? s.deal : null;
      if (deal && after.reveal) {
        for (const id of after.reveal) {
          const value = handValue(deal, id);
          if (value) this.log('hand', `${name(id)} ${value.label}`);
        }
      }
      for (const [id, amount] of totals) {
        const p = findPlayer(after, id) ?? after.departed.find((d) => d.id === id);
        this.log('win', `${p?.name ?? '누군가'} ${fmt(amount)} 획득`);
      }
    }
    if (after.phase === 'done' && before.phase !== 'done' && after.handNo > 0) this.recordHand(after);
  }

  /** 핸드가 끝나면 공개된 정보만 모아 기록해요. 되돌렸다가 다시 끝나면 같은 핸드를 덮어써요. */
  private recordHand(g: Game) {
    const s = this.s as Stored;
    const name = (id: string | null) =>
      (id && (findPlayer(g, id)?.name ?? g.departed.find((d) => d.id === id)?.name ?? s.members.find((m) => m.id === id)?.name)) || '누군가';
    const deal = s.cardMode && s.deal && s.deal.handNo === g.handNo ? s.deal : null;
    const totals = new Map<string, number>();
    for (const r of g.results) totals.set(r.id, (totals.get(r.id) ?? 0) + r.amount);
    const start = s.log.find((e) => e.id === s.handLogFrom);
    const record: HandRecord = {
      handNo: g.handNo,
      startedAt: start?.at ?? Date.now(),
      cardMode: !!s.cardMode,
      sb: g.settings.sb,
      bb: g.settings.bb,
      button: name(g.buttonId),
      actions: (g.actions ?? []).map((a) => ({ street: a.street, name: name(a.id), kind: a.kind, to: a.to, allIn: a.allIn })),
      holes: deal
        ? bySeat(g)
            .filter((p) => deal.hole[p.id])
            .map((p) => ({ name: p.name, cards: deal.hole[p.id] }))
            // 핸드가 끝나기 전에 나간 사람도 받은 패는 남겨요
            .concat(
              Object.entries(deal.hole)
                .filter(([id]) => !findPlayer(g, id))
                .map(([id, cards]) => ({ name: name(id), cards })),
            )
        : [],
      board: deal ? visibleBoard(g, deal) : [],
      shown:
        deal && g.reveal
          ? g.reveal.flatMap((id) => {
              const value = handValue(deal, id);
              return value ? [{ name: name(id), cards: deal.hole[id], category: value.category, label: value.label }] : [];
            })
          : [],
      winners: [...totals].map(([id, amount]) => ({ name: name(id), amount })),
    };
    const hands = (s.hands ?? []).filter((h) => h.handNo !== g.handNo);
    hands.push(record);
    s.hands = hands.slice(-HANDS_KEEP);
  }

  private describeAction(before: Game, after: Game, id: string) {
    const p = findPlayer(after, id);
    const la = after.lastAction;
    if (!p || !la) return '행동';
    switch (la.kind) {
      case 'fold':
        return `${p.name} 폴드`;
      case 'check':
        return `${p.name} 체크`;
      case 'call':
        return la.allIn ? `${p.name} 올인 콜 ${fmt(la.amount)}` : `${p.name} 콜 ${fmt(la.amount)}`;
      case 'raise':
        if (la.allIn) return `${p.name} 올인 ${fmt(la.amount)}`;
        return before.currentBet === 0 ? `${p.name} 벳 ${fmt(la.amount)}` : `${p.name} 레이즈 ${fmt(la.amount)}`;
      default:
        return `${p.name} 행동`;
    }
  }

  // ---------- 마작 ----------

  private get gameType(): GameType {
    return this.s?.gameType ?? 'holdem';
  }

  private get maxMembers() {
    return this.gameType === 'mahjong' ? MJ_PLAYERS : MAX_MEMBERS;
  }

  /** 진행 중인(또는 끝난) 마작 판. 기록에서 필요할 때 다시 만들어요. */
  private get mj(): MjDriver | null {
    if (!this.mjLog) return null;
    if (!this.mjDriver) this.setMjLog(this.mjLog);
    return this.mjDriver;
  }

  private setMjLog(log: MjLog | null) {
    this.mjDriver = log ? new MjDriver(log, () => randomWall(log.rules.aka)) : null;
    // 운전석이 진행하면서 패산·수를 덧붙이는 기록을 그대로 저장해요
    this.mjLog = this.mjDriver?.log ?? null;
  }

  private mjSeat(id: string) {
    return this.mjLog ? this.mjLog.players.findIndex((p) => p.id === id) : -1;
  }

  /** 폰 없는 자리(봇)와 테이블을 떠난 사람 자리는 자동으로 둬요 */
  private mjBots() {
    const s = this.s as Stored;
    const mj = this.mj;
    if (!mj || !this.mjLog) return;
    const players = this.mjLog.players;
    mj.runBots((seat) => {
      const m = s.members.find((x) => x.id === players[seat].id);
      return !m || m.manual;
    });
  }

  /** 되돌리기 한 칸을 적용하고, 거꾸로 돌아갈 칸을 돌려줘요 */
  private applyMj(snap: MjSnap): MjSnap {
    if ('log' in snap) {
      const inverse: MjSnap = { log: this.mjLog ? structuredClone(this.mjLog) : null };
      this.setMjLog(snap.log ? structuredClone(snap.log) : null);
      return inverse;
    }
    const log = this.mjLog ?? deny('INVALID', '되돌릴 게 없어요');
    if ('steps' in snap) {
      const tail = log.steps.slice(snap.steps);
      this.setMjLog({ ...log, steps: log.steps.slice(0, snap.steps) });
      return { append: tail };
    }
    const n = log.steps.length;
    this.setMjLog({ ...log, steps: [...log.steps, ...snap.append] });
    return { steps: n };
  }

  /** 마작 판을 바꾸고 되돌리기 칸을 남겨요. 바꾼 뒤 봇 차례면 봇이 이어서 둬요. */
  private mjMutate(label: string, change: () => void, before?: MjSnap) {
    const s = this.s as Stored;
    const snap: MjSnap = before ?? { steps: this.mjLog?.steps.length ?? 0 };
    const prev = this.mj?.publicView() ?? null;
    change();
    this.mjBots();
    this.undo.push({ label, game: s.game, mj: snap });
    this.redo = [];
    if (this.undo.length > UNDO_DEPTH) this.undo.shift();
    s.v += 1;
    this.logMj(prev, this.mj?.publicView() ?? null);
    this.commit();
  }

  private mjStart() {
    const s = this.s as Stored;
    if (this.mj) deny('PHASE', '이미 게임이 시작됐어요');
    const seats = bySeat(s.game);
    if (seats.length !== MJ_PLAYERS) deny('INVALID', `마작은 ${MJ_PLAYERS}명이 앉아야 시작할 수 있어요 (지금 ${seats.length}명)`);
    const rules = s.mjRules ?? DEFAULT_MJ_RULES;
    const players = seats.map((p) => ({ id: p.id, name: p.name }));
    this.mjMutate(
      '게임 시작',
      () => {
        const driver = MjDriver.start(rules, players, () => randomWall(rules.aka));
        this.mjDriver = driver;
        this.mjLog = driver.log;
      },
      { log: null },
    );
  }

  private mjNext() {
    const mj = this.mj ?? deny('PHASE', '아직 게임이 시작되지 않았어요');
    if (mj.phase === 'end') {
      // 게임이 끝났으면 대기실로 (규칙을 바꾸거나 새 게임을 시작해요)
      this.mjMutate('대기실로', () => this.setMjLog(null), { log: structuredClone(mj.log) });
      return;
    }
    if (mj.phase !== 'result') deny('PHASE', '아직 이번 국이 끝나지 않았어요');
    this.mjMutate('다음 국', () => mj.ack());
  }

  /** 국 시작, 화료·유국, 게임 끝만 기록에 남겨요 (버림패 하나하나는 너무 많아서 안 남겨요) */
  private logMj(before: MjView | null, after: MjView | null) {
    if (!after) return;
    const name = (seat: number | null) => (seat === null ? '' : (after.seats[seat]?.name ?? '누군가'));
    if (!before || before.roundNo !== after.roundNo) {
      if (after.phase !== 'end') {
        this.log('hand', `${roundName(after.roundWind, after.kyoku)} ${after.honba}본장 · 친 ${name(after.dealer)}`);
        (this.s as Stored).handLogFrom = (this.s as Stored).logSeq;
      }
    }
    const fresh = after.results.slice(before && before.roundNo === after.roundNo ? before.results.length : 0);
    for (const r of fresh) {
      if (r.kind === 'win') {
        const how = r.from === null ? '쯔모' : `론 (${name(r.from)} 버림)`;
        this.log('win', `${name(r.seat)} ${how} · ${fmt(r.points)}점`);
      } else {
        const tenpai = r.shown.flatMap((h, i) => (h ? [name(i)] : []));
        this.log('win', `유국 · ${tenpai.length ? `텐파이 ${tenpai.join(', ')}` : '모두 노텐'}`);
      }
    }
    if (after.final && !before?.final) {
      const order = after.final.rank.map((r, i) => ({ r, i })).sort((a, b) => a.r - b.r);
      this.log('win', `게임 끝 · ${order.map(({ r, i }) => `${r}위 ${name(i)} ${fmt(after.final!.points[i])}`).join(', ')}`);
    }
  }

  // ---------- 카드 모드 ----------

  /** 새 핸드가 시작됐으면 카드를 나눠주고, 쇼다운에 왔으면 족보대로 팟을 지급해요. */
  private withCards(g: Game): Game {
    const s = this.s as Stored;
    if (!s.cardMode) return g;
    if (handInProgress(g) && g.handNo > 0 && s.deal?.handNo !== g.handNo) {
      const deck = shuffle(newDeck(), cryptoRandInt);
      const hole: Record<string, string[]> = {};
      for (const p of g.players.filter((q) => q.inHand)) hole[p.id] = [deck.pop()!, deck.pop()!];
      s.deal = { handNo: g.handNo, board: deck.slice(0, 5), hole };
    }
    return s.deal ? autoAward(g, s.deal) : g;
  }

  /** 카드 모드에서는 다른 핸드로 되돌아가지 못하게 해요 (이미 본 카드가 다시 섞이면 안 돼요). */
  private guardCardUndo(target: Game) {
    const s = this.s as Stored;
    if (s.cardMode && target.handNo !== s.game.handNo) {
      deny('INVALID', '카드 모드에서는 이전 핸드로 되돌릴 수 없어요');
    }
  }

  /** 쇼다운에서 공개된 패 */
  private shownHands(): ShownHand[] {
    const s = this.s as Stored;
    const g = s.game;
    const deal = s.deal;
    if (!s.cardMode || !deal || deal.handNo !== g.handNo || !g.reveal) return [];
    return g.reveal.flatMap((id) => {
      const value = handValue(deal, id);
      if (!value) return [];
      const name = findPlayer(g, id)?.name ?? g.departed.find((d) => d.id === id)?.name ?? '누군가';
      return [{ id, name, cards: deal.hole[id], label: value.label, best: value.best, made: value.made }];
    });
  }

  /** Undo restores game state only. Seats follow current membership. */
  private reconcile(game: Game): Game {
    const s = this.s as Stored;
    let g = game;
    for (const p of [...g.players]) {
      if (!s.members.some((m) => m.id === p.id) && !p.leaving) g = removePlayer(g, p.id);
    }
    for (const m of s.members) {
      if (!findPlayer(g, m.id)) {
        try {
          g = addPlayer(g, m.id, m.name);
        } catch {
          // table full of players still finishing a hand; they are seated next undo-free change
        }
      }
    }
    return g;
  }

  private removeMember(target: Member, how: 'left' | 'kicked') {
    const s = this.s as Stored;
    const before = s.game;
    const after = this.withCards(findPlayer(before, target.id) ? removePlayer(before, target.id) : before);
    s.members = s.members.filter((m) => m.id !== target.id);
    s.claims = s.claims.filter((c) => c.playerId !== target.id);
    if (s.hostId === target.id) {
      s.hostId = (s.members.find((m) => !m.manual && !this.isAway(m)) ?? s.members.find((m) => !m.manual))?.id ?? null;
    }
    for (const ws of this.ctx.getWebSockets()) {
      const oa = ws.deserializeAttachment() as Attachment;
      if (oa.memberId !== target.id) continue;
      oa.memberId = null;
      ws.serializeAttachment(oa);
      if (how === 'kicked') {
        this.send(ws, { type: 'closed', reason: 'kicked' });
        ws.close(4002, 'Removed by host');
      }
    }
    this.undo.push({ label: `${target.name} ${how === 'left' ? '나감' : '내보내짐'}`, game: before });
    this.redo = [];
    if (this.undo.length > UNDO_DEPTH) this.undo.shift();
    s.game = after;
    s.v += 1;
    this.log('table', how === 'left' ? `${target.name} 나감` : `${target.name} 내보내짐`);
    this.logTransition(before, after, '', 'hand');
    if (this.mj && this.mj.phase === 'play') {
      // 마작 중에 나가면 그 자리는 자동으로 둬요
      const prev = this.mj.publicView();
      this.mjBots();
      this.logMj(prev, this.mj.publicView());
    }
    this.commit();
  }

  private applyClaim(target: Member, tokenHash: string) {
    const s = this.s as Stored;
    target.tokenHash = tokenHash;
    target.manual = false;
    s.claims = s.claims.filter((c) => c.playerId !== target.id);
    for (const ws of this.ctx.getWebSockets()) {
      const oa = ws.deserializeAttachment() as Attachment;
      if (oa.tokenHash === tokenHash) {
        oa.memberId = target.id;
        ws.serializeAttachment(oa);
      } else if (oa.memberId === target.id) {
        oa.memberId = null;
        ws.serializeAttachment(oa);
        this.send(ws, { type: 'closed', reason: 'replaced' });
        ws.close(4001, 'Seat moved to another device');
      }
    }
  }

  private uniqueName(raw: string) {
    const s = this.s as Stored;
    const name = cleanName(raw) ?? deny('INVALID', '이름을 정해 주세요');
    if (s.members.some((m) => sameName(m.name, name))) {
      deny('INVALID', `${name} 이름이 이미 있어요. 본인이라면 아래에서 이름을 누르세요.`);
    }
    return name;
  }

  private log(kind: LogKind, text: string) {
    const s = this.s as Stored;
    s.logSeq += 1;
    s.log.push({ id: s.logSeq, at: Date.now(), kind, text });
    if (s.log.length > LOG_KEEP) s.log.splice(0, s.log.length - LOG_KEEP);
  }

  private commit() {
    const s = this.s as Stored;
    const turn = s.game.toActId;
    if (turn !== s.turnId) {
      s.turnStartedAt = turn ? Date.now() : null;
      s.turnId = turn;
    }
    // 새 핸드나 새 스트리트가 열리면 딜러가 카드를 깔 시간만큼 베팅을 잠가요.
    // 되돌리기로 이미 진행된 스트리트에 돌아온 경우엔 누군가 행동했으니 잠그지 않아요.
    const g = s.game;
    const key = g.phase === 'betting' ? `${g.handNo}:${g.street}` : null;
    if (key !== (s.dealKey ?? null)) {
      // 카드 모드에서는 앱이 바로 카드를 깔아서 기다릴 필요가 없어요
      const ms = this.env.DEAL_LOCK_OFF === '1' || s.cardMode ? 0 : dealLockMs(g);
      s.dealUntil = ms > 0 ? Date.now() + ms : null;
      s.dealKey = key;
    }
    s.lastActivity = Date.now();
    this.persist();
    this.broadcast();
  }

  private persist() {
    const s = this.s as Stored;
    void this.ctx.storage.put({ room: s, undo: this.undo, redo: this.redo, mj: this.mjLog });
    const deadline = s.lastActivity + IDLE_TTL_MS;
    if (this.alarmAt === null || Math.abs(deadline - this.alarmAt) > 30 * 60 * 1000) {
      this.alarmAt = deadline;
      void this.ctx.storage.setAlarm(deadline);
    }
  }

  // ---------- presence ----------

  private socketLastSeen(ws: WebSocket, att: Attachment) {
    const auto = this.ctx.getWebSocketAutoResponseTimestamp(ws)?.getTime() ?? 0;
    return Math.max(att.openedAt, auto, this.lastMsg.get(att.connId) ?? 0);
  }

  private presence(memberId: string) {
    const now = Date.now();
    let connections = 0;
    let lastSeen = 0;
    for (const ws of this.ctx.getWebSockets()) {
      if (ws.readyState !== WebSocket.OPEN) continue;
      const att = ws.deserializeAttachment() as Attachment;
      if (att.memberId !== memberId) continue;
      const seen = this.socketLastSeen(ws, att);
      lastSeen = Math.max(lastSeen, seen);
      if (now - seen < AWAY_AFTER_MS) connections += 1;
    }
    return { connections, lastSeen };
  }

  private isAway(m: Member) {
    return m.manual || this.presence(m.id).connections === 0;
  }

  private dropConnection(ws: WebSocket) {
    const att = ws.deserializeAttachment() as Attachment | null;
    if (!att || !this.s) return;
    this.buckets.delete(att.connId);
    this.lastMsg.delete(att.connId);
    const before = this.s.claims.length;
    this.s.claims = this.s.claims.filter((c) => c.connId !== att.connId);
    if (before !== this.s.claims.length) this.persist();
    this.broadcast(ws);
  }

  private takeToken(connId: string) {
    const now = Date.now();
    const b = this.buckets.get(connId) ?? { tokens: RATE_BURST, at: now, strikes: 0 };
    b.tokens = Math.min(RATE_BURST, b.tokens + ((now - b.at) / 1000) * RATE_PER_SEC);
    b.at = now;
    const ok = b.tokens >= 1;
    if (ok) b.tokens -= 1;
    else b.strikes += 1;
    this.buckets.set(connId, b);
    return ok;
  }

  // ---------- output ----------

  private view(): RoomView {
    const s = this.s as Stored;
    const members: MemberView[] = s.members.map((m) => ({
      id: m.id,
      name: m.name,
      manual: m.manual,
      ...this.presence(m.id),
    }));
    return {
      code: s.code,
      gameType: this.gameType,
      mj: this.mj?.publicView() ?? null,
      mjRules: this.gameType === 'mahjong' ? (s.mjRules ?? DEFAULT_MJ_RULES) : null,
      cardMode: !!s.cardMode,
      board: s.cardMode ? visibleBoard(s.game, s.deal) : [],
      shown: this.shownHands(),
      createdAt: s.createdAt,
      hostId: s.hostId,
      members,
      game: s.game,
      claims: s.claims.map(({ id, playerId, at }) => ({ id, playerId, at })),
      log: s.log.slice(-LOG_SEND),
      undoLabel: this.undo.at(-1)?.label ?? null,
      redoLabel: this.redo.at(-1)?.label ?? null,
      turnStartedAt: s.turnStartedAt,
      dealUntil: s.dealUntil ?? null,
    };
  }

  private stateFor(ws: WebSocket, room: RoomView): ServerMessage {
    const s = this.s as Stored;
    const att = ws.deserializeAttachment() as Attachment;
    const id = att.memberId;
    return {
      type: 'state',
      v: s.v,
      serverNow: Date.now(),
      room,
      you: {
        id,
        isHost: !!id && s.hostId === id,
        claimId: s.claims.find((c) => c.connId === att.connId)?.id ?? null,
        legal: id ? legalActions(s.game, id) : null,
        hole: this.holeFor(id),
        mj: this.mjFor(id),
      },
    };
  }

  /** 내 카드만 보내요. 이번 핸드 카드가 아니면 아무것도 안 보내요. */
  private holeFor(id: string | null): string[] | null {
    const s = this.s as Stored;
    const deal = s.deal;
    if (!s.cardMode || !id || !deal || deal.handNo !== s.game.handNo || s.game.handNo === 0) return null;
    return deal.hole[id] ?? null;
  }

  /** 마작: 내 손패만 보내요 */
  private mjFor(id: string | null) {
    const seat = id ? this.mjSeat(id) : -1;
    const mj = this.mj;
    if (!mj || seat === -1) return null;
    return mj.privateView(seat);
  }

  private sendState(ws: WebSocket) {
    if (!this.s) return;
    this.send(ws, this.stateFor(ws, this.view()));
  }

  private broadcast(except?: WebSocket) {
    if (!this.s) return;
    const room = this.view();
    for (const ws of this.ctx.getWebSockets()) {
      if (ws === except || ws.readyState !== WebSocket.OPEN) continue;
      const att = ws.deserializeAttachment() as Attachment;
      if (!att.tokenHash) continue;
      this.send(ws, this.stateFor(ws, room));
    }
  }

  private send(ws: WebSocket, msg: ServerMessage) {
    try {
      ws.send(JSON.stringify(msg));
    } catch {
      // socket went away mid-send
    }
  }
}
