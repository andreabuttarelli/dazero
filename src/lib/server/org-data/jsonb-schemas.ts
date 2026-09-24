/**
 * OGNI COLONNA `jsonb` CHE `insert_row`/`update_row` PUÒ TOCCARE, IN UN POSTO SOLO.
 *
 * `nodes.data` non è l'unica: il database ha 20 colonne jsonb su 11 tabelle (lette dal database
 * vero, klnswzhhgrqvbfjzioul, lo stesso motivo per cui `checks.ts` accanto non è generato dalle
 * migration). Ognuna è raggiungibile dagli stessi tre tool generici — un agente che scrive
 * `insert_row('ad_campaigns', {targeting: …})` indovina la forma esattamente come indovinava
 * `nodes.data` prima di questo giro.
 *
 * STESSA REGOLA DI `checks.ts` e `node-data.ts`: un `if` per tabella sarebbe la stessa colonna
 * scritta cinque volte che diverge in silenzio alla prima migrazione. Qui `table.column` è UNA
 * riga, e la riga dice anche COSA fare quando non c'è una forma vera da imporre — vedi sotto.
 *
 * DUE STATI, MAI UN TERZO IMPLICITO:
 *
 *   `validated`  →  uno schema Zod derivato da codice che gira davvero (non dal solo
 *                   `NEW_DATABASE_STRUCTURE.md`, che qui è proposta, non verità).
 *   `free_form`  →  deliberatamente non giudicato, CON IL MOTIVO. Un'assenza muta lascerebbe
 *                   chi legge il registro a chiedersi se la colonna è stata dimenticata; un
 *                   `free_form` esplicito dice che la scelta è stata fatta, e perché.
 *
 * Una colonna jsonb che esiste sul database ma non è qui non blocca niente: `validateJsonbColumn`
 * passa quando non trova la coppia table.column, esattamente come una tabella senza colonne jsonb
 * registrate — il registro riduce il rischio, non lo azzera da solo, e va tenuto aggiornato come
 * `ORG_TABLE_CHECKS` accanto.
 */
import { z } from 'zod';

/**
 * `posts.media`: la stessa `PostMedia` che `repos/posts.ts` e il tool
 * MCP `create_post` già usano — non una forma nuova, la STESSA riletta qui perché quel modulo
 * dipende da `$lib/server/db/client` e non conviene farlo dipendere anche da questo file, o
 * viceversa: due letture della stessa riga, mai due righe.
 */
export const postMediaSchema = z.array(
  z.object({
    assetId: z.string(),
    order: z.number().int(),
    role: z.string().optional()
  })
);

/**
 * `canvases.viewport`: la stessa forma che `repos/canvas.ts::saveViewport` scrive e
 * `Canvas['viewport']` dichiara — `{ x, y, zoom } | null`.
 */
export const canvasViewportSchema = z.object({
  x: z.number(),
  y: z.number(),
  zoom: z.number()
});

/**
 * `ad_campaigns.targeting`: la STESSA `AdTargeting` di `src/lib/server/zernio-ads.ts`, il client
 * del provider — non una forma inventata per lo schema nuovo. Ridichiarata qui invece di
 * importata: `zernio-ads.ts` legge `$env/dynamic/private` al caricamento del modulo, e questo
 * file deve restare importabile da `write-tool.ts` senza trascinarsi dietro il client di un
 * provider che non chiama. Se `AdTargeting` cambia là, questa riga diverge finché qualcuno non se
 * ne accorge — lo stesso rischio che `checks.ts` accetta consapevolmente per gli stessi motivi.
 */
export const adTargetingSchema = z.object({
  age_min: z.number().optional(),
  age_max: z.number().optional(),
  genders: z.array(z.string()).optional(),
  countries: z.array(z.string()).optional(),
  languages: z.array(z.string()).optional(),
  interests: z.array(z.object({ id: z.string(), name: z.string().optional() })).optional(),
  keywords: z.array(z.object({ text: z.string(), matchType: z.enum(['BROAD', 'PHRASE', 'EXACT']).optional() })).optional(),
  geoTargets: z.array(z.string()).optional()
});

/** `ad_campaigns.placements`: `string[]` nello stesso client (`CreateStandaloneAdInput.placements`). */
export const adPlacementsSchema = z.array(z.string());

type JsonbEntry =
  | { kind: 'validated'; schema: z.ZodType }
  | { kind: 'free_form'; reason: string };

const validated = (schema: z.ZodType): JsonbEntry => ({ kind: 'validated', schema });
const freeForm = (reason: string): JsonbEntry => ({ kind: 'free_form', reason });

/**
 * LA TABELLA. Un tipo nuovo, o una colonna jsonb nuova, è UNA RIGA qui — mai un `if` sparso in
 * `write-tool.ts`. `jsonb-schemas.test.ts` verifica che la lista resti quella delle 20 colonne
 * vere; chi ne aggiunge una in una migration futura la aggiunge anche qui, come per `checks.ts`.
 */
