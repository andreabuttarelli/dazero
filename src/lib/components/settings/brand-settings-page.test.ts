import { existsSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { SETTINGS_GROUPS, SETTINGS_SECTIONS } from './platforms';

const read = (rel: string) => readFileSync(fileURLToPath(new URL(rel, import.meta.url)), 'utf8');
const routeDir = (section: string) =>
  fileURLToPath(new URL(`../../../routes/p/[projectId]/settings/${section}`, import.meta.url));

/** Le quattro che erano rotte e adesso sono sezioni della stessa pagina. */
const MERGED = ['platforms', 'hashtags', 'voice-examples', 'timezone'];

/**
 * `get_brand_settings` / `set_brand_settings` restituiscono UN oggetto: fuso, piattaforme,
 * hashtag, esempi di voce. Finché il browser mostrava quattro pagine e l'MCP un oggetto, citare
 * il contratto era una coincidenza, non una fonte comune. Questi test tengono ferma la
 * corrispondenza — e soprattutto tengono fermo che nessun link punti a una rotta che non c'è
 * più, che è il modo in cui una cancellazione si trasforma in un 404 che nessuno vede.
 */
describe('le impostazioni del brand sono una pagina sola', () => {
  it('non lascia in piedi le quattro rotte che ha inglobato', () => {
    for (const section of MERGED) {
      expect(existsSync(routeDir(section)), `settings/${section} esiste ancora`).toBe(false);
    }
  });

  it('non le lascia nemmeno negli elenchi che disegnano la navigazione', () => {
    const listed = [
      ...SETTINGS_SECTIONS,
      ...SETTINGS_GROUPS.flatMap((g) => g.items.map((i) => i.section))
    ];
    for (const section of MERGED) {
      expect(listed, `${section} è ancora in nav`).not.toContain(section);
    }
  });

  it('mostra le quattro sezioni del contratto nella pagina che resta', () => {
    const page = read('../../../routes/p/[projectId]/settings/brand/+page.svelte');

    expect(page).toContain("'brand', 'platforms', 'hashtags', 'voice-examples'");
    expect(page).toContain('<BrandTimezone');
  });

  /**
   * Un avviso che punta a una rotta cancellata è un 404 che non fallisce nessun test di import:
   * il link è una stringa. I rimandi legacy da `/studio/*` sono spariti insieme alle rotte —
   * `dead-links.test.ts` tiene fermo che nessun link vivo punti a una rotta assente.
   */
  it('non lascia link a rotte cancellate negli avvisi', () => {
    const source = read('../../warnings.ts');

    for (const section of MERGED) {
      expect(source, `punta ancora a settings/${section}`).not.toContain(`/settings/${section}`);
    }
  });

  it('ogni ancora usata da StudioPage è una sezione vera', () => {
    const studio = read('../studio/StudioPage.svelte');

    for (const section of ['brand', 'platforms', 'hashtags', 'voice-examples']) {
      expect(studio, `manca <section id="${section}">`).toContain(`<section id="${section}"`);
    }
  });
});
