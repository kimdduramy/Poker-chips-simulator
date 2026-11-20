/**
 * 새 버전이 배포된 뒤 폰이 예전 화면(HTML)을 다시 쓰면, 그 화면이 찾는 예전 CSS·JS 파일은
 * 이미 없어져서 스타일이 하나도 안 입혀진 화면이 나와요. 그럴 때 한 번만 새로고침해서
 * 새 버전을 받아요. (30초 안에 또 실패하면 무한 새로고침을 막으려고 멈춰요)
 */
const KEY = 'stale-asset-reload-at';

function reloadOnce() {
  try {
    const last = Number(sessionStorage.getItem(KEY) ?? 0);
    if (Date.now() - last < 30_000) return;
    sessionStorage.setItem(KEY, String(Date.now()));
  } catch {
    // 저장소를 못 쓰는 환경이면 루프 위험이 있어서 새로고침하지 않아요
    return;
  }
  location.reload();
}

/** styles.css의 :root 변수가 없으면 CSS가 안 불러와진 거예요 */
function cssMissing() {
  return getComputedStyle(document.documentElement).getPropertyValue('--font-sans').trim() === '';
}

export function healStaleAssets() {
  if (!import.meta.env.PROD) return;
  const check = () => {
    if (cssMissing()) reloadOnce();
  };
  if (document.readyState === 'complete') check();
  else window.addEventListener('load', check, { once: true });
  // 뒤로가기 캐시나 탭 복원으로 다시 보일 때도 확인
  window.addEventListener('pageshow', (e) => e.persisted && check());
  // 나중에 불러오는 JS 조각이 없어졌을 때 (Vite가 보내는 이벤트)
  window.addEventListener('vite:preloadError', (e) => {
    e.preventDefault();
    reloadOnce();
  });
}
