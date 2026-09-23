import { test, expect, REAL_STACK, gotoHydrated } from './fixtures/session';

/**
 * LA TELA, DAL VERO BROWSER. @real: richiede uno stack disposable (E2E_REAL_STACK=1), lo stesso
 * cancello di `onboarding.real.spec.ts` — qui in più la sessione crea org/progetto/tela veri e li
 * smonta in `finally` (vedi fixtures/session.ts).
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

  test('la barra in basso crea un nodo del tipo su cui si clicca', async ({ page, session }) => {
    await gotoHydrated(page, `/p/${session.projectId}/c/${session.canvasId}`);

    await expect(page.getByRole('button', { name: 'Testo' })).toBeVisible();
    const nodesBefore = await page.locator('.svelte-flow__node').count();

    await page.getByRole('button', { name: 'Testo' }).click();

    await expect(page.locator('.svelte-flow__node')).toHaveCount(nodesBefore + 1);
  });

  test('un nodo testo genera davvero: prompt, Genera, il giro arriva a done', async ({ page, session }) => {
    test.skip(!process.env.OPENROUTER_API_KEY, 'OPENROUTER_API_KEY assente: salto la chiamata reale, unico step a pagamento');

    await gotoHydrated(page, `/p/${session.projectId}/c/${session.canvasId}`);
    await page.getByRole('button', { name: 'Testo' }).click();

    const node = page.locator('.svelte-flow__node').last();
    await node.click();

    await node.getByPlaceholder('Di cosa deve parlare…').fill('Scrivi una sola parola: pronto.');
    await node.getByRole('button', { name: 'Genera' }).click();

    await expect(node.locator('.gen-text')).not.toBeEmpty({ timeout: 60_000 });
  });

  test('un nodo immagine con modello sincronizzato mostra più porte tipizzate', async ({ page, session, admin }) => {
    const node = await createGenNode(admin, session, 'image');
    await gotoHydrated(page, `/p/${session.projectId}/c/${session.canvasId}`);

    const tile = page.locator(`[data-id="${node.id}"]`);
    await tile.click();

    const modelSelect = tile.getByLabel('Modello');
    await expect(modelSelect).toBeVisible();

    const options = await modelSelect.locator('option').all();
    const withMultiFrame = await findModelWithMultipleConnectors(modelSelect, options);
    test.skip(!withMultiFrame, 'nessun modello sincronizzato in questo stack dichiara più di una porta di ingresso');

    if (withMultiFrame) {
      await modelSelect.selectOption(withMultiFrame);
    }

    const handles = tile.locator('.svelte-flow__handle[aria-label]');
    const handleCount = await handles.count();
    expect(handleCount).toBeGreaterThan(1);

    await handles.first().hover();
    await expect(handles.first()).toHaveAttribute('aria-label', /.+/);

    await page.screenshot({ path: 'test-results/canvas-typed-ports.png' });
  });

  test('caricare un\'immagine piccola dalla barra crea un nodo statico e appare negli Assets', async ({ page, session }) => {
    await gotoHydrated(page, `/p/${session.projectId}/c/${session.canvasId}`);

    const nodesBefore = await page.locator('.svelte-flow__node').count();

    const fileChooserPromise = page.waitForEvent('filechooser');
    await page.getByRole('button', { name: 'Carica file' }).click();
    const fileChooser = await fileChooserPromise;
    await fileChooser.setFiles({
      name: 'e2e-upload.png',
      mimeType: 'image/png',
      buffer: onePixelPng()
    });

    await expect(page.locator('.svelte-flow__node')).toHaveCount(nodesBefore + 1, { timeout: 15_000 });
    await expect(page.locator('.uploaded img').last()).toBeVisible();

    await gotoHydrated(page, `/p/${session.projectId}/assets`);
    await expect(page.locator('.grid .tile .badge')).toContainText('uploaded', { timeout: 10_000 });
  });

  test('trascinare un asset del progetto sulla tela crea una tile piena, non vuota', async ({ page, session, admin }) => {
    const asset = await seedImageAsset(admin, session);
    await gotoHydrated(page, `/p/${session.projectId}/c/${session.canvasId}`);

    await page.getByRole('button', { name: 'Assets', exact: true }).click();
    const sourceTile = page.locator('.left-panel .tile').first();
    await expect(sourceTile).toBeVisible({ timeout: 10_000 });

    const nodesBefore = await page.locator('.svelte-flow__node').count();
    await dragAndDropFilledNode(page, sourceTile, page.locator('.svelte-flow__pane'));

    await expect(page.locator('.svelte-flow__node')).toHaveCount(nodesBefore + 1);
    const newTile = page.locator('.svelte-flow__node').last();
    await expect(newTile.locator('.uploaded img, img')).toBeVisible({ timeout: 10_000 });

    void asset;
  });

  test('gli angoli sono squadrati: nessun border-radius sui chrome principali', async ({ page, session }) => {
    await gotoHydrated(page, `/p/${session.projectId}/c/${session.canvasId}`);

    const selectors = ['.add-bar', '.rail', '.svelte-flow__node'];
    for (const selector of selectors) {
      const el = page.locator(selector).first();
      if ((await el.count()) === 0) continue;
      const radius = await el.evaluate((node) => getComputedStyle(node).borderRadius);
      expect(radius, `${selector} border-radius`).toBe('0px');
    }
  });
});

async function createGenNode(
  admin: import('@supabase/supabase-js').SupabaseClient,
  session: { orgId: string; projectId: string; canvasId: string; userId: string },
  medium: 'text' | 'image' | 'video'
): Promise<{ id: string; version: number }> {
  const { randomUUID } = await import('node:crypto');
  const id = randomUUID();
  const { data, error } = await admin
    .from('nodes')
    .insert({
      id,
      org_id: session.orgId,
      project_id: session.projectId,
      canvas_id: session.canvasId,
      type: medium,
      x: 0,
      y: 0,
      data: { medium, prompt: '', model: null, params: {}, running: false, error: null },
      actor_kind: 'user',
      actor_id: session.userId
    })
    .select('id, version')
    .single();
  if (error) throw new Error(error.message);
  return data as { id: string; version: number };
}

async function findModelWithMultipleConnectors(
  select: import('@playwright/test').Locator,
  options: import('@playwright/test').Locator[]
): Promise<string | null> {
  for (const option of options) {
    const value = await option.getAttribute('value');
    if (!value) continue;
    await select.selectOption(value);
    const count = await select.page().locator('.svelte-flow__handle[aria-label]').count();
    if (count > 1) return value;
  }
  return null;
}

async function seedImageAsset(
  admin: import('@supabase/supabase-js').SupabaseClient,
  session: { orgId: string; projectId: string; canvasId: string; userId: string }
): Promise<{ id: string }> {
  const { randomUUID } = await import('node:crypto');
  const path = `${session.orgId}/${session.projectId}/${randomUUID()}-seed.png`;
  const { error: uploadError } = await admin.storage
    .from('canvas-assets')
    .upload(path, onePixelPng(), { contentType: 'image/png' });
  if (uploadError) throw new Error(uploadError.message);

  const { data, error } = await admin
    .from('assets')
    .insert({
      org_id: session.orgId,
      project_id: session.projectId,
      type: 'image',
      source: 'upload',
      url: path,
      mime_type: 'image/png',
      bytes: onePixelPng().length
    })
    .select('id')
    .single();
  if (error) throw new Error(error.message);
  return data as { id: string };
}

async function dragAndDropFilledNode(
  page: import('@playwright/test').Page,
  source: import('@playwright/test').Locator,
  target: import('@playwright/test').Locator
): Promise<void> {
  const sourceBox = await source.boundingBox();
  const targetBox = await target.boundingBox();
  if (!sourceBox || !targetBox) throw new Error('drag: bounding box mancante');

  await page.evaluate(
    ({ sx, sy, tx, ty }) => {
      const dt = new DataTransfer();
      const el = document.elementFromPoint(sx, sy);
      el?.dispatchEvent(new DragEvent('dragstart', { bubbles: true, cancelable: true, dataTransfer: dt }));
      const dropTarget = document.elementFromPoint(tx, ty);
      dropTarget?.dispatchEvent(new DragEvent('dragover', { bubbles: true, cancelable: true, dataTransfer: dt, clientX: tx, clientY: ty }));
      dropTarget?.dispatchEvent(new DragEvent('drop', { bubbles: true, cancelable: true, dataTransfer: dt, clientX: tx, clientY: ty }));
    },
    {
      sx: sourceBox.x + sourceBox.width / 2,
      sy: sourceBox.y + sourceBox.height / 2,
      tx: targetBox.x + targetBox.width / 2,
      ty: targetBox.y + targetBox.height / 2
    }
  );
}

function onePixelPng(): Buffer {
  return Buffer.from(
    'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=',
    'base64'
  );
}
