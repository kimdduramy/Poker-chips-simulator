import { useEffect, useRef, useState } from 'react';
import { Icon } from './Icon';

export interface Term {
  term: string;
  /** 게임 중 작은 창 목록에 쓰는 짧은 이름 (없으면 term) */
  short?: string;
  en: string;
  desc: string;
}

/** 앱 화면에 나오는 홀덤 용어. 국내 홀덤에서 쓰는 명칭 기준. */
export type TermGroup = { title: string; terms: Term[] };

export const HOLDEM_TERMS: TermGroup[] = [
  {
    title: '진행',
    terms: [
      { term: '핸드', en: 'Hand', desc: '카드를 받고 팟을 지급할 때까지의 한 판. 화면 위 "핸드 #3"은 세 번째 판이에요.' },
      { term: '버튼 (D)', short: '버튼', en: 'Dealer Button', desc: '딜러 위치 표시. 매 핸드 시계 방향으로 한 칸씩 옮겨지고, 블라인드와 액션 순서의 기준이 돼요.' },
      { term: '스몰 블라인드 (SB)', short: 'SB', en: 'Small Blind', desc: '버튼 바로 왼쪽 사람이 카드를 받기 전에 의무로 내는 베팅. 보통 빅 블라인드의 절반이에요.' },
      { term: '빅 블라인드 (BB)', short: 'BB', en: 'Big Blind', desc: 'SB 왼쪽 사람이 의무로 내는 베팅. 최소 베팅 단위가 돼요.' },
      { term: '프리플랍', en: 'Preflop', desc: '각자 개인 카드 2장만 받은 상태의 첫 베팅 라운드.' },
      { term: '플랍', en: 'Flop', desc: '가운데 공유 카드 3장을 펼친 뒤의 베팅 라운드.' },
      { term: '턴', en: 'Turn', desc: '공유 카드 4번째 장을 펼친 뒤의 베팅 라운드.' },
      { term: '리버', en: 'River', desc: '마지막 5번째 공유 카드를 펼친 뒤의 마지막 베팅 라운드.' },
      { term: '쇼다운', en: 'Showdown', desc: '마지막 베팅이 끝나고 남은 사람이 핸드를 공개해 승자를 가리는 단계. 실물 카드에서는 방장이 이긴 사람을 골라 팟을 지급하고, 앱 카드에서는 족보로 자동 지급돼요.' },
      { term: '액션', en: 'Action', desc: '자기 차례에 하는 행동(체크·벳·콜·레이즈·폴드). "Ana 액션"은 Ana 차례라는 뜻이에요.' },
    ],
  },
  {
    title: '액션',
    terms: [
      { term: '체크', en: 'Check', desc: '앞에 베팅이 없을 때 칩을 내지 않고 차례를 넘기는 것.' },
      { term: '벳', en: 'Bet', desc: '그 라운드에서 처음으로 칩을 거는 것.' },
      { term: '콜', en: 'Call', desc: '앞사람이 건 금액만큼 맞춰 내는 것.' },
      { term: '레이즈', en: 'Raise', desc: '앞사람 베팅보다 더 올려서 거는 것. 앱의 레이즈 금액은 이번 라운드에 낼 총액 기준이에요.' },
      { term: '폴드', en: 'Fold', desc: '이번 핸드를 포기하고 빠지는 것. 이미 낸 칩은 돌려받지 못해요.' },
      { term: '올인', en: 'All-in', desc: '남은 스택을 전부 거는 것.' },
    ],
  },
  {
    title: '칩과 팟',
    terms: [
      { term: '스택', en: 'Stack', desc: '지금 내가 가진 칩.' },
      { term: '팟', en: 'Pot', desc: '이번 핸드에 모두가 낸 칩이 모인 곳. 이긴 사람이 가져가요.' },
      { term: '메인 팟 / 사이드 팟', short: '사이드 팟', en: 'Main / Side Pot', desc: '누가 올인하면 그 사람이 걸 수 있는 만큼이 메인 팟, 그 위로 나머지 사람끼리 더 건 칩이 사이드 팟이에요. 올인한 사람은 메인 팟만 이길 수 있어요.' },
      { term: '콜 금액', en: 'To Call', desc: '베팅 현황 표의 숫자. 지금 콜하려면 더 내야 하는 칩이에요.' },
      { term: '총 베팅', en: 'Total Bet', desc: '베팅 현황 표의 숫자. 이번 핸드에 그 사람이 지금까지 팟에 넣은 칩 전부예요 (블라인드 포함).' },
      { term: '바이인', en: 'Buy-in', desc: '게임에 참여하면서 받은 칩. 정산 표에서는 리바이까지 합친 총액이에요.' },
      { term: '리바이', en: 'Rebuy', desc: '칩을 다 잃었을 때 시작 스택만큼 다시 받는 것.' },
    ],
  },
  {
    title: '상황',
    terms: [
      { term: '스플릿', en: 'Split / Chop', desc: '같은 패로 비긴 사람끼리 팟을 똑같이 나누는 것.' },
      { term: '오드 칩', en: 'Odd Chip', desc: '스플릿하고 남는 칩. 버튼 왼쪽에 가까운 사람부터 1개씩 받아요.' },
      { term: '런아웃', en: 'Run-out', desc: '모두 올인해서 더 베팅할 게 없을 때 남은 공유 카드를 한 번에 다 펼치는 것.' },
      { term: '워크', en: 'Walk', desc: '프리플랍에서 모두 폴드해서 빅 블라인드가 그냥 팟을 가져가는 것.' },
      { term: '버스트', en: 'Bust', desc: '스택을 다 잃은 상태. 리바이하면 다시 참여할 수 있어요.' },
      { term: '싯아웃 / 싯인', short: '싯아웃', en: 'Sit out / in', desc: '자리는 그대로 두고 핸드 참여만 쉬는 것 / 다시 참여하는 것.' },
    ],
  },
  {
    title: '기록',
    terms: [
      {
        term: '기보 읽는 법',
        short: '기보',
        en: 'Hand History',
        desc: '메뉴 → 기록 → 핸드 기록 복사로 받는 짧은 기록이에요. 맨 위에 "P1 = Ana"처럼 누가 누군지 적고, 본문에서는 P1, P2로 불러요. 한 판은 "#3 5/10 D:P1"처럼 번호, 블라인드, 딜러 버튼으로 시작하고, "H P1 KdAs P2 9h2d"처럼 모두의 시작 패가 나온 뒤 스트리트마다 한 줄씩 행동이 이어져요. 예를 들어 "F Td Jh Ts: P2 b20 P3 r60 P1 f P2 c"는 플랍에 10♦ J♥ 10♠가 깔렸고, P2가 20을 벳, P3가 60으로 레이즈, P1은 폴드, P2가 콜했다는 뜻이에요.',
      },
      { term: '줄 기호', short: 'H P F T R SD', en: 'Streets', desc: 'H 시작 패, P 프리플랍, F 플랍, T 턴, R 리버, SD 쇼다운. "D:P1"은 그 판의 딜러 버튼이에요. 블라인드는 바뀐 판에만 적어요. 숫자가 붙은 P1, P2는 사람이에요.' },
      { term: '행동 기호', short: 'x c b r f !', en: 'Actions', desc: 'x 체크, c 콜, b 벳, r 레이즈, f 폴드. 벳과 레이즈 뒤 숫자는 이번 라운드에 건 총액이고, 끝에 붙은 !는 올인이에요. 예: r1000!는 1,000까지 올인 레이즈.' },
      { term: '카드 표기', short: 'Td As', en: 'Cards', desc: '숫자 한 글자 + 무늬 한 글자예요. T는 10이고, 무늬는 s ♠, h ♥, d ♦, c ♣. 예: Td는 10♦, As는 A♠, Kd8d는 K♦ 8♦ 두 장.' },
      { term: '족보 약어', short: '2P FL', en: 'Hand Codes', desc: 'HC 하이카드, 1P 원페어, 2P 투페어, 3K 트리플, ST 스트레이트, FL 플러시, FH 풀하우스, 4K 포카드, SF 스티플, RF 로티플. 괄호 안은 족보를 만든 숫자예요. 예: 2P(J,10)은 J와 10 투페어, FL(K)는 K가 가장 높은 플러시.' },
      { term: '승자 표시', short: '* +30', en: 'Winner', desc: '앞에 *가 붙은 사람이 팟을 가져갔고, 뒤의 +숫자가 받은 칩이에요. 쇼다운 줄에서는 | 로 사람을 나눠요. 예: "SD *P2 FL(K) +30 | P3 2P(J,10)". 카드는 H 줄에서 보면 돼요.' },
    ],
  },
];

