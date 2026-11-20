// 카드 모드: 덱, 섞기, 홀덤 족보 판정. 서버와 화면이 같이 써요.
// 카드는 '숫자+무늬' 두 글자 문자열이에요. 숫자 23456789TJQKA, 무늬 s(♠) h(♥) d(♦) c(♣). 예: 'As', 'Td'.

export type Card = string;

export const RANKS = '23456789TJQKA';
export const SUITS = 'shdc';

export const rankOf = (c: Card) => RANKS.indexOf(c[0]) + 2;
export const suitOf = (c: Card) => c[1];

export const isCard = (c: unknown): c is Card =>
  typeof c === 'string' && c.length === 2 && RANKS.includes(c[0]) && SUITS.includes(c[1]);

export function newDeck(): Card[] {
  const deck: Card[] = [];
  for (const s of SUITS) for (const r of RANKS) deck.push(r + s);
  return deck;
}

/** 0 이상 n 미만 정수를 고르게 뽑는 함수를 받아 Fisher–Yates로 섞어요. */
export function shuffle(deck: Card[], randInt: (n: number) => number): Card[] {
  const d = [...deck];
  for (let i = d.length - 1; i > 0; i--) {
    const j = randInt(i + 1);
    [d[i], d[j]] = [d[j], d[i]];
  }
  return d;
}

/** crypto로 치우침 없이 0..n-1 뽑기 (서버용) */
export function cryptoRandInt(n: number): number {
  const buf = new Uint32Array(1);
  const limit = Math.floor(0x1_0000_0000 / n) * n;
  for (;;) {
    crypto.getRandomValues(buf);
    if (buf[0] < limit) return buf[0] % n;
  }
}

// ---------- 족보 ----------

export const CATEGORY_NAMES = [
  '하이카드',
  '원페어',
  '투페어',
  '트리플',
  '스트레이트',
  '플러시',
  '풀하우스',
  '포카드',
  '스트레이트 플러시',
  '로열 플러시',
] as const;

export interface HandValue {
  /** 0 하이카드 … 8 스트레이트 플러시, 9 로열 플러시 */
  category: number;
  /** 클수록 센 패. 같은 값이면 무승부(스플릿). */
  score: number;
  /** 비교에 쓰는 5장 (족보 카드 + 키커) */
  best: Card[];
  /** 그중 족보를 이루는 카드만 (원페어면 2장, 투페어면 4장, 하이카드면 1장). 키커는 빠져요. */
  made: Card[];
  /** 예: '플러시', '원페어 (K)', '풀하우스 (Q, 7)' */
  label: string;
}

const RANK_LABEL: Record<number, string> = { 10: '10', 11: 'J', 12: 'Q', 13: 'K', 14: 'A' };
export const rankLabel = (r: number) => RANK_LABEL[r] ?? String(r);

/** 5장 평가: [족보, 비교용 숫자들(중요한 순)] */
function rank5(cards: Card[]): { category: number; tiebreak: number[] } {
  const ranks = cards.map(rankOf).sort((a, b) => b - a);
  const flush = cards.every((c) => suitOf(c) === suitOf(cards[0]));
  const unique = [...new Set(ranks)];
  let straightHigh = 0;
  if (unique.length === 5) {
    if (ranks[0] - ranks[4] === 4) straightHigh = ranks[0];
    else if (ranks.join() === '14,5,4,3,2') straightHigh = 5; // A-2-3-4-5 (가장 낮은 스트레이트)
  }
  if (straightHigh && flush) return { category: straightHigh === 14 ? 9 : 8, tiebreak: [straightHigh] };

  // 같은 숫자끼리 묶어서 (장수 많은 순, 숫자 높은 순)
  const counts = new Map<number, number>();
  for (const r of ranks) counts.set(r, (counts.get(r) ?? 0) + 1);
  const groups = [...counts.entries()].sort((a, b) => b[1] - a[1] || b[0] - a[0]);
  const shape = groups.map((g) => g[1]).join('');
  const order = groups.map((g) => g[0]);

  if (shape === '41') return { category: 7, tiebreak: order };
  if (shape === '32') return { category: 6, tiebreak: order };
  if (flush) return { category: 5, tiebreak: ranks };
  if (straightHigh) return { category: 4, tiebreak: [straightHigh] };
  if (shape === '311') return { category: 3, tiebreak: order };
  if (shape === '221') return { category: 2, tiebreak: order };
  if (shape === '2111') return { category: 1, tiebreak: order };
  return { category: 0, tiebreak: ranks };
}

const toScore = (category: number, tiebreak: number[]) => {
  let s = category;
  for (let i = 0; i < 5; i++) s = s * 15 + (tiebreak[i] ?? 0);
  return s;
};

