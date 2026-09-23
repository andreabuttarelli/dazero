import { test, expect, REAL_STACK, gotoHydrated } from './fixtures/session';

/**
 * IMPOSTAZIONI DEL BRAND: un progetto nasce senza brand (`projects.brand_id` nullable, il caso
 * normale — vedi CLAUDE.md), e questa pagina deve mostrare lo stato vuoto scegli/crea, MAI un
 * 400. Poi crea un brand, controlla che il form abbia tutti i campi, salva e verifica che
 * persista dopo un reload.
 */
test.describe('settings brand @real', () => {
  test.skip(!REAL_STACK, 'richiede uno stack disposable: E2E_REAL_STACK=1');

  test('progetto senza brand: stato vuoto scegli/crea, non un 400', async ({ page, session }) => {
    await gotoHydrated(page, `/p/${session.projectId}/settings/brand`);

    await expect(page.getByRole('heading', { name: 'No brand yet' })).toBeVisible();
    await expect(page.locator('form[action="?/createBrand"]')).toBeVisible();
    await expect(page.locator('input[name="name"]')).toBeVisible();
  });

  test('creare un brand porta al form con tutti i campi, editabile e persistente', async ({ page, session }) => {
    await gotoHydrated(page, `/p/${session.projectId}/settings/brand`);

    const brandName = `E2E brand ${Date.now().toString(36)}`;
    await page.locator('form[action="?/createBrand"] input[name="name"]').fill(brandName);
    await page.locator('form[action="?/createBrand"] button[type="submit"]').click();

    await expect(page.getByRole('heading', { name: 'Brand', exact: true })).toBeVisible({ timeout: 10_000 });

    await expect(page.locator('.logo-upload')).toBeVisible();
    const nameInput = page.locator('.edit-form input[name="name"]');
    const slugInput = page.locator('.edit-form input:disabled');
    const websiteInput = page.locator('.edit-form input[name="website"]');
    const shortDescInput = page.locator('.edit-form input[name="short_description"]');
    const contentInput = page.locator('.edit-form textarea[name="content"]');

    await expect(nameInput).toHaveValue(brandName);
    await expect(slugInput).toBeVisible();
    await expect(websiteInput).toBeVisible();
    await expect(shortDescInput).toBeVisible();
    await expect(contentInput).toBeVisible();

    await nameInput.fill(`${brandName} edited`);
    await websiteInput.fill('https://example.com');
    await shortDescInput.fill('A test brand, edited');
    await contentInput.fill('Some content about the brand, written by the e2e spec.');
    await page.locator('.edit-form button[type="submit"]').click();

    await expect(page.locator('.msg.ok')).toBeVisible({ timeout: 10_000 });

    await page.reload();
    await expect(page.locator('.edit-form input[name="name"]')).toHaveValue(`${brandName} edited`);
    await expect(page.locator('.edit-form input[name="website"]')).toHaveValue('https://example.com');
    await expect(page.locator('.edit-form input[name="short_description"]')).toHaveValue('A test brand, edited');

    await page.screenshot({ path: 'test-results/settings-brand-empty-state.png' });
  });
});
