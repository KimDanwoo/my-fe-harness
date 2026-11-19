import { expect, test, type Page } from '@playwright/test';

import { FIXED_NOW, ROUTES, screenName } from './screens';

const SETTLE_MS = 400;
const SCROLL_STEP_MS = 120;
const SCREEN_SETTLE_MS = 800;

async function loadLazyImages(page: Page) {
  await page.evaluate(async (stepMs) => {
    for (let y = 0; y < document.body.scrollHeight; y += window.innerHeight) {
      window.scrollTo(0, y);
      await new Promise((resolve) => setTimeout(resolve, stepMs));
    }
    window.scrollTo(0, 0);
  }, SCROLL_STEP_MS);
  await page.waitForFunction(() =>
    Array.from(document.images).every((image) => image.complete),
  );
}

async function settle(page: Page, ms = SETTLE_MS) {
  await page.waitForLoadState('networkidle');
  await loadLazyImages(page);
  await page.waitForLoadState('networkidle');
  await page.waitForTimeout(ms);
}

async function pageMetrics(page: Page) {
  return page.evaluate(() => ({
    height: document.documentElement.scrollHeight,
    viewport: window.innerHeight,
  }));
}

// fullPage 캡처는 Chromium이 화면 높이를 페이지 높이로 늘려 찍어 vh·ResizeObserver가 다시 계산된다 — 사용자가 보는 크기로 스크롤하며 한 화면씩 찍는다. 스크롤에 반응하는 지연 UI(스크롤 안내 숨김 등)가 끝난 뒤 찍도록 화면마다 기다린다
async function expectPageScreens(page: Page, name: string) {
  const { height, viewport } = await pageMetrics(page);
  expect(`${height}`).toMatchSnapshot(`${name}-height.txt`);
  const screenCount = Math.ceil(height / viewport);
  for (let index = 0; index < screenCount; index += 1) {
    await page.evaluate((top) => window.scrollTo(0, top), index * viewport);
    await page.waitForTimeout(SCREEN_SETTLE_MS);
    await expect(page).toHaveScreenshot(`${name}-${index + 1}.png`);
  }
}

test.beforeEach(async ({ page }) => {
  await page.clock.setFixedTime(new Date(FIXED_NOW));
});

for (const route of ROUTES) {
  test(`화면 ${route}`, async ({ page }) => {
    await page.goto(route);
    await settle(page);
    await expectPageScreens(page, screenName(route));
  });
}
