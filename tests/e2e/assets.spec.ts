import { test, expect, REAL_STACK, gotoHydrated } from './fixtures/session';

/**
 * LA LIBRERIA ASSET DEL PROGETTO. Elenca, filtra per sorgente, e un documento caricato diventa un
 * nodo `doc` quando trascinato sulla tela — la stessa tabella `data.items` che `ProjectDragPanel`
 * legge nella sidebar, qui letta dalla sua pagina dedicata.
 */
test.describe('assets @real', () => {
  test.skip(!REAL_STACK, 'richiede uno stack disposable: E2E_REAL_STACK=1');

  test('vuota: stato "Nothing here yet", non un errore', async ({ page, session }) => {
    const response = await gotoHydrated(page, `/p/${session.projectId}/assets`);

    expect(response?.status()).toBe(200);
    await expect(page.getByRole('heading', { name: 'Nothing here yet' })).toBeVisible();
  });

  test('elenca un asset caricato e il filtro Uploaded lo trova', async ({ page, session, admin }) => {
    await seedUploadAsset(admin, session);

    await gotoHydrated(page, `/p/${session.projectId}/assets`);
    await expect(page.locator('.grid .tile')).toHaveCount(1);
    await expect(page.locator('.grid .tile .badge')).toHaveText('uploaded');

    await page.getByRole('link', { name: 'Uploaded' }).click();
    await expect(page).toHaveURL(/source=upload/);
    await expect(page.locator('.grid .tile')).toHaveCount(1);

    await page.getByRole('link', { name: 'Generated' }).click();
    await expect(page).toHaveURL(/source=generated/);
    await expect(page.locator('.empty')).toBeVisible();
  });

  test('caricare un documento lo elenca, e trascinarlo sulla tela crea un nodo doc', async ({ page, session }) => {
    await gotoHydrated(page, `/p/${session.projectId}/assets`);

    const fileChooserPromise = page.waitForEvent('filechooser');
    await page.getByRole('button', { name: 'Upload' }).click();
    const fileChooser = await fileChooserPromise;
    await fileChooser.setFiles({
      name: 'e2e-notes.txt',
      mimeType: 'text/plain',
      buffer: Buffer.from('Notes for the e2e assets spec.')
    });

    await expect(page.locator('.grid .tile')).toHaveCount(1, { timeout: 15_000 });
    await expect(page.locator('.grid .tile .text-preview')).toContainText('Notes for the e2e assets spec');

    await gotoHydrated(page, `/p/${session.projectId}/c/${session.canvasId}`);
    await page.getByRole('button', { name: 'Assets', exact: true }).click();

    const docTile = page.locator('.left-panel .tile').first();
    await expect(docTile).toBeVisible({ timeout: 10_000 });

    const nodesBefore = await page.locator('.svelte-flow__node').count();
    await dragAndDrop(page, docTile, page.locator('.svelte-flow__pane'));

    await expect(page.locator('.svelte-flow__node')).toHaveCount(nodesBefore + 1);
  });
});

async function seedUploadAsset(
  admin: import('@supabase/supabase-js').SupabaseClient,
  session: { orgId: string; projectId: string }
): Promise<void> {
  const { randomUUID } = await import('node:crypto');
  const path = `${session.orgId}/${session.projectId}/${randomUUID()}-seed.png`;
  const { error: uploadError } = await admin.storage
    .from('canvas-assets')
    .upload(path, onePixelPng(), { contentType: 'image/png' });
  if (uploadError) throw new Error(uploadError.message);

  const { error } = await admin.from('assets').insert({
    org_id: session.orgId,
    project_id: session.projectId,
    type: 'image',
    source: 'upload',
    url: path,
    mime_type: 'image/png',
    bytes: onePixelPng().length
  });
  if (error) throw new Error(error.message);
}

async function dragAndDrop(
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
