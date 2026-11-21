import { useRef, type CSSProperties } from 'react';
import { cardRankText, cardSpeech, cardSuitSymbol, evaluate, isRed, type Card } from '../../shared/cards';
import type { RoomView } from '../../shared/protocol';
import { useHandFocus } from '../lib/handFocus';
import { useTable } from '../lib/table';

type Glow = 'hl' | 'dim' | undefined;

/**
 * 카드 한 장. card가 없으면 빈 자리(점선), hidden이면 뒷면.
 * flipDelay가 있으면 옆에서 미끄러져 들어오며 나타나요 (ms 뒤에 시작).
 */
export function PlayingCard({
  card,
  size = 'md',
  glow,
  hidden,
  flipDelay,
}: {
  card?: Card | null;
  size?: 'sm' | 'md' | 'lg';
  /** hl: 족보 카드라 밝고 살짝 크게, dim: 족보에 안 쓰여서 흐리게 */
  glow?: Glow;
  hidden?: boolean;
  flipDelay?: number | null;
}) {
  if (hidden) return <span className="pcard" data-size={size} data-back aria-hidden="true" />;
  if (!card) return <span className="pcard" data-size={size} data-empty aria-hidden="true" />;
  const flip = flipDelay !== undefined && flipDelay !== null;
  return (
    <span
      className="pcard"
      data-size={size}
      data-red={isRed(card) || undefined}
      data-glow={glow}
      data-flip={flip || undefined}
      style={flip ? ({ '--flip-delay': `${flipDelay}ms` } as CSSProperties) : undefined}
      aria-hidden="true"
    >
      <span className="pcard-rank">{cardRankText(card)}</span>
      <span className="pcard-suit">{cardSuitSymbol(card)}</span>
    </span>
  );
}

export const cardsSpeech = (cards: Card[]) => cards.map(cardSpeech).join(', ');

/** 같은 묶음 안에서 카드 사이 간격, 플랍→턴→리버 사이 간격, 한 장이 들어오는 시간 (ms) */
const STAGGER = 140;
const STREET_GAP = 650;
const DEAL_MS = 420;

/** 보드 카드가 다 깔리는 시각 (performance.now 기준). 승리 띠와 공개 패는 이 뒤에 나와요. */
let boardSettlesAt = 0;
/** 지금부터 보드 카드가 다 깔릴 때까지 남은 시간 (ms) */
export const boardSettleDelay = () => Math.max(0, boardSettlesAt - performance.now());

/**
 * 새로 나타난 카드마다 등장 애니메이션 시작 시각을 한 번만 정해요.
 * 처음 화면을 열었을 때 이미 있던 카드는 움직이지 않아요 (새로고침할 때마다 다시 깔리면 어색해요).
 * 올인 런아웃처럼 여러 장이 한 번에 열리면 플랍, 턴, 리버 순서로 차례차례 나와요.
 */
function useFlipDelays(cards: Card[], resetKey: unknown, streetBreaks: number[] = [], onDealt?: (lastDelay: number) => void) {
  const state = useRef<{ key: unknown; delays: Map<Card, number | null> } | null>(null);
  if (!state.current) {
    state.current = { key: resetKey, delays: new Map(cards.map((c) => [c, null])) };
  } else if (state.current.key !== resetKey) {
    state.current = { key: resetKey, delays: new Map() };
  }
  const delays = state.current.delays;
  let t = 0;
  let first = true;
  cards.forEach((c, i) => {
    if (delays.has(c)) return;
    if (!first) t += streetBreaks.includes(i) ? STREET_GAP : STAGGER;
    first = false;
    delays.set(c, t);
  });
  if (!first) onDealt?.(t);
  return (c: Card) => delays.get(c) ?? null;
}

/** 지금 강조할 패: 누르고 있는 플레이어, 아니면 이긴 사람 */
export function useFocusedBest(room: RoomView): { id: string | null; best: Set<Card> } {
  const focus = useHandFocus();
  const shown = room.shown;
  // 족보를 이루는 카드만 (키커 제외). 예전 서버는 made가 없어서 best로 대신해요.
  const made = (s: (typeof shown)[number]) => s.made ?? s.best;
  // 평소에는 아무 카드도 흐리게 하지 않아요. 플레이어를 누르고 있는 동안만 그 사람 족보를 강조해요.
  const held = focus ? shown.find((s) => s.id === focus) : undefined;
  return held ? { id: held.id, best: new Set(made(held)) } : { id: null, best: new Set() };
}

