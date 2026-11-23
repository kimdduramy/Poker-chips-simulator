// 마작패 표기와 이름. 화면과 서버가 같이 써요 (majiang-core 없이도 동작해요).
//
// 패 한 장: 종류 글자 + 숫자 (majiang-core 표기).
//   m 만수, p 통수, s 삭수: 1~9, 0은 빨간 5(적도라). 예: 'm3', 'p0'.
//   z 자패: 1동 2남 3서 4북 5백 6발 7중. 예: 'z1'(동), 'z7'(중).
// 버린 패에는 뒤에 기호가 붙을 수 있어요: '_' 쯔모기리, '*' 리치 선언, '+=-' 누가 울어 감.

import { cryptoRandInt, shuffle } from '../cards';

export type Tile = string;

export const isTile = (t: unknown): t is Tile => typeof t === 'string' && /^(?:[mps]\d|z[1-7])$/.test(t);

/** 기호를 뗀 패 두 글자 */
export const bare = (t: string): Tile => t.slice(0, 2);
export const isRed = (t: string) => t[0] !== 'z' && t[1] === '0';
/** 빨간 5를 보통 5로 */
export const plain = (t: string): Tile => (isRed(t) ? `${t[0]}5` : bare(t));

/** 손패 문자열('m123p05z11*,s567-')에서 손 안 패만 패 목록으로. 뽑은 패가 있으면 맨 끝이에요. */
export function tilesOf(paistr: string): Tile[] {
  const body = paistr.split(',')[0];
  const out: Tile[] = [];
  for (const group of body.match(/[mpsz]\d+/g) ?? []) {
    for (const n of group.slice(1)) out.push(group[0] + n);
  }
  return out;
}

/** 손패 문자열의 운 몸통들 */
export const meldsOf = (paistr: string): string[] => paistr.split(',').slice(1).filter(Boolean);

/** 패산 136장 (섞기 전). aka면 만·통·삭 5 중 한 장씩 빨간 5예요. majiang-core의 Shan과 같은 구성이에요. */
export function newWall(aka: boolean): Tile[] {
  const wall: Tile[] = [];
  for (const s of 'mpsz') {
    for (let n = 1; n <= (s === 'z' ? 7 : 9); n++) {
      for (let i = 0; i < 4; i++) wall.push(aka && s !== 'z' && n === 5 && i === 0 ? `${s}0` : `${s}${n}`);
    }
  }
  return wall;
}

/** 정렬: 만 → 통 → 삭 → 자패, 숫자 순. 빨간 5는 보통 5 앞. */
export function sortTiles(tiles: Tile[]): Tile[] {
  const key = (t: Tile) => 'mpsz'.indexOf(t[0]) * 20 + (t[1] === '0' ? 9 : Number(t[1]) * 2);
  return [...tiles].sort((a, b) => key(a) - key(b));
}

// ---------- 이름 ----------

const HONORS = ['동', '남', '서', '북', '백', '발', '중'];
const SUITS: Record<string, string> = { m: '만', p: '통', s: '삭' };

/** '3만', '빨간 5통', '동', '중' */
export function tileName(t: string): string {
  const b = bare(t);
  if (b[0] === 'z') return HONORS[Number(b[1]) - 1];
  return `${isRed(b) ? '빨간 ' : ''}${b[1] === '0' ? 5 : b[1]}${SUITS[b[0]]}`;
}

/** 바람 이름: 0 동 1 남 2 서 3 북 */
export const WIND_NAMES = ['동', '남', '서', '북'];

/** 도라 표시패 → 도라 (9 다음 1, 북 다음 동, 중 다음 백) */
export function doraOf(indicator: string): Tile {
  const s = indicator[0];
  const n = Number(indicator[1]) || 5;
  if (s !== 'z') return `${s}${(n % 9) + 1}`;
  return n < 5 ? `z${(n % 4) + 1}` : `z${((n - 4) % 3) + 5}`;
}

/** '동1국' */
export const roundName = (wind: number, kyoku: number) => `${WIND_NAMES[wind] ?? '?'}${kyoku + 1}국`;

/** 서버가 쓰는 섞인 패산: crypto로 치우침 없이 섞어요. */
export const randomWall = (aka: boolean): Tile[] => shuffle(newWall(aka), cryptoRandInt);
