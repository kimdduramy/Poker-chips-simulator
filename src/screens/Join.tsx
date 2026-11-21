import { useEffect, useRef, useState, type FormEvent } from 'react';
import { saveName, savedName } from '../lib/device';
import { unlockAudio } from '../lib/device-features';
import { useTable } from '../lib/table';
import { getTest, setTest } from '../lib/testMode';
import { CardBackPick } from '../components/CardBackPick';

export function Join({ onDisplay }: { onDisplay: () => void }) {
  const { room, game, you, run, busy, away } = useTable();
  const [name, setName] = useState(savedName);
  const pendingClaim = room.claims.find((c) => c.id === you.claimId);
  const full = room.members.length >= 10;

  // 테스트 판: 만든 사람은 이름 입력 없이 '방장'으로 바로 입장
  const autoJoined = useRef(false);
  useEffect(() => {
    const t = getTest(room.code);
    if (!t || t.joined || autoJoined.current) return;
    autoJoined.current = true;
    void run({ type: 'join', name: '방장' }).then((ok) => ok && setTest(room.code, { ...t, joined: true }));
  }, [room.code, run]);

  const join = async (e: FormEvent) => {
    e.preventDefault();
    unlockAudio();
    const trimmed = name.trim();
    if (!trimmed) return;
    saveName(trimmed);
    await run({ type: 'join', name: trimmed });
  };

  const status =
    game.phase === 'lobby'
      ? room.members.length === 0
        ? '아직 아무도 없어요. 혼자 하는 포커는 그냥 카드놀이예요.'
        : `${room.members.length}명 대기 중`
      : `핸드 #${game.handNo} 진행 중`;

  if (pendingClaim) {
    return (
      <main className="join" id="main" tabIndex={-1}>
        <div className="join-card">
          <p className="join-code">
            <span className="sr-only">테이블 코드 {room.code.split('').join(' ')}</span>
            <span aria-hidden="true">{room.code}</span>
          </p>
          <h1 className="join-title">승인 기다리는 중</h1>
          <p className="muted" role="status" aria-live="polite">
            테이블의 누군가가{' '}
            <strong>{room.members.find((m) => m.id === pendingClaim.playerId)?.name}</strong>의 자리를 이 기기로 옮기는 걸 승인해야 해요.
          </p>
          <div className="waiting-dots" aria-hidden="true">
            <span />
            <span />
            <span />
          </div>
          <button className="btn btn-quiet btn-lg" onClick={() => run({ type: 'cancelClaim' })}>
            취소
          </button>
        </div>
      </main>
    );
  }

  return (
    <main className="join" id="main" tabIndex={-1}>
      <div className="join-card">
        <p className="join-code">
          <span className="sr-only">테이블 코드 {room.code.split('').join(' ')}</span>
          <span aria-hidden="true">{room.code}</span>
        </p>
        <h1 className="join-title">자리에 앉기</h1>
        <p className="muted">{status}</p>

        <form className="stack-form" onSubmit={join}>
          <label htmlFor="name" className="field-label">
            내 이름
          </label>
          <input
            id="name"
            className="text-input"
            value={name}
            onChange={(e) => setName(e.target.value)}
            maxLength={24}
            autoComplete="nickname"
            enterKeyHint="go"
            placeholder="친구들이 부르는 이름"
            autoFocus
          />
          {room.cardMode && <CardBackPick />}
          <button className="btn btn-primary btn-xl" disabled={!name.trim() || busy || full}>
            {full ? '좌석이 꽉 찼어요' : '참가하기'}
          </button>
        </form>

        {room.members.length > 0 && (
          <section className="rejoin">
            <h2 className="field-label">다른 기기로 이미 앉아 있었나요?</h2>
            <ul className="chip-list">
              {room.members.map((m) => (
                <li key={m.id}>
                  <button className="chip" onClick={() => run({ type: 'claim', playerId: m.id })} disabled={busy}>
                    {m.name}
                    {away(m.id) && <span className="chip-note">{m.manual ? '폰 없음' : '자리 비움'}</span>}
                  </button>
                </li>
              ))}
            </ul>
          </section>
        )}

        <button className="link-btn" onClick={onDisplay}>
          이 화면을 큰 화면 모드로 쓰기
        </button>
      </div>
    </main>
  );
}
