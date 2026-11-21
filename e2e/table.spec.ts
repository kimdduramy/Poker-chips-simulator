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

  await expect(ben.getByText('Ana님이 첫 핸드를 시작하길 기다리는 중')).toBeVisible();
  await ana.getByRole('button', { name: '첫 핸드 시작' }).click();

  await expect(yourTurn(ana)).toBeVisible();
  await expect(ben.locator('.act-line')).toHaveText(/Ana 액션\s*콜 10/);
  await ana.getByRole('button', { name: '레이즈' }).click();
  await ana.getByLabel('금액').fill('60');
  await ana.getByRole('textbox').fill('60');
  await ana.getByRole('button', { name: '레이즈 60' }).click();

  await expect(yourTurn(ben)).toBeVisible();
  await ben.getByRole('button', { name: '콜 55' }).click();
  await expect(yourTurn(cat)).toBeVisible();
  await cat.getByRole('button', { name: '폴드' }).click();

  await expect(ana.locator('.dealer-tip', { hasText: '1장 버리고 플랍 3장 펼치기' })).toBeVisible();
  await expect(ana.locator('.pot-amount')).toHaveText('130');

  for (let i = 0; i < 6; i++) await actWhoeverIsUp([ana, ben], '체크');
  // 승자 처리는 방장만: 다른 사람은 기다림 안내만 봐요
  await expect(cat.getByText('방장(Ana)이 승자를 고르는 중이에요')).toBeVisible();
  await expect(cat.locator('.win-row')).toHaveCount(0);
  await expect(ana.getByText('누가 이겼나요?')).toBeVisible();
  await ana.locator('.win-row').filter({ hasText: 'Ben' }).click();
  await ana.getByRole('button', { name: 'Ben에게 130 지급' }).click();

  await expect(ana.locator('.stage-line')).toHaveText('Ben 승리');
  await expect(stackOf(ana, 'Ben')).toHaveText('1,070');
  await expect(stackOf(ben, 'Ana')).toHaveText('940');
  await expect(stackOf(cat, 'Cat')).toHaveText('990');

  await ana.getByRole('button', { name: '메뉴' }).click();
  await ana.getByRole('button', { name: '정산' }).click();
  await expect(ana.getByText('Ana → Ben')).toBeVisible();
  await ana.keyboard.press('Escape');

  await expect(ben.getByRole('button', { name: /다음 핸드 시작/ })).toHaveCount(0);
  await expect(ben.getByText('방장(Ana)이 다음 핸드를 준비하는 중이에요')).toBeVisible();
  await ana.getByRole('button', { name: /다음 핸드 시작/ }).click();
  await expect(ana.getByText('핸드 #2', { exact: true })).toBeVisible();
  for (const p of [ana, ben, cat]) expect((p as Page & { errors: string[] }).errors).toEqual([]);
});

test('short stack all in creates a side pot that pays the right people', async ({ browser }) => {
  const ana = await seat(browser, 'Ana');
  const code = codeOf(ana);
  const ben = await seat(browser, 'Ben', code);
  const cat = await seat(browser, 'Cat', code);

  await ana.getByRole('button', { name: '관리' }).click();
  const benRow = ana.locator('.player-row').filter({ hasText: 'Ben' });
  await benRow.getByRole('button', { name: '스택 수정' }).click();
  await ana.getByLabel('Ben의 새 스택').fill('100');
  await ana.getByRole('button', { name: '적용', exact: true }).click();
  await expect(benRow).toContainText('100');
  await ana.keyboard.press('Escape');

  await ana.getByRole('button', { name: '첫 핸드 시작' }).click();
  await expect(yourTurn(ana)).toBeVisible();
  await ana.getByRole('button', { name: '레이즈' }).click();
  await ana.getByRole('button', { name: '올인', exact: true }).click();
  await ana.getByRole('button', { name: '올인 1,000' }).click();

  await expect(yourTurn(ben)).toBeVisible();
  await ben.getByRole('button', { name: '올인 95' }).click();
  await expect(yourTurn(cat)).toBeVisible();
  await cat.getByRole('button', { name: '올인 990' }).click();

  await expect(ana.getByText('누가 이겼나요?')).toBeVisible();
  await expect(ana.locator('.stage-line')).toHaveText('올인 런아웃');
  const main = ana.locator('.pot-pick').filter({ hasText: '메인 팟' });
  const side = ana.locator('.pot-pick').filter({ hasText: '사이드 팟 1' });
  await expect(main).toContainText('300');
  await expect(side).toContainText('1,800');
  await expect(side.getByRole('button', { name: 'Ben' })).toHaveCount(0);

  await main.getByRole('button', { name: 'Ben' }).click();
  await side.getByRole('button', { name: 'Cat' }).click();
  await ana.getByRole('button', { name: '팟 지급' }).click();

  await expect(stackOf(ana, 'Ben')).toHaveText('300');
  await expect(stackOf(ana, 'Cat')).toHaveText('1,800');
  await expect(stackOf(ana, 'Ana')).toHaveText('0');
  await expect(ana.getByRole('button', { name: '리바이 1,000' })).toBeVisible();
  await ana.getByRole('button', { name: '리바이 1,000' }).click();
  await expect(stackOf(ben, 'Ana')).toHaveText('1,000');
});

