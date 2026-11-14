import { useState, type FormEvent } from 'react';
import { CODE_LENGTH, normalizeCode } from '../../shared/protocol';
import { createRoom, roomInfo } from '../lib/api';
import { unlockAudio } from '../lib/device-features';

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
      <section className="home-hero">
        <h1 className="wordmark">
          <mark>칩</mark> 포커
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

      <ol className="home-how">
        <li>테이블을 만들고 코드를 공유해요.</li>
        <li>각자 자기 폰으로 들어와요.</li>
        <li>카드는 진짜로 돌리고, 칩 계산은 앱이 해요.</li>
      </ol>

    </main>
  );
}
