import { defineConfig, devices } from '@playwright/test';

const VERIFY_DIR = '.verify';
const SCREENSHOT_TIMEOUT_MS = 30_000;

export default defineConfig({
  testDir: '.',
  testMatch: /screens\.verify\.ts$/,
  outputDir: `../../${VERIFY_DIR}/results`,
  snapshotPathTemplate: `../../${VERIFY_DIR}/snapshots/{projectName}/{arg}{ext}`,
  fullyParallel: true,
  retries: 0,
  reporter: [
    ['list'],
    ['html', { outputFolder: `../../${VERIFY_DIR}/report`, open: 'never' }],
  ],
  expect: {
    timeout: SCREENSHOT_TIMEOUT_MS,
    toHaveScreenshot: {
      animations: 'disabled',
      caret: 'hide',
      maxDiffPixels: 0,
    },
  },
  use: {
    baseURL: process.env.VERIFY_BASE_URL,
    locale: 'ko-KR',
    timezoneId: 'Asia/Seoul',
    reducedMotion: 'reduce',
  },
  projects: [
    {
      name: 'mobile',
      use: { ...devices['iPhone 13'], defaultBrowserType: 'chromium' },
    },
    { name: 'desktop', use: { viewport: { width: 1280, height: 900 } } },
  ],
});
