import { useEffect, useRef, useState, type ReactNode } from 'react';
import { useTable } from '../lib/table';
import { Icon } from './Icon';

const HOLD_MS = 600;

/**
 * 꾹 눌러야(0.6초) 실행되는 버튼. 누르는 동안 바탕이 차오르고, 중간에 떼면 취소돼요.
 * 스크롤하다 스치거나 한 번 톡 건드린 걸로는 실행되지 않아요.
 */
function HoldButton({
  label,
  disabled,
  onFire,
  children,
}: {
  label: string;
  disabled: boolean;
  onFire: () => void;
  children: ReactNode;
}) {
  const [holding, setHolding] = useState(false);
  const timer = useRef<number | undefined>(undefined);

  const stop = () => {
    window.clearTimeout(timer.current);
    setHolding(false);
  };
  const start = () => {
    if (disabled) return;
    setHolding(true);
    timer.current = window.setTimeout(() => {
      setHolding(false);
      navigator.vibrate?.(15);
      onFire();
    }, HOLD_MS);
  };
  useEffect(() => stop, []);

  return (
    <button
      type="button"
      className="hist-btn"
      aria-label={`${label} (꾹 누르기)`}
      disabled={disabled}
      data-holding={holding || undefined}
      style={{ ['--hold-ms' as string]: `${HOLD_MS}ms` }}
      onPointerDown={(e) => {
        e.preventDefault();
        start();
      }}
      onPointerUp={stop}
      onPointerLeave={stop}
      onPointerCancel={stop}
      onContextMenu={(e) => e.preventDefault()}
      onKeyDown={(e) => {
        if ((e.key === ' ' || e.key === 'Enter') && !e.repeat) {
          e.preventDefault();
          start();
        }
      }}
      onKeyUp={(e) => (e.key === ' ' || e.key === 'Enter') && stop()}
      onBlur={stop}
    >
      <span className="hist-fill" aria-hidden="true" />
      {children}
    </button>
  );
}

/** 방장 전용: 되돌리기 / 다시 하기를 메뉴를 열지 않고 바로. */
export function HistoryBar() {
  const { isHost, room, game, run, busy, v } = useTable();
  if (!isHost || game.phase === 'lobby') return null;
  const undo = room.undoLabel;
  const redo = room.redoLabel;
  if (!undo && !redo) return null;

  return (
    <div className="hist-bar" role="group" aria-label="되돌리기 / 다시 하기">
      <HoldButton label="되돌리기" disabled={!undo || busy} onFire={() => void run({ type: 'undo', v })}>
        <Icon name="undo" size={15} />
        <span className="hist-text">
          <span className="hist-kind">되돌리기</span>
          <span className="hist-what">{undo ?? '없음'}</span>
        </span>
      </HoldButton>
      <span className="hist-hint" aria-hidden="true">
        꾹 누르기
      </span>
      <HoldButton label="다시 하기" disabled={!redo || busy} onFire={() => void run({ type: 'redo', v })}>
        <span className="hist-text hist-text-end">
          <span className="hist-kind">다시 하기</span>
          <span className="hist-what">{redo ?? '없음'}</span>
        </span>
        <span className="hist-redo-icon">
          <Icon name="undo" size={15} />
        </span>
      </HoldButton>
    </div>
  );
}
