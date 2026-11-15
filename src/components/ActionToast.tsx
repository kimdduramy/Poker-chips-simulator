import { useEffect, useRef, useState } from 'react';
import { findPlayer } from '../../shared/engine';
import { dealerTip } from '../lib/dealer';
import { actionSound, dealSound, winSound, type ActionSound } from '../lib/device-features';
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
 * 누가 벳·체크·콜·레이즈·폴드·올인을 하면 화면 가운데를 가로지르는 띠로 잠깐 크게 띄우고 효과음을 내요.
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
    // 한 번에 여러 줄이 올 수 있어요: 마지막 콜 뒤에 '턴' 줄, 마지막 폴드 뒤에 '획득' 줄 등
    const fresh = room.log.filter((e) => e.id > (seen.current ?? 0));
    seen.current = last.id;
    const action = fresh.findLast((e) => e.kind === 'action');
    const won = fresh.some((e) => e.kind === 'win');

    const la = game.lastAction;
    if (action && la && la.kind !== 'sb' && la.kind !== 'bb') {
      let kind: ActionSound;
      if (la.kind === 'raise') kind = la.allIn ? 'allin' : / 벳 /.test(` ${action.text} `) ? 'bet' : 'raise';
      else if (la.kind === 'call') kind = la.allIn ? 'allin' : 'call';
      else kind = la.kind;

      const p = findPlayer(game, la.id);
      const who = la.id === you.id ? '나' : (p?.name ?? nameOf(la.id));
      setShown({ key: action.id, kind, who, amount: kind === 'check' || kind === 'fold' ? null : la.amount });
      actionSound(kind);
    }
    // 팟이 지급되면 동전 소리 (액션 소리와 겹치지 않게 조금 뒤에)
    if (won) setTimeout(() => winSound(), action ? 380 : 0);
  }, [last, room.log, game, you.id, nameOf]);

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
        <span className="action-toast-word">{LABEL[shown.kind]}</span>
        <span className="action-toast-sub">
          <span className="action-toast-who">{shown.who}</span>
          {shown.amount !== null && (
            <>
              <span className="action-toast-dot" />
              <span className="num">{fmt(shown.amount)}</span>
            </>
          )}
        </span>
      </div>
    </div>
  );
}
