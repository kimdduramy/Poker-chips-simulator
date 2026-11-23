import type { Card } from './cards';
import type { ActionKind, Game, Legal, Settings } from './engine';
import { isMjRules, type MjAction, type MjPrivate, type MjRules, type MjView } from './mahjong/view';

/** 테이블의 게임 종류 (테이블을 만들 때 정해요) */
export type GameType = 'holdem' | 'mahjong';

export const MAX_MESSAGE_BYTES = 2048;
export const CODE_ALPHABET = 'ABCDEFGHJKMNPQRSTUVWXYZ';
export const CODE_LENGTH = 4;
export const PING = 'ping';
export const PONG = 'pong';
/** A socket silent (no ping) for longer than this counts as away. */
export const AWAY_AFTER_MS = 30_000;

export const isRoomCode = (code: unknown): code is string =>
  typeof code === 'string' && new RegExp(`^[${CODE_ALPHABET}]{${CODE_LENGTH}}$`).test(code);

export const normalizeCode = (input: string) =>
  input
    .toUpperCase()
    .replace(/[^A-Z]/g, '')
    .slice(0, CODE_LENGTH);

export type ClientMessage =
  | { type: 'hello'; token: string }
  | { type: 'join'; name: string }
  | { type: 'addSeat'; name: string }
  | { type: 'claim'; playerId: string }
  | { type: 'cancelClaim' }
  | { type: 'resolveClaim'; claimId: string; allow: boolean }
  | { type: 'start'; v: number }
  | { type: 'act'; v: number; kind: ActionKind; amount?: number; playerId?: string }
  | { type: 'award'; v: number; winners: Record<string, string[]> }
  | { type: 'next'; v: number }
  | { type: 'undo'; v: number }
  | { type: 'redo'; v: number }
  | { type: 'sit'; out: boolean; playerId?: string }
  | { type: 'rebuy'; playerId?: string }
  | { type: 'repay'; amount: number }
  | { type: 'leave' }
  | { type: 'settings'; v: number; settings: Settings }
  | { type: 'setStack'; v: number; playerId: string; stack: number }
  | { type: 'seatOrder'; v: number; ids: string[] }
  | { type: 'kick'; playerId: string }
  | { type: 'transferHost'; playerId: string }
  | { type: 'takeHost' }
  /** 마작: 버리기·쯔모·론·패스·구종구패. playerId는 자리 비운 사람을 대신 자동으로 둘 때만 ('auto'). */
  | { type: 'mj'; v: number; action: MjAction }
  | { type: 'mjAuto'; v: number; playerId: string }
  | { type: 'mjRules'; v: number; rules: MjRules };

export type Envelope = ClientMessage & { seq?: number };

export interface MemberView {
  id: string;
  name: string;
  manual: boolean;
  connections: number;
  lastSeen: number;
}

export interface ClaimView {
  id: string;
  playerId: string;
  at: number;
}

export type LogKind = 'action' | 'hand' | 'win' | 'undo' | 'table';

export interface LogEntry {
  id: number;
  at: number;
  kind: LogKind;
  text: string;
}

/** 카드 모드 쇼다운에서 공개된 패 */
export interface ShownHand {
  id: string;
  name: string;
  cards: Card[];
  /** 족보 이름, 예: '플러시 (A 하이)' */
  label: string;
  /** 비교에 쓴 5장 (키커 포함) */
  best: Card[];
  /** 족보를 이루는 카드만 (키커 제외) */
  made: Card[];
}

/**
 * 끝난 핸드 한 판의 기록(기보): 메뉴 → 기록 → 핸드 기록 복사.
 * 끝난 판만 기록해서, 진행 중인 판의 카드는 절대 들어가지 않아요.
 */
