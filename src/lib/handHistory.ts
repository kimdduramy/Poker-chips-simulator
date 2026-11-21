import type { HandRecord } from '../../shared/protocol';
import { fmt } from './format';

/**
 * 핸드 기록을 체스 기보처럼 짧게: 카드는 Td(10♦)처럼 2글자, 행동은 한 글자.
 * 한 판이 대개 2~6줄이라 50판을 붙여넣어도 부담이 적어요.
 *
 * #3 D:Cy
 * P Cy c Ana c Ben x
 * F 2d 6c Th: Ana x Ben b20 Cy f Ana c
 * T 9h: Ana x Ben x
 * R Tc: Ana x Ben x
 * SD Ana KdAs 1P(10) | *Ben TsAh 3K(10) +70
 */
const STREETS = ['P', 'F', 'T', 'R'];
const CATEGORY = ['HC', '1P', '2P', '3K', 'ST', 'FL', 'FH', '4K', 'SF', 'RF'];

export const LEGEND = [
  '행동: x 체크, c 콜, b 벳, r 레이즈 (숫자는 총액), f 폴드, ! 올인, * 승자',
  '스트리트: P 프리플랍, F 플랍, T 턴, R 리버, SD 쇼다운. D 딜러 버튼',
  '카드: 숫자(T=10) + 무늬(s♠ h♥ d♦ c♣)',
  '족보: HC 하이카드, 1P 원페어, 2P 투페어, 3K 트리플, ST 스트레이트, FL 플러시, FH 풀하우스, 4K 포카드, SF 스티플, RF 로티플',
];

/** '투페어 (J, 10)' → '2P(J,10)', '플러시 (A 하이)' → 'FL(A)' */
function handCode(category: number, label: string) {
  const inside = label.match(/\(([^)]*)\)/)?.[1]?.replace(/ 하이/, '').replace(/\s+/g, '');
  return `${CATEGORY[category] ?? '?'}${inside ? `(${inside})` : ''}`;
}

function actionCode(a: HandRecord['actions'][number], betBefore: boolean) {
  const bang = a.allIn ? '!' : '';
  switch (a.kind) {
    case 'check':
      return 'x';
    case 'fold':
      return 'f';
    case 'call':
      return `c${bang}`;
    case 'raise':
      // 플랍부터는 그 스트리트 첫 베팅이 '벳', 그 뒤가 '레이즈'
      return `${a.street > 0 && !betBefore ? 'b' : 'r'}${a.to}${bang}`;
    default:
      return '?';
  }
}

function handLines(h: HandRecord, showBlinds: boolean): string[] {
  const out = [`#${h.handNo}${showBlinds ? ` ${fmt(h.sb)}/${fmt(h.bb)}` : ''} D:${h.button}`];
  const boardFor = [[], h.board.slice(0, 3), h.board.slice(3, 4), h.board.slice(4, 5)];
  const lastStreet = Math.max(-1, ...h.actions.map((a) => a.street));
  for (let st = 0; st < 4; st++) {
    const acts = h.actions.filter((a) => a.street === st);
    const cards = boardFor[st];
    // 행동도 카드도 없는 스트리트는 건너뛰어요 (올인 런아웃이면 카드만 적어요)
    if (!acts.length && !cards.length) continue;
    if (st > lastStreet && !cards.length) continue;
    let bet = false;
    const moves = acts.map((a) => {
      const code = actionCode(a, bet);
      if (a.kind === 'raise') bet = true;
      return `${a.name} ${code}`;
    });
    const head = cards.length ? `${STREETS[st]} ${cards.join(' ')}` : STREETS[st];
    out.push(moves.length ? `${head}${cards.length ? ':' : ''} ${moves.join(' ')}` : head);
  }
  const won = new Map(h.winners.map((w) => [w.name, w.amount]));
  if (h.shown.length) {
    const parts = h.shown.map((s) => {
      const amount = won.get(s.name);
      return `${amount ? '*' : ''}${s.name} ${s.cards.join('')} ${handCode(s.category, s.label)}${amount ? ` +${fmt(amount)}` : ''}`;
    });
    // 쇼다운에서 패를 안 깐 승자(사이드 팟 등)도 빠뜨리지 않게
    for (const w of h.winners) if (!h.shown.some((s) => s.name === w.name)) parts.push(`*${w.name} +${fmt(w.amount)}`);
    out.push(`SD ${parts.join(' | ')}`);
  } else {
    out.push(h.winners.map((w) => `*${w.name} +${fmt(w.amount)}`).join(' ') || '* 없음');
  }
  return out;
}

/** 붙여넣기 좋은 짧은 기보. 오래된 핸드부터, 블라인드는 바뀔 때만 적어요. */
export function formatHistory(code: string, cardMode: boolean, hands: HandRecord[]): string {
  const first = hands[0];
  const when = first
    ? new Date(first.startedAt).toLocaleString('ko-KR', { month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit', hour12: false })
    : '';
  const out = [`포커 기보 · 테이블 ${code} · ${cardMode ? '앱 카드' : '실물 카드'} · ${hands.length}판 · ${when}~`, ...LEGEND, ''];
  let blinds = '';
  for (const h of hands) {
    const b = `${h.sb}/${h.bb}`;
    out.push(...handLines(h, b !== blinds));
    blinds = b;
  }
  return out.join('\n');
}
