// Renders PNG icons and the OpenGraph card from HTML with the real fonts. Run: node scripts/assets.mjs
import { chromium } from '@playwright/test';
import fs from 'node:fs';
import path from 'node:path';

const root = path.resolve(import.meta.dirname, '..');
const pub = path.join(root, 'public');
const font = (p) => `data:font/woff2;base64,${fs.readFileSync(path.join(root, 'node_modules', p)).toString('base64')}`;
const faces = `
@font-face { font-family: Geist; src: url(${font('@fontsource-variable/geist/files/geist-latin-wght-normal.woff2')}); font-weight: 100 900; }
@font-face { font-family: Serif; src: url(${font('@fontsource/instrument-serif/files/instrument-serif-latin-400-italic.woff2')}); font-style: italic; }
`;
const mark = fs.readFileSync(path.join(pub, 'favicon.svg'), 'utf8');

const browser = await chromium.launch(process.env.CI ? {} : { channel: 'chrome' });
const page = await browser.newPage();

async function render(html, width, height, file) {
  await page.setViewportSize({ width, height });
  await page.setContent(`<!doctype html><style>${faces} html,body{margin:0;width:${width}px;height:${height}px;overflow:hidden}</style>${html}`);
  await page.evaluate(() => document.fonts.ready);
  await page.screenshot({ path: path.join(pub, file), omitBackground: false });
  console.log('wrote', file);
}

const icon = (size, pad) =>
  `<div style="width:${size}px;height:${size}px;display:grid;place-items:center;background:#f5db2b">
     <div style="width:${size - pad * 2}px;height:${size - pad * 2}px">${mark.replace('<rect width="64" height="64" rx="14" fill="#f5db2b"/>', '').replace('<svg ', '<svg width="100%" height="100%" ')}</div>
   </div>`;

await render(icon(32, 0), 32, 32, 'favicon-32.png');
await render(icon(180, 14), 180, 180, 'apple-touch-icon.png');
await render(icon(192, 16), 192, 192, 'icon-192.png');
await render(icon(512, 40), 512, 512, 'icon-512.png');
await render(icon(512, 110), 512, 512, 'icon-maskable-512.png');

const seat = (name, tag, stack, acting) => `
  <div style="display:flex;align-items:center;justify-content:space-between;padding:14px 16px;margin:0 -16px;border-radius:14px;${acting ? 'background:#3a3300;' : ''}">
    <div><div style="font-size:22px;font-weight:600">${name}</div><div style="margin-top:4px;font-size:13px;color:#a9a8a3">${tag}</div></div>
    <div style="font-size:24px;font-weight:560;font-variant-numeric:tabular-nums">${stack}</div>
  </div>`;

const chipSvg = (cx, cy, r, face) => {
  const e = r - 4;
  const dash = (Math.PI * 2 * e) / 24;
  return `<circle cx="${cx}" cy="${cy}" r="${r}" fill="${face}" stroke="#0a0a0a" stroke-width="4"/>
    <circle cx="${cx}" cy="${cy}" r="${e}" fill="none" stroke="#191606" stroke-width="6" stroke-dasharray="${dash} ${dash}" opacity=".85"/>
    <circle cx="${cx}" cy="${cy}" r="${r * 0.7}" fill="none" stroke="#191606" stroke-width="1.5" opacity=".22"/>`;
};
const ko = "Geist, 'Apple SD Gothic Neo', 'Noto Sans KR', 'Noto Sans CJK KR', 'Malgun Gothic', sans-serif";

await render(
  `<div style="position:relative;width:1200px;height:630px;background:#0a0a0a;color:#f2f1ed;font-family:${ko};overflow:hidden">
    <div style="position:absolute;left:84px;top:118px">
      <div style="font-size:104px;font-weight:800;line-height:1.08;letter-spacing:-3px">
        <div style="display:flex;align-items:center">
          <span style="position:relative;display:inline-grid;place-items:center;width:130px;height:104px;margin-right:30px">
            <svg viewBox="0 0 120 120" style="position:absolute;left:0;top:-39px;width:156px;height:156px;overflow:visible">
              ${chipSvg(76, 44, 36, '#d2b726')}${chipSvg(50, 70, 42, '#f5db2b')}
            </svg>
          </span>베팅
        </div>
        <div>시뮬레이터</div>
      </div>
      <div style="margin-top:34px;font-size:38px;line-height:1.35;color:#bdbcb7;letter-spacing:-1px">칩은 폰으로, 카드는 테이블에서.</div>
      <div style="margin-top:34px;font-size:24px;color:#8d8c87">chip-poker.pages.dev</div>
    </div>
    <div style="position:absolute;right:90px;top:70px;width:340px;height:640px;border-radius:52px;background:#141414;box-shadow:0 0 0 10px #232323, 0 40px 80px rgba(0,0,0,.6);overflow:hidden">
      <div style="padding:40px 30px 0">
        <div style="font-size:15px;color:#a9a8a3">팟</div>
        <div style="font-size:84px;font-weight:560;letter-spacing:-4px;line-height:1">1,240</div>
        <div style="margin-top:14px;display:flex;gap:10px;align-items:center;font-size:17px;color:#bdbcb7">
          <span style="background:#f5db2b;color:#191606;font-weight:650;padding:5px 12px;border-radius:99px">턴 오픈</span> 내 액션
        </div>
        <div style="margin-top:22px">${seat('지훈', 'D · 액션', '3,420', true)}${seat('민수', 'SB', '1,875', false)}</div>
      </div>
      <div style="position:absolute;left:0;right:0;bottom:0;height:200px;background:#f5db2b;color:#191606;padding:22px 26px">
        <div style="font-size:28px;font-weight:700;letter-spacing:-.5px">내 차례</div>
        <div style="font-size:16px;opacity:.8">콜 620</div>
        <div style="display:grid;grid-template-columns:1fr 1.35fr 1fr;gap:8px;margin-top:16px">
          <div style="border:2px solid rgba(25,22,6,.5);border-radius:14px;height:54px;display:grid;place-items:center;font-weight:650;font-size:18px">폴드</div>
          <div style="background:#191606;color:#f5db2b;border-radius:14px;height:54px;display:grid;place-items:center;font-weight:650;font-size:18px">콜 620</div>
          <div style="border:2px solid rgba(25,22,6,.5);border-radius:14px;height:54px;display:grid;place-items:center;font-weight:650;font-size:18px">레이즈</div>
        </div>
      </div>
    </div>
  </div>`,
  1200,
  630,
  'og.png',
);

await browser.close();
