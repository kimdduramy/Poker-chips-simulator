import type { HandRecord } from '../../shared/protocol';
import { fmt } from './format';

/**
 * 핸드 기록을 체스 기보처럼 짧게: 카드는 Td(10♦)처럼 2글자, 행동은 한 글자.
 * 한 판이 대개 2~6줄이라 50판을 붙여넣어도 부담이 적어요.
 *
 * 이름은 띄어쓰기나 기호가 있어도 기보가 깨지지 않게 P1, P2…로 바꾸고, 맨 위에 누가 누군지 적어요.
 *
 * #3 D:P3
 * H P1 KdAs P2 TsAh P3 7c2d
 * P P3 c P1 c P2 x
 * F 2d 6c Th: P1 x P2 b20 P3 f P1 c
 * T 9h: P1 x P2 x
 * R Tc: P1 x P2 x
 * SD P1 1P(10) | *P2 3K(10) +70
 */
const STREETS = ['P', 'F', 'T', 'R'];
const CATEGORY = ['HC', '1P', '2P', '3K', 'ST', 'FL', 'FH', '4K', 'SF', 'RF'];

export const LEGEND = [
  '행동: x 체크, c 콜, b 벳, r 레이즈 (숫자는 총액), f 폴드, ! 올인, * 승자',
  '줄: H 시작 패, P 프리플랍, F 플랍, T 턴, R 리버, SD 쇼다운. D 딜러 버튼',
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

/** 기록에 처음 나온 순서대로 P1, P2… */
function aliasesFor(hands: HandRecord[]): Map<string, string> {
  const map = new Map<string, string>();
  const see = (name: string) => {
    if (!map.has(name)) map.set(name, `P${map.size + 1}`);
  };
  for (const h of hands) {
    see(h.button);
    h.actions.forEach((a) => see(a.name));
    (h.holes ?? []).forEach((x) => see(x.name));
    h.shown.forEach((s) => see(s.name));
    h.winners.forEach((w) => see(w.name));
  }
  return map;
}

function handLines(h: HandRecord, showBlinds: boolean, alias: (name: string) => string): string[] {
  const out = [`#${h.handNo}${showBlinds ? ` ${fmt(h.sb)}/${fmt(h.bb)}` : ''} D:${alias(h.button)}`];
  // 시작 패: 모두의 패를 한 줄에 (끝난 판만 기록돼서 진행 중인 판은 안 보여요)
  if (h.holes?.length) out.push(`H ${h.holes.map((x) => `${alias(x.name)} ${x.cards.join('')}`).join(' ')}`);
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
      return `${alias(a.name)} ${code}`;
    });
    const head = cards.length ? `${STREETS[st]} ${cards.join(' ')}` : STREETS[st];
    out.push(moves.length ? `${head}${cards.length ? ':' : ''} ${moves.join(' ')}` : head);
  }
  const won = new Map(h.winners.map((w) => [w.name, w.amount]));
  if (h.shown.length) {
    const parts = h.shown.map((s) => {
      const amount = won.get(s.name);
      // 카드는 H 줄에 있으니 여기는 족보만 (예전 기록처럼 H 줄이 없으면 카드도 적어요)
      const cards = h.holes?.length ? '' : ` ${s.cards.join('')}`;
      return `${amount ? '*' : ''}${alias(s.name)}${cards} ${handCode(s.category, s.label)}${amount ? ` +${fmt(amount)}` : ''}`;
    });
    // 쇼다운에서 패를 안 깐 승자(사이드 팟 등)도 빠뜨리지 않게
    for (const w of h.winners) if (!h.shown.some((s) => s.name === w.name)) parts.push(`*${alias(w.name)} +${fmt(w.amount)}`);
    out.push(`SD ${parts.join(' | ')}`);
  } else {
    out.push(h.winners.map((w) => `*${alias(w.name)} +${fmt(w.amount)}`).join(' ') || '* 없음');
  }
  return out;
}

/** 붙여넣기 좋은 짧은 기보. 오래된 핸드부터, 블라인드는 바뀔 때만 적어요. */
export function formatHistory(code: string, cardMode: boolean, hands: HandRecord[]): string {
  const first = hands[0];
  const when = first
    ? new Date(first.startedAt).toLocaleString('ko-KR', { month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit', hour12: false })
    : '';
  const aliases = aliasesFor(hands);
  const alias = (name: string) => aliases.get(name) ?? name;
  const out = [`포커 기보 · 테이블 ${code} · ${cardMode ? '앱 카드' : '실물 카드'} · ${hands.length}판 · ${when}~`, ...LEGEND, ''];
  // 한 줄에 한 명씩: 이름에 쉼표나 기호가 있어도 헷갈리지 않게
  for (const [name, a] of aliases) out.push(`${a} = ${name}`);
  out.push('');
  let blinds = '';
  for (const h of hands) {
    const b = `${h.sb}/${h.bb}`;
    out.push(...handLines(h, b !== blinds, alias));
    blinds = b;
  }
  return out.join('\n');
}
