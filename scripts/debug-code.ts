// 사용법: npm run debug-code QMQQ
import { debugCode } from '../shared/debugCode.ts';

const room = process.argv[2];
if (!room) {
  console.error('방 코드를 적어 주세요. 예: npm run debug-code QMQQ');
  process.exit(1);
}
console.log(debugCode(room));
