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
    const body = text.split('\n\n')[1];
    expect(body).toBe(
      [
        '#1 5/10 D:Ana',
        'P Ana c Ben c Cy x',
        'F Td Jh Ts: Ben b20 Cy r60 Ana f Ben c',
        'T 5d: Ben x Cy x',
        'R Jd: Ben x Cy x',
        'SD *Ben Kd8d FL(K) +150 | Cy 7hQs 2P(J,10)',
        '#2 D:Ben',
        'P Ben f Cy f',
        '*Ana +15',
        '#3 10/20 D:Cy',
        'P Cy r1000! Ana c!',
        'F 2d 6c Th',
        'T 9h',
        'R Tc',
        'SD Ana KdAs 1P(10) | *Cy TsAh 3K(10) +2,000',
      ].join('\n'),
    );
    expect(text.split('\n')[0]).toContain('테이블 ABCD');
  });

  it('works for physical-card tables without boards', () => {
    const text = formatHistory('WXYZ', false, [
      { ...base, cardMode: false, handNo: 1, button: 'Ana', actions: [act(0, 'Ana', 'raise', 30), act(0, 'Ben', 'fold')], board: [], shown: [], winners: [{ name: 'Ana', amount: 25 }] },
    ]);
    expect(text).toContain('실물 카드');
    expect(text.split('\n\n')[1]).toBe('#1 5/10 D:Ana\nP Ana r30 Ben f\n*Ana +25');
  });
});
