import { describe, it, expect } from 'vitest';
import { BRAND_ENDPOINTS } from './index';

/**
 * I TOOL CHE I TRE GENERICI HANNO RESO INUTILI.
 *
 * `query`, `insert_row`, `update_row` e `delete_row` raggiungono ogni tabella dell'allowlist. Un
 * tool dedicato accanto a loro si giustifica solo se fa qualcosa in PIÙ della riga: pubblicare
 * davvero, spendere crediti, far partire una coda. Se si limita a scrivere una riga, è un secondo
 * modo di fare la stessa cosa — e ogni tool viaggia nel prompt di ogni turno, per sempre.
 *
 * Questo elenco è la decisione, scritta dove un ritorno indietro accidentale la fa fallire.
 * Rimetterne uno è legittimo: va tolto DA QUI, e allora si vede.
 */
const RETIRED = [
  'add_competitor',
  'add_radar_source',
  'delete_competitor',
  'delete_product',
  'remove_blog_term',
  'remove_radar_source',
  'get_ads',
  'record_memory_used',
  'discard_plan',
  'approve_posts'
] as const;

/**
 * Quelli che RESTANO benché somiglino a una scrittura, con la ragione accanto: senza, il prossimo
 * giro di pulizia li toglie per simmetria e rompe qualcosa che nessun test copre.
 */
const KEPT_ON_PURPOSE: Record<string, string> = {
  list_brands:
    'risponde a «quali brand esistono», cioè la domanda PRIMA dello slug: `query` è scoped su un brand e non può porsela',
  publish_post: 'manda il post fuori davvero: `update_row` darebbe post pubblicati che non escono',
  publish_article: 'mette l\'articolo online: `update_row` lo marcherebbe pubblicato e basta',
  approve_post: 'innesca coda e scheduling, non cambia solo uno stato',
  approve_plan: 'attiva il piano, non lo marca soltanto',
  check_content: 'esegue controlli: non è una lettura',
  make_video: 'genera e spende crediti',
  get_gsc: 'legge Google, non una tabella nostra',
  get_creation_kit: 'compone un brief da più fonti',
  get_writing_skills: 'restituisce file del repo, non righe'
};

/**
 * Non tutti i tool nascono dal registro: `approve_post` e `publish_post` sono registrati a mano
 * nel server MCP, e un test che guardasse solo `BRAND_ENDPOINTS` li direbbe assenti mentre
 * esistono — cioè coprirebbe metà della superficie credendo di coprirla tutta.
 */
const HAND_REGISTERED = ['approve_post', 'publish_post', 'list_brands'];

describe('i tool ritirati in favore dei quattro generici', () => {
  const names = new Set([...BRAND_ENDPOINTS.map((e) => e.tool), ...HAND_REGISTERED]);

  it.each(RETIRED)('%s non è più un tool', (tool) => {
    expect(names.has(tool)).toBe(false);
  });

  it.each(Object.keys(KEPT_ON_PURPOSE))('%s resta, e il motivo è scritto', (tool) => {
    expect(names.has(tool)).toBe(true);
    expect(KEPT_ON_PURPOSE[tool].length).toBeGreaterThan(20);
  });

  it('i quattro generici ci sono tutti: senza, il ritiro toglie e basta', () => {
    for (const tool of ['query', 'insert_row', 'update_row', 'delete_row']) {
      expect(names.has(tool)).toBe(true);
    }
  });
});
