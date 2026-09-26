import { test, expect } from '@playwright/test';

const SIGN_IN = { name: 'Sign in', exact: true };

async function pointerEvents(page: import('@playwright/test').Page): Promise<string> {
  return page.getByRole('button', SIGN_IN).evaluate((el) => getComputedStyle(el).pointerEvents);
}

test('before hydration the controls refuse clicks instead of swallowing them', async ({ page }) => {
  await page.route('**/*', (route) =>
    route.request().resourceType() === 'script' ? route.abort() : route.continue()
  );

  await page.goto('/login');

  await expect(page.locator('html')).toHaveAttribute('data-hydrating', '');
  expect(await pointerEvents(page)).toBe('none');
});

test('once hydrated the controls take clicks again', async ({ page }) => {
  await page.goto('/login');

  await expect(page.locator('html')).not.toHaveAttribute('data-hydrating', '');
  expect(await pointerEvents(page)).toBe('auto');
});

test.describe('without JavaScript', () => {
  test.use({ javaScriptEnabled: false });

  test('the plain forms stay usable', async ({ page }) => {
    await page.goto('/login');

    await expect(page.locator('html')).not.toHaveAttribute('data-hydrating', '');
    expect(await pointerEvents(page)).toBe('auto');
  });
});
