import { cardRankText, cardSuitSymbol, type Card } from '../../shared/cards';
import type { HandRecord } from '../../shared/protocol';
import { fmt } from './format';

const cardText = (c: Card) => `${cardRankText(c)}${cardSuitSymbol(c)}`;
const cards = (cs: Card[]) => cs.map(cardText).join(' ');
const time = (at: number) =>
  new Date(at).toLocaleString('ko-KR', { month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit', hour12: false });

/** 붙여넣기 좋게 핸드 기록을 글로 만들어요. 오래된 핸드부터. */
export function formatHistory(code: string, cardMode: boolean, hands: HandRecord[]): string {
  const out = [`포커 베팅 시뮬레이터 핸드 기록`, `테이블 ${code} (${cardMode ? '앱 카드' : '실물 카드'}), ${hands.length}판`, ''];
  for (const h of hands) {
    out.push(`=== 핸드 #${h.handNo} (${time(h.startedAt)}) ===`);
    if (h.cardMode) {
      out.push(`보드: ${h.board.length ? cards(h.board) : '(없음, 프리플랍에서 끝남)'}`);
      if (h.shown.length) for (const s of h.shown) out.push(`공개: ${s.name} ${cards(s.cards)} → ${s.label}`);
      else out.push('공개: 없음 (쇼다운 없이 끝남)');
    }
    out.push(`승리: ${h.winners.map((w) => `${w.name} +${fmt(w.amount)}`).join(', ') || '없음'}`);
    out.push('진행:');
    for (const l of h.lines) out.push(`  ${l}`);
    out.push('');
  }
  return out.join('\n');
}
