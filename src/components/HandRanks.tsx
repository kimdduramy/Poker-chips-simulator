import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';

type Card = [rank: string, suit: '♠' | '♥' | '♦' | '♣', key?: boolean];

/** 족보: 높은 순. 예시 카드에서 족보를 만드는 카드는 진하게, 나머지(키커)는 흐리게. */
const RANKS: { name: string; en: string; desc: string; cards: Card[] }[] = [
  { name: '로열 플러시', en: 'Royal Flush', desc: '같은 무늬 10·J·Q·K·A', cards: [['A', '♠', true], ['K', '♠', true], ['Q', '♠', true], ['J', '♠', true], ['10', '♠', true]] },
  { name: '스트레이트 플러시', en: 'Straight Flush', desc: '같은 무늬로 숫자 5장 연속', cards: [['9', '♥', true], ['8', '♥', true], ['7', '♥', true], ['6', '♥', true], ['5', '♥', true]] },
  { name: '포카드', en: 'Four of a Kind', desc: '같은 숫자 4장', cards: [['K', '♠', true], ['K', '♥', true], ['K', '♦', true], ['K', '♣', true], ['3', '♦']] },
  { name: '풀하우스', en: 'Full House', desc: '트리플 + 원페어', cards: [['Q', '♠', true], ['Q', '♥', true], ['Q', '♦', true], ['7', '♣', true], ['7', '♥', true]] },
  { name: '플러시', en: 'Flush', desc: '같은 무늬 5장 (숫자 상관없음)', cards: [['A', '♦', true], ['J', '♦', true], ['8', '♦', true], ['5', '♦', true], ['2', '♦', true]] },
  { name: '스트레이트', en: 'Straight', desc: '숫자 5장 연속 (A-2-3-4-5도 인정)', cards: [['10', '♣', true], ['9', '♦', true], ['8', '♠', true], ['7', '♥', true], ['6', '♣', true]] },
  { name: '트리플', en: 'Three of a Kind', desc: '같은 숫자 3장', cards: [['8', '♠', true], ['8', '♥', true], ['8', '♦', true], ['K', '♣'], ['4', '♥']] },
  { name: '투페어', en: 'Two Pair', desc: '페어 2개', cards: [['J', '♠', true], ['J', '♦', true], ['4', '♣', true], ['4', '♥', true], ['A', '♠']] },
  { name: '원페어', en: 'One Pair', desc: '같은 숫자 2장', cards: [['10', '♥', true], ['10', '♣', true], ['A', '♦'], ['7', '♠'], ['3', '♣']] },
  { name: '하이카드', en: 'High Card', desc: '조합 없음, 가장 높은 카드로 비교', cards: [['A', '♠', true], ['J', '♦'], ['8', '♣'], ['6', '♥'], ['2', '♠']] },
];

function Mini({ card: [rank, suit, key] }: { card: Card }) {
  const red = suit === '♥' || suit === '♦';
  return (
    <span className="mini-card" data-red={red || undefined} data-key={key || undefined}>
      <span className="mini-rank">{rank}</span>
      <span className="mini-suit">{suit}</span>
    </span>
  );
}

/**
 * "족보" 버튼: 누르고 있는 동안만 족보 창이 떠요. 손을 떼면 바로 닫혀요.
 * variant="icon"은 게임 상단바용 작은 버튼, "pill"은 메인 화면용.
 */
export function HandRanksHold({ variant = 'icon' }: { variant?: 'icon' | 'pill' }) {
  const [open, setOpen] = useState(false);

  useEffect(() => {
    if (!open) return;
    const close = () => setOpen(false);
    window.addEventListener('pointerup', close);
    window.addEventListener('pointercancel', close);
    window.addEventListener('blur', close);
    return () => {
      window.removeEventListener('pointerup', close);
      window.removeEventListener('pointercancel', close);
      window.removeEventListener('blur', close);
    };
  }, [open]);

  return (
    <>
      <button
        type="button"
        className={variant === 'icon' ? 'icon-btn hold-btn' : 'btn btn-quiet btn-sm hold-btn'}
        aria-label="족보 보기 (누르고 있는 동안 표시)"
        aria-pressed={open}
        onPointerDown={(e) => {
          e.preventDefault();
          setOpen(true);
        }}
        onContextMenu={(e) => e.preventDefault()}
        onKeyDown={(e) => {
          if ((e.key === ' ' || e.key === 'Enter') && !e.repeat) {
            e.preventDefault();
            setOpen(true);
          }
        }}
        onKeyUp={(e) => (e.key === ' ' || e.key === 'Enter') && setOpen(false)}
        onBlur={() => setOpen(false)}
      >
        {variant === 'icon' ? <span className="hold-btn-text">족보</span> : '족보 보기 · 누르고 있기'}
      </button>
      {open &&
        createPortal(
        <div className="ranks-overlay" role="dialog" aria-label="족보">
          <div className="ranks-panel">
            <div className="ranks-head">
              <span className="ranks-title">족보</span>
              <span className="ranks-sub">위가 더 높아요</span>
            </div>
            <ol className="ranks-list">
              {RANKS.map((r, i) => (
                <li key={r.name} className="ranks-row">
                  <span className="ranks-no num">{i + 1}</span>
                  <span className="ranks-cards" aria-hidden="true">
                    {r.cards.map((c, j) => (
                      <Mini key={j} card={c} />
                    ))}
                  </span>
                  <span className="ranks-text">
                    <span className="ranks-name">
                      {r.name} <span className="ranks-en">{r.en}</span>
                    </span>
                    <span className="ranks-desc">{r.desc}</span>
                  </span>
                </li>
              ))}
            </ol>
            <p className="ranks-foot">내 카드 2장 + 공유 카드 5장 중 가장 좋은 5장으로 겨뤄요. 같은 족보면 더 높은 숫자가 이겨요.</p>
          </div>
        </div>,
          // 반투명 창(backdrop-filter) 안에서 열려도 화면 전체에 뜨도록 body에 그려요
          document.body,
        )}
    </>
  );
}
