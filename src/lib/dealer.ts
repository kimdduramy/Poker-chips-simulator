import type { Game } from '../../shared/engine';

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