/** 카드 모드 보드: 깔린 카드 + 아직 안 깐 자리 */
export function BoardRow({ size = 'md' }: { size?: 'md' | 'lg' }) {
  const { room, game } = useTable();
  const focus = useFocusedBest(room);
  const board = room.board;
  const delay = useFlipDelays(board, game.handNo, [3, 4], (last) => {
    boardSettlesAt = performance.now() + last + DEAL_MS;
  });
  if (!room.cardMode || game.phase === 'lobby') return null;
  const label = board.length === 0 ? '보드 카드 아직 없음' : `보드 카드: ${cardsSpeech(board)}`;
  return (
    <div className="board-row" data-size={size} data-focus={focus.id ? true : undefined} role="img" aria-label={label}>
      {[0, 1, 2, 3, 4].map((i) => {
        const c = board[i];
        const glow: Glow = focus.id && c ? (focus.best.has(c) ? 'hl' : 'dim') : undefined;
        // 카드가 바뀌면 새 요소로 그려야 애니메이션이 다시 돌아요
        return <PlayingCard key={c ?? `empty-${i}`} size={size} card={c} glow={glow} flipDelay={c ? delay(c) : null} />;
      })}
    </div>
  );
}

/**
 * 카드 모드 폰 화면: 보드 5장과 내 카드 2장을 한 줄에 나란히 놓고, 그 아래에 지금 내 족보를 적어요.
 * 족보는 내 카드와 보드를 같이 봐야 해서 한눈에 들어오게 붙여 두고,
 * 아래 행동 영역에서 내 카드 줄을 빼서 좌석 목록이 보일 자리를 만들어요.
 */
export function CardZone() {
  const { room, you, me, game } = useTable();
  const focusId = useHandFocus();
  const focus = useFocusedBest(room);
  const board = room.board;
  const hole = you.hole ?? [];
  const boardDelay = useFlipDelays(board, game.handNo, [3, 4], (last) => {
    boardSettlesAt = performance.now() + last + DEAL_MS;
  });
  const holeDelay = useFlipDelays(hole, game.handNo);
  if (!room.cardMode || game.phase === 'lobby') return null;

  const folded = !!me?.folded;
  const all = [...hole, ...board];
  const value = hole.length === 2 && all.length >= 5 ? evaluate(all) : null;
  const mine = new Set(value?.made ?? []);
  // 꾹 누르는 동안: 누른 사람 족보 카드만 밝고 크게, 나머지는 흐리게. 평소엔 구분 없음.
  const holding = focus.id !== null;
  const boardGlow = (c: Card): Glow => (holding ? (focus.best.has(c) ? 'hl' : 'dim') : undefined);
  const holeGlow = (c: Card): Glow => (holding ? (focusId === you.id && mine.has(c) ? 'hl' : 'dim') : undefined);
  const label =
    hole.length < 2 ? null : value ? value.label : hole[0][0] === hole[1][0] ? `포켓 페어 (${cardRankText(hole[0])})` : '프리플랍';
  const boardLabel = board.length === 0 ? '보드 카드 아직 없음' : `보드 카드: ${cardsSpeech(board)}`;

  return (
    <div className="card-zone">
      <div className="card-zone-row">
        <div className="board-row" role="img" aria-label={boardLabel}>
          {[0, 1, 2, 3, 4].map((i) => {
            const c = board[i];
            return <PlayingCard key={c ?? `empty-${i}`} card={c} glow={c ? boardGlow(c) : undefined} flipDelay={c ? boardDelay(c) : null} />;
          })}
        </div>
        {hole.length === 2 && (
          <div className="card-zone-mine" data-folded={folded || undefined} role="img" aria-label={`내 카드: ${cardsSpeech(hole)}`}>
            {hole.map((c) => (
              <PlayingCard key={c} card={c} glow={holeGlow(c)} flipDelay={holeDelay(c)} />
            ))}
          </div>
        )}
      </div>
      {label && (
        <p className="card-zone-label">
          <span className="card-zone-label-key">내 패</span>
          <span className="card-zone-label-value">{folded ? '폴드' : label}</span>
        </p>
      )}
    </div>
  );
}
