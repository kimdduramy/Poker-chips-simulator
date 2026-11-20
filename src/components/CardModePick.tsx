/** 테이블을 만들 때 고르기: 실물 카드(칩만 관리) / 앱 카드(앱이 카드를 나눠주고 승자도 정해요) */
export function CardModePick({ value, onChange }: { value: boolean; onChange: (cardMode: boolean) => void }) {
  const options = [
    { on: false, title: '실물 카드', desc: '카드는 테이블에서, 칩만 폰으로' },
    { on: true, title: '앱 카드', desc: '앱이 카드를 나눠주고 승자도 정해요' },
  ];
  return (
    <div className="mode-pick" role="radiogroup" aria-label="카드">
      {options.map((o) => (
        <button key={o.title} type="button" role="radio" aria-checked={value === o.on} className="mode-pick-opt" onClick={() => onChange(o.on)}>
          <span className="mode-pick-title">{o.title}</span>
          <span className="mode-pick-desc">{o.desc}</span>
        </button>
      ))}
    </div>
  );
}
