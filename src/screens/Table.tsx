import { useEffect, useRef, useState } from 'react';
import { Claims } from '../components/Claims';
import { Dock } from '../components/Dock';
import { GameAnnouncer } from '../components/GameAnnouncer';
import { Header } from '../components/Header';
import { Lobby } from '../components/Lobby';
import { Seats } from '../components/Seats';
import { Sheets, type SheetName } from '../components/Sheets';
import { Stage } from '../components/Stage';
import { turnAlert, unlockAudio, useWakeLock } from '../lib/device-features';
import { useTable } from '../lib/table';
import { APP_NAME } from '../lib/format';

export function Table({ onDisplay, onLeft }: { onDisplay: () => void; onLeft: () => void }) {
  const { game, you, conn } = useTable();
  const [sheet, setSheet] = useState<SheetName>(null);
  const myTurn = !!you.legal;
  const wasMyTurn = useRef(false);
  const dockRef = useRef<HTMLElement>(null);

  useWakeLock(true);

  useEffect(() => {
    if (myTurn && !wasMyTurn.current) {
      turnAlert();
      const first = dockRef.current?.querySelector<HTMLButtonElement>('button:not([disabled])');
      first?.focus();
    }
    wasMyTurn.current = myTurn;
    document.title = myTurn ? `내 차례 · ${APP_NAME}` : `${game.phase === 'lobby' ? '대기실' : `${game.handNo}번째 판`} · ${APP_NAME}`;
  }, [myTurn, game.phase, game.handNo]);

  useEffect(() => () => void (document.title = APP_NAME), []);

  return (
    <div className="table-shell" data-turn={myTurn || undefined} data-phase={game.phase} onPointerDown={unlockAudio}>
      <a className="skip-link" href="#table-main">
        테이블로 바로가기
      </a>
      <Header onInvite={() => setSheet('invite')} onMenu={() => setSheet('menu')} />
      <GameAnnouncer />
      {conn.status === 'reconnecting' && (
        <div className="offline" role="status">
          다시 연결 중…
        </div>
      )}
      <Claims />
      <main id="table-main" className="table-main" tabIndex={-1}>
        {game.phase === 'lobby' ? (
          <Lobby onSettings={() => setSheet('settings')} onPlayers={() => setSheet('players')} />
        ) : (
          <>
            <Stage />
            <Seats />
          </>
        )}
      </main>
      <aside ref={dockRef} className="dock-wrap" aria-label="내 행동">
        <Dock />
      </aside>
      <Sheets open={sheet} setOpen={setSheet} onDisplay={onDisplay} onLeft={onLeft} />
    </div>
  );
}
