import { describe, it, expect } from 'vitest';
import { BRAND_ENDPOINTS } from './index';

/**
 * I TOOL CHE I TRE GENERICI HANNO RESO INUTILI, o le cui rotte sono cancellate del tutto.
 *
 * `query`, `insert_row`, `update_row` e `delete_row` raggiungono ogni tabella dell'allowlist. Un
 * tool dedicato accanto a loro si giustifica solo se fa qualcosa in PIÙ della riga. Studio, piano
 * editoriale, piano settimanale, memory e blog/autoblog sono usciti dal prodotto: le loro rotte
 * REST sono cancellate, non solo il tool.
 *
 * Questo elenco è la decisione, scritta dove un ritorno indietro accidentale la fa fallire.
 * Rimetterne uno è legittimo: va tolto DA QUI, e allora si vede.
 */
const RETIRED = [
  'add_competitor',
  'delete_competitor',
  'delete_product',
  'remove_blog_term',
  'get_ads',
  'record_memory_used',
  'discard_plan',
  'approve_posts',
  'set_automation',
  'create_article',
  'update_article',
  'publish_article',
  'unpublish_article',
  'delete_article',
  'generate_article',
  'optimize_article',
  'add_blog_term',
  'set_blog_settings',
  'propose_plan',
  'revise_plan',
  'plan_week',
  'replan_week',
  'generate_captions',
  'approve_plan',
  'save_plan',
  'save_week_seeds',
  'save_brief',
  'check_content',
  'get_creation_kit',
  'get_writing_skills',
  'search_knowledge',
  'research_competitors',
  'diagnose_brand',
  'sync_history',
  'add_note',
  'add_person',
  'set_bio',
  'set_colors',
  'update_brand_kit',
  'update_voice',
  'update_person',
  'update_competitor',
  'delete_person',
  'delete_document',
  'save_memory',
  'make_video',
  'regenerate_post_media',
  'regenerate_slide',
  'reorder_slides',
  'produce_week',
  'list_brands'
] as const;

/**
 * Quelli che RESTANO benché somiglino a una scrittura, con la ragione accanto: senza, il prossimo
 * giro di pulizia li toglie per simmetria e rompe qualcosa che nessun test copre.
 */
const KEPT_ON_PURPOSE: Record<string, string> = {
  publish_post:
    'chiama `publishApprovedPost`, che consegna alle piattaforme: `update_row` darebbe post marcati pubblicati che non escono',
  approve_post:
    'pubblica o schedula davvero, e distingue tre esiti che uno stato non contiene: schedulato, rifiutato dalla piattaforma, approvato-ma-senza-account collegato',
  reject_post:
    'revoca la schedulazione su Zernio PRIMA di cancellare, e se la revoca fallisce non cancella: `delete_row` toglierebbe la riga lasciando viva la schedulazione — il post esce e non resta nulla che lo racconti (incidente luglio 2026)',
  create_post: 'deposita la copy scritta fuori come post in attesa, senza modello e senza crediti',
  edit_post: 'riscrive la copy di un post che esiste, senza modello e senza crediti',
  generate_image: 'il modello interno è Nano Banana: un agente di testo non disegna',
  generate_video: 'il modello interno è Seedance/Kling: un agente di testo non gira clip',
  generate_carousel: 'rende le slide, non la copy che ci sta sopra',
  refine_media: 'modifica un\'immagine o una clip che esiste: pixel, non parole',
  render_post: 'trasforma un post in immagine finita',
  enhance_prompt:
    'il testo che produce non lo legge una persona ma un modello di immagini, e la forma che serve a ciascuno (sezioni etichettate, paragrafo unico, comando) sta in una guida per modello che vive qui: un agente esterno non sa con quale modello stai per rendere né come vuole essere parlato. Rifiuta di suo le riscritture che inventano un soggetto, quindi non è una seconda stesura del brief'
};

/**
 * Non tutti i tool nascono dal registro: la superficie MCP reale oggi è cablata a mano in
 * `cli/mcp/tools/{posts,ads,org-data}.ts` (`list_posts`, `create_post`, `set_post_status`,
 * `list_ad_campaigns`, `create_ad_campaign`, `approve_ad_campaign`, `query`, `insert_row`,
 * `update_row`, `delete_row`, `describe_node_types`) e non passa più da `BRAND_ENDPOINTS`.
 * `approve_post`, `publish_post` e `reject_post` sono nomi che questo registro conosceva quando
 * risolvevano un id da un prefisso; restano qui come promemoria che una rotta REST li chiama
 * ancora, anche se `tools/list` oggi è quello cablato a mano.
 */
const HAND_REGISTERED = [
  'list_posts',
  'create_post',
  'set_post_status',
  'list_ad_campaigns',
  'create_ad_campaign',
  'approve_ad_campaign',
  'query',
  'insert_row',
  'update_row',
  'delete_row',
  'describe_node_types',
  'approve_post',
  'publish_post',
  'reject_post'
];

describe('i tool ritirati o le cui rotte sono cancellate', () => {
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
