import { useState, type FormEvent } from 'react';
import { CODE_LENGTH, normalizeCode } from '../../shared/protocol';
import { createRoom, roomInfo } from '../lib/api';
import { unlockAudio } from '../lib/device-features';
import { HelpButton } from '../components/Help';

export function Home({ navigate }: { navigate: (to: string) => void }) {
  const [code, setCode] = useState('');
  const [busy, setBusy] = useState<'new' | 'join' | null>(null);
  const [error, setError] = useState<string | null>(null);

  const start = async () => {
    unlockAudio();
    setBusy('new');
    setError(null);
    try {
      navigate(`/t/${await createRoom()}`);
    } catch (e) {
      setError((e as Error).message);
      setBusy(null);
    }
  };

  const join = async (e: FormEvent) => {
    e.preventDefault();
    unlockAudio();
    if (code.length !== CODE_LENGTH) return;
    setBusy('join');
    setError(null);
    try {
      const info = await roomInfo(code);
      if (!info) {
        setError(`${code} 테이블이 없어요. 방장 화면의 코드를 다시 확인해 주세요.`);
        setBusy(null);
        return;
      }
      navigate(`/t/${code}`);
    } catch (err) {
      setError((err as Error).message);
      setBusy(null);
    }
  };

  return (
    <main id="main" className="home" tabIndex={-1}>
      <a className="skip-link" href="#home-actions">
        바로가기
      </a>
      <header className="home-top">
        <HelpButton />
      </header>
      <section className="home-hero">
        <h1 className="wordmark" aria-label="포커 베팅 시뮬레이터">
          <span className="wm-line" aria-hidden="true">
            <span className="wm-chip">
              <ChipsMark />
            </span>
            포커 베팅
          </span>
          <span className="wm-line" aria-hidden="true">
            시뮬레이터
          </span>
        </h1>
        <p className="home-tagline">칩은 폰으로, 카드는 테이블에서.</p>
      </section>

      <section id="home-actions" className="home-actions">
        <button className="btn btn-primary btn-xl" onClick={start} disabled={busy !== null}>
          {busy === 'new' ? '만드는 중…' : '테이블 만들기'}
        </button>

        <form className="join-form" onSubmit={join}>
          <label htmlFor="code" className="field-label">
            코드가 있나요?
          </label>
          <div className="join-row">
            <input
              id="code"
              className="code-input"
              value={code}
              onChange={(e) => setCode(normalizeCode(e.target.value))}
              placeholder="ABCD"
              autoComplete="off"
              autoCapitalize="characters"
              autoCorrect="off"
              spellCheck={false}
              enterKeyHint="go"
              maxLength={CODE_LENGTH + 4}
              aria-invalid={error ? true : undefined}
              aria-describedby={error ? 'home-error' : undefined}
            />
            <button className="btn btn-quiet btn-lg" disabled={code.length !== CODE_LENGTH || busy !== null}>
              {busy === 'join' ? '찾는 중…' : '입장'}
            </button>
          </div>
        </form>
        {error && (
          <p id="home-error" className="form-error" role="alert">
            {error}
          </p>
        )}
      </section>

    </main>
  );
}

/** 워드마크 앞 그림: 노란 칩 두 개가 겹친 모양 */
function ChipsMark() {
  const chip = (cx: number, cy: number, r: number, cls: string) => (
    <g className={cls}>
      <circle cx={cx} cy={cy} r={r} className="wm-chip-face" />
      <circle cx={cx} cy={cy} r={r - 4} className="wm-chip-edge" strokeDasharray={`${(Math.PI * 2 * (r - 4)) / 24} ${(Math.PI * 2 * (r - 4)) / 24}`} />
      <circle cx={cx} cy={cy} r={r * 0.7} className="wm-chip-ring" />
    </g>
  );
  return (
    <svg className="wm-chips" viewBox="0 0 120 120" aria-hidden="true" focusable="false">
      {chip(76, 44, 36, 'wm-chip-back')}
      {chip(50, 70, 42, 'wm-chip-front')}
    </svg>
  );
}
