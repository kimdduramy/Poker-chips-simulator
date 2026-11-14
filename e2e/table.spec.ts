import { expect, test, type Browser, type BrowserContext, type Page } from '@playwright/test';

const contexts: BrowserContext[] = [];

test.afterEach(async () => {
  await Promise.all(contexts.splice(0).map((c) => c.close().catch(() => undefined)));
});

async function seat(browser: Browser, name: string, code?: string, options: Parameters<Browser['newContext']>[0] = {}) {
  const ctx = await browser.newContext({ ...test.info().project.use, ...options });
  contexts.push(ctx);
  const page = await ctx.newPage();
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  (page as Page & { errors: string[] }).errors = errors;
  if (code) {
    await page.goto(`/t/${code}`);
  } else {
    await page.goto('/');
    await page.getByRole('button', { name: '테이블 만들기' }).click();
    await page.waitForURL(/\/t\/[A-Z]{4}$/);
  }
  await page.getByLabel('내 이름').fill(name);
  await page.getByRole('button', { name: '참가하기' }).click();
  await expect(page.getByRole('button', { name: '메뉴' })).toBeVisible();
  return page;
}

const codeOf = (page: Page) => page.url().match(/\/t\/([A-Z]{4})/)![1];
const yourTurn = (page: Page) => page.getByText('내 차례', { exact: true });
const stackOf = (page: Page, name: string) =>
  page.getByRole('listitem').filter({ has: page.locator('.seat-name', { hasText: new RegExp(`^${name}`) }) }).locator('.seat-stack');

async function actWhoeverIsUp(pages: Page[], action: '체크' | RegExp) {
  for (let i = 0; i < 100; i++) {
    for (const p of pages) {
      if (!(await yourTurn(p).isVisible())) continue;
      try {
        await p.getByRole('button', { name: action }).click({ timeout: 2_000 });
      } catch {
        continue; // the turn moved on between the check and the click
      }
      await expect(yourTurn(p)).toBeHidden({ timeout: 3_000 }).catch(() => undefined);
      return p;
    }
    await pages[0].waitForTimeout(100);
  }
  throw new Error('nobody had a turn');
}

test('three players play a hand from deal to payout', async ({ browser }) => {
  const ana = await seat(browser, 'Ana');
  const code = codeOf(ana);
  const ben = await seat(browser, 'Ben', code);
  const cat = await seat(browser, 'Cat', code);

  await expect(ben.getByText('Ana님이 첫 판을 시작하길 기다리는 중')).toBeVisible();
  await ana.getByRole('button', { name: '첫 판 시작' }).click();

  await expect(yourTurn(ana)).toBeVisible();
  await expect(ben.getByText('Ana 차례 · 콜하려면 10')).toBeVisible();
  await ana.getByRole('button', { name: '레이즈' }).click();
  await ana.getByLabel('금액').fill('60');
  await ana.getByRole('textbox').fill('60');
  await ana.getByRole('button', { name: '레이즈 60' }).click();

  await expect(yourTurn(ben)).toBeVisible();
  await ben.getByRole('button', { name: '콜 55' }).click();
  await expect(yourTurn(cat)).toBeVisible();
  await cat.getByRole('button', { name: '폴드' }).click();

  await expect(ana.getByText('플랍 3장 까세요')).toBeVisible();
  await expect(ana.locator('.pot-amount')).toHaveText('130');

  for (let i = 0; i < 6; i++) await actWhoeverIsUp([ana, ben], '체크');
  await expect(cat.getByText('누가 이겼나요?')).toBeVisible();
  await cat.locator('.win-row').filter({ hasText: 'Ben' }).click();
  await cat.getByRole('button', { name: 'Ben에게 130 주기' }).click();

  await expect(ana.locator('.stage-line')).toHaveText('Ben 승리');
  await expect(stackOf(ana, 'Ben')).toHaveText('1,070');
  await expect(stackOf(ben, 'Ana')).toHaveText('940');
  await expect(stackOf(cat, 'Cat')).toHaveText('990');

  await ana.getByRole('button', { name: '메뉴' }).click();
  await ana.getByRole('button', { name: '정산' }).click();
  await expect(ana.getByText('Ana → Ben')).toBeVisible();
  await ana.keyboard.press('Escape');

  await ben.getByRole('button', { name: /다음 판 시작/ }).click();
  await expect(ana.getByText('2번째 판', { exact: true })).toBeVisible();
  for (const p of [ana, ben, cat]) expect((p as Page & { errors: string[] }).errors).toEqual([]);
});

