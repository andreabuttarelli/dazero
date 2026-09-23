import { test, expect, REAL_STACK } from './fixtures/session';

/**
 * UN SOLO SMOKE E2E PER LA SHELL DEL PROGETTO: apri il progetto → atterri sulla tela → la rail
 * c'è → Calendar si apre come foglio con la sua URL → Esc torna alla tela esattamente com'era.
 *
 * Il resto della copertura (ogni voce della rail, ogni pagina dentro un foglio, il redirect di
 * home) sta a livello unitario — `shell-nav.test.ts`, `sheet-nav.test.ts`, `sheet-pages.test.ts`,
 * `home-redirect.test.ts` — dove non serve un browser reale per essere vera. Playwright qui
 * prova solo che il filo intero (routing reale, sessione reale, DOM reale) tiene per il percorso
 * che un utente farebbe per primo.
 */
test.skip(!REAL_STACK, 'richiede uno stack disposable con utente/org/progetto seminati: E2E_REAL_STACK=1');

test.setTimeout(60_000);

test('apri il progetto, la rail c\'è, Calendar si apre come foglio ed Esc torna alla tela', async ({ page, session }) => {
  await page.goto(`/p/${session.projectId}`);
  await page.waitForURL(new RegExp(`/p/${session.projectId}/c/`));
  const canvasUrl = page.url();

  await expect(page.getByRole('button', { name: 'Assets' })).toBeVisible();

  await page.getByRole('button', { name: 'Calendar' }).click();

  await expect(page).toHaveURL(`${new URL(canvasUrl).origin}/p/${session.projectId}/calendar`);
  await expect(page.getByRole('dialog')).toBeVisible();

  await page.keyboard.press('Escape');

  await expect(page).toHaveURL(canvasUrl);
  await expect(page.getByRole('dialog')).not.toBeVisible();
});
