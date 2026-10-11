import { defineConfig, devices } from '@playwright/test';

// Mocked local acceptance only. No RPC, signing or broadcast reaches a real chain.
export default defineConfig({
  testDir: './tests',
  testIgnore: ['**/solana/**', '**/integration/**'],
  fullyParallel: false,
  workers: 1,
  outputDir: process.env.PACT_QA_MODE === 'setup' ? './test-results/setup' : './test-results/fixture',
  timeout: 35_000,
  expect: {timeout: 10_000},
  reporter: [['list'], ['html', {open: 'never', outputFolder: process.env.PACT_QA_MODE === 'setup' ? 'playwright-report/setup' : 'playwright-report/fixture'}]],
  use: {baseURL: 'http://127.0.0.1:3001', trace: 'retain-on-failure', screenshot: 'only-on-failure'},
  projects: [
    {name: 'desktop-chromium', use: {...devices['Desktop Chrome']}},
    {name: 'mobile-chromium', use: {...devices['Pixel 7']}},
  ],
  webServer: {
    command: 'node tests/start-server.mjs',
    url: 'http://127.0.0.1:3001',
    reuseExistingServer: false,
    timeout: 120_000,
  },
});
