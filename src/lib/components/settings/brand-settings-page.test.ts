import { existsSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { SETTINGS_GROUPS, SETTINGS_SECTIONS } from './platforms';

const read = (rel: string) => readFileSync(fileURLToPath(new URL(rel, import.meta.url)), 'utf8');
const routeDir = (section: string) =>
  fileURLToPath(new URL(`../../../routes/p/[projectId]/settings/${section}`, import.meta.url));

/**
 * `brands` was cut down to logo, name, slug, website, short description, content — no palette,
 * target audience, voice, hashtags, fonts, platforms, timezone. The routes that edited those
 * fields (and the `people` / talent feature) are gone with the columns; this test keeps them
 * from coming back as a dangling route, a nav entry or a dead link in the warnings banner.
 */
const REMOVED = ['platforms', 'hashtags', 'voice-examples', 'timezone', 'people'];

describe('la pagina brand mostra solo le colonne vere', () => {
  it('non lascia in piedi le rotte delle colonne cancellate', () => {
    for (const section of REMOVED) {
      expect(existsSync(routeDir(section)), `settings/${section} esiste ancora`).toBe(false);
    }
  });

  it('non le lascia nemmeno negli elenchi che disegnano la navigazione', () => {
    const listed = [
      ...SETTINGS_SECTIONS,
      ...SETTINGS_GROUPS.flatMap((g) => g.items.map((i) => i.section))
    ];
    for (const section of REMOVED) {
      expect(listed, `${section} è ancora in nav`).not.toContain(section);
    }
  });

  it('la pagina brand edita solo i campi reali di brands', () => {
    const page = read('../../../routes/p/[projectId]/settings/brand/+page.svelte');

    for (const field of ['name', 'website', 'short_description', 'content']) {
      expect(page, `manca il campo ${field}`).toContain(`name="${field}"`);
    }
    expect(page).not.toContain('StudioPage');
    expect(page).not.toContain('BrandTimezone');
  });

  it('mostra uno stato vuoto quando il progetto non ha un brand', () => {
    const page = read('../../../routes/p/[projectId]/settings/brand/+page.svelte');
    expect(page).toContain('!data.brand');
  });

  /**
   * Un avviso che punta a una rotta cancellata è un 404 che non fallisce nessun test di import:
   * il link è una stringa. `dead-links.test.ts` tiene fermo che nessun link vivo punti a una
   * rotta assente.
   */
  it('non lascia link a rotte cancellate negli avvisi', () => {
    const source = read('../../warnings.ts');

    for (const section of REMOVED) {
      expect(source, `punta ancora a settings/${section}`).not.toContain(`/settings/${section}`);
    }
  });
});
