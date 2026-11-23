// 마작 기보: majiang-core가 남기는 패보(paipu)를 국마다 짧게 정리해요.
// 끝난 국만 담아요. 배패와 쯔모(남이 몰랐던 패)는 디버그 코드가 맞을 때만 넣어요.

import type { GameMessage } from '@kobalab/majiang-core';
import { drawName, yakuName } from './names';
import { roundName } from './tiles';

export interface MjRoundRecord {
  /** '동1국' */
  round: string;
  honba: number;
  dealer: string;
  /** 도라 표시패 (깡도라 포함) */
  dora: string[];
  /** 자리 순서대로 이름 */
  names: string[];
  /** 디버그: 자리마다 배패 */
  haipai?: string[];
  /** 디버그: 자리마다 가져온 패 */
  draws?: string[][];
  /** 자리마다 버린 패 (기호 포함: _ 쯔모기리, * 리치) */
  discards: string[][];
  results: (
    | { kind: 'win'; winner: string; from: string | null; hand: string; yaku: string[]; fu: number; han: number; yakuman: number; points: number; deltas: number[] }
    | { kind: 'draw'; name: string; tenpai: string[]; deltas: number[] }
  )[];
}

/** 패보 → 끝난 국들의 기록. names는 처음 앉은 자리(id) 순서예요. */
export function buildMjRecords(log: GameMessage[][], qijia: number, names: string[], debug: boolean): MjRoundRecord[] {
  const out: MjRoundRecord[] = [];
  for (const round of log) {
    const q = round[0]?.qipai;
    if (!q) continue;
    if (!round.some((m) => m.hule || m.pingju)) continue; // 아직 진행 중인 국은 안 담아요
    const seatOf = (l: number) => (qijia + q.jushu + l) % 4;
    const bySeat = <T>(arr: T[], empty: T) => {
      const res = new Array<T>(4).fill(empty);
      arr.forEach((v, l) => (res[seatOf(l)] = v));
      return res;
    };
    const rec: MjRoundRecord = {
      round: roundName(q.zhuangfeng, q.jushu),
      honba: q.changbang,
      dealer: names[seatOf(0)],
      dora: [q.baopai],
      names,
      discards: [[], [], [], []],
      results: [],
    };
    if (debug) {
      rec.haipai = bySeat(q.shoupai, '');
      rec.draws = [[], [], [], []];
    }
    for (const m of round) {
      if (m.zimo || m.gangzimo) {
        const z = (m.zimo ?? m.gangzimo)!;
        rec.draws?.[seatOf(z.l)].push(z.p);
      } else if (m.dapai) rec.discards[seatOf(m.dapai.l)].push(m.dapai.p);
      else if (m.kaigang) rec.dora.push(m.kaigang.baopai);
      else if (m.hule) {
        const h = m.hule;
        rec.results.push({
          kind: 'win',
          winner: names[seatOf(h.l)],
          from: h.baojia === null ? null : names[seatOf(h.baojia)],
          hand: h.shoupai,
          yaku: (h.hupai ?? []).map((y) => `${yakuName(y.name)}${typeof y.fanshu === 'number' ? y.fanshu : '★'}`),
          fu: h.fu ?? 0,
          han: h.fanshu ?? 0,
          yakuman: h.damanguan ?? 0,
          points: h.defen,
          deltas: bySeat(h.fenpei, 0),
        });
      } else if (m.pingju) {
        const p = m.pingju;
        rec.results.push({
          kind: 'draw',
          name: drawName(p.name),
          tenpai: p.shoupai.flatMap((s, l) => (s ? [names[seatOf(l)]] : [])),
          deltas: bySeat(p.fenpei, 0),
        });
      }
    }
    out.push(rec);
  }
  return out;
}

export const MJ_LEGEND = [
  '패: 종류 글자 + 숫자. m 만, p 통, s 삭(0은 빨간 5), z 자패(1동 2남 3서 4북 5백 6발 7중)',
  '버림패 뒤 _ 는 쯔모기리(가져온 패를 그대로 버림), * 는 리치 선언',
  '줄: D 버린 패, H 배패, Z 가져온 패(디버그에만), = 결과',
];

const signed = (n: number) => (n > 0 ? `+${n}` : String(n));

/** 기보 글: 국마다 몇 줄 */
export function formatMjHistory(code: string, rounds: MjRoundRecord[]): string {
  const names = rounds[0]?.names ?? [];
  const alias = (name: string | null) => (name === null ? '' : `P${names.indexOf(name) + 1}`);
  const out = [`마작 기보 · 테이블 ${code} · ${rounds.length}국`, ...MJ_LEGEND, names.map((n, i) => `P${i + 1} = ${n}`).join(', '), ''];
  for (const r of rounds) {
    out.push(`# ${r.round} ${r.honba}본장 친:${alias(r.dealer)} 도라표시:${r.dora.join(' ')}`);
    r.names.forEach((n, seat) => {
      if (r.haipai) out.push(`H ${alias(n)} ${r.haipai[seat]}`);
      if (r.draws) out.push(`Z ${alias(n)} ${r.draws[seat].join(' ')}`);
      out.push(`D ${alias(n)} ${r.discards[seat].join(' ')}`);
    });
    for (const x of r.results) {
      const deltas = x.deltas.map((d, seat) => `${alias(r.names[seat])} ${signed(d)}`).join(' ');
      if (x.kind === 'win') {
        const how = x.from === null ? '쯔모' : `론←${alias(x.from)}`;
        const score = x.yakuman > 0 ? `역만×${x.yakuman}` : `${x.fu}부${x.han}판`;
        out.push(`= ${alias(x.winner)} ${how} ${x.hand} · ${x.yaku.join(' ')} · ${score} ${x.points} · ${deltas}`);
      } else {
        out.push(`= ${x.name} · 텐파이 ${x.tenpai.map(alias).join(' ') || '없음'} · ${deltas}`);
      }
    }
    out.push('');
  }
  return out.join('\n').trimEnd();
}
