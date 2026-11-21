import { useSyncExternalStore } from 'react';

/**
 * 카드 뒷면 디자인: 사람마다 골라요. 내 패는 나만 보니까 이 기기에만 저장해요.
 * <html data-card-back="..."> 로 걸어 두면 CSS가 모든 뒷면 카드에 적용해요.
 */
export const CARD_BACKS = [
  { id: 'navy', name: '네이비' },
  { id: 'cream', name: '크림' },
  { id: 'spade', name: '스페이드' },
  { id: 'minimal', name: '미니멀' },
] as const;

export type CardBack = (typeof CARD_BACKS)[number]['id'];

const KEY = 'pp:cardBack';
const isBack = (v: unknown): v is CardBack => CARD_BACKS.some((b) => b.id === v);

function read(): CardBack {
  try {
    const v = localStorage.getItem(KEY);
    return isBack(v) ? v : 'navy';
  } catch {
    return 'navy';
  }
}

let current: CardBack = read();
const listeners = new Set<() => void>();

/** 앱을 켤 때 한 번: 저장된 뒷면을 화면에 걸어요 */
export function applyCardBack() {
  document.documentElement.dataset.cardBack = current;
}

export function setCardBack(id: CardBack) {
  current = id;
  try {
    localStorage.setItem(KEY, id);
  } catch {
    // 저장이 안 되는 브라우저면 이번에만 적용돼요
  }
  applyCardBack();
  listeners.forEach((l) => l());
}

export function useCardBack(): CardBack {
  return useSyncExternalStore(
    (l) => {
      listeners.add(l);
      return () => listeners.delete(l);
    },
    () => current,
  );
}
