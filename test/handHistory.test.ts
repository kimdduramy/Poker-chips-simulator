import { describe, expect, it } from 'vitest';
import type { HandRecord } from '../shared/protocol';
import { formatHistory } from '../src/lib/handHistory';

const base = { startedAt: Date.UTC(2026, 10, 21, 3, 0), cardMode: true, sb: 5, bb: 10 };
const act = (street: number, name: string, kind: string, to = 0, allIn = false) => ({ street, name, kind, to, allIn });

describe('compact hand history', () => {
  const hands: HandRecord[] = [
    {
      ...base,
      handNo: 1,
      button: 'Ana',
      actions: [
        act(0, 'Ana', 'call', 10), act(0, 'Ben', 'call', 10), act(0, 'Cy', 'check'),
        act(1, 'Ben', 'raise', 20), act(1, 'Cy', 'raise', 60), act(1, 'Ana', 'fold'), act(1, 'Ben', 'call', 60),
        act(2, 'Ben', 'check'), act(2, 'Cy', 'check'),
        act(3, 'Ben', 'check'), act(3, 'Cy', 'check'),
      ],
      board: ['Td', 'Jh', 'Ts', '5d', 'Jd'],
      shown: [
        { name: 'Ben', cards: ['Kd', '8d'], category: 5, label: '플러시 (K 하이)' },
        { name: 'Cy', cards: ['7h', 'Qs'], category: 2, label: '투페어 (J, 10)' },
      ],
      winners: [{ name: 'Ben', amount: 150 }],
    },
    {
      ...base,
      handNo: 2,
      button: 'Ben',
      actions: [act(0, 'Ben', 'fold'), act(0, 'Cy', 'fold')],
      board: [],
      shown: [],
      winners: [{ name: 'Ana', amount: 15 }],
    },
    {
      ...base,
      handNo: 3,
      sb: 10,
      bb: 20,
      button: 'Cy',
      actions: [act(0, 'Cy', 'raise', 1000, true), act(0, 'Ana', 'call', 990, true)],
      board: ['2d', '6c', 'Th', '9h', 'Tc'],
      shown: [
        { name: 'Ana', cards: ['Kd', 'As'], category: 1, label: '원페어 (10)' },
        { name: 'Cy', cards: ['Ts', 'Ah'], category: 3, label: '트리플 (10)' },
      ],
      winners: [{ name: 'Cy', amount: 2000 }],
    },
  ];

  it('writes each hand in a few short lines', () => {
    const text = formatHistory('ABCD', true, hands);
    const [, players, body] = text.split('\n\n');
    expect(players).toBe('P1 = Ana\nP2 = Ben\nP3 = Cy');
    expect(body).toBe(
      [
        '#1 5/10 D:P1',
        'P P1 c P2 c P3 x',
        'F Td Jh Ts: P2 b20 P3 r60 P1 f P2 c',
        'T 5d: P2 x P3 x',
        'R Jd: P2 x P3 x',
        'SD *P2 Kd8d FL(K) +150 | P3 7hQs 2P(J,10)',
        '#2 D:P2',
        'P P2 f P3 f',
        '*P1 +15',
        '#3 10/20 D:P3',
        'P P3 r1000! P1 c!',
        'F 2d 6c Th',
        'T 9h',
        'R Tc',
        'SD P1 KdAs 1P(10) | *P3 TsAh 3K(10) +2,000',
      ].join('\n'),
    );
    expect(text.split('\n')[0]).toContain('테이블 ABCD');
  });

  it('works for physical-card tables without boards', () => {
    const text = formatHistory('WXYZ', false, [
      { ...base, cardMode: false, handNo: 1, button: 'Ana', actions: [act(0, 'Ana', 'raise', 30), act(0, 'Ben', 'fold')], board: [], shown: [], winners: [{ name: 'Ana', amount: 25 }] },
    ]);
    expect(text).toContain('실물 카드');
    expect(text.split('\n\n').slice(1).join('\n\n')).toBe('P1 = Ana\nP2 = Ben\n\n#1 5/10 D:P1\nP P1 r30 P2 f\n*P1 +25');
  });
});

describe('names that would break the notation', () => {
  it('become P1, P2 with a key at the top', () => {
    const weird = 'AX 컨설팅 및 교육 문의:';
    const text = formatHistory('QMQQ', true, [
      {
        ...base,
        handNo: 12,
        button: weird,
        actions: [act(0, weird, 'call', 50), act(0, 'soyeonrie', 'check'), act(1, 'soyeonrie', 'raise', 50), act(1, weird, 'call', 50)],
        board: ['As', '6c', '2h'],
        shown: [],
        winners: [{ name: weird, amount: 200 }],
      },
    ]);
    expect(text).toContain(`P1 = ${weird}\nP2 = soyeonrie`);
    expect(text).toContain('P P1 c P2 x\nF As 6c 2h: P2 b50 P1 c');
    // 기보 본문에는 원래 이름이 안 나와요
    expect(text.split('\n\n').at(-1)).not.toContain('컨설팅');
  });
});
