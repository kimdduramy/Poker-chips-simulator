import { useSyncExternalStore } from 'react';

/**
 * 쇼다운 뒤 플레이어를 누르고 있는 동안 그 사람의 족보 5장을 보드에서 강조해요.
 * 좌석 목록, 보드, 내 카드가 서로 떨어져 있어서 작은 전역 저장소로 공유해요.
 */
let focused: string | null = null;
const listeners = new Set<() => void>();

export function setHandFocus(id: string | null) {
  if (focused === id) return;
  focused = id;
  listeners.forEach((l) => l());
}

export function useHandFocus(): string | null {
  return useSyncExternalStore(
    (l) => {
      listeners.add(l);
      return () => listeners.delete(l);
    },
    () => focused,
  );
}

/**
 * 내 패 들춰 보기: 열어 둔 상태를 핸드 번호와 같이 기억해요.
 * 아래 영역은 내 차례/대기 화면이 번갈아 그려져서, 컴포넌트 안에 두면 매번 닫혀 버려요.
 */
let peek: { handNo: number; open: boolean } = { handNo: -1, open: false };
const peekListeners = new Set<() => void>();

export function setPeek(handNo: number, open: boolean) {
  if (peek.handNo === handNo && peek.open === open) return;
  peek = { handNo, open };
  peekListeners.forEach((l) => l());
}

export function usePeek(handNo: number): boolean {
  const p = useSyncExternalStore(
    (l) => {
      peekListeners.add(l);
      return () => peekListeners.delete(l);
    },
    () => peek,
  );
  // 새 핸드가 되면 다시 뒷면으로
  return p.handNo === handNo && p.open;
}
