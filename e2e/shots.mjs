// Visual walkthrough: three players on phones play a hand; screenshots every key state.
import { chromium, devices } from '@playwright/test';
import fs from 'node:fs';

const BASE = process.env.BASE ?? 'http://localhost:5173';
const OUT = process.env.OUT ?? '/tmp/pp-shots';
const scheme = process.env.SCHEME ?? 'light';
fs.mkdirSync(OUT, { recursive: true });

const browser = await chromium.launch({ channel: 'chrome' });
const phone = { ...devices['iPhone 14 Pro Max'], colorScheme: scheme };
delete phone.defaultBrowserType;

async function player(name) {
  const ctx = await browser.newContext(phone);
  const page = await ctx.newPage();
  page.on('pageerror', (e) => console.error(name, 'pageerror', e.message));
  page.on('console', (m) => m.type() === 'error' && console.error(name, 'console', m.text()));
  return page;
}

const shot = async (page, file) => {
  await page.waitForTimeout(350);
  await page.screenshot({ path: `${OUT}/${scheme}-${file}.png` });
};

const ana = await player('Ana');
await ana.goto(BASE);
await shot(ana, '01-home');
await ana.getByRole('button', { name: '테이블 만들기' }).click();
await ana.waitForURL(/\/t\/[A-Z]{4}/);
const code = ana.url().match(/\/t\/([A-Z]{4})/)[1];
await ana.getByLabel('내 이름').fill('Ana');
await shot(ana, '02-join');
await ana.getByRole('button', { name: '참가하기' }).click();
await ana.getByText('자리').waitFor();

const others = [];
for (const name of ['Ben', 'Cat']) {
  const p = await player(name);
  await p.goto(`${BASE}/t/${code}`);
  await p.getByLabel('내 이름').fill(name);
  await p.getByRole('button', { name: '참가하기' }).click();
  await p.getByText('Ana님이 첫 판을').waitFor();
  others.push(p);
}
const [ben, cat] = others;
await shot(ana, '03-lobby-host');
await shot(ben, '04-lobby-guest');

await ana.getByRole('button', { name: '첫 판 시작' }).click();
await ana.getByText('내 차례', { exact: true }).waitFor();
await shot(ana, '05-your-turn');
await shot(ben, '06-waiting');

await ana.getByRole('button', { name: '레이즈' }).click();
await shot(ana, '07-raise');
await ana.getByRole('button', { name: '팟', exact: true }).click();
await ana.getByRole('button', { name: /^레이즈 / }).click();
await ben.getByText('내 차례', { exact: true }).waitFor();
await ben.getByRole('button', { name: /^콜/ }).click();
await cat.getByText('내 차례', { exact: true }).waitFor();
await cat.getByRole('button', { name: /^콜/ }).click();
await ana.getByText('플랍 3장 까세요').first().waitFor();
await shot(ana, '08-flop-waiting');

for (let i = 0; i < 9; i++) {
  for (const p of [ana, ben, cat]) {
    if (await p.getByText('내 차례', { exact: true }).isVisible()) {
      await p.getByRole('button', { name: '체크' }).click();
      await p.waitForTimeout(150);
    }
  }
  if (await ana.getByText('누가 이겼나요?').isVisible()) break;
}
await ana.getByText('누가 이겼나요?').waitFor();
await shot(ana, '09-showdown');
await ana.locator('.win-row').filter({ hasText: 'Cat' }).click();
await ana.locator('.win-row').filter({ hasText: 'Ben' }).click();
await shot(ana, '09b-chop');
await ana.locator('.dock-award .btn-primary').click();
await ana.getByRole('button', { name: /다음 판 시작/ }).waitFor();
await shot(ana, '10-hand-over');

await ana.getByRole('button', { name: '메뉴' }).click();
await shot(ana, '11-menu');
await ana.getByRole('button', { name: '정산' }).click();
await shot(ana, '12-settle');
await ana.keyboard.press('Escape');

const tablet = await browser.newContext({ viewport: { width: 1024, height: 768 }, colorScheme: scheme, deviceScaleFactor: 2 });
const display = await tablet.newPage();
await display.goto(`${BASE}/t/${code}?view=display`);
await display.getByText('큰 화면 끄기').waitFor();
await shot(display, '13-display-ipad');

const desk = await browser.newContext({ viewport: { width: 1440, height: 900 }, colorScheme: scheme });
const deskPage = await desk.newPage();
await deskPage.goto(`${BASE}/t/${code}`);
await deskPage.getByLabel('내 이름').fill('Dee');
await deskPage.getByRole('button', { name: '참가하기' }).click();
await deskPage.getByRole('button', { name: /다음 판 시작/ }).waitFor();
await deskPage.getByRole('button', { name: /다음 판 시작/ }).click();
await deskPage.waitForTimeout(600);
await shot(deskPage, '14-desktop');
const turnPage = [ana, ben, cat, deskPage];
for (const p of turnPage) {
  if (await p.getByText('내 차례', { exact: true }).isVisible()) {
    await shot(p, `15-turn-${p === deskPage ? 'desktop' : 'phone'}`);
  }
}
const ipadPortrait = await browser.newContext({ viewport: { width: 820, height: 1180 }, colorScheme: scheme, deviceScaleFactor: 2, hasTouch: true });
const ip = await ipadPortrait.newPage();
await ip.goto(`${BASE}/t/${code}`);
await ip.getByLabel('내 이름').fill('Eve');
await ip.getByRole('button', { name: '참가하기' }).click();
await ip.waitForTimeout(600);
await shot(ip, '16-ipad-portrait');

console.log('code', code);
await browser.close();
