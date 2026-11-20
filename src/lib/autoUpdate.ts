/**
 * 앱을 켜둔 채로 새 버전이 배포되면, 새로고침하기 전까지 예전 버전이 계속 돌아가요.
 * 1분마다(그리고 화면으로 돌아올 때) /version.json을 확인해서 새 버전이 나왔으면
 * 안전한 순간에 조용히 새로고침해요. 게임 상태는 서버에 있어서 새로고침해도 그대로예요.
 *
 * 안전한 순간: 내 차례 버튼이 떠 있지 않고, 설정·메뉴 같은 창도 안 열려 있을 때.
 */
const CHECK_EVERY_MS = 60_000;

let pending = false;

async function latestId(): Promise<string | null> {
  try {
    const res = await fetch('/version.json', { cache: 'no-store' });
    if (!res.ok) return null;
    const { id } = (await res.json()) as { id?: unknown };
    return typeof id === 'string' ? id : null;
  } catch {
    return null;
  }
}

function safeNow() {
  return !document.querySelector('.dock-turn') && !document.querySelector('dialog[open]');
}

function reloadWhenSafe() {
  if (safeNow()) {
    location.reload();
    return;
  }
  window.setTimeout(reloadWhenSafe, 1000);
}

async function check() {
  if (pending) return;
  const id = await latestId();
  if (id && id !== __BUILD_ID__) {
    pending = true;
    reloadWhenSafe();
  }
}

export function autoUpdate() {
  if (!import.meta.env.PROD) return;
  window.setInterval(() => void check(), CHECK_EVERY_MS);
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') void check();
  });
  window.addEventListener('online', () => void check());
}
