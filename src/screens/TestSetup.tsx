import { useState } from 'react';
import { createRoom } from '../lib/api';
import { setTest } from '../lib/testMode';
import { CardModePick } from '../components/CardModePick';
import { GamePick } from '../components/GamePick';
import type { GameType } from '../../shared/protocol';

/** /test : 혼자서 여러 명 판을 시험해 보는 테스트 판 만들기 */
export function TestSetup({ navigate }: { navigate: (to: string) => void }) {
  const [bots, setBots] = useState(3);
  const [busy, setBusy] = useState(false);
  const [cardMode, setCardMode] = useState(false);
  const [gameType, setGameType] = useState<GameType>('holdem');
  const mahjong = gameType === 'mahjong';
  const [error, setError] = useState<string | null>(null);

  const start = async () => {
    setBusy(true);
    setError(null);
    try {
      const code = await createRoom({ cardMode: !mahjong && cardMode, gameType });
      // 마작은 4명이라 봇 3명이 고정이에요
      setTest(code, { bots: mahjong ? 3 : bots, joined: false, seeded: false });
      navigate(`/t/${code}`);
    } catch (e) {
      setError((e as Error).message);
      setBusy(false);
    }
  };

  return (
    <main className="home test-setup" id="main" tabIndex={-1}>
      <section className="home-hero">
        <span className="test-badge">테스트</span>
        <h1 className="wordmark">테스트 판 만들기</h1>
        <p className="home-tagline">혼자서 여러 명 있는 판을 돌려 볼 수 있어요.</p>
      </section>

      <section className="home-actions test-actions">
        <span className="field-label">게임</span>
        <GamePick value={gameType} onChange={setGameType} />
        {mahjong ? (
          <p className="hint">마작은 나 + 봇 3명이에요. 봇은 가져온 패를 그대로 버리고, 이길 수 있으면 이겨요.</p>
        ) : (
          <>
        <span className="field-label" id="bots-label">
          봇 인원 (나 포함 {bots + 1}명)
        </span>
        <div className="test-bots" role="radiogroup" aria-labelledby="bots-label">
          {[1, 2, 3, 4, 5, 6, 7].map((n) => (
            <button
              key={n}
              type="button"
              role="radio"
              aria-checked={bots === n}
              className="test-bot-pick"
              onClick={() => setBots(n)}
            >
              {n}
            </button>
          ))}
        </div>
        <span className="field-label">카드</span>
        <CardModePick value={cardMode} onChange={setCardMode} />
          </>
        )}
        <button className="btn btn-primary btn-xl" onClick={start} disabled={busy}>
          {busy ? '만드는 중…' : '테스트 판 시작'}
        </button>
        {error && (
          <p className="form-error" role="alert">
            {error}
          </p>
        )}
      </section>

      <ol className="home-how">
        <li>내가 방장으로 자동 입장하고, 봇이 자리에 앉아요.</li>
        <li>봇 차례가 오면 그 봇의 버튼이 바로 내 화면에 떠요.</li>
        <li>판은 일반 판과 똑같이 돌아가요. 친구에게 코드를 주면 같이 들어올 수도 있어요.</li>
      </ol>
    </main>
  );
}
