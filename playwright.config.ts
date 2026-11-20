import { defineConfig, devices } from '@playwright/test';

const port = 5173;

export default defineConfig({
  testDir: 'e2e',
  testMatch: '*.spec.ts',
  timeout: 60_000,
  fullyParallel: false,
  workers: 1,
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? [['github'], ['list']] : 'list',
  use: {
    baseURL: `http://localhost:${port}`,
    trace: 'retain-on-failure',
    reducedMotion: 'reduce',
    ...(process.env.CI ? {} : { channel: 'chrome' }),
  },
  projects: [{ name: 'phone', use: { ...devices['iPhone 14 Pro Max'], defaultBrowserType: 'chromium' } }],
  webServer: {
    // 딜러 대기 시간(스트리트마다 2.5~8초)을 끈 서버로 돌려요. 안 그러면 테스트가 두 배로 느려져요.
    // (대기 시간 자체는 worker 테스트와 단위 테스트에서 확인)
    command: 'npm run dev:e2e',
    url: `http://localhost:${port}/api/health`,
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
  },
});