test('short stack all in creates a side pot that pays the right people', async ({ browser }) => {
  const ana = await seat(browser, 'Ana');
  const code = codeOf(ana);
  const ben = await seat(browser, 'Ben', code);
  const cat = await seat(browser, 'Cat', code);

  await ana.getByRole('button', { name: '관리' }).click();
  const benRow = ana.locator('.player-row').filter({ hasText: 'Ben' });
  await benRow.getByRole('button', { name: '칩 수정' }).click();
  await ana.getByLabel('Ben의 새 칩 수').fill('100');
  await ana.getByRole('button', { name: '적용', exact: true }).click();
  await expect(benRow).toContainText('100');
  await ana.keyboard.press('Escape');

  await ana.getByRole('button', { name: '첫 판 시작' }).click();
  await expect(yourTurn(ana)).toBeVisible();
  await ana.getByRole('button', { name: '레이즈' }).click();
  await ana.getByRole('button', { name: '올인', exact: true }).click();
  await ana.getByRole('button', { name: '올인 1,000' }).click();

  await expect(yourTurn(ben)).toBeVisible();
  await ben.getByRole('button', { name: '올인 95' }).click();
  await expect(yourTurn(cat)).toBeVisible();
  await cat.getByRole('button', { name: '올인 990' }).click();

  await expect(ana.getByText('누가 이겼나요?')).toBeVisible();
  await expect(ana.locator('.stage-line')).toHaveText('모두 올인. 남은 카드 다 까요.');
  const main = ana.locator('.pot-pick').filter({ hasText: '메인 팟' });
  const side = ana.locator('.pot-pick').filter({ hasText: '사이드 팟 1' });
  await expect(main).toContainText('300');
  await expect(side).toContainText('1,800');
  await expect(side.getByRole('button', { name: 'Ben' })).toHaveCount(0);

  await main.getByRole('button', { name: 'Ben' }).click();
  await side.getByRole('button', { name: 'Cat' }).click();
  await ana.getByRole('button', { name: '칩 나눠 주기' }).click();

  await expect(stackOf(ana, 'Ben')).toHaveText('300');
  await expect(stackOf(ana, 'Cat')).toHaveText('1,800');
  await expect(stackOf(ana, 'Ana')).toHaveText('0');
  await expect(ana.getByRole('button', { name: '1,000 다시 받기' })).toBeVisible();
  await ana.getByRole('button', { name: '1,000 다시 받기' }).click();
  await expect(stackOf(ben, 'Ana')).toHaveText('1,000');
});

test('two players with the same hand chop the pot', async ({ browser }) => {
  const ana = await seat(browser, 'Ana');
  const code = codeOf(ana);
  const ben = await seat(browser, 'Ben', code);
  const cat = await seat(browser, 'Cat', code);

  await ana.getByRole('button', { name: '첫 판 시작' }).click();
  await expect(yourTurn(ana)).toBeVisible();
  await ana.getByRole('button', { name: /콜/ }).click();
  await expect(yourTurn(ben)).toBeVisible();
  await ben.getByRole('button', { name: /콜/ }).click();
  await expect(yourTurn(cat)).toBeVisible();
  await cat.getByRole('button', { name: '체크' }).click();
  for (let i = 0; i < 9; i++) await actWhoeverIsUp([ana, ben, cat], '체크');

  await expect(ana.getByText('이긴 사람을 모두 누르세요. 두 명 이상이면 나눠 가져요.')).toBeVisible();
  const rowFor = (page: Page, name: string) => page.locator('.win-row').filter({ hasText: name });

  await rowFor(ana, 'Ana').click();
  await expect(rowFor(ana, 'Ana').locator('.win-take')).toHaveText('+30');
  await expect(rowFor(ana, 'Ben').locator('.win-take')).toHaveText('나눔');
  await expect(ana.getByRole('button', { name: 'Ana에게 30 주기' })).toBeVisible();

  await rowFor(ana, 'Ben').click();
  await expect(rowFor(ana, 'Ana').locator('.win-take')).toHaveText('+15');
  await expect(rowFor(ana, 'Ben').locator('.win-take')).toHaveText('+15');
  await expect(ana.getByText('2명이 나눠 가져요. 한 명당 15.')).toBeVisible();

  await ana.getByRole('button', { name: '30 나눠 갖기 (2명)' }).click();
  await expect(ben.locator('.stage-line')).toHaveText(/나눠 가짐/);
  await expect(stackOf(cat, 'Ana')).toHaveText('1,005');
  await expect(stackOf(cat, 'Ben')).toHaveText('1,005');
  await expect(stackOf(cat, 'Cat')).toHaveText('990');
  for (const p of [ana, ben, cat]) expect((p as Page & { errors: string[] }).errors).toEqual([]);
});

