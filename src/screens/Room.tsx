import { TableProvider } from '../lib/table';
import { useRoom } from '../lib/useRoom';
import { Display } from './Display';
import { Join } from './Join';
import { Table } from './Table';

const CLOSED_COPY = {
  expired: { title: '테이블이 닫혔어요', body: '12시간 동안 아무 활동이 없으면 테이블이 닫혀요. 새로 만들면 돼요.' },
  kicked: { title: '테이블에서 내보내졌어요', body: '방장이 이 테이블에서 내보냈어요.' },
  replaced: { title: '자리가 옮겨졌어요', body: '내 자리가 다른 기기로 넘어갔어요.' },
} as const;

export function Room({ code, display, navigate }: { code: string; display: boolean; navigate: (to: string) => void }) {
  const conn = useRoom(code);
  const toDisplay = () => navigate(`/t/${code}?view=display`);
  const toTable = () => navigate(`/t/${code}`);

  if (conn.status === 'missing') {
    return (
      <Notice
        title={`${code} 테이블이 없어요`}
        body="코드를 다시 확인해 주세요. 아니면 테이블이 폴드했거나요."
        action="처음으로"
        onAction={() => navigate('/')}
      />
    );
  }
  if (conn.status === 'closed' && conn.closedReason) {
    const copy = CLOSED_COPY[conn.closedReason];
    return <Notice title={copy.title} body={copy.body} action="처음으로" onAction={() => navigate('/')} />;
  }
  if (!conn.state) {
    return (
      <main className="notice" aria-busy="true">
        <p className="big-code">{code}</p>
        <p className="muted">{conn.status === 'reconnecting' ? '다시 연결 중…' : '의자 가져오는 중…'}</p>
      </main>
    );
  }

  return (
    <TableProvider conn={conn}>
      {display ? (
        <Display onExit={toTable} />
      ) : conn.state.you.id ? (
        <Table onDisplay={toDisplay} onLeft={() => navigate('/')} />
      ) : (
        <Join onDisplay={toDisplay} />
      )}
    </TableProvider>
  );
}

function Notice({ title, body, action, onAction }: { title: string; body: string; action: string; onAction: () => void }) {
  return (
    <main className="notice" id="main" tabIndex={-1}>
      <h1 className="notice-title">{title}</h1>
      <p className="muted">{body}</p>
      <button className="btn btn-primary btn-lg" onClick={onAction}>
        {action}
      </button>
    </main>
  );
}
