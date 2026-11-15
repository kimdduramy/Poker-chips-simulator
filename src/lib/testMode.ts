/**
 * 테스트 판: /test 로 만든 테이블은 이 탭에서 "테스트 모드"로 기억돼요.
 * - 방장(나)이 자동으로 입장하고, 봇(폰 없는 자리)이 자동으로 추가돼요.
 * - 봇 차례가 오면 "대신 하기"를 누를 필요 없이 바로 그 봇의 버튼이 나와요.
 * 이 탭(sessionStorage)에만 저장되니 친구들 화면이나 다른 판에는 영향이 없어요.
 */
export interface TestSetup {
  bots: number;
  joined: boolean;
  seeded: boolean;
}

const key = (code: string) => `pp:test:${code}`;

export function getTest(code: string): TestSetup | null {
  try {
    const raw = sessionStorage.getItem(key(code));
    return raw ? (JSON.parse(raw) as TestSetup) : null;
  } catch {
    return null;
  }
}

export function setTest(code: string, t: TestSetup) {
  try {
    sessionStorage.setItem(key(code), JSON.stringify(t));
  } catch {
    // 저장이 안 되는 브라우저면 테스트 편의 기능만 빠져요
  }
}

export const BOT_NAMES = ['봇1', '봇2', '봇3', '봇4', '봇5', '봇6', '봇7'];
