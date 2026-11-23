import { useEffect, useState } from 'react';
import { drawName, yakuName } from '../../../shared/mahjong/names';
import { tileName, tilesOf, WIND_NAMES } from '../../../shared/mahjong/tiles';
import type { MjPrivate, MjResult, MjView } from '../../../shared/mahjong/view';
import { fmt, signed } from '../../lib/format';
import { useTable } from '../../lib/table';
import { MjTile, MjTiles } from './Tile';

/** 화면 아래: 내 손패와 버튼. 국이 끝나면 결과, 게임이 끝나면 순위. */
export function MjDock({ mj }: { mj: MjView }) {
  const { you } = useTable();
  if (mj.phase === 'end') return <MjFinalPanel mj={mj} />;
  if (mj.phase === 'result') return <MjResultPanel mj={mj} />;
  if (!you.mj) return <div className="dock">관전 중</div>;
  return <MjPlay mj={mj} me={you.mj} />;
}

function MjPlay({ mj, me }: { mj: MjView; me: MjPrivate }) {
  const { run, busy, v, nameOf, away } = useTable();
  const legal = me.legal;
  const myTurn = !!legal && legal.discard.length > 0;
  const [picked, setPicked] = useState<string | null>(null);
  // 차례가 바뀌면 고른 패를 지워요
  useEffect(() => setPicked(null), [mj.turn, me.drawn, mj.claiming]);

  const send = (action: Parameters<typeof run>[0]) => void run(action);
  const discard = (tile: string) => send({ type: 'mj', v, action: { kind: 'discard', tile } });
  /** 처음 누르면 들어 올리고, 한 번 더 누르면 버려요 */
  const tap = (tile: string) => {
    if (!myTurn || busy) return;
    if (picked === tile) discard(tile);
    else setPicked(tile);
  };
  const allowed = (tile: string) => !!legal?.discard.includes(tile);

  const turnSeat = mj.seats[mj.turn];
  const turnAway = !myTurn && !mj.claiming && turnSeat && away(turnSeat.id);

  let title: string;
  if (legal?.ron && mj.lastDiscard) title = `${nameOf(mj.seats[mj.lastDiscard.seat].id)}님이 버린 ${tileName(mj.lastDiscard.tile)}(으)로 이길 수 있어요!`;
  else if (myTurn) title = legal?.tsumo ? '쯔모! 가져온 패로 이길 수 있어요' : '내 차례 · 버릴 패를 두 번 누르세요';
  else if (mj.claiming) title = '누군가 론을 고르는 중…';
  else title = `${turnSeat?.name ?? ''} 차례`;

  return (
    <div className="dock mj-dock" data-turn={myTurn || legal?.ron || undefined} data-discard={myTurn || undefined}>
      <div className="mj-hand" role="group" aria-label="내 손패">
        {me.hand.map((t, i) => (
          <HandTile key={`${t}-${i}`} tile={t} picked={picked === t && i === me.hand.indexOf(t)} enabled={myTurn && allowed(t)} onTap={() => tap(t)} />
        ))}
        {me.drawn && (
          <span className="mj-hand-drawn">
            <HandTile tile={me.drawn} picked={picked === `${me.drawn}_`} enabled={myTurn && allowed(`${me.drawn}_`)} onTap={() => tap(`${me.drawn}_`)} drawn />
          </span>
        )}
      </div>

      {/* 세로 화면에서는 제목·도우미·버튼이 손패 위아래로, 가로 화면에서는 오른쪽 칸에 모여요 */}
      <div className="mj-dock-side">
        <p className="mj-dock-title" aria-live="polite">
          {title}
        </p>
        <Helper me={me} />
        <div className="mj-actions">
          {legal?.tsumo && (
            <button className="btn btn-primary btn-lg" disabled={busy} onClick={() => send({ type: 'mj', v, action: { kind: 'tsumo' } })}>
              쯔모
            </button>
          )}
          {legal?.ron && (
            <>
              <button className="btn btn-primary btn-lg" disabled={busy} onClick={() => send({ type: 'mj', v, action: { kind: 'ron' } })}>
                론
              </button>
              <button className="btn btn-quiet btn-lg" disabled={busy} onClick={() => send({ type: 'mj', v, action: { kind: 'pass' } })}>
                넘기기
              </button>
            </>
          )}
          {myTurn && picked && (
            <button className="btn btn-quiet btn-lg" disabled={busy} onClick={() => discard(picked)}>
              {tileName(picked)} 버리기
            </button>
          )}
          {legal?.abort && (
            <button className="btn btn-quiet btn-lg" disabled={busy} onClick={() => send({ type: 'mj', v, action: { kind: 'abort' } })}>
              구종구패 유국
            </button>
          )}
          {turnAway && turnSeat && (
            <button className="btn btn-quiet btn-lg" disabled={busy} onClick={() => send({ type: 'mjAuto', v, playerId: turnSeat.id })}>
              {turnSeat.name} 대신 버리기
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

function HandTile({ tile, picked, enabled, onTap, drawn }: { tile: string; picked: boolean; enabled: boolean; onTap: () => void; drawn?: boolean }) {
  return (
    <button
      type="button"
      className="mj-hand-tile"
      data-picked={picked || undefined}
      disabled={!enabled}
      onClick={onTap}
      aria-label={`${tileName(tile)}${drawn ? ' (방금 가져온 패)' : ''}${picked ? ', 한 번 더 누르면 버려요' : ''}`}
    >
      <MjTile tile={tile} size="lg" />
    </button>
  );
}

/** 초보 도우미: 텐파이면 기다리는 패, 후리텐이면 경고 */
function Helper({ me }: { me: MjPrivate }) {
  if (me.waits.length === 0) return null;
  return (
    <p className="mj-helper" data-warn={me.furiten || undefined}>
      <span className="mj-helper-label">{me.furiten ? '후리텐 · 론 불가 (쯔모만 돼요)' : '텐파이 · 기다리는 패'}</span>
      <MjTiles tiles={me.waits} label={`기다리는 패 ${me.waits.map(tileName).join(', ')}`} />
    </p>
  );
}

// ---------- 국 끝 ----------

function MjResultPanel({ mj }: { mj: MjView }) {
  const { isHost, run, busy, v, nameOf, room } = useTable();
  return (
    <div className="dock mj-dock mj-result">
      {mj.results.map((r, i) => (
        <ResultBlock key={i} r={r} mj={mj} />
      ))}
      {isHost ? (
        <button className="btn btn-primary btn-xl btn-block" disabled={busy} onClick={() => run({ type: 'next', v })}>
          다음 국
        </button>
      ) : (
        <p className="dock-wait">{room.hostId ? `${nameOf(room.hostId)}님이 다음 국을 시작하길 기다리는 중` : '방장을 기다리는 중'}</p>
      )}
    </div>
  );
}

function ResultBlock({ r, mj }: { r: MjResult; mj: MjView }) {
  const name = (seat: number) => mj.seats[seat]?.name ?? '누군가';
  const deltas = (
    <ul className="mj-deltas">
      {r.deltas.map((d, seat) => (
        <li key={seat} data-sign={Math.sign(d)}>
          <span>{name(seat)}</span>
          <span className="num">{d === 0 ? '±0' : signed(d)}</span>
        </li>
      ))}
    </ul>
  );
  if (r.kind === 'draw') {
    const shown = r.shown.flatMap((h, seat) => (h ? [{ seat, h }] : []));
    return (
      <section className="mj-result-block">
        <h2 className="mj-result-title">{drawName(r.name)}</h2>
        {shown.length === 0 ? (
          <p className="muted">모두 노텐이에요.</p>
        ) : (
          shown.map(({ seat, h }) => (
            <div key={seat} className="mj-result-hand">
              <span className="small">{name(seat)} 텐파이</span>
              <MjTiles tiles={tilesOf(h)} />
            </div>
          ))
        )}
        {deltas}
      </section>
    );
  }
  const tiles = tilesOf(r.hand);
  const how = r.from === null ? '쯔모' : `론 · ${name(r.from)} 버림`;
  const score = r.yakuman > 0 ? `역만${r.yakuman > 1 ? ` ×${r.yakuman}` : ''}` : `${r.fu}부 ${r.han}판`;
  return (
    <section className="mj-result-block">
      <h2 className="mj-result-title">
        {name(r.seat)} {how}
      </h2>
      <div className="mj-result-hand">
        <MjTiles tiles={tiles} mark={tiles.length - 1} label={`이긴 손패 ${tiles.map(tileName).join(', ')}`} />
      </div>
      <ul className="mj-yaku">
        {r.yaku.map((y) => (
          <li key={y.name}>
            <span>{yakuName(y.name)}</span>
            <span className="num muted">{typeof y.han === 'number' ? `${y.han}판` : '역만'}</span>
          </li>
        ))}
      </ul>
      <p className="mj-score">
        <span className="muted">{score}</span> <strong className="num">{fmt(r.points)}점</strong>
      </p>
      {deltas}
    </section>
  );
}

function MjFinalPanel({ mj }: { mj: MjView }) {
  const { isHost, run, busy, v } = useTable();
  const final = mj.final;
  const order = final ? mj.seats.map((s, i) => ({ s, i, rank: final.rank[i] })).sort((a, b) => a.rank - b.rank) : [];
  return (
    <div className="dock mj-dock mj-result">
      <h2 className="mj-result-title">게임 끝</h2>
      <ol className="mj-final">
        {order.map(({ s, i, rank }) => (
          <li key={s.id} data-first={rank === 1 || undefined}>
            <span className="mj-final-rank num">{rank}위</span>
            <span>{s.name}</span>
            <span className="muted small">{WIND_NAMES[s.wind]}</span>
            <span className="num">{fmt(final!.points[i])}</span>
          </li>
        ))}
      </ol>
      {isHost && (
        <button className="btn btn-primary btn-xl btn-block" disabled={busy} onClick={() => run({ type: 'next', v })}>
          대기실로
        </button>
      )}
    </div>
  );
}

// ---------- 대기실 ----------

export function MjLobbyDock() {
  const { room, isHost, run, busy, v, nameOf, away } = useTable();
  const seated = room.members.length;
  const ready = seated === 4;
  if (!isHost) {
    const hostAway = !room.hostId || away(room.hostId);
    return (
      <div className="dock">
        <p className="dock-wait">{room.hostId ? `${nameOf(room.hostId)}님이 게임을 시작하길 기다리는 중` : '방장을 기다리는 중'}</p>
        {hostAway && (
          <button className="btn btn-quiet btn-lg btn-block" disabled={busy} onClick={() => run({ type: 'takeHost' })}>
            방장 넘겨받기
          </button>
        )}
      </div>
    );
  }
  return (
    <div className="dock">
      <button className="btn btn-primary btn-xl btn-block" disabled={!ready || busy} onClick={() => run({ type: 'start', v })}>
        {ready ? '게임 시작' : `${4 - seated}명 더 있어야 해요 (마작은 4명)`}
      </button>
    </div>
  );
}
