import { useState } from 'react';
import { useTable } from '../lib/table';
import type { LogEntry } from '../../shared/protocol';
import { fetchHistory } from '../lib/api';
import { deviceToken } from '../lib/device';
import { formatHistory } from '../lib/handHistory';
import { toast } from './Toast';

const time = (at: number) =>
  new Date(at).toLocaleTimeString('ko-KR', { hour: '2-digit', minute: '2-digit', hour12: false });

/** 메뉴 → 기록: 최근 액션·핸드·승자·되돌리기를 최신순으로 */
export function GameLog() {
  const { room } = useTable();
  if (!room.log.length) return <p className="muted">아직 기록이 없어요.</p>;
  return (
    <>
      <CopyHistory />
      <LogList />
    </>
  );
}

/**
 * 핸드 기록 복사: 끝난 핸드(최근 50판)의 보드, 공개된 패, 승자, 진행을 글로 복사해요.
 * 클립보드가 막힌 브라우저에서는 글 상자를 띄워 직접 복사하게 해요.
 */
function CopyHistory() {
  const { room } = useTable();
  const [busy, setBusy] = useState(false);
  const [fallback, setFallback] = useState<string | null>(null);
  const copy = async () => {
    setBusy(true);
    try {
      const { code, cardMode, hands } = await fetchHistory(room.code, deviceToken());
      if (!hands.length) {
        toast('아직 끝난 핸드가 없어요');
        return;
      }
      const text = formatHistory(code, cardMode, hands);
      try {
        await navigator.clipboard.writeText(text);
        toast(`핸드 ${hands.length}판 기록을 복사했어요`);
        setFallback(null);
      } catch {
        setFallback(text);
      }
    } catch (e) {
      toast((e as Error).message);
    } finally {
      setBusy(false);
    }
  };
  return (
    <div className="history-copy">
      <button className="btn btn-quiet btn-block" onClick={copy} disabled={busy}>
        {busy ? '가져오는 중…' : '핸드 기록 복사'}
      </button>
      <p className="hint">끝난 핸드 최근 50판이 짧은 기보로 복사돼요. 읽는 법은 도움말 → 용어 → 기록에 있어요.</p>
      {fallback && (
        <textarea className="text-input history-text" readOnly value={fallback} rows={8} onFocus={(e) => e.currentTarget.select()} aria-label="핸드 기록" />
      )}
    </div>
  );
}

function LogList() {
  const { room } = useTable();

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
