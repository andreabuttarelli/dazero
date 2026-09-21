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
  publish_post:
    'chiama `publishApprovedPost`, che consegna alle piattaforme: `update_row` darebbe post marcati pubblicati che non escono',
  publish_article:
    'scrive con il client admin — `brand_articles` è SELECT-only sotto RLS, quindi `update_row` verrebbe proprio rifiutato — e notifica IndexNow ed Exa',
  approve_post:
    'pubblica o schedula davvero, e distingue tre esiti che uno stato non contiene: schedulato, rifiutato dalla piattaforma, approvato-ma-senza-account collegato',
  approve_plan:
    'supersede il piano attivo, timbra le date di inizio settimana e risincronizza le preferenze del brand: tre scritture oltre allo stato',
  check_content:
    'compone sei moduli di regole — limiti di piattaforma, proof discipline, punteggio, conflitti di calendario, igiene hashtag — e ne versiona la composizione: nessuna riga da leggere esiste',
  propose_plan: 'passa da `gateAiAction` e fa scrivere il piano al modello: spende crediti',
  save_week_seeds:
    'conia gli id di riga stabili, mappa i formati legacy sull\'enum, clampa le capacità media e tiene UN solo draft per brand: `insert_row` depositerebbe seeds grezzi che il CHECK accetta e `produce_week` non sa produrre',
  reject_post:
    'revoca la schedulazione su Zernio PRIMA di cancellare, e se la revoca fallisce non cancella: `delete_row` toglierebbe la riga lasciando viva la schedulazione — il post esce e non resta nulla che lo racconti (incidente luglio 2026)',
  make_video: 'genera e spende crediti',
  get_gsc: 'legge Google, non una tabella nostra',
  get_creation_kit: 'compone un brief da più fonti',
  get_writing_skills: 'restituisce file del repo, non righe'
};

/**
 * Non tutti i tool nascono dal registro: quelli che risolvono un id da un prefisso — `approve_post`,
 * `publish_post`, `reject_post` — sono registrati a mano nel server MCP, e un test che guardasse
 * solo `BRAND_ENDPOINTS` li direbbe assenti mentre esistono, cioè coprirebbe metà della superficie
 * credendo di coprirla tutta. Va tenuto allineato a `cli/mcp/tools/brand-content.ts`.
 */
const HAND_REGISTERED = ['approve_post', 'publish_post', 'reject_post', 'list_brands'];

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
