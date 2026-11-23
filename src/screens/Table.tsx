import { useEffect, useRef, useState } from 'react';
import { Claims } from '../components/Claims';
import { Dock } from '../components/Dock';
import { ActionToast } from '../components/ActionToast';
import { GameAnnouncer } from '../components/GameAnnouncer';
import { Header } from '../components/Header';
import { HistoryBar } from '../components/HistoryBar';
import { Lobby } from '../components/Lobby';
import { Seats } from '../components/Seats';
import { Sheets, type SheetName } from '../components/Sheets';
import { Stage } from '../components/Stage';
import { turnAlert, unlockAudio, useWakeLock } from '../lib/device-features';
import { useTable } from '../lib/table';
import { useDealLeft } from '../lib/dealer';
import { APP_NAME } from '../lib/format';
import { BOT_NAMES, getTest, setTest } from '../lib/testMode';
import { MjTableBoard } from '../components/mahjong/Board';
import { MjDock, MjLobbyDock } from '../components/mahjong/Dock';

export function Table({ onDisplay, onLeft }: { onDisplay: () => void; onLeft: () => void }) {
  const { room, game, you, conn, isHost, run } = useTable();
  const [sheet, setSheet] = useState<SheetName>(null);
  // 딜러가 카드를 까는 동안은 아직 내 차례로 치지 않아요 (알림·노란 화면은 풀릴 때)
  const dealLeft = useDealLeft();
  const mahjong = room.gameType === 'mahjong';
  const mj = mahjong ? room.mj : null;
  const myTurn = mahjong ? !!you.mj?.legal : !!you.legal && dealLeft === 0;
  const wasMyTurn = useRef(false);
  const dockRef = useRef<HTMLElement>(null);

  useWakeLock(true);

  // 테스트 판: 방장으로 들어오면 봇 자리를 한 번만 채워요
  const seeding = useRef(false);
  useEffect(() => {
    const t = getTest(room.code);
    if (!t || t.seeded || !isHost || game.phase !== 'lobby' || seeding.current) return;
    seeding.current = true;
    setTest(room.code, { ...t, seeded: true });
    void (async () => {
      const taken = new Set(room.members.map((m) => m.name));
      for (const name of BOT_NAMES.filter((n) => !taken.has(n)).slice(0, t.bots)) {
        if (!(await run({ type: 'addSeat', name }))) break;
      }
    })();
  }, [room.code, room.members, isHost, game.phase, run]);

  useEffect(() => {
    if (myTurn && !wasMyTurn.current) {
      turnAlert();
      const first = dockRef.current?.querySelector<HTMLButtonElement>('button:not([disabled])');
      first?.focus();
    }
    wasMyTurn.current = myTurn;
    const where = mahjong ? (mj ? '마작' : '대기실') : game.phase === 'lobby' ? '대기실' : `핸드 #${game.handNo}`;
    document.title = myTurn ? `내 차례 · ${APP_NAME}` : `${where} · ${APP_NAME}`;
  }, [myTurn, game.phase, game.handNo, mahjong, mj]);

  useEffect(() => () => void (document.title = APP_NAME), []);

  return (
    <div
      className="table-shell"
      data-game={room.gameType}
      data-turn={myTurn || undefined}
      data-phase={mahjong ? `mj-${mj?.phase ?? 'lobby'}` : game.phase}
      onPointerDown={unlockAudio}
    >
      <a className="skip-link" href="#table-main">
        테이블로 바로가기
      </a>
      <Header onInvite={() => setSheet('invite')} onMenu={() => setSheet('menu')} />
      {!mahjong && <GameAnnouncer />}
      <ActionToast />
      {conn.status === 'reconnecting' && (
        <div className="offline" role="status">
          다시 연결 중…
        </div>
      )}
      <Claims />
      <main id="table-main" className="table-main" tabIndex={-1}>
        {mahjong ? (
          mj ? (
            <MjTableBoard mj={mj} />
          ) : (
            <Lobby onSettings={() => setSheet('settings')} onPlayers={() => setSheet('players')} />
          )
        ) : game.phase === 'lobby' ? (
          <Lobby onSettings={() => setSheet('settings')} onPlayers={() => setSheet('players')} />
        ) : (
          <>
            <Stage />
            <Seats />
          </>
        )}
      </main>
      <aside ref={dockRef} className="dock-wrap" aria-label="내 행동">
        <HistoryBar />
        {mahjong ? mj ? <MjDock mj={mj} /> : <MjLobbyDock /> : <Dock />}
      </aside>
      <Sheets open={sheet} setOpen={setSheet} onDisplay={onDisplay} onLeft={onLeft} />
    </div>
  );
}
