import { expect, test, type Page } from '@playwright/test';

import { FIXED_NOW, ROUTES, screenName } from './screens';

const SETTLE_MS = 400;
const SCROLL_STEP_MS = 120;

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

test.beforeEach(async ({ page }) => {
  await page.clock.setFixedTime(new Date(FIXED_NOW));
});

for (const route of ROUTES) {
  test(`화면 ${route}`, async ({ page }) => {
    await page.goto(route);
    await settle(page);
    await expect(page).toHaveScreenshot(`${screenName(route)}.png`, {
      fullPage: true,
    });
  });
}
