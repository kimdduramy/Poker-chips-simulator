import { useEffect, useState } from 'react';
import type { Game } from '../../shared/engine';
import { useTable } from './table';

/**
 * 딜러 지시사항: 지금 딜러가 할 일. 카드를 깔 순간(now)에는 강조돼요.
 * 버튼을 가진 사람이 딜러예요.
 */
export function dealerTip(game: Game): { text: string; now: boolean } | null {
  const untouched = game.players.every((p) => !p.acted);
  if (game.phase === 'betting') {
    if (game.street === 0 && untouched) return { text: '2장씩 나눠줘요 · SB부터 한 장씩', now: true };
    if (game.street > 0 && untouched && game.currentBet === 0) {
      const what = ['', '플랍 3장', '턴 1장', '리버 1장'][game.street];
      return { text: `1장 버리고 ${what} 펼치기`, now: true };
    }
    const next = ['플랍 3장', '턴 1장', '리버 1장', '쇼다운'][game.street];
    return { text: `베팅이 끝나면 ${next}`, now: false };
  }
  if (game.phase === 'showdown') {
    if (game.runout) {
      const left = ['플랍 · 턴 · 리버', '턴 · 리버', '리버', ''][game.street];
      return left
        ? { text: `남은 ${left} 펼치기 · 장마다 1장 버리고`, now: true }
        : { text: '모두 카드 공개', now: true };
    }
    return { text: '마지막에 베팅한 사람부터 카드 공개', now: true };
  }
  if (game.phase === 'done') return { text: '카드 모아 섞기 · 다음 딜러는 왼쪽 사람', now: false };
  return null;
}

/**
 * 딜러가 카드를 까는 중이라 베팅이 잠겨 있으면 남은 시간(ms), 아니면 0.
 * 잠긴 동안엔 0.2초마다 다시 그려서 숫자가 줄고, 끝나는 순간 버튼이 풀려요.
 */
export function useDealLeft(): number {
  const { room, conn, game } = useTable();
  const until = game.phase === 'betting' ? room.dealUntil : null;
  const [, tick] = useState(0);
  const left = until ? until - (Date.now() + conn.clockOffset) : 0;
  const locked = left > 0;
  useEffect(() => {
    if (!locked) return;
    const id = window.setInterval(() => tick((n) => n + 1), 200);
    return () => clearInterval(id);
  }, [until, locked]);
  return Math.max(0, left);
}

/** 잠긴 동안 보여줄 말: 딜러가 지금 무엇을 까는지 */
export function dealingText(game: Game): string {
  return ['딜러가 카드 나눠주는 중', '딜러가 플랍 까는 중', '딜러가 턴 까는 중', '딜러가 리버 까는 중'][game.street];
}