export const JSONB_COLUMN_SCHEMAS: Record<string, JsonbEntry> = {
  'nodes.data': freeForm(
    'ha la sua propria validazione per type in $lib/canvas/node-data.ts (discriminante, non una ' +
      'forma sola) — write-tool.ts la applica separatamente, prima di questo registro.'
  ),

  'posts.media': validated(postMediaSchema),

  'posts.per_platform': freeForm(
    'nessun codice del nuovo schema legge o scrive un campo nominato al suo interno oggi — ' +
      '`repos/posts.ts::Post.perPlatform` è `Record<string, unknown> | null` senza forma imposta. ' +
      'Imporne una qui inventerebbe un contratto che il prodotto non ha ancora deciso.'
  ),

  'ad_campaigns.targeting': validated(adTargetingSchema),
  'ad_campaigns.placements': validated(adPlacementsSchema),

  'canvases.viewport': validated(canvasViewportSchema),

  'brands.palette': freeForm(
    'nessun repository del nuovo schema legge o scrive questa colonna: `products/brand-context.ts` ' +
      'ha un VisualBrief.palette per un altro scopo (il brief generato per la grafica), non ' +
      'confermato come la stessa forma. Imporla qui sarebbe un contratto inventato, non letto dal codice.'
  ),
  'brands.target': freeForm(
    'stesso motivo di brands.palette: separata da `content` "perché si interroghi" ' +
      '(NEW_DATABASE_STRUCTURE.md), ma nessun repository la consuma ancora con una forma concreta.'
  ),

  'competitor_ads.raw': freeForm(
    'la risposta INTERA della Meta Ad Library, tenuta verbatim apposta: quella libreria cambia ' +
      'forma senza preavviso, e validarla vorrebbe dire rompere l\'ingest a ogni cambiamento del ' +
      'provider invece di limitarsi a registrarlo.'
  ),
  'competitor_ads.media': freeForm(
    'nessun repository del nuovo schema scrive ancora questa tabella (solo la FK verso nodes esiste ' +
      'in database.types.ts) — nessuna forma reale da cui derivare uno schema onesto.'
  ),

  'canvas_events.before': freeForm(
    'l\'istantanea di una riga qualunque prima della modifica, per uno storico/undo — la forma È ' +
      'la riga che cambia volta per volta, non un tipo suo. Validarla vorrebbe dire ridichiarare ' +
      'lo schema di ogni tabella una seconda volta qui.'
  ),
  'canvas_events.after': freeForm('stesso motivo di canvas_events.before, sul lato "dopo" della stessa istantanea.'),

  'chat_messages.tool_calls': freeForm(
    'rispecchia la forma che l\'AI SDK usa per le tool call, non nostra da governare — e nessun ' +
      'repository del nuovo schema la scrive ancora (`repos/chat.ts::saveTurn` non la tocca).'
  ),
  'chat_messages.attachments': freeForm(
    'stesso motivo di chat_messages.tool_calls: nessun repository del nuovo schema la scrive oggi.'
  ),

  'node_runs.params': freeForm(
    'parametri per-modello del giro (aspect ratio, durata, audio…): la stessa ragione per cui ' +
      '`gen-node.ts` non duplica i limiti del catalogo — un campo diverso per ogni provider, e ' +
      'imporre una forma qui darebbe due verità con `media-model-slots`.'
  ),

  'ad_creatives.media': freeForm(
    'nessun repository del nuovo schema scrive ancora `ad_creatives` — `NEW_DATABASE_STRUCTURE.md` ' +
      'propone `[{ asset_id, order }]`, ma è la proposta del documento, non codice che gira: si ' +
      'valida quando un repository reale ne fissa la forma, non prima.'
  ),

  'social_posts.media': freeForm(
    'nessun repository del nuovo schema scrive ancora `social_posts` — la tabella dei post scaricati ' +
      'dai feed social (§ `social_account_feed` in NEW_DATABASE_STRUCTURE.md) non ha ancora un ingest.'
  ),
  'social_posts.metrics': freeForm('stesso motivo di social_posts.media: nessun ingest reale da cui derivare la forma.'),

  'products.images': freeForm(
    '`brand-design-doc.ts::normalizeImageUrls` accetta di proposito tre forme diverse ' +
      '(`["url"]`, `[{src}]`, `[{url}]`) perché la fonte è uno scraper su siti che non controlliamo ' +
      '— la tolleranza è la scelta del prodotto, non una lacuna da chiudere con uno schema stretto.'
  )
};

export function jsonbColumnsOf(table: string): string[] {
  const prefix = `${table}.`;
  return Object.keys(JSONB_COLUMN_SCHEMAS)
    .filter((key) => key.startsWith(prefix))
    .map((key) => key.slice(prefix.length));
}

export type JsonbColumnVerdict = { ok: true } | { ok: false; error: string };

export function validateJsonbColumn(table: string, column: string, value: unknown): JsonbColumnVerdict {
  const entry = JSONB_COLUMN_SCHEMAS[`${table}.${column}`];
  if (!entry || entry.kind === 'free_form') {
    return { ok: true };
  }

  const result = entry.schema.safeParse(value ?? null);
  if (result.success) {
    return { ok: true };
  }

  const [issue] = result.error.issues;
  const field = issue.path.length ? `.${issue.path.join('.')}` : '';
  return { ok: false, error: `${table}.${column}${field}: ${issue.message}` };
}