export interface HandRecord {
  handNo: number;
  startedAt: number;
  cardMode: boolean;
  sb: number;
  bb: number;
  /** 딜러 버튼 */
  button: string;
  /** 0 프리플랍 · 1 플랍 · 2 턴 · 3 리버 */
  actions: { street: number; name: string; kind: string; to: number; allIn: boolean }[];
  /** 카드 모드: 이 판에 참여한 사람마다 받은 시작 패 (폴드한 사람 포함, 좌석 순서) */
  holes?: { name: string; cards: Card[] }[];
  /** 카드 모드: 끝났을 때 깔려 있던 보드 */
  board: Card[];
  /** 카드 모드: 쇼다운에서 공개된 패 (category: 0 하이카드 … 9 로열 플러시) */
  shown: { name: string; cards: Card[]; category: number; label: string }[];
  winners: { name: string; amount: number }[];
}

export interface RoomView {
  code: string;
  gameType: GameType;
  /** 마작 테이블: 모두에게 보여도 되는 판 (게임 전에는 null) */
  mj: MjView | null;
  /** 마작 테이블: 다음 게임 규칙 */
  mjRules: MjRules | null;
  /** 카드 모드: 앱이 카드를 나눠주고 승자를 정해요 */
  cardMode: boolean;
  /** 카드 모드에서 지금 깔린 보드 카드 */
  board: Card[];
  /** 카드 모드에서 쇼다운 때 공개된 패 */
  shown: ShownHand[];
  createdAt: number;
  hostId: string | null;
  members: MemberView[];
  game: Game;
  claims: ClaimView[];
  log: LogEntry[];
  undoLabel: string | null;
  /** 방금 되돌린 것을 다시 실행할 수 있으면 그 설명 */
  redoLabel: string | null;
  turnStartedAt: number | null;
  /** 딜러가 카드를 까는 동안(서버 시각 기준 이때까지) 베팅 버튼이 잠겨요 */
  dealUntil: number | null;
}

export interface YouView {
  id: string | null;
  isHost: boolean;
  claimId: string | null;
  legal: Legal | null;
  /** 카드 모드: 내 홀카드 (나한테만 보내요) */
  hole: Card[] | null;
  /** 마작: 내 손패와 누를 수 있는 버튼 (나한테만 보내요) */
  mj: MjPrivate | null;
}

export type ErrorCode = 'STALE' | 'NOT_TURN' | 'INVALID' | 'PHASE' | 'FORBIDDEN' | 'RATE' | 'NOT_FOUND';

export type ServerMessage =
  | { type: 'state'; v: number; serverNow: number; room: RoomView; you: YouView }
  | { type: 'ok'; seq: number }
  | { type: 'err'; seq?: number; code: ErrorCode; message: string }
  | { type: 'closed'; reason: 'expired' | 'kicked' | 'replaced' | 'ended' };

const isObj = (v: unknown): v is Record<string, unknown> =>
  typeof v === 'object' && v !== null && !Array.isArray(v);
const isStr = (v: unknown, max = 64): v is string => typeof v === 'string' && v.length > 0 && v.length <= max;
const isId = (v: unknown): v is string => typeof v === 'string' && /^[a-z0-9]{8,32}$/.test(v);
const isNum = (v: unknown): v is number => typeof v === 'number' && Number.isSafeInteger(v) && v >= 0;
const optId = (v: unknown) => v === undefined || isId(v);
const KINDS: readonly string[] = ['fold', 'check', 'call', 'raise'];
const isMjTile = (t: unknown): t is string => typeof t === 'string' && /^(?:[mps]\d|z[1-7])_?$/.test(t);

function parseMjAction(a: unknown): MjAction | null {
  if (!isObj(a) || typeof a.kind !== 'string') return null;
  switch (a.kind) {
    case 'discard':
      return isMjTile(a.tile) ? { kind: 'discard', tile: a.tile } : null;
    case 'tsumo':
    case 'ron':
    case 'pass':
    case 'abort':
      return { kind: a.kind };
    default:
      return null;
  }
}

