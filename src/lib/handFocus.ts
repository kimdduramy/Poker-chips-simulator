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
