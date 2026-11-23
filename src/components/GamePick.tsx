import type { GameType } from '../../shared/protocol';
import { Icon } from './Icon';

/** 테이블을 만들 때 고르기: 홀덤 / 마작 */
export function GamePick({ value, onChange }: { value: GameType; onChange: (g: GameType) => void }) {
  const options: { id: GameType; title: string; desc: string }[] = [
    { id: 'holdem', title: '홀덤', desc: '노리밋 텍사스 홀덤, 2~10명' },
    { id: 'mahjong', title: '마작', desc: '리치 마작 4명, 앱이 패를 나눠줘요' },
  ];
  return (
    <div className="mode-pick" role="radiogroup" aria-label="게임">
      {options.map((o) => (
        <button key={o.id} type="button" role="radio" aria-checked={value === o.id} className="mode-pick-opt" onClick={() => onChange(o.id)}>
          <span className="mode-pick-title">
            {o.title}
            {value === o.id && <Icon name="check" size={16} />}
          </span>
          <span className="mode-pick-desc">{o.desc}</span>
        </button>
      ))}
    </div>
  );
}