/** 게임 중 작은 창의 제목 줄 탭: 용어 설명 [진행|액션|칩과 팟|상황] */
function GroupTabs({ groups, group, onPick }: { groups: TermGroup[]; group: number; onPick: (i: number) => void }) {
  return (
    <div className="gl-tabs" role="tablist" aria-label="용어 묶음">
      {groups.map((g, i) => (
        <button key={g.title} role="tab" aria-selected={i === group} className="gl-tab" onClick={() => onPick(i)}>
          {g.title}
        </button>
      ))}
    </div>
  );
}

/** 게임 중용: 화면을 덜 가리도록 [용어 칩] → [고른 용어 설명 한 개]만 보여 줘요. */
function CompactGlossary({ groups, group, pick, onPick }: { groups: TermGroup[]; group: number; pick: number; onPick: (i: number) => void }) {
  const terms = groups[Math.min(group, groups.length - 1)].terms;
  const t = terms[Math.min(pick, terms.length - 1)];
  return (
    <div className="gl-compact">
      {/* 줄 맨 앞의 구분점(·)은 바깥 틀에서 잘려 안 보여요 */}
      <div className="gl-chips-clip">
        <div className="gl-chips">
          {terms.map((x, i) => (
            <span key={x.term} className="gl-chip-wrap">
              <button className="gl-chip" aria-pressed={i === pick} aria-label={x.term} onClick={() => onPick(i)}>
                {x.short ?? x.term}
              </button>
            </span>
          ))}
        </div>
      </div>
      <div className="gl-desc" aria-live="polite">
        <span className="gl-desc-name">
          {t.term} <span className="glossary-en">{t.en}</span>
        </span>
        <span className="gl-desc-text">{t.desc}</span>
      </div>
    </div>
  );
}

