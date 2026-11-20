import { cardRankText, cardSpeech, cardSuitSymbol, evaluate, isRed, type Card } from '../../shared/cards';
import { useTable } from '../lib/table';

/** 카드 한 장. card가 없으면 빈 자리(점선), hidden이면 뒷면. */
export function PlayingCard({
  card,
  size = 'md',
  dim,
  hidden,
}: {
  card?: Card | null;
  size?: 'sm' | 'md' | 'lg';
  /** 족보에 안 쓰인 카드: 흐리게 */
  dim?: boolean;
  hidden?: boolean;
}) {
  if (hidden) return <span className="pcard" data-size={size} data-back aria-hidden="true" />;
  if (!card) return <span className="pcard" data-size={size} data-empty aria-hidden="true" />;
  return (
    <span className="pcard" data-size={size} data-red={isRed(card) || undefined} data-dim={dim || undefined} aria-hidden="true">
      <span className="pcard-rank">{cardRankText(card)}</span>
      <span className="pcard-suit">{cardSuitSymbol(card)}</span>
    </span>
  );
}

export const cardsSpeech = (cards: Card[]) => cards.map(cardSpeech).join(', ');

/** 카드 모드 보드: 깔린 카드 + 아직 안 깐 자리 */
export function BoardRow({ size = 'md' }: { size?: 'md' | 'lg' }) {
  const { room, game } = useTable();
  if (!room.cardMode || game.phase === 'lobby') return null;
  const board = room.board;
  const best = new Set(room.shown.length > 0 ? winningBest(room) : []);
  const label = board.length === 0 ? '보드 카드 아직 없음' : `보드 카드: ${cardsSpeech(board)}`;
  return (
    <div className="board-row" data-size={size} role="img" aria-label={label}>
      {[0, 1, 2, 3, 4].map((i) => (
        <PlayingCard key={i} size={size} card={board[i]} dim={best.size > 0 && !!board[i] && !best.has(board[i])} />
      ))}
    </div>
  );
}

/** 이긴 사람의 족보 5장 (보드에서 강조할 카드) */
function winningBest(room: ReturnType<typeof useTable>['room']): Card[] {
  const winners = new Set(room.game.results.map((r) => r.id));
  return room.shown.filter((s) => winners.has(s.id)).flatMap((s) => s.best);
}

/** 카드 모드: 내 카드 2장과 지금 내 족보 */
export function MyHand() {
  const { room, you, me, game } = useTable();
  const hole = you.hole;
  if (!room.cardMode || !hole || game.phase === 'lobby') return null;
  const folded = !!me?.folded;
  const all = [...hole, ...room.board];
  const value = all.length >= 5 ? evaluate(all) : null;
  const best = new Set(value?.best ?? []);
  const label = value ? value.label : hole[0][0] === hole[1][0] ? `포켓 페어 (${cardRankText(hole[0])})` : '프리플랍';
  return (
    <div className="my-hand" data-folded={folded || undefined}>
      <span className="my-hand-cards" role="img" aria-label={`내 카드: ${cardsSpeech(hole)}`}>
        {hole.map((c) => (
          <PlayingCard key={c} card={c} size="lg" dim={!!value && !best.has(c)} />
        ))}
      </span>
      <span className="my-hand-text">
        <span className="label">내 패</span>
        <span className="my-hand-label">{folded ? '폴드' : label}</span>
      </span>
    </div>
  );
}