test('two players with the same hand chop the pot', async ({ browser }) => {
  const ana = await seat(browser, 'Ana');
  const code = codeOf(ana);
  const ben = await seat(browser, 'Ben', code);
  const cat = await seat(browser, 'Cat', code);

  await ana.getByRole('button', { name: '첫 핸드 시작' }).click();
  await expect(yourTurn(ana)).toBeVisible();
  await ana.getByRole('button', { name: /콜/ }).click();
  await expect(yourTurn(ben)).toBeVisible();
  await ben.getByRole('button', { name: /콜/ }).click();
  await expect(yourTurn(cat)).toBeVisible();
  await cat.getByRole('button', { name: '체크' }).click();
  for (let i = 0; i < 9; i++) await actWhoeverIsUp([ana, ben, cat], '체크');

  await expect(ana.getByText('승자를 모두 선택하세요. 2명 이상이면 스플릿돼요.')).toBeVisible();
  const rowFor = (page: Page, name: string) => page.locator('.win-row').filter({ hasText: name });

  await rowFor(ana, 'Ana').click();
  await expect(rowFor(ana, 'Ana').locator('.win-take')).toHaveText('+30');
  await expect(rowFor(ana, 'Ben').locator('.win-take')).toHaveText('–');
  await expect(ana.getByRole('button', { name: 'Ana에게 30 지급' })).toBeVisible();

  await rowFor(ana, 'Ben').click();
  await expect(rowFor(ana, 'Ana').locator('.win-take')).toHaveText('+15');
  await expect(rowFor(ana, 'Ben').locator('.win-take')).toHaveText('+15');
  await expect(ana.getByText('2명 스플릿, 1인당 15.')).toBeVisible();

  await ana.getByRole('button', { name: '2명 스플릿 · 30' }).click();
  await expect(ben.locator('.stage-line')).toHaveText(/스플릿/);
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

  await ana.getByRole('button', { name: '첫 핸드 시작' }).click();
  await expect(yourTurn(ana)).toBeVisible();
  await ana.getByRole('button', { name: '콜 10' }).click();
  await expect(yourTurn(ben)).toBeVisible();
  await ben.getByRole('button', { name: '콜 5' }).click();

  await expect(ana.getByRole('button', { name: 'Gran 대신 하기' })).toBeVisible();
  await ben.getByRole('button', { name: 'Gran 대신 하기' }).click();
  await expect(ben.getByText('Gran 대신 하는 중')).toBeVisible();
  await ben.getByRole('button', { name: '체크' }).click();
  await expect(ana.locator('.dealer-tip', { hasText: '1장 버리고 플랍 3장 펼치기' })).toBeVisible();

  await ana.getByRole('button', { name: '메뉴' }).click();
  await expect(ana.locator('dialog[open]').getByText('Gran 체크 (Ben 대신)')).toBeVisible();
  await ana.locator('dialog[open]').getByRole('button', { name: /^되돌리기/ }).click();
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
  await ana.getByRole('button', { name: '첫 핸드 시작' }).click();
  await expect(yourTurn(ana)).toBeVisible();

  await ben.context().setOffline(true);
  await ben.evaluate(() => window.dispatchEvent(new Event('offline')));
  await ana.getByRole('button', { name: '콜 5' }).click();
  await ben.context().setOffline(false);
  await ben.evaluate(() => window.dispatchEvent(new Event('online')));
  await expect(yourTurn(ben)).toBeVisible({ timeout: 20_000 });
  await ben.getByRole('button', { name: '체크' }).click();
  await expect(ana.locator('.dealer-tip', { hasText: '1장 버리고 플랍 3장 펼치기' })).toBeVisible();
});

