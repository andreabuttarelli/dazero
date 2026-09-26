import { test, expect, REAL_STACK, gotoHydrated, createE2eSession, teardownE2eSession, signInE2e } from './fixtures/session';

/**
 * LA TELA, DAL VERO BROWSER — due percorsi critici, non una copertura esaustiva. @real: richiede
 * uno stack disposable (E2E_REAL_STACK=1), lo stesso cancello di `onboarding.real.spec.ts` — qui
 * in più la sessione crea org/progetto/tela veri e li smonta in `finally` (vedi
 * fixtures/session.ts).
 */
test.describe('canvas @real', () => {
  test.skip(!REAL_STACK, 'richiede uno stack disposable: E2E_REAL_STACK=1');

  test('la tela si apre senza 500 e senza overlay di errore', async ({ page, session }) => {
    const consoleErrors: string[] = [];
    page.on('console', (msg) => {
      if (msg.type() === 'error') consoleErrors.push(msg.text());
    });

    const response = await gotoHydrated(page, `/p/${session.projectId}/c/${session.canvasId}`);

    if (response) expect(response.status()).toBeLessThan(400);
    await expect(page.locator('vite-error-overlay')).toHaveCount(0);
    await expect(page.locator('.svelte-flow')).toBeVisible();
    expect(consoleErrors, `console errors on canvas load: ${consoleErrors.join('\n')}`).toEqual([]);
  });

  test('un nodo testo genera davvero: prompt, Genera, il giro arriva a done', async ({ page, session }) => {
    test.skip(!process.env.OPENROUTER_API_KEY, 'OPENROUTER_API_KEY assente: salto la chiamata reale, unico step a pagamento');

    await gotoHydrated(page, `/p/${session.projectId}/c/${session.canvasId}`);
    await page.getByRole('button', { name: 'Testo' }).click();

    const node = page.locator('.svelte-flow__node').last();
    await node.click();

    // Il bottone resta spento senza un modello scelto (`blockedReason`, `gen-history.ts`): un
    // nodo testo non ne ha uno di default, il menù compare solo da nodo selezionato.
    await node.getByLabel('Modello').selectOption({ index: 1 });
    await node.getByPlaceholder('Di cosa deve parlare…').fill('Scrivi una sola parola: pronto.');
    await node.getByRole('button', { name: 'Genera' }).click();

    await expect(node.locator('.gen-text')).not.toBeEmpty({ timeout: 60_000 });
  });

  test('a zero-credit org sees a readable message, not a generic save failure', async ({ page }) => {
    const session = await createE2eSession({ withCredits: false });
    try {
      await signInE2e(page, session);
      await gotoHydrated(page, `/p/${session.projectId}/c/${session.canvasId}`);
      await page.getByRole('button', { name: 'Testo' }).click();

      const node = page.locator('.svelte-flow__node').last();
      await node.click();
      await node.getByLabel('Modello').selectOption({ index: 1 });
      await node.getByPlaceholder('Di cosa deve parlare…').fill('Scrivi una sola parola: pronto.');
      await node.getByRole('button', { name: 'Genera' }).click();

      await expect(page.getByRole('alert')).toContainText(/credit/i, { timeout: 15_000 });
      await expect(page.getByRole('link', { name: 'Buy credits' })).toBeVisible();
    } finally {
      await teardownE2eSession(session);
    }
  });
});
