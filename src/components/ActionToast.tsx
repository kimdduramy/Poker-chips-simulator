import { useEffect, useRef, useState } from 'react';
import { findPlayer } from '../../shared/engine';
import { dealerTip } from '../lib/dealer';
import { actionSound, dealSound, type ActionSound } from '../lib/device-features';
import { fmt } from '../lib/format';
import { useTable } from '../lib/table';

const LABEL: Record<ActionSound, string> = {
  check: '체크',
  call: '콜',
  bet: '벳',
  raise: '레이즈',
  allin: '올인',
  fold: '폴드',
};

interface Shown {
  key: number;
  kind: ActionSound;
  who: string;
  amount: number | null;
}

/**
 * 누가 벳·체크·콜·레이즈·폴드·올인을 하면 화면 가운데에 잠깐 크게 띄우고 효과음을 내요.
 * 모든 폰에서 똑같이 떠요. 화면 읽기 프로그램은 GameAnnouncer가 따로 읽어줘서 여기선 숨겨요.
 */
export function ActionToast() {
  const { room, game, you, nameOf } = useTable();
  const seen = useRef<number | null>(null);
  const [shown, setShown] = useState<Shown | null>(null);

  const last = room.log.at(-1);

  useEffect(() => {
    if (!last) return;
    // 처음 열었을 때나 다시 연결됐을 때 지난 액션을 다시 띄우지 않아요
    if (seen.current === null) {
      seen.current = last.id;
      return;
    }
    if (last.id <= seen.current) return;
    seen.current = last.id;
    if (last.kind !== 'action') return;
    const la = game.lastAction;
    if (!la || la.kind === 'sb' || la.kind === 'bb') return;

    let kind: ActionSound;
    if (la.kind === 'raise') kind = la.allIn ? 'allin' : / 벳 /.test(` ${last.text} `) ? 'bet' : 'raise';
    else if (la.kind === 'call') kind = la.allIn ? 'allin' : 'call';
    else kind = la.kind;

    const p = findPlayer(game, la.id);
    const who = la.id === you.id ? '나' : (p?.name ?? nameOf(la.id));
    setShown({ key: last.id, kind, who, amount: kind === 'check' || kind === 'fold' ? null : la.amount });
    actionSound(kind);
  }, [last, game, you.id, nameOf]);

  // 딜러가 카드를 깔 순간(노란 딜러 줄)에 카드 '착' 소리: 플랍 3번, 턴·리버 1번, 새 핸드 2번
  const tip = dealerTip(game);
  const dealKey = tip?.now ? `${game.handNo}-${game.phase}-${game.street}-${tip.text}` : null;
  const lastDeal = useRef<string | null | undefined>(undefined);
  useEffect(() => {
    const first = lastDeal.current === undefined;
    if (dealKey === lastDeal.current) return;
    lastDeal.current = dealKey;
    if (first || !dealKey || (game.phase === 'showdown' && !game.runout)) return;
    const cards = game.phase === 'showdown' ? 2 : [2, 3, 1, 1][game.street];
    // 방금 낸 칩 소리와 겹치지 않게 조금 뒤에
    setTimeout(() => dealSound(cards), 450);
  }, [dealKey, game.phase, game.runout, game.street]);

  useEffect(() => {
    if (!shown) return;
    const timer = setTimeout(() => setShown(null), 1400);
    return () => clearTimeout(timer);
  }, [shown]);

  if (!shown) return null;
  return (
    <div className="action-toast-layer" aria-hidden="true">
      <div className="action-toast" data-kind={shown.kind} key={shown.key}>
        <svg className="action-toast-chips" viewBox="0 0 120 120">
          <circle cx="76" cy="44" r="36" className="atc-back" />
          <circle cx="76" cy="44" r="32" className="atc-edge" strokeDasharray="8.4 8.4" />
          <circle cx="50" cy="70" r="42" className="atc-front" />
          <circle cx="50" cy="70" r="38" className="atc-edge" strokeDasharray="9.9 9.9" />
        </svg>
        <span className="action-toast-word">{LABEL[shown.kind]}</span>
        <span className="action-toast-sub">
          {shown.who}
          {shown.amount !== null && <span className="num"> · {fmt(shown.amount)}</span>}
        </span>
      </div>
    </div>
  );
}
