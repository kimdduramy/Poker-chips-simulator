import { useRef, type CSSProperties } from 'react';
import { cardRankText, cardSpeech, cardSuitSymbol, evaluate, isRed, type Card } from '../../shared/cards';
import type { RoomView } from '../../shared/protocol';
import { useHandFocus } from '../lib/handFocus';
import { useTable } from '../lib/table';

type Glow = 'hl' | 'dim' | undefined;

/**
 * 카드 한 장. card가 없으면 빈 자리(점선), hidden이면 뒷면.
 * flipDelay가 있으면 뒷면에서 앞면으로 뒤집히며 나타나요 (ms 뒤에 시작).
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

/** 같은 묶음 안에서 카드 사이 간격, 플랍→턴→리버 사이 간격 (ms) */
const STAGGER = 140;
const STREET_GAP = 650;

/**
 * 새로 나타난 카드마다 뒤집기 시작 시각을 한 번만 정해요.
 * 처음 화면을 열었을 때 이미 있던 카드는 뒤집지 않아요 (새로고침할 때마다 다시 깔리면 어색해요).
 * 올인 런아웃처럼 여러 장이 한 번에 열리면 플랍, 턴, 리버 순서로 차례차례 뒤집어요.
 */
function useFlipDelays(cards: Card[], resetKey: unknown, streetBreaks: number[] = []) {
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
  return (c: Card) => delays.get(c) ?? null;
}

/** 지금 강조할 패: 누르고 있는 플레이어, 아니면 이긴 사람 */
export function useFocusedBest(room: RoomView): { id: string | null; best: Set<Card> } {
  const focus = useHandFocus();
  const shown = room.shown;
  const held = focus ? shown.find((s) => s.id === focus) : undefined;
  if (held) return { id: held.id, best: new Set(held.best) };
  const winners = new Set(room.game.results.map((r) => r.id));
  return { id: null, best: new Set(shown.filter((s) => winners.has(s.id)).flatMap((s) => s.best)) };
}

/** 카드 모드 보드: 깔린 카드 + 아직 안 깐 자리 */
export function BoardRow({ size = 'md' }: { size?: 'md' | 'lg' }) {
  const { room, game } = useTable();
  const focus = useFocusedBest(room);
  const board = room.board;
  const delay = useFlipDelays(board, game.handNo, [3, 4]);
  if (!room.cardMode || game.phase === 'lobby') return null;
  const showing = room.shown.length > 0;
  const label = board.length === 0 ? '보드 카드 아직 없음' : `보드 카드: ${cardsSpeech(board)}`;
  return (
    <div className="board-row" data-size={size} data-focus={focus.id ? true : undefined} role="img" aria-label={label}>
      {[0, 1, 2, 3, 4].map((i) => {
        const c = board[i];
        const glow: Glow = showing && c ? (focus.best.has(c) ? (focus.id ? 'hl' : undefined) : 'dim') : undefined;
        // 카드가 바뀌면 새 요소로 그려야 애니메이션이 다시 돌아요
        return <PlayingCard key={c ?? `empty-${i}`} size={size} card={c} glow={glow} flipDelay={c ? delay(c) : null} />;
      })}
    </div>
  );
}

/** 카드 모드: 내 카드 2장과 지금 내 족보 */
export function MyHand() {
  const { room, you, me, game } = useTable();
  const focus = useHandFocus();
  const hole = you.hole ?? [];
  const delay = useFlipDelays(hole, game.handNo);
  if (!room.cardMode || hole.length === 0 || game.phase === 'lobby') return null;
  const folded = !!me?.folded;
  const all = [...hole, ...room.board];
  const value = all.length >= 5 ? evaluate(all) : null;
  const best = new Set(value?.best ?? []);
  const held = focus !== null && focus === you.id;
  const label = value ? value.label : hole[0][0] === hole[1][0] ? `포켓 페어 (${cardRankText(hole[0])})` : '프리플랍';
  return (
    <div className="my-hand" data-folded={folded || undefined}>
      <span className="my-hand-cards" role="img" aria-label={`내 카드: ${cardsSpeech(hole)}`}>
        {hole.map((c) => (
          <PlayingCard key={c} card={c} size="lg" glow={value && !best.has(c) ? 'dim' : held ? 'hl' : undefined} flipDelay={delay(c)} />
        ))}
      </span>
      <span className="my-hand-text">
        <span className="label">내 패</span>
        <span className="my-hand-label">{folded ? '폴드' : label}</span>
      </span>
    </div>
  );
}