function describe(category: number, tiebreak: number[]): string {
  const r = tiebreak.map(rankLabel);
  switch (category) {
    case 9:
      return '로열 플러시';
    case 8:
      return `스트레이트 플러시 (${r[0]} 하이)`;
    case 7:
      return `포카드 (${r[0]})`;
    case 6:
      return `풀하우스 (${r[0]}, ${r[1]})`;
    case 5:
      return `플러시 (${r[0]} 하이)`;
    case 4:
      return `스트레이트 (${r[0]} 하이)`;
    case 3:
      return `트리플 (${r[0]})`;
    case 2:
      return `투페어 (${r[0]}, ${r[1]})`;
    case 1:
      return `원페어 (${r[0]})`;
    default:
      return `하이카드 (${r[0]})`;
  }
}

function combos5(cards: Card[]): Card[][] {
  const out: Card[][] = [];
  const n = cards.length;
  for (let a = 0; a < n; a++)
    for (let b = a + 1; b < n; b++)
      for (let c = b + 1; c < n; c++)
        for (let d = c + 1; d < n; d++)
          for (let e = d + 1; e < n; e++) out.push([cards[a], cards[b], cards[c], cards[d], cards[e]]);
  return out;
}

/** 5~7장 중 가장 좋은 5장을 찾아요. */
export function evaluate(cards: Card[]): HandValue {
  if (cards.length < 5 || cards.length > 7) throw new Error('카드는 5~7장이어야 해요');
  let top: { category: number; tiebreak: number[]; score: number; best: Card[] } | null = null;
  for (const five of combos5(cards)) {
    const { category, tiebreak } = rank5(five);
    const score = toScore(category, tiebreak);
    if (!top || score > top.score) top = { category, tiebreak, score, best: five };
  }
  const t = top!;
  // 보기 좋게: 족보를 만드는 카드 먼저, 높은 숫자 먼저
  const weight = (c: Card) => {
    const r = rankOf(c);
    const idx = t.tiebreak.indexOf(r);
    return (idx === -1 ? 0 : 100 - idx) * 20 + r;
  };
  const best = [...t.best].sort((a, b) => weight(b) - weight(a));
  if (t.category === 4 || t.category === 8) {
    // 스트레이트는 높은 숫자부터 (A-2-3-4-5에서는 A를 맨 뒤로)
    best.sort((a, b) => straightRank(b, t.tiebreak[0]) - straightRank(a, t.tiebreak[0]));
  }
  return { category: t.category, score: t.score, best, made: madeCards(t.category, t.tiebreak, best), label: describe(t.category, t.tiebreak) };
}

/** 족보를 이루는 카드: 5장이 다 쓰이는 족보는 5장, 아니면 같은 숫자 묶음만 */
function madeCards(category: number, tiebreak: number[], best: Card[]): Card[] {
  const keep = (n: number) => {
    const ranks = new Set(tiebreak.slice(0, n));
    return best.filter((c) => ranks.has(rankOf(c)));
  };
  switch (category) {
    case 7: // 포카드
    case 3: // 트리플
    case 1: // 원페어
      return keep(1);
    case 2: // 투페어
      return keep(2);
    case 0: // 하이카드: 가장 높은 1장
      return best.slice(0, 1);
    default: // 스트레이트, 플러시, 풀하우스, 스트레이트 플러시
      return best;
  }
}

const straightRank = (c: Card, high: number) => (high === 5 && rankOf(c) === 14 ? 1 : rankOf(c));

/** 여러 명 중 이긴 사람들 (같은 패면 여러 명) */
export function winnersOf(hands: { id: string; value: HandValue }[]): string[] {
  if (hands.length === 0) return [];
  const best = Math.max(...hands.map((h) => h.value.score));
  return hands.filter((h) => h.value.score === best).map((h) => h.id);
}

// ---------- 보여주기 ----------

const SUIT_SYMBOL: Record<string, string> = { s: '♠', h: '♥', d: '♦', c: '♣' };
const SUIT_NAME: Record<string, string> = { s: '스페이드', h: '하트', d: '다이아', c: '클로버' };

export const cardRankText = (c: Card) => rankLabel(rankOf(c));
export const cardSuitSymbol = (c: Card) => SUIT_SYMBOL[suitOf(c)];
export const isRed = (c: Card) => suitOf(c) === 'h' || suitOf(c) === 'd';
/** 화면 낭독기용: '스페이드 A' */
export const cardSpeech = (c: Card) => `${SUIT_NAME[suitOf(c)]} ${cardRankText(c)}`;
