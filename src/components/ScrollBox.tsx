import { useCallback, useLayoutEffect, useRef, useState, type ReactNode } from 'react';

interface Props {
  className?: string;
  viewportClassName?: string;
  label?: string;
  children: ReactNode;
}

const PAD = 4;
const MIN_THUMB = 28;

/**
 * 폰 브라우저는 스크롤 막대를 숨기기 때문에, 스크롤할 내용이 있을 때만
 * 오른쪽에 네모난 막대를 직접 그려요. 막대는 끌거나 트랙을 눌러서 움직일 수 있어요.
 */
export function ScrollBox({ className, viewportClassName, label, children }: Props) {
  const viewRef = useRef<HTMLDivElement>(null);
  const [bar, setBar] = useState<{ top: number; height: number } | null>(null);
  const drag = useRef<{ y: number; scroll: number } | null>(null);

  const measure = useCallback(() => {
    const el = viewRef.current;
    if (!el) return;
    const { scrollTop, scrollHeight, clientHeight } = el;
    if (scrollHeight <= clientHeight + 1) {
      setBar(null);
      return;
    }
    const track = clientHeight - PAD * 2;
    const height = Math.max(MIN_THUMB, (track * clientHeight) / scrollHeight);
    const top = PAD + ((track - height) * scrollTop) / (scrollHeight - clientHeight);
    setBar((prev) => (prev && Math.abs(prev.top - top) < 0.5 && Math.abs(prev.height - height) < 0.5 ? prev : { top, height }));
  }, []);

  useLayoutEffect(() => {
    const el = viewRef.current;
    if (!el) return;
    measure();
    el.addEventListener('scroll', measure, { passive: true });
    let observer: ResizeObserver | undefined;
    if (typeof ResizeObserver !== 'undefined') {
      observer = new ResizeObserver(measure);
      observer.observe(el);
      for (const child of el.children) observer.observe(child);
    }
    return () => {
      el.removeEventListener('scroll', measure);
      observer?.disconnect();
    };
  }, [measure]);

  // 내용이 바뀌면(행 추가 등) 다시 계산
  useLayoutEffect(measure);

  /** 막대 1px 이동이 내용 몇 px인지 */
  const ratio = () => {
    const el = viewRef.current;
    if (!el || !bar) return 0;
    const free = el.clientHeight - PAD * 2 - bar.height;
    return free > 0 ? (el.scrollHeight - el.clientHeight) / free : 0;
  };

  return (
    <div className={`scrollbox ${className ?? ''}`}>
      <div ref={viewRef} className={`scrollbox-viewport ${viewportClassName ?? ''}`} tabIndex={bar ? 0 : -1} aria-label={label}>
        {children}
      </div>
      {bar && (
        <div
          className="scrollbox-track"
          aria-hidden="true"
          onPointerDown={(e) => {
            // 트랙을 누르면 그 방향으로 한 화면씩 이동
            if (e.target !== e.currentTarget) return;
            const el = viewRef.current;
            if (!el) return;
            const y = e.clientY - e.currentTarget.getBoundingClientRect().top;
            el.scrollBy({ top: y < bar.top ? -el.clientHeight * 0.9 : el.clientHeight * 0.9, behavior: 'smooth' });
          }}
        >
          <div
            className="scrollbox-thumb"
            data-dragging={drag.current ? true : undefined}
            style={{ top: bar.top, height: bar.height }}
            onPointerDown={(e) => {
              e.preventDefault();
              e.currentTarget.setPointerCapture(e.pointerId);
              drag.current = { y: e.clientY, scroll: viewRef.current?.scrollTop ?? 0 };
            }}
            onPointerMove={(e) => {
              const d = drag.current;
              const el = viewRef.current;
              if (!d || !el) return;
              el.scrollTop = d.scroll + (e.clientY - d.y) * ratio();
            }}
            onPointerUp={() => (drag.current = null)}
            onPointerCancel={() => (drag.current = null)}
          />
        </div>
      )}
    </div>
  );
}
