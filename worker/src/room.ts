import { DurableObject } from 'cloudflare:workers';
import {
  act,
  addPlayer,
  award,
  createGame,
  findPlayer,
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
} from '../../shared/engine';
import { cleanName, sameName } from '../../shared/names';
import {
  AWAY_AFTER_MS,
  MAX_MESSAGE_BYTES,
  parseClientMessage,
  PING,
  PONG,
  type ClaimView,
  type Envelope,
  type ErrorCode,
  type LogEntry,
  type LogKind,
  type MemberView,
  type RoomView,
  type ServerMessage,
} from '../../shared/protocol';
import type { Env } from './index';

export const DEFAULT_SETTINGS: Settings = { sb: 5, bb: 10, startingStack: 1000, buyInPrice: 0 };
export const IDLE_TTL_MS = 12 * 60 * 60 * 1000;
const UNDO_DEPTH = 30;
const LOG_KEEP = 100;
const LOG_SEND = 40;
const MAX_SOCKETS = 40;
const MAX_MEMBERS = 10;
const RATE_PER_SEC = 8;
const RATE_BURST = 20;
const STREETS = ['프리플랍', '플랍', '턴', '리버'];

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

interface Snapshot {
  label: string;
  game: Game;
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
  private alarmAt: number | null = null;
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
      this.alarmAt = await ctx.storage.getAlarm();
    });
  }

  // ---------- HTTP ----------

  async fetch(request: Request): Promise<Response> {
    const url = new URL(request.url);
    const route = url.pathname.split('/').pop();

    if (route === 'init' && request.method === 'POST') {
      if (this.s) return new Response('exists', { status: 409 });
      const { code } = (await request.json()) as { code: string };
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
      };
      this.undo = [];
      this.persist();
      return Response.json({ code }, { status: 201 });
    }

    if (!this.s) return new Response('not found', { status: 404 });

    if (route === 'info') {
      return Response.json({
        code: this.s.code,
        phase: this.s.game.phase,
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
      if (e instanceof Reject || e instanceof RuleError) {
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
        if (s.members.length >= MAX_MEMBERS) deny('INVALID', '좌석이 꽉 찼어요');
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
        if (s.members.length >= MAX_MEMBERS) deny('INVALID', '좌석이 꽉 찼어요');
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
        if (s.game.phase !== 'lobby') deny('PHASE', '이미 게임이 시작됐어요');
        this.mutate('게임 시작', (g) => startHand(g));
        return;
      }
      case 'next': {
        // 핸드 진행(다음 핸드·승자 지급·되돌리기)은 방장만. 방장이 자리를 비우면 takeHost로 넘겨받아요.
        requireHost();
        checkV(msg.v);
        if (s.game.phase !== 'done') deny('PHASE', '아직 핸드가 끝나지 않았어요');
        this.mutate('다음 핸드 시작', (g) => startHand(g));
        return;
      }
      case 'act': {
        const m = requireMember();
        checkV(msg.v);
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
        this.mutate('팟 지급', (g) => award(g, msg.winners));
        return;
      }
      case 'undo': {
        const m = requireHost();
        checkV(msg.v);
        const snap = this.undo.pop() ?? deny('INVALID', '되돌릴 게 없어요');
        s.game = this.reconcile(snap.game);
        s.v += 1;
        this.log('undo', `${m.name} 되돌림: ${snap.label}`);
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
    const after = fn(before);
    this.undo.push({ label, game: before });
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
    } else if (kind !== 'hand') {
      this.log(kind, label);
    }
    if (after.phase === 'betting' && after.handNo === before.handNo && after.street !== before.street) {
      this.log('hand', STREETS[after.street]);
    }
    if (after.phase === 'showdown' && before.phase !== 'showdown') {
      this.log('hand', after.runout ? '올인 · 런아웃' : '쇼다운');
    }
    if (after.results.length > 0 && after.phase === 'done' && before.phase !== 'done') {
      const totals = new Map<string, number>();
      for (const r of after.results) totals.set(r.id, (totals.get(r.id) ?? 0) + r.amount);
      for (const [id, amount] of totals) {
        const p = findPlayer(after, id) ?? after.departed.find((d) => d.id === id);
        this.log('win', `${p?.name ?? '누군가'} ${fmt(amount)} 획득`);
      }
    }
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
    const after = findPlayer(before, target.id) ? removePlayer(before, target.id) : before;
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
    if (this.undo.length > UNDO_DEPTH) this.undo.shift();
    s.game = after;
    s.v += 1;
    this.log('table', how === 'left' ? `${target.name} 나감` : `${target.name} 내보내짐`);
    this.logTransition(before, after, '', 'hand');
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
    s.lastActivity = Date.now();
    this.persist();
    this.broadcast();
  }

  private persist() {
    const s = this.s as Stored;
    void this.ctx.storage.put({ room: s, undo: this.undo });
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
      createdAt: s.createdAt,
      hostId: s.hostId,
      members,
      game: s.game,
      claims: s.claims.map(({ id, playerId, at }) => ({ id, playerId, at })),
      log: s.log.slice(-LOG_SEND),
      undoLabel: this.undo.at(-1)?.label ?? null,
      turnStartedAt: s.turnStartedAt,
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
      },
    };
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