test('anyone can act for a seat without a phone, and undo rolls it back', async ({ browser }) => {
  const ana = await seat(browser, 'Ana');
  const code = codeOf(ana);
  const ben = await seat(browser, 'Ben', code);

  await ana.getByRole('button', { name: '관리' }).click();
  await ana.getByLabel('폰 없는 사람 추가').fill('Gran');
  await ana.getByRole('button', { name: '추가' }).click();
  await expect(ana.locator('.player-row').filter({ hasText: 'Gran' })).toBeVisible();
  await ana.keyboard.press('Escape');

  await ana.getByRole('button', { name: '첫 판 시작' }).click();
  await expect(yourTurn(ana)).toBeVisible();
  await ana.getByRole('button', { name: '콜 10' }).click();
  await expect(yourTurn(ben)).toBeVisible();
  await ben.getByRole('button', { name: '콜 5' }).click();

  await expect(ana.getByRole('button', { name: 'Gran 대신 하기' })).toBeVisible();
  await ben.getByRole('button', { name: 'Gran 대신 하기' }).click();
  await expect(ben.getByText('Gran 대신 하는 중')).toBeVisible();
  await ben.getByRole('button', { name: '체크' }).click();
  await expect(ana.getByText('플랍 3장 까세요')).toBeVisible();

  await ana.getByRole('button', { name: '메뉴' }).click();
  await expect(ana.getByText('Gran 체크 (Ben 대신)')).toBeVisible();
  await ana.getByRole('button', { name: /^되돌리기/ }).click();
  await expect(ben.getByRole('button', { name: 'Gran 대신 하기' })).toBeVisible();
  await expect(ben.locator('.phase-name')).toHaveText('프리플랍');
});

test('a new device can take over a seat after approval', async ({ browser }) => {
  const ana = await seat(browser, 'Ana');
  const code = codeOf(ana);
  const ben = await seat(browser, 'Ben', code);

  const ctx = await browser.newContext(test.info().project.use);
  contexts.push(ctx);
  const benTablet = await ctx.newPage();
  await benTablet.goto(`/t/${code}`);
  await benTablet.getByRole('button', { name: /^Ben/ }).click();
  await expect(benTablet.getByText('승인 기다리는 중')).toBeVisible();

  await expect(ana.getByText('새 기기가')).toBeVisible();
  await ana.getByRole('button', { name: '허용' }).click();

  await expect(benTablet.getByRole('button', { name: '메뉴' })).toBeVisible();
  await expect(benTablet.locator('.seat-you')).toHaveCount(0);
  await expect(ben.getByText('자리가 옮겨졌어요')).toBeVisible();
});

test('recovers after losing the connection', async ({ browser }) => {
  const ana = await seat(browser, 'Ana');
  const code = codeOf(ana);
  const ben = await seat(browser, 'Ben', code);
  await ana.getByRole('button', { name: '첫 판 시작' }).click();
  await expect(yourTurn(ana)).toBeVisible();

  await ben.context().setOffline(true);
  await ben.evaluate(() => window.dispatchEvent(new Event('offline')));
  await ana.getByRole('button', { name: '콜 5' }).click();
  await ben.context().setOffline(false);
  await ben.evaluate(() => window.dispatchEvent(new Event('online')));
  await expect(yourTurn(ben)).toBeVisible({ timeout: 20_000 });
  await ben.getByRole('button', { name: '체크' }).click();
  await expect(ana.getByText('플랍 3장 까세요')).toBeVisible();
});

test('desktop keyboard shortcuts drive the action bar', async ({ browser }) => {
  const ana = await seat(browser, 'Ana', undefined, { viewport: { width: 1440, height: 900 }, isMobile: false, hasTouch: false });
  const ben = await seat(browser, 'Ben', codeOf(ana));
  await ana.getByRole('button', { name: '첫 판 시작' }).click();
  await expect(yourTurn(ana)).toBeVisible();
  await ana.keyboard.press('r');
  await expect(ana.getByRole('button', { name: '레이즈 20' })).toBeVisible();
  await ana.keyboard.press('ArrowUp');
  await expect(ana.getByRole('button', { name: '레이즈 30' })).toBeVisible();
  await ana.keyboard.press('Enter');
  await expect(yourTurn(ben)).toBeVisible();
  await ben.getByRole('button', { name: '폴드' }).click();
  await expect(ana.getByRole('button', { name: /다음 판 시작/ })).toBeVisible();
  await ana.keyboard.press('n');
  await expect(ana.getByText('2번째 판', { exact: true })).toBeVisible();
});

test('no horizontal overflow from small phones to desktops', async ({ browser }) => {
  const host = await seat(browser, 'Ana with a long name');
  const code = codeOf(host);
  await seat(browser, 'Bartholomew', code);
  for (const width of [320, 390, 768, 1024, 1440]) {
    const ctx = await browser.newContext({ baseURL: test.info().project.use.baseURL, viewport: { width, height: 800 } });
    const page = await ctx.newPage();
    for (const path of ['/', `/t/${code}`, `/t/${code}?view=display`]) {
      await page.goto(path);
      await page.waitForTimeout(400);
      const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
      expect(overflow, `${path} at ${width}px`).toBeLessThanOrEqual(0);
    }
    await ctx.close();
  }
});

test('unknown table codes and room pages explain themselves', async ({ page }) => {
  await page.goto('/');
  await page.getByLabel('코드가 있나요?').fill('zzzz');
  await page.getByRole('button', { name: '입장' }).click();
  await expect(page.getByRole('alert')).toContainText('ZZZZ 테이블이 없어요');
  await page.goto('/t/QQQQ');
  await expect(page.getByText('QQQQ 테이블이 없어요')).toBeVisible();
});