test('desktop keyboard shortcuts drive the action bar', async ({ browser }) => {
  const ana = await seat(browser, 'Ana', undefined, { viewport: { width: 1440, height: 900 }, isMobile: false, hasTouch: false });
  const ben = await seat(browser, 'Ben', codeOf(ana));
  await ana.getByRole('button', { name: '첫 핸드 시작' }).click();
  await expect(yourTurn(ana)).toBeVisible();
  await ana.keyboard.press('r');
  await expect(ana.getByRole('button', { name: '레이즈 20' })).toBeVisible();
  await ana.keyboard.press('ArrowUp');
  await expect(ana.getByRole('button', { name: '레이즈 30' })).toBeVisible();
  await ana.keyboard.press('Enter');
  await expect(yourTurn(ben)).toBeVisible();
  await ben.getByRole('button', { name: '폴드' }).click();
  await expect(ana.getByRole('button', { name: /다음 핸드 시작/ })).toBeVisible();
  await ana.keyboard.press('n');
  await expect(ana.getByText('핸드 #2', { exact: true })).toBeVisible();
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

test('when the host leaves, the old table closes for everyone and a new table starts empty', async ({ browser }) => {
  const ana = await seat(browser, 'Ana');
  const ben = await seat(browser, 'Ben', codeOf(ana));
  await ana.getByRole('button', { name: '메뉴' }).click();
  await ana.getByRole('button', { name: '테이블 닫고 나가기' }).click();
  await ana.getByRole('button', { name: '나가기', exact: true }).click();
  await expect(ben.getByText('방장이 테이블을 닫았어요')).toBeVisible();
  await ana.waitForURL(/\/$/);
  await ana.getByRole('button', { name: '테이블 만들기' }).click();
  await ana.waitForURL(/\/t\/[A-Z]{4}$/);
  await expect(ana.getByText('아직 아무도 없어요', { exact: false })).toBeVisible();
});

test('hand rankings show only while held, glossary opens small, and mid-hand joiners see the hand number', async ({ browser }) => {
  const ana = await seat(browser, 'Ana');
  const code = codeOf(ana);
  await seat(browser, 'Ben', code);
  await ana.getByRole('button', { name: '첫 핸드 시작' }).click();

  const hold = ana.getByRole('button', { name: /족보 보기/ });
  const box = (await hold.boundingBox())!;
  await ana.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  await ana.mouse.down();
  await expect(ana.getByText('로열 플러시')).toBeVisible();
  await ana.mouse.up();
  await expect(ana.getByText('로열 플러시')).toBeHidden();

  await ana.getByRole('button', { name: '용어 설명' }).click();
  await expect(ana.getByRole('dialog', { name: '용어 설명' })).toBeVisible();
  await ana.keyboard.press('Escape');
  await expect(ana.getByRole('dialog', { name: '용어 설명' })).toBeHidden();

  const ctx = await browser.newContext(test.info().project.use);
  contexts.push(ctx);
  const late = await ctx.newPage();
  await late.goto(`/t/${code}`);
  await expect(late.getByText('핸드 #1 진행 중')).toBeVisible();
});

test('host undo / redo bar needs a long press, so a quick tap does nothing', async ({ browser }) => {
  const ana = await seat(browser, 'Ana');
  const ben = await seat(browser, 'Ben', codeOf(ana));
  await ana.getByRole('button', { name: '첫 핸드 시작' }).click();
  await expect(yourTurn(ana)).toBeVisible();
  await ana.getByRole('button', { name: '콜 5' }).click();
  await expect(yourTurn(ben)).toBeVisible();

  // 방장이 아닌 사람에겐 바가 없어요
  await expect(ben.locator('.hist-bar')).toHaveCount(0);

  const undo = ana.getByRole('button', { name: '되돌리기 (꾹 누르기)' });
  await expect(undo).toBeEnabled();
  // 톡 건드리면 아무 일도 안 일어나요
  await undo.click();
  await ana.waitForTimeout(800);
  await expect(yourTurn(ben)).toBeVisible();

  // 꾹 누르면 되돌려져요
  const box = (await undo.boundingBox())!;
  await ana.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  await ana.mouse.down();
  await ana.waitForTimeout(800);
  await ana.mouse.up();
  await expect(yourTurn(ana)).toBeVisible();

  // 다시 하기도 꾹 눌러서 앞으로
  const redo = ana.getByRole('button', { name: '다시 하기 (꾹 누르기)' });
  await expect(redo).toBeEnabled();
  const rb = (await redo.boundingBox())!;
  await ana.mouse.move(rb.x + rb.width / 2, rb.y + rb.height / 2);
  await ana.mouse.down();
  await ana.waitForTimeout(800);
  await ana.mouse.up();
  await expect(yourTurn(ben)).toBeVisible();
});

test('/test sets up a solo table with bots and lets me play their turns', async ({ browser }) => {
  const ctx = await browser.newContext({ ...test.info().project.use });
  contexts.push(ctx);
  const me = await ctx.newPage();
  const errors: string[] = [];
  me.on('pageerror', (e) => errors.push(e.message));

  await me.goto('/test');
  await expect(me.getByRole('heading', { name: '테스트 판 만들기' })).toBeVisible();
  await me.getByRole('radio', { name: '2' }).click();
  await me.getByRole('button', { name: '테스트 판 시작' }).click();
  await me.waitForURL(/\/t\/[A-Z]{4}$/);

  // 이름 입력 없이 '나'로 입장하고 봇 2명이 앉아요
  await expect(me.getByRole('button', { name: '메뉴' })).toBeVisible();
  await expect(me.locator('.topbar .test-badge')).toBeVisible();
  const seats = me.locator('.lobby-seats .lobby-name');
  await expect(seats).toHaveCount(3);
  await expect(seats.filter({ hasText: '봇1' })).toHaveCount(1);
  await expect(seats.filter({ hasText: '봇2' })).toHaveCount(1);

  // 새로고침해도 봇이 또 늘지 않아요
  await me.reload();
  await expect(me.getByRole('button', { name: '메뉴' })).toBeVisible();
  await expect(seats).toHaveCount(3);

  await me.getByRole('button', { name: '첫 핸드 시작' }).click();
  // 딜러 지시: 처음엔 카드 나눠주기
  await expect(me.locator('.dealer-bar[data-now] .dealer-tip')).toHaveText('2장씩 나눠줘요 · SB부터 한 장씩');
  // 액션을 하면 화면 가운데에 크게 떠요
  await me.locator('.dock-turn').getByRole('button', { name: /^(체크|콜 \d+)/ }).first().click();
  await expect(me.locator('.action-toast')).toBeVisible();
  await expect(me.locator('.action-toast-word')).toHaveText(/^(체크|콜)$/);

  // 봇 차례든 내 차례든 바로 버튼이 나와요: 끝까지 콜/체크
  const anyTurn = me.locator('.dock-turn');
  for (let i = 0; i < 40 && !(await me.getByText('누가 이겼나요?').isVisible()); i++) {
    await expect(anyTurn.or(me.getByText('누가 이겼나요?'))).toBeVisible();
    if (!(await anyTurn.isVisible())) break;
    const title = (await anyTurn.locator('.turn-title').textContent()) ?? '';
    expect(title).toMatch(/^(내 차례|봇\d 차례 \(테스트\))$/);
    await anyTurn.getByRole('button', { name: /^(체크|콜 \d+)/ }).first().click();
    await expect(anyTurn.locator('.turn-title')).not.toHaveText(title, { timeout: 3_000 }).catch(() => undefined);
  }
  await expect(me.getByText('누가 이겼나요?')).toBeVisible();
  expect(errors).toEqual([]);
});

test('menu has a game log that shows who did what', async ({ browser }) => {
  const ana = await seat(browser, 'Ana');
  const ben = await seat(browser, 'Ben', codeOf(ana));
  await ana.getByRole('button', { name: '첫 핸드 시작' }).click();
  await actWhoeverIsUp([ana, ben], /^(체크|콜 \d+)/);

  await ben.getByRole('button', { name: '메뉴' }).click();
  await ben.getByRole('button', { name: /기록/ }).click();
  const log = ben.locator('dialog[open] .game-log');
  await expect(log.getByRole('heading', { name: /핸드 #1/ })).toBeVisible();
  await expect(log.locator('.game-log-row').filter({ hasText: /콜|체크/ }).first()).toBeVisible();
});

test('home help opens in a window with how-to, terms and hand ranks tabs', async ({ browser }) => {
  const ctx = await browser.newContext({ ...test.info().project.use });
  contexts.push(ctx);
  const page = await ctx.newPage();
  await page.goto('/');
  await expect(page.getByRole('heading', { name: '포커 베팅 시뮬레이터' })).toBeVisible();
  await page.getByRole('button', { name: '도움말' }).click();
  const help = page.getByRole('dialog', { name: '도움말' });
  await expect(help).toBeVisible();
  await expect(help.getByRole('tab', { name: '진행 방법' })).toHaveAttribute('aria-selected', 'true');
  await expect(help.getByText(/첫 핸드 시작/)).toBeVisible();
  await help.getByRole('tab', { name: '용어' }).click();
  await help.getByRole('button', { name: '프리플랍' }).click();
  await expect(help.getByText(/개인 카드 2장만/)).toBeVisible();
  await help.getByRole('tab', { name: '족보' }).click();
  await expect(help.getByText('로열 플러시')).toBeVisible();
  await expect(page).toHaveURL(/\/$/);
  await help.getByRole('button', { name: '닫기' }).click();
  await expect(help).toBeHidden();
});

test('card mode deals cards on the phones and pays the best hand by itself', async ({ browser }) => {
  const ctx = await browser.newContext({ ...test.info().project.use });
  contexts.push(ctx);
  const ana = await ctx.newPage();
  await ana.goto('/');
  await ana.getByRole('radio', { name: /앱 카드/ }).click();
  await ana.getByRole('button', { name: '테이블 만들기' }).click();
  await ana.waitForURL(/\/t\/[A-Z]{4}$/);
  await ana.getByLabel('내 이름').fill('Ana');
  await ana.getByRole('button', { name: '참가하기' }).click();
  const ben = await seat(browser, 'Ben', codeOf(ana));

  await expect(ana.getByText('앱이 나눠줘요')).toBeVisible();
  await ana.getByRole('button', { name: '첫 핸드 시작' }).click();
  for (const p of [ana, ben]) await expect(p.getByRole('button', { name: /^내 카드: / })).toBeVisible();
  const anaCards = await ana.getByRole('button', { name: /^내 카드: / }).getAttribute('aria-label');
  const benCards = await ben.getByRole('button', { name: /^내 카드: / }).getAttribute('aria-label');
  expect(anaCards).not.toBe(benCards);

  for (let i = 0; i < 8; i++) {
    if (await ana.getByRole('button', { name: '다음 핸드 시작' }).isVisible()) break;
    await actWhoeverIsUp([ana, ben], /^(체크|콜)/);
  }
  await expect(ana.getByRole('button', { name: '다음 핸드 시작' })).toBeVisible();
  await expect(ana.getByRole('img', { name: /^보드 카드: / })).toBeVisible();
  await expect(ben.locator('.stage-line')).toHaveText(/(승리|스플릿) · /);

  // 플레이어를 누르고 있는 동안만 그 사람 족보 5장이 강조돼요
  const row = ben.locator('.seat[data-holdable]').first();
  const box = (await row.boundingBox())!;
  await ben.mouse.move(box.x + 40, box.y + box.height / 2);
  await ben.mouse.down();
  await expect(ben.locator('.seat[data-held]')).toHaveCount(1);
  await expect(ben.locator('.board-row .pcard[data-glow="hl"]')).not.toHaveCount(0);
  await ben.mouse.up();
  await expect(ben.locator('.seat[data-held]')).toHaveCount(0);
  expect(Number((await stackOf(ana, 'Ana').innerText()).replace(/,/g, '')) + Number((await stackOf(ana, 'Ben').innerText()).replace(/,/g, ''))).toBe(2000);
});
