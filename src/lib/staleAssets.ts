/**
 * 스타일이 하나도 안 입혀진 화면이 뜨는 경우를 스스로 고쳐요.
 * - 예전 화면(HTML)을 다시 써서, 배포로 없어진 예전 CSS를 찾는 경우
 * - 배포 순간에 CSS 대신 HTML을 받아서, 그게 1년짜리 캐시로 폰에 박혀버린 경우
 *   (이건 새로고침해도 계속 깨져요)
 * CSS를 캐시 무시하고 다시 받아 캐시를 덮어쓴 뒤 한 번만 새로고침해요.
 * 30초 안에 또 실패하면 무한 새로고침을 막으려고 멈춰요.
 */
const KEY = 'stale-asset-reload-at';

async function reloadOnce() {
  try {
    const last = Number(sessionStorage.getItem(KEY) ?? 0);
    if (Date.now() - last < 30_000) return;
    sessionStorage.setItem(KEY, String(Date.now()));
  } catch {
    // 저장소를 못 쓰는 환경이면 루프 위험이 있어서 새로고침하지 않아요
    return;
  }
  // 캐시에 박힌 잘못된 파일을 서버의 진짜 파일로 덮어써요
  const files = [...document.querySelectorAll<HTMLLinkElement>('link[rel="stylesheet"], link[rel="modulepreload"]')]
    .map((l) => l.href)
    .concat([...document.querySelectorAll<HTMLScriptElement>('script[src]')].map((s) => s.src));
  await Promise.allSettled(files.map((f) => fetch(f, { cache: 'reload' })));
  location.reload();
}

/** styles.css의 :root 변수가 없으면 CSS가 안 불러와진 거예요 */
function cssMissing() {
  return getComputedStyle(document.documentElement).getPropertyValue('--font-sans').trim() === '';
}

export function healStaleAssets() {
  if (!import.meta.env.PROD) return;
  const check = () => {
    if (cssMissing()) void reloadOnce();
  };
  if (document.readyState === 'complete') check();
  else window.addEventListener('load', check, { once: true });
  // 뒤로가기 캐시나 탭 복원으로 다시 보일 때도 확인
  window.addEventListener('pageshow', (e) => e.persisted && check());
  // 나중에 불러오는 JS 조각이 없어졌을 때 (Vite가 보내는 이벤트)
  window.addEventListener('vite:preloadError', (e) => {
    e.preventDefault();
    void reloadOnce();
  });
}