/** Strict structural validation. Unknown message types or malformed fields return null. */
export function parseClientMessage(raw: string): Envelope | null {
  let m: unknown;
  try {
    m = JSON.parse(raw);
  } catch {
    return null;
  }
  if (!isObj(m) || typeof m.type !== 'string') return null;
  if (m.seq !== undefined && !isNum(m.seq)) return null;
  const seq = m.seq as number | undefined;
  const v = m.v;
  const out = (msg: ClientMessage): Envelope => (seq === undefined ? msg : { ...msg, seq });
  switch (m.type) {
    case 'hello':
      return typeof m.token === 'string' && /^[a-f0-9]{64}$/.test(m.token) ? out({ type: 'hello', token: m.token }) : null;
    case 'join':
    case 'addSeat':
      return isStr(m.name, 200) ? out({ type: m.type, name: m.name }) : null;
    case 'claim':
      return isId(m.playerId) ? out({ type: 'claim', playerId: m.playerId }) : null;
    case 'cancelClaim':
    case 'leave':
    case 'takeHost':
      return out({ type: m.type });
    case 'resolveClaim':
      return isId(m.claimId) && typeof m.allow === 'boolean'
        ? out({ type: 'resolveClaim', claimId: m.claimId, allow: m.allow })
        : null;
    case 'start':
    case 'next':
    case 'undo':
    case 'redo':
      return isNum(v) ? out({ type: m.type, v }) : null;
    case 'act': {
      if (!isNum(v) || typeof m.kind !== 'string' || !KINDS.includes(m.kind) || !optId(m.playerId)) return null;
      if (m.amount !== undefined && !isNum(m.amount)) return null;
      if (m.kind === 'raise' && m.amount === undefined) return null;
      const msg: ClientMessage = { type: 'act', v, kind: m.kind as ActionKind };
      if (m.amount !== undefined) msg.amount = m.amount as number;
      if (m.playerId !== undefined) msg.playerId = m.playerId as string;
      return out(msg);
    }
    case 'award': {
      if (!isNum(v) || !isObj(m.winners)) return null;
      const winners: Record<string, string[]> = {};
      const entries = Object.entries(m.winners);
      if (entries.length > 12) return null;
      for (const [potId, ids] of entries) {
        if (!/^\d{1,2}$/.test(potId) || !Array.isArray(ids) || ids.length > 10 || !ids.every(isId)) return null;
        winners[potId] = ids as string[];
      }
      return out({ type: 'award', v, winners });
    }
    case 'sit':
      return typeof m.out === 'boolean' && optId(m.playerId)
        ? out(m.playerId === undefined ? { type: 'sit', out: m.out } : { type: 'sit', out: m.out, playerId: m.playerId as string })
        : null;
    case 'rebuy':
      return optId(m.playerId)
        ? out(m.playerId === undefined ? { type: 'rebuy' } : { type: 'rebuy', playerId: m.playerId as string })
        : null;
    case 'repay':
      return isNum(m.amount) && m.amount > 0 ? out({ type: 'repay', amount: m.amount }) : null;
    case 'settings': {
      const s = m.settings;
      if (!isNum(v) || !isObj(s)) return null;
      if (![s.sb, s.bb, s.startingStack, s.buyInPrice].every(isNum)) return null;
      return out({
        type: 'settings',
        v,
        settings: {
          sb: s.sb as number,
          bb: s.bb as number,
          startingStack: s.startingStack as number,
          buyInPrice: s.buyInPrice as number,
        },
      });
    }
    case 'setStack':
      return isNum(v) && isId(m.playerId) && isNum(m.stack)
        ? out({ type: 'setStack', v, playerId: m.playerId, stack: m.stack })
        : null;
    case 'seatOrder':
      return isNum(v) && Array.isArray(m.ids) && m.ids.length <= 10 && m.ids.every(isId)
        ? out({ type: 'seatOrder', v, ids: m.ids as string[] })
        : null;
    case 'kick':
    case 'transferHost':
      return isId(m.playerId) ? out({ type: m.type, playerId: m.playerId }) : null;
    case 'mj': {
      const action = parseMjAction(m.action);
      return isNum(v) && action ? out({ type: 'mj', v, action }) : null;
    }
    case 'mjAuto':
      return isNum(v) && isId(m.playerId) ? out({ type: 'mjAuto', v, playerId: m.playerId }) : null;
    case 'mjRules': {
      if (!isNum(v) || !isMjRules(m.rules)) return null;
      const { startPoints, length, aka, kuitan } = m.rules;
      return out({ type: 'mjRules', v, rules: { startPoints, length, aka, kuitan } });
    }
    default:
      return null;
  }
}
