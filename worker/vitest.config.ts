import path from 'node:path';
import { cloudflareTest } from '@cloudflare/vitest-pool-workers';
import { defineConfig } from 'vitest/config';

export default defineConfig({
  root: import.meta.dirname,
  plugins: [
    cloudflareTest({
      wrangler: { configPath: path.join(import.meta.dirname, 'wrangler.jsonc') },
      // 테스트는 바로바로 행동해야 해서 딜러 대기 시간을 꺼요 (잠금 자체는 따로 테스트)
      miniflare: { bindings: { DEAL_LOCK_OFF: '1' } },
    }),
  ],
  test: {
    include: ['test/**/*.test.ts'],
    testTimeout: 20_000,
  },
});
