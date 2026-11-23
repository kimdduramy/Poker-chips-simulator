import { doraOf, roundName, tileName, WIND_NAMES } from '../../../shared/mahjong/tiles';
import type { MjView } from '../../../shared/mahjong/view';
import { fmt } from '../../lib/format';
import { useTable } from '../../lib/table';
import { MjTile } from './Tile';

/** 나를 기준으로 한 자리 위치 이름 (반시계 방향으로 차례가 돌아요) */
const PLACE = ['나', '오른쪽', '맞은편', '왼쪽'];

/** 판 위쪽: 국·본장·공탁, 남은 패, 도라 */
export function MjInfo({ mj }: { mj: MjView }) {
  return (
    <section className="mj-info" aria-label="판 정보">
      <div className="mj-info-round">
        <span className="mj-round">{roundName(mj.roundWind, mj.kyoku)}</span>
        <span className="muted num">
          {mj.honba}본장{mj.kyotaku > 0 ? ` · 공탁 ${mj.kyotaku}` : ''}
        </span>
      </div>
      <div className="mj-info-wall">
        <span className="label">남은 패</span>
        <span className="mj-wall-left num">{mj.wallLeft}</span>
      </div>
      <div className="mj-info-dora" aria-label={`도라 표시패 ${mj.dora.map(tileName).join(', ')}. 도라는 ${mj.dora.map((d) => tileName(doraOf(d))).join(', ')}`}>
        <span className="label">도라 표시</span>
        <span className="mj-dora-tiles" aria-hidden="true">
          {mj.dora.map((d, i) => (
            <MjTile key={i} tile={d} size="sm" />
          ))}
        </span>
        <span className="mj-dora-is muted small" aria-hidden="true">
          → {mj.dora.map((d) => tileName(doraOf(d))).join(', ')}
        </span>
      </div>
    </section>
  );
}

/** 네 사람: 바람, 이름, 점수, 버림패. 내 자리를 맨 아래에, 나머지는 차례 순서대로. */
export function MjSeats({ mj, fixed }: { mj: MjView; fixed?: boolean }) {
  const { you: me, away, member } = useTable();
  // 큰 화면(fixed)은 누구 기준도 아니라 자리 순서대로 보여줘요
  const you = fixed ? { mj: null } : me;
  const mySeat = you.mj?.seat ?? 0;
  const order = (you.mj ? [1, 2, 3, 0] : [0, 1, 2, 3]).map((k) => (mySeat + k) % 4);
  return (
    <ol className="mj-seats" aria-label="자리">
      {order.map((seat) => {
        const s = mj.seats[seat];
        const k = (seat - mySeat + 4) % 4;
        const acting = mj.phase === 'play' && mj.turn === seat && !mj.claiming;
        const m = member(s.id);
        const status = !m ? '자동' : m.manual ? '봇' : away(s.id) ? '자리 비움' : '';
        const last = mj.lastDiscard?.seat === seat;
        return (
          <li key={s.id} className="mj-seat" data-acting={acting || undefined} data-me={k === 0 || undefined}>
            <div className="mj-seat-head">
              <span className="mj-wind" data-dealer={s.wind === 0 || undefined} title={s.wind === 0 ? '친' : undefined}>
                {WIND_NAMES[s.wind]}
              </span>
              <span className="mj-seat-name">
                {s.name}
                {you.mj && <span className="muted small"> · {PLACE[k]}</span>}
                {s.wind === 0 && <span className="tag">친</span>}
                {s.riichi && <span className="tag tag-accent">리치</span>}
                {status && <span className="muted small"> {status}</span>}
              </span>
              <span className="mj-seat-points num">{fmt(s.points)}</span>
            </div>
            <div className="mj-river" aria-label={`${s.name} 버림패 ${s.river.length}장`}>
              {s.river.length === 0 ? (
                <span className="mj-river-empty muted small">{acting ? '차례' : ''}</span>
              ) : (
                s.river.map((t, i) => (
                  <MjTile key={i} tile={t} size="sm" faint={t.includes('_')} mark={last && i === s.river.length - 1} />
                ))
              )}
            </div>
          </li>
        );
      })}
    </ol>
  );
}
