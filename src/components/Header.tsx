import { STREET_NAMES } from '../lib/format';
import { useTable } from '../lib/table';
import { Icon } from './Icon';

export function Header({ onInvite, onMenu }: { onInvite: () => void; onMenu: () => void }) {
  const { room, game, conn } = useTable();
  const phase =
    game.phase === 'lobby'
      ? '대기실'
      : game.phase === 'betting'
        ? STREET_NAMES[game.street]
        : game.phase === 'showdown'
          ? '쇼다운'
          : '핸드 종료';
  const online = conn.status === 'open';

  return (
    <header className="topbar">
      <button className="code-btn" onClick={onInvite} aria-label={`테이블 ${room.code}. 친구 초대`}>
        <span className="mono">{room.code}</span>
      </button>
      <div className="topbar-phase" aria-live="polite">
        {game.handNo > 0 && <span className="muted">핸드 #{game.handNo}</span>}
        <span className="phase-name" key={phase}>
          {phase}
        </span>
      </div>
      <div className="topbar-end">
        <span className="conn" data-online={online} title={online ? '연결됨' : '다시 연결 중'} role="img" aria-label={online ? '연결됨' : '다시 연결 중'} />
        <button className="icon-btn" onClick={onMenu} aria-label="메뉴">
          <Icon name="menu" />
        </button>
      </div>
    </header>
  );
}
