import { randomUUID } from 'node:crypto';
import { test, expect, REAL_STACK, gotoHydrated } from './fixtures/session';

/**
 * IL CHECKBOX DELL'ACCOUNT NEL CALENDARIO, DAL FOGLIO FLOTTANTE — smoke test per il difetto
 * documentato in LESSONS.md ("un checkbox il cui `onchange` non parte mai"): il DOM segna
 * `.checked` ma nessun handler Svelte gira, quindi lo Schedule resta spento per sempre. Questo
 * spec prova il sintomo dell'utente (bottone Schedule) invece del dettaglio implementativo
 * (`onclick` chiamato): è quello che rompe davvero la programmazione dalla UI.
 */
test.describe('calendar checkbox @real', () => {
  test.skip(!REAL_STACK, 'richiede uno stack disposable: E2E_REAL_STACK=1');

  test.setTimeout(60_000);

  test('spuntare un account nel foglio Calendar abilita Schedule', async ({ page, session, admin }) => {
    const brandId = randomUUID();
    await admin.from('brands').insert({ id: brandId, org_id: session.orgId, name: 'E2E brand', slug: `e2e-brand-${brandId}` });
    await admin.from('projects').update({ brand_id: brandId }).eq('id', session.projectId);
    await admin.from('social_accounts').insert({
      id: randomUUID(),
      org_id: session.orgId,
      brand_id: brandId,
      platform: 'instagram',
      zernio_account_id: `zern-${randomUUID()}`,
      status: 'connected',
      handle: 'e2e_handle'
    });
    await admin.from('posts').insert({
      id: randomUUID(),
      org_id: session.orgId,
      brand_id: brandId,
      caption: 'Post e2e per il checkbox',
      media: []
    });

    await gotoHydrated(page, `/p/${session.projectId}/c/${session.canvasId}`);
    await page.getByRole('button', { name: 'Calendar' }).click();
    await expect(page.getByRole('dialog')).toBeVisible();

    const scheduleButton = page.getByRole('button', { name: 'Schedule' });
    await expect(scheduleButton).toBeDisabled();

    await page.getByRole('checkbox').first().click();

    await expect(scheduleButton).toBeEnabled();
  });
});
