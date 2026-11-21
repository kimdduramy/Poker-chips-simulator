import { CARD_BACKS, setCardBack, useCardBack } from '../lib/cardBack';

/** 카드 뒷면 고르기: 실제 뒷면 모양을 작게 보여주고 누르면 바로 바뀌어요 */
export function CardBackPick() {
  const value = useCardBack();
  return (
    <div className="back-pick-wrap">
      <span className="field-label" id="back-pick-label">
        내 카드 뒷면
      </span>
      <div className="back-pick" role="radiogroup" aria-labelledby="back-pick-label">
        {CARD_BACKS.map((b) => (
          <button
            key={b.id}
            type="button"
            role="radio"
            aria-checked={value === b.id}
            className="back-pick-opt"
            onClick={() => setCardBack(b.id)}
          >
            {/* 고르는 버튼에서는 html 설정과 상관없이 각자의 모양으로 */}
            <span className="pcard back-sample" data-back data-back-style={b.id} aria-hidden="true" />
            <span className="back-pick-name">{b.name}</span>
          </button>
        ))}
      </div>
    </div>
  );
}
