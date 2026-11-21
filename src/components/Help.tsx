import { useEffect, useRef, useState } from 'react';
import { TermsPanel } from './Glossary';
import { RanksList } from './HandRanks';
import { Icon } from './Icon';
import { ScrollBox } from './ScrollBox';

const TABS = ['진행 방법', '용어', '족보'] as const;

const STEPS = [
  '한 명이 테이블 만들기를 누르고 코드, QR, 링크 중 하나로 친구들을 불러요. 만든 사람이 방장이에요.',
  '각자 자기 폰으로 들어와 이름만 넣으면 자리에 앉아요. 폰 없는 사람은 방장이 메뉴에서 자리를 추가해요.',
  '방장이 첫 핸드 시작을 누르면 딜러 버튼과 블라인드가 자동으로 정해져요.',
  '내 차례가 되면 화면 아래가 노랗게 바뀌고, 폴드 / 체크·콜 / 레이즈 중 하나를 눌러요.',
  "실물 카드로 만들었다면 카드는 직접 돌려요. 베팅이 끝나면 화면 위에 '플랍 오픈'처럼 지금 깔 카드를 알려주고, 쇼다운에서 방장이 이긴 사람을 고르면 팟이 지급돼요. 비기면 여러 명을 골라 나눠요.",
  '앱 카드로 만들었다면 앱이 각자 폰에 카드 2장을 나눠주고 보드도 깔아줘요. 쇼다운에서 족보로 승자를 정해 팟을 자동으로 줘요. 끝난 뒤 플레이어를 꾹 누르면 그 사람 족보 카드가 밝아져요.',
  '방장이 다음 핸드를 누르면 계속돼요. 실수는 방장이 되돌리기(꾹 누르기)로 고치고, 끝나면 메뉴 → 정산을 봐요.',
];

/** 메인 화면 위쪽의 작은 '도움말' 버튼. 누르면 페이지 이동 없이 창이 떠요. */
export function HelpButton() {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button type="button" className="help-btn" onClick={() => setOpen(true)} aria-haspopup="dialog">
        <Icon name="help" size={16} />
        도움말
      </button>
      <HelpDialog open={open} onClose={() => setOpen(false)} />
    </>
  );
}

function HelpDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
  const ref = useRef<HTMLDialogElement>(null);
  const [tab, setTab] = useState(0);

  useEffect(() => {
    const dialog = ref.current;
    if (!dialog) return;
    if (open && !dialog.open) dialog.showModal();
    if (!open && dialog.open) dialog.close();
  }, [open]);

  return (
    <dialog
      ref={ref}
      className="help-dialog"
      aria-labelledby="help-title"
      onCancel={(e) => {
        e.preventDefault();
        onClose();
      }}
      onClick={(e) => {
        if (e.target === ref.current) onClose();
      }}
    >
      {open && (
        <div className="help-body">
          <div className="help-head">
            <h2 id="help-title" className="help-title">
              도움말
            </h2>
            {/* C. 밑줄 탭 */}
            <div className="gl-tabs help-tabs" role="tablist" aria-label="도움말 종류">
              {TABS.map((t, i) => (
                <button key={t} role="tab" aria-selected={i === tab} className="gl-tab" onClick={() => setTab(i)}>
                  {t}
                </button>
              ))}
            </div>
            <button className="gl-close" aria-label="닫기" onClick={onClose}>
              <Icon name="close" size={16} />
            </button>
          </div>
          <ScrollBox className="help-scroll" viewportClassName="help-view" label={TABS[tab]}>
            <div role="tabpanel" aria-label={TABS[tab]}>
              {tab === 0 && (
                <ol className="help-steps">
                  {STEPS.map((s) => (
                    <li key={s}>{s}</li>
                  ))}
                </ol>
              )}
              {tab === 1 && <TermsPanel />}
              {tab === 2 && (
                <div className="help-ranks">
                  <RanksList />
                </div>
              )}
            </div>
          </ScrollBox>
        </div>
      )}
    </dialog>
  );
}
