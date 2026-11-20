import { bySeat } from '../../shared/engine';
import { fmt } from '../lib/format';
import { useTable } from '../lib/table';
import { Icon } from './Icon';
import { Invite } from './Invite';

export function Lobby({ onSettings, onPlayers }: { onSettings: () => void; onPlayers: () => void }) {
  const { room, game, isHost, run, busy, v, away, member } = useTable();
  const seats = bySeat(game);
  const move = (index: number, delta: number) => {
    const ids = seats.map((p) => p.id);
    const [id] = ids.splice(index, 1);
    ids.splice(index + delta, 0, id);
    void run({ type: 'seatOrder', v, ids });
  };
  const { sb, bb, startingStack } = game.settings;

  return (
    <div className="lobby">
      <Invite code={room.code} />

      <section className="lobby-section" aria-labelledby="lobby-players">
        <div className="section-head">
          <h2 id="lobby-players">
            좌석 <span className="muted num">{seats.length}/10</span>
          </h2>
          {isHost && (
            <button className="link-btn" onClick={onPlayers}>
              관리
            </button>
          )}
        </div>
        {seats.length === 0 ? (
          <p className="muted">아직 아무도 안 들어왔어요.</p>
        ) : (
          <ol className="lobby-seats">
            {seats.map((p, i) => {
              const m = member(p.id);
              return (
                <li key={p.id}>
                  <span className="seat-index num">{i + 1}</span>
                  <span className="lobby-name">
                    {p.name}
                    {room.hostId === p.id && <span className="tag">방장</span>}
                    {i === 0 && <span className="tag">첫 버튼</span>}
                  </span>
                  <span className="muted small">{m?.manual ? '폰 없음' : away(p.id) ? '자리 비움' : ''}</span>
                  {isHost && seats.length > 1 && (
                    <span className="reorder">
                      <button className="icon-btn" disabled={i === 0 || busy} onClick={() => move(i, -1)} aria-label={`${p.name} 위로`}>
                        <Icon name="up" size={18} />
                      </button>
                      <button
                        className="icon-btn"
                        disabled={i === seats.length - 1 || busy}
                        onClick={() => move(i, 1)}
                        aria-label={`${p.name} 아래로`}
                      >
                        <Icon name="down" size={18} />
                      </button>
                    </span>
                  )}
                </li>
              );
            })}
          </ol>
        )}
        {isHost && seats.length > 1 && <p className="hint">실제 좌석 순서대로, 버튼부터 시계 방향으로 맞춰 주세요. 이 순서대로 액션이 돌아요.</p>}
      </section>

      <section className="lobby-section" aria-labelledby="lobby-rules">
        <div className="section-head">
          <h2 id="lobby-rules">게임</h2>
          {isHost && (
            <button className="link-btn" onClick={onSettings}>
              수정
            </button>
          )}
        </div>
        <dl className="facts">
          <div>
            <dt>블라인드</dt>
            <dd className="num">
              {fmt(sb)}/{fmt(bb)}
            </dd>
          </div>
          <div>
            <dt>시작 스택</dt>
            <dd className="num">{fmt(startingStack)}</dd>
          </div>
          <div>
            <dt>카드</dt>
            <dd>{room.cardMode ? '앱이 나눠줘요' : '실물 카드'}</dd>
          </div>
        </dl>
      </section>
    </div>
  );
}
