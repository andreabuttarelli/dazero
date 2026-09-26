/**
 * UN COLORE DEL CONTENT DIVENTA UN'IMMAGINE DA TRASCINARE — la stessa dottrina del logo del
 * brand (`brands/+page.server.ts`): `dragstart` è sincrono, quindi lo swatch nasce PRIMA che il
 * puntatore parta, non al volo. `media` è il bucket pubblico dei loghi (`settings-actions.ts`,
 * `studio-actions.ts`) — uno swatch ci sta accanto, senza bisogno del bucket privato
 * `canvas-assets` che chiede un `canvasId` che il pannello dei brand e il wizard non hanno.
 * Pubblico per necessità, non per comodità: `assets.url` qui è un URL DUREVOLE consegnato al
 * browser (mai firmato al momento della lettura, come `generated`/`upload`), perché lo swatch
 * deve restare trascinabile ore o giorni dopo che la pagina che l'ha aperto è chiusa.
 *
 * IDEMPOTENTE PER COLORE, NON PER CHIAMATA — `colourSwatchPath` è una funzione pura dell'org e
 * dell'hex: lo stesso colore trascinato da due brand diversi della stessa org scrive lo stesso
 * file, e `findOrCreateImportedAsset` (già usato per i loghi) trova la riga `imported` invece di
 * duplicarla.
 */
import sharp from 'sharp';
import type { Db } from '$lib/server/db/client';
import { findOrCreateImportedAsset, type Asset } from '$lib/server/repos/assets';
import { parseChipColourRgb } from '$lib/canvas/brand-content-chips';

const SWATCH_SIZE = 128;

function fileStemOf(raw: string): string {
  return raw
    .replace(/^#/, '')
    .replace(/[^a-z0-9]+/gi, '-')
    .replace(/^-+|-+$/g, '')
    .toLowerCase();
}

export function colourSwatchPath(orgId: string, raw: string): string {
  return `colours/${orgId}/${fileStemOf(raw)}.png`;
}

export function colourSwatchUrl(bucketPublicOrigin: string, orgId: string, raw: string): string {
  return `${bucketPublicOrigin}${colourSwatchPath(orgId, raw)}`;
}

export type ColourAsset = { asset: Asset; url: string };

/**
 * TROVA O CREA — la riga in `assets` E il file nel bucket, insieme: un asset `imported` con `url`
 * che punta a un file assente sarebbe un nodo che nasce rotto sulla tela. `findOrCreateImportedAsset`
 * decide se la riga esiste già dall'URL pubblico, quindi il file va scritto (upsert, idempotente
 * anche lui) PRIMA di chiamarla — un secondo trascinamento dello stesso colore riscrive lo stesso
 * file e trova la stessa riga.
 */
export async function findOrCreateColourAsset(db: Db, input: { orgId: string; hex: string }): Promise<ColourAsset | null> {
  const rgb = parseChipColourRgb(input.hex);
  if (!rgb) {
    return null;
  }

  const path = colourSwatchPath(input.orgId, input.hex);
  const png = await sharp({
    create: { width: SWATCH_SIZE, height: SWATCH_SIZE, channels: 3, background: rgb }
  })
    .png()
    .toBuffer();

  const { error: uploadError } = await db.storage.from('media').upload(path, png, {
    contentType: 'image/png',
    upsert: true
  });
  if (uploadError) {
    throw uploadError;
  }

  const url = db.storage.from('media').getPublicUrl(path).data.publicUrl;
  const asset = await findOrCreateImportedAsset(db, { orgId: input.orgId, type: 'image', url, mimeType: 'image/png' });

  return { asset, url };
}
