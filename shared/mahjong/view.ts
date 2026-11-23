// 마작 판에서 화면으로 보내는 것. 서버(majiang-core)가 만들고 화면이 읽어요.
// 모두에게 가는 MjView에는 남의 손패와 패산이 절대 들어가지 않아요. 내 손패는 MjPrivate로 나한테만 가요.

import type { Tile } from './tiles';

export interface MjRules {
  startPoints: number;
  /** 동풍전(동장만) / 반장전(동장+남장) */
  length: 'east' | 'south';
  /** 적도라(빨간 5) 3장 */
  aka: boolean;
  /** 울고 탕야오 */
  kuitan: boolean;
}

export const DEFAULT_MJ_RULES: MjRules = { startPoints: 25000, length: 'south', aka: true, kuitan: true };
export const MJ_PLAYERS = 4;

export function isMjRules(r: unknown): r is MjRules {
  if (typeof r !== 'object' || r === null) return false;
  const x = r as Record<string, unknown>;
  return (
    typeof x.startPoints === 'number' &&
    Number.isSafeInteger(x.startPoints) &&
    x.startPoints >= 1000 &&
    x.startPoints <= 1_000_000 &&
    x.startPoints % 100 === 0 &&
    (x.length === 'east' || x.length === 'south') &&
    typeof x.aka === 'boolean' &&
    typeof x.kuitan === 'boolean'
  );
}

export interface MjSeatView {
  id: string;
  name: string;
  points: number;
  /** 자풍: 0 동 1 남 2 서 3 북 */
  wind: number;
  /** 손 안 패 수 (뽑은 패 포함) */
  handCount: number;
  /** 지금 뽑은 패를 들고 있어요 (버리기 전) */
  drawn: boolean;
  /** 버림패. 기호 포함: 'm5_' 쯔모기리, 'p3*' 리치, 'z1-' 남이 울어 감 */
  river: string[];
  /** 운 몸통 */
  melds: string[];
  riichi: boolean;
}

/** 한 사람이 이긴 결과 */
export interface MjWin {
  kind: 'win';
  seat: number;
  /** 론이면 쏘인 자리, 쯔모면 null */
  from: number | null;
  /** 이긴 손패 (화료패 포함) */
  hand: string;
  /** 이긴 패 */
  tile: Tile;
  yaku: { name: string; han: number | string }[];
  fu: number;
  han: number;
  /** 역만 배수 (역만이 아니면 0) */
  yakuman: number;
  points: number;
  /** 자리 순서대로 점수 변화 */
  deltas: number[];
  uraDora: Tile[] | null;
}

/** 유국 */
export interface MjDraw {
  kind: 'draw';
  /** majiang-core 유국 이름 (荒牌平局, 九種九牌 …) */
  name: string;
  /** 공개된 손패 (텐파이·구종구패), 자리 순서 */
  shown: (string | null)[];
  deltas: number[];
}

export type MjResult = MjWin | MjDraw;

export interface MjFinal {
  /** 자리 순서대로 최종 점수와 순위 */
  points: number[];
  rank: number[];
}

export interface MjView {
  /** play: 진행 중 · result: 국이 끝나고 다음 국을 기다려요 · end: 게임 끝 */
  phase: 'play' | 'result' | 'end';
  rules: MjRules;
  /** 장풍 0 동 1 남 */
  roundWind: number;
  /** 국 번호 0~3 */
  kyoku: number;
  honba: number;
  /** 공탁 리치봉 수 */
  kyotaku: number;
  /** 지금까지 시작한 국 수 */
  roundNo: number;
  dealer: number;
  seats: MjSeatView[];
  wallLeft: number;
  dora: Tile[];
  /** 지금 차례(뽑고 버리는 사람)의 자리 */
  turn: number;
  /** 버려진 패에 누군가 론을 고르는 중 (누구인지는 비밀) */
  claiming: boolean;
  /** 방금 버려진 패 */
  lastDiscard: { seat: number; tile: Tile } | null;
  /** 이번 국 결과 (더블 론이면 여러 개) */
  results: MjResult[];
  final: MjFinal | null;
}

export interface MjLegal {
  /** 버릴 수 있는 패. 쯔모기리는 'm5_'처럼 '_'가 붙어요. */
  discard: string[];
  tsumo: boolean;
  ron: boolean;
  /** 론하지 않고 넘기기 */
  pass: boolean;
  /** 구종구패로 유국 선언 */
  abort: boolean;
}

export interface MjPrivate {
  seat: number;
  /** 손 안 패 (뽑은 패 제외), 정렬돼 있어요 */
  hand: Tile[];
  drawn: Tile | null;
  melds: string[];
  legal: MjLegal | null;
  /** 텐파이면 기다리는 패 (초보 도우미) */
  waits: Tile[];
  /** 기다리는 패가 내 버림패에 있거나 론을 넘겨서 지금 론을 못 해요 */
  furiten: boolean;
}

export type MjAction =
  | { kind: 'discard'; tile: string }
  | { kind: 'tsumo' }
  | { kind: 'ron' }
  | { kind: 'pass' }
  | { kind: 'abort' };
