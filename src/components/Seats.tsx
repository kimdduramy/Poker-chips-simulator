import { useLayoutEffect, useRef, useState } from 'react';
import { bySeat, type Player } from '../../shared/engine';
import { fmt } from '../lib/format';
import { useTable } from '../lib/table';
import { Num } from './Num';
import { cardsSpeech, PlayingCard } from './PlayingCard';

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

export function Seats() {
  const { game, you, member, away, room } = useTable();
  const hand = game.phase === 'betting' || game.phase === 'showdown';
  const listRef = useRef<HTMLUListElement>(null);
  const [glide, setGlide] = useState<{ top: number; height: number; slide: boolean } | null>(null);
  const seats = bySeat(game);

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
                    {shown.cards.map((c) => (
                      <PlayingCard key={c} card={c} size="sm" dim={!shown.best.includes(c)} />
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
  );
}
