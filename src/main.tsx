import '@fontsource-variable/geist';
import '@fontsource-variable/geist-mono';
import '@fontsource/instrument-serif/400-italic.css';
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { App } from './App';
import './styles.css';
import { healStaleAssets } from './lib/staleAssets';
import { autoUpdate } from './lib/autoUpdate';
import { applyCardBack } from './lib/cardBack';

// 꾹 눌렀을 때 뜨는 길게 누르기 메뉴(복사·검색·이미지 저장 등)를 막아요. 입력칸은 그대로 둬요.
document.addEventListener('contextmenu', (e) => {
  const el = e.target as Element | null;
  if (el?.closest('input, textarea, [contenteditable]')) return;
  e.preventDefault();
});

healStaleAssets();
applyCardBack();
autoUpdate();

createRoot(document.getElementById('root') as HTMLElement).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