/** 도움말 창의 '용어' 탭: [진행|액션|칩과 팟|상황] 밑줄 탭 + 용어 글자 목록 + 설명 */
export function TermsPanel({ groups = HOLDEM_TERMS }: { groups?: TermGroup[] }) {
  const [group, setGroup] = useState(0);
  const [pick, setPick] = useState(0);
  return (
    <div className="help-terms">
      <GroupTabs
        groups={groups}
        group={group}
        onPick={(i) => {
          setGroup(i);
          setPick(0);
        }}
      />
      <CompactGlossary groups={groups} group={group} pick={pick} onPick={setPick} />
    </div>
  );
}

/** 게임 중: 상단바의 작은 버튼으로 여는 작은 창. 바깥을 누르거나 Esc로 닫혀요. */
export function GlossaryButton({ groups = HOLDEM_TERMS }: { groups?: TermGroup[] }) {
  const [open, setOpen] = useState(false);
  const [group, setGroup] = useState(0);
  const [pick, setPick] = useState(0);
  const rootRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && setOpen(false);
    const onDown = (e: PointerEvent) => {
      if (!rootRef.current?.contains(e.target as Node)) setOpen(false);
    };
    window.addEventListener('keydown', onKey);
    window.addEventListener('pointerdown', onDown);
    return () => {
      window.removeEventListener('keydown', onKey);
      window.removeEventListener('pointerdown', onDown);
    };
  }, [open]);

  return (
    <div className="glossary-pop-root" ref={rootRef}>
      <button
        className="icon-btn"
        aria-label="용어 설명"
        aria-expanded={open}
        aria-controls="glossary-pop"
        onClick={() => setOpen((o) => !o)}
      >
        <Icon name="help" />
      </button>
      {open && (
        <div id="glossary-pop" className="glossary glossary-pop" role="dialog" aria-label="용어 설명">
          <div className="glossary-pop-head">
            <span className="glossary-title">용어 설명</span>
            <GroupTabs
              groups={groups}
              group={group}
              onPick={(i) => {
                setGroup(i);
                setPick(0);
              }}
            />
            <button className="gl-close" aria-label="닫기" onClick={() => setOpen(false)}>
              <Icon name="close" size={14} />
            </button>
          </div>
          <CompactGlossary groups={groups} group={group} pick={pick} onPick={setPick} />
        </div>
      )}
    </div>
  );
}
