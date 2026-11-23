import { STREET_NAMES } from '../lib/format';
import { useTable } from '../lib/table';
import { getTest } from '../lib/testMode';
import { GlossaryButton } from './Glossary';
import { HandRanksHold } from './HandRanks';
import { Icon } from './Icon';
import { MAHJONG_TERMS } from './mahjong/terms';
import { roundName } from '../../shared/mahjong/tiles';

export function Header({ onInvite, onMenu }: { onInvite: () => void; onMenu: () => void }) {
  const { room, game, conn } = useTable();
  const mj = room.gameType === 'mahjong' ? room.mj : null;
  const phase = mj
    ? mj.phase === 'end'
      ? '게임 끝'
      : `${roundName(mj.roundWind, mj.kyoku)}${mj.phase === 'result' ? ' 끝' : ''}`
    : room.gameType === 'mahjong'
      ? '대기실'
      : game.phase === 'lobby'
      ? '대기실'
      : game.phase === 'betting'
        ? STREET_NAMES[game.street]
        : game.phase === 'showdown'
          ? '쇼다운'
          : '핸드 종료';
  const online = conn.status === 'open';

  return (
    <header className="topbar">
      <div className="topbar-start">
        <button className="code-btn" onClick={onInvite} aria-label={`테이블 ${room.code}. 친구 초대`}>
          <span className="mono">{room.code}</span>
        </button>
 {getTest(room.code) && <span className="test-badge test-badge-sm">테스트</span>}
        <span className="conn" data-online={online} title={online ? '연결됨' : '다시 연결 중'} role="img" aria-label={online ? '연결됨' : '다시 연결 중'} />
      </div>
      <div className="topbar-phase" aria-live="polite">
        {room.gameType !== 'mahjong' && game.handNo > 0 && <span className="muted">핸드 #{game.handNo}</span>}
        <span className="phase-name" key={phase}>
          {phase}
        </span>
      </div>
      <div className="topbar-end">
        {room.gameType !== 'mahjong' && <HandRanksHold />}
        <GlossaryButton groups={room.gameType === 'mahjong' ? MAHJONG_TERMS : undefined} />
        <button className="icon-btn" onClick={onMenu} aria-label="메뉴">
          <Icon name="menu" />
        </button>
      </div>
    </header>
  );
}
