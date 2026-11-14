import { useMemo } from 'react';
import { findPlayer, potTotal } from '../../shared/engine';
import { fmt, STREET_NAMES } from '../lib/format';
import { useTable } from '../lib/table';
import { outcomeLine } from './Stage';

/** Street prompts for the live region — worded apart from the visible deal buttons. */
const NEXT_STREET_ANNOUNCE = ['', '다음은 플랍', '다음은 턴', '다음은 리버'] as const;

/** Off-screen live region so screen readers hear turns, pot size and outcomes. */
export function GameAnnouncer() {
  const { game, you, nameOf, room } = useTable();

  const message = useMemo(() => {
    const pot = game.phase === 'done' ? game.results.reduce((s, r) => s + r.amount, 0) : potTotal(game);
    const actor = findPlayer(game, game.toActId);
    const parts: string[] = [];

    if (game.phase === 'lobby') {
      parts.push(`대기실. ${game.players.length}명 앉음. 아직 시작 전.`);
    } else if (game.phase === 'betting' && actor) {
      const street = STREET_NAMES[game.street];
      const fresh =
        game.street > 0 && game.players.every((p) => !p.acted) && game.currentBet === 0
          ? `${NEXT_STREET_ANNOUNCE[game.street]}. `
          : '';
      const who = actor.id === you.id ? '내 차례예요' : `${actor.name} 차례예요`;
      const toCall = game.currentBet - actor.bet;
      parts.push(
        `핸드 ${game.handNo}, ${street}. ${fresh}${who}${toCall > 0 ? `, 콜 ${fmt(toCall)}` : ''}. 팟 ${fmt(pot)}.`,
      );
    } else if (game.phase === 'showdown') {
      parts.push(
        `쇼다운. ${game.runout ? '올인, 런아웃 진행.' : '핸드 공개.'} 팟 ${fmt(pot)}. 승자를 모두 고르세요.`,
      );
    } else if (game.phase === 'done') {
      parts.push(`${outcomeLine(game, nameOf)}. ${fmt(pot)} 지급.`);
    }

    const last = room.log.at(-1);
    if (last && last.kind !== 'hand' && game.phase === 'betting') {
      parts.push(last.text);
    }

    return parts.join(' ');
  }, [game, you.id, nameOf, room.log]);

  return (
    <div className="sr-only" aria-live="polite" aria-atomic="true">
      {message}
    </div>
  );
}
