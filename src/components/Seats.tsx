import { useLayoutEffect, useRef, useState, type MouseEvent, type PointerEvent } from 'react';
import { bySeat, type Player } from '../../shared/engine';
import { fmt } from '../lib/format';
import { useTable } from '../lib/table';
import { Num } from './Num';
import { boardSettleDelay, cardsSpeech, PlayingCard } from './PlayingCard';
import { setHandFocus, useHandFocus } from '../lib/handFocus';

export function seatStatus(p: Player, phase: string, away: boolean, manual: boolean): string | null {
  const inHand = (phase === 'betting' || phase === 'showdown') && p.inHand;
  if (p.leaving) return '나감';
  if (inHand && p.folded) return '폴드';
  if (inHand && p.allIn) return '올인';
  if (!inHand && (phase === 'betting' || phase === 'showdown')) {
    if (p.stack === 0) return '버스트';
    return p.sittingOut ? '싯아웃' : '다음 핸드부터';
  }
  if (p.stack === 0 && phase !== 'lobby') return '버스트';
  if (p.sittingOut) return '싯아웃';
  if (manual) return '폰 없음';
  if (away) return '자리 비움';
  return null;
}

/**
 * 쇼다운 뒤 플레이어를 누르고 있는 동안 그 사람 족보를 강조해요.
 * 손을 떼거나 밖으로 끌면 풀려요. 키보드로는 그 줄에 초점이 있는 동안 강조해요.
 */
function holdHandlers(id: string) {
  const release = () => setHandFocus(null);
  return {
    tabIndex: 0,
    onPointerDown: (e: PointerEvent) => {
      // 터치를 끝까지 이 줄에 붙잡아 둬서, 손가락이 조금 움직여도 풀리지 않게
      (e.currentTarget as HTMLElement).setPointerCapture?.(e.pointerId);
      setHandFocus(id);
    },
    onPointerUp: release,
    onPointerCancel: release,
    onLostPointerCapture: release,
    onFocus: () => setHandFocus(id),
    onBlur: release,
    onContextMenu: (e: MouseEvent) => e.preventDefault(),
  };
}

export function Seats() {
  const { game, you, member, away, room } = useTable();
  const hand = game.phase === 'betting' || game.phase === 'showdown';
  const listRef = useRef<HTMLUListElement>(null);
  const [glide, setGlide] = useState<{ top: number; height: number; slide: boolean } | null>(null);
  const seats = bySeat(game);
  const focus = useHandFocus();
  // 공개 패는 보드 카드가 다 깔린 뒤에 나와요 (쇼다운 결과가 처음 생긴 순간에 한 번 정해요)
  // (같은 렌더에서 보드가 먼저 그려져서, 여기서 읽으면 이번에 깔릴 카드까지 반영돼요)
  const shownKey = room.shown.length > 0 ? game.handNo : null;
  const reveal = useRef<{ key: number | null; delay: number }>({ key: null, delay: 0 });
  if (reveal.current.key !== shownKey) reveal.current = { key: shownKey, delay: shownKey === null ? 0 : boardSettleDelay() };
  const revealDelay = reveal.current.delay;
  // 쇼다운 결과가 사라지면(다음 핸드) 누르고 있던 것도 풀어요
  const anyShown = room.shown.length > 0;
  useLayoutEffect(() => {
    if (!anyShown) setHandFocus(null);
  }, [anyShown]);
  useLayoutEffect(() => () => setHandFocus(null), []);

  const [, remeasure] = useState(0);
  useLayoutEffect(() => {
    const list = listRef.current;
    if (!list || typeof ResizeObserver === 'undefined') return;
    const observer = new ResizeObserver(() => remeasure((n) => n + 1));
    observer.observe(list);
    return () => observer.disconnect();
  }, []);

  useLayoutEffect(() => {
    const row = listRef.current?.querySelector<HTMLElement>('[data-acting]');
    setGlide((prev) => {
      if (!row) return null;
      const top = row.offsetTop;
      const height = row.offsetHeight;
      if (prev && prev.top === top && prev.height === height) return prev;
      return { top, height, slide: prev !== null };
    });
  });

  return (
    <>
    <ul ref={listRef} className="seats" aria-label="플레이어">
      <span
        className="seat-glide"
        aria-hidden="true"
        data-on={glide ? true : undefined}
        data-slide={glide?.slide || undefined}
        style={glide ? { transform: `translateY(${glide.top}px)`, height: glide.height } : undefined}
      />
      {seats.map((p) => {
        const status = seatStatus(p, game.phase, away(p.id), !!member(p.id)?.manual);
        const acting = game.toActId === p.id;
        const blind = hand ? (game.sbId === p.id ? 'SB' : game.bbId === p.id ? 'BB' : null) : null;
        const won = game.phase === 'done' ? game.results.filter((r) => r.id === p.id).reduce((s, r) => s + r.amount, 0) : 0;
        const shown = room.shown.find((s) => s.id === p.id);
        return (
          <li
            key={p.id}
            className="seat"
            data-acting={acting || undefined}
            data-holdable={shown ? true : undefined}
            data-held={(shown && focus === p.id) || undefined}
            data-unheld={(focus !== null && focus !== p.id) || undefined}
            {...(shown ? holdHandlers(p.id) : {})}
            data-dim={(hand && (!p.inHand || p.folded)) || undefined}
            data-you={p.id === you.id || undefined}
            data-won={won > 0 || undefined}
            aria-current={acting ? 'true' : undefined}
          >
            <span className="seat-mark" aria-hidden="true" />
            <div className="seat-who">
              <span className="seat-name">
                <span className="seat-name-text">{p.name}</span>
                {hand && game.buttonId === p.id && (
                  <span className="dealer" title="딜러 버튼">
                    <span className="sr-only">딜러</span>
                    <span aria-hidden="true">D</span>
                  </span>
                )}
                {p.id === you.id && <span className="seat-you">나</span>}
              </span>
              {(blind || status || p.loan) && (
                <span className="seat-meta">
                  {[blind, status, p.loan ? `빚 ${fmt(p.loan)}` : null].filter(Boolean).join(' · ')}
                </span>
              )}
              {shown && (
                <span className="seat-shown">
                  <span className="seat-shown-cards" role="img" aria-label={cardsSpeech(shown.cards)}>
                    {shown.cards.map((c, i) => (
                      <PlayingCard
                        key={c}
                        card={c}
                        size="sm"
                        glow={focus === p.id ? ((shown.made ?? shown.best).includes(c) ? 'hl' : 'dim') : undefined}
                        flipDelay={revealDelay + i * 120}
                      />
                    ))}
                  </span>
                  <span className="seat-shown-label">{shown.label}</span>
                </span>
              )}
            </div>
            <span className="seat-bet num">
              {hand && p.bet > 0 ? (
                <span className="bet-pop" key={p.bet}>
                  {fmt(p.bet)}
                </span>
              ) : won > 0 ? (
                <span className="won">+{fmt(won)}</span>
              ) : null}
            </span>
            <Num value={p.stack} className="seat-stack" />
          </li>
        );
      })}
    </ul>
    {anyShown && <p className="hint seats-hint">플레이어를 누르고 있으면 그 사람의 족보 카드가 밝아져요</p>}
    </>
  );
}
