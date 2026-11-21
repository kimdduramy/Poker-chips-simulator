/**
 * 디버그 복사(모두의 시작 패 포함)에 필요한 코드: 방 코드를 거꾸로 쓰면 돼요.
 * 예: QMQQ → QQMQ, ABCD → DCBA
 * 터미널에서: npm run debug-code QMQQ
 */
export function debugCode(roomCode: string): string {
  return [...roomCode.toUpperCase()].reverse().join('');
}

export const isDebugCode = (roomCode: string, input: string) => input.trim().toUpperCase() === debugCode(roomCode);
