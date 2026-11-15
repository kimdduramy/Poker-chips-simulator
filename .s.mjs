import { chromium, devices } from '@playwright/test';
const b = await chromium.launch({ channel: 'chrome' });
const ctx = await b.newContext({ ...devices['iPhone 12'], reducedMotion: 'reduce' });
const p = await ctx.newPage();
await p.goto('http://localhost:5173/test');
await p.getByRole('radio', { name: '2' }).click();
await p.getByRole('button', { name: '테스트 판 시작' }).click();
await p.waitForURL(/\/t\//);
await p.locator('.lobby-seats .lobby-name').nth(2).waitFor();
await p.getByRole('button', { name: '관리' }).click();
await p.getByLabel('폰 없는 사람 추가').fill('김가나다라마바사아자');
await p.getByRole('button', { name: '추가' }).click();
await p.waitForTimeout(600);
await p.keyboard.press('Escape');
await p.waitForTimeout(300);
await p.getByRole('button', { name: '첫 핸드 시작' }).click();
await p.locator('.dock-turn').waitFor();
for (let i = 0; i < 12; i++) {
  const t = await p.locator('.turn-title').textContent();
  if (t.includes('김가나')) break;
  await p.locator('.dock-turn').getByRole('button', { name: /^(체크|콜)/ }).first().click();
  await p.waitForTimeout(300);
}
await p.screenshot({ path: process.argv[2] });
await b.close();
