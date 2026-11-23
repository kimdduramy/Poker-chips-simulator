import { useState, type FormEvent } from 'react';
import { DEFAULT_MJ_RULES, type MjRules } from '../../../shared/mahjong/view';
import { fmt } from '../../lib/format';
import { useTable } from '../../lib/table';
import { Icon } from '../Icon';

/** 마작 규칙 한 줄 요약들 (대기실·큰 화면) */
export function rulesFacts(r: MjRules): { label: string; value: string }[] {
  return [
    { label: '길이', value: r.length === 'east' ? '동풍전 (동장만)' : '반장전 (동장+남장)' },
    { label: '시작 점수', value: fmt(r.startPoints) },
    { label: '적도라', value: r.aka ? '있음 (빨간 5 세 장)' : '없음' },
    { label: '쿠이탕', value: r.kuitan ? '있음 (울어도 탕야오)' : '없음' },
  ];
}

function Pick<T extends string | boolean>({
  label,
  value,
  options,
  onChange,
}: {
  label: string;
  value: T;
  options: { value: T; title: string; desc: string }[];
  onChange: (v: T) => void;
}) {
  return (
    <div className="field">
      <span className="field-label">{label}</span>
      <div className="mode-pick" role="radiogroup" aria-label={label}>
        {options.map((o) => (
          <button key={String(o.value)} type="button" role="radio" aria-checked={value === o.value} className="mode-pick-opt" onClick={() => onChange(o.value)}>
            <span className="mode-pick-title">
              {o.title}
              {value === o.value && <Icon name="check" size={16} />}
            </span>
            <span className="mode-pick-desc">{o.desc}</span>
          </button>
        ))}
      </div>
    </div>
  );
}

/** 방장: 마작 규칙 고르기 (게임 시작 전에만) */
export function MjRulesForm({ onDone }: { onDone: () => void }) {
  const { room, run, busy, v } = useTable();
  const current = room.mjRules ?? DEFAULT_MJ_RULES;
  const [length, setLength] = useState(current.length);
  const [aka, setAka] = useState(current.aka);
  const [kuitan, setKuitan] = useState(current.kuitan);
  const [points, setPoints] = useState(String(current.startPoints));
  const n = Number(points);
  const error = !Number.isSafeInteger(n) || n < 1000 || n > 1_000_000 || n % 100 !== 0 ? '시작 점수는 1,000 이상, 100 단위로 적어 주세요' : null;
  const playing = !!room.mj;

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (error || playing) return;
    if (await run({ type: 'mjRules', v, rules: { startPoints: n, length, aka, kuitan } })) onDone();
  };

  return (
    <form className="stack-form" onSubmit={submit}>
      {playing && <p className="hint">게임 중에는 바꿀 수 없어요. 게임이 끝나고 대기실에서 바꿔요.</p>}
      <Pick
        label="길이"
        value={length}
        onChange={setLength}
        options={[
          { value: 'south', title: '반장전', desc: '동장 4국 + 남장 4국, 1시간 넘게' },
          { value: 'east', title: '동풍전', desc: '동장 4국만, 처음 해 보면 추천' },
        ]}
      />
      <Pick
        label="적도라"
        value={aka}
        onChange={setAka}
        options={[
          { value: true, title: '있음', desc: '빨간 5 세 장이 도라 1판' },
          { value: false, title: '없음', desc: '점수가 덜 출렁여요' },
        ]}
      />
      <Pick
        label="쿠이탕 (울고 탕야오)"
        value={kuitan}
        onChange={setKuitan}
        options={[
          { value: true, title: '있음', desc: '초보도 이기기 쉬워요' },
          { value: false, title: '없음', desc: '탕야오는 안 울었을 때만' },
        ]}
      />
      <div className="field">
        <label htmlFor="mj-points" className="field-label">
          시작 점수
        </label>
        <input id="mj-points" className="text-input num" inputMode="numeric" value={points} onChange={(e) => setPoints(e.target.value.replace(/\D/g, ''))} />
        <span className="hint">보통 25,000점이에요.</span>
      </div>
      {error && (
        <p className="form-error" role="alert">
          {error}
        </p>
      )}
      <button className="btn btn-primary btn-lg btn-block" disabled={busy || !!error || playing}>
        저장
      </button>
    </form>
  );
}
