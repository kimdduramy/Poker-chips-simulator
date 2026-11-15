import { useTable } from '../lib/table';
import type { LogEntry } from '../../shared/protocol';

const time = (at: number) =>
  new Date(at).toLocaleTimeString('ko-KR', { hour: '2-digit', minute: '2-digit', hour12: false });

/** 메뉴 → 기록: 최근 액션·핸드·승자·되돌리기를 최신순으로 */
export function GameLog() {
  const { room } = useTable();
  if (!room.log.length) return <p className="muted">아직 기록이 없어요.</p>;

  // '핸드 #N' 줄을 제목으로 삼아 핸드별로 묶어요
  const isHandStart = (e: LogEntry) => e.kind === 'hand' && e.text.startsWith('핸드 #');
  const groups: { head: LogEntry | null; items: LogEntry[] }[] = [];
  for (const e of room.log) {
    if (isHandStart(e) || !groups.length) groups.push({ head: isHandStart(e) ? e : null, items: [] });
    if (!isHandStart(e)) groups[groups.length - 1].items.push(e);
  }

  return (
    <div className="game-log">
      <p className="game-log-note">최근 {room.log.length}개 · 새로운 게 위에</p>
      {groups.reverse().map((g, i) => (
        <section key={g.head?.id ?? `pre-${i}`} className="game-log-group">
          {g.head && <h3 className="game-log-head">{g.head.text}</h3>}
          <ol className="game-log-list">
            {[...g.items].reverse().map((e) => (
              <li key={e.id} className="game-log-row" data-kind={e.kind}>
                <span className="game-log-time mono">{time(e.at)}</span>
                <span className="game-log-text">{e.text}</span>
              </li>
            ))}
          </ol>
        </section>
      ))}
    </div>
  );
}
