import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { BRAND_ENDPOINTS, pathFor, pathWithoutBrand, type BrandEndpoint } from '@dazero/api-contracts';

/**
 * IL REGISTRY PROMETTE, LE ROTTE MANTENGONO. Ogni entry di BRAND_ENDPOINTS diventa da sola un
 * metodo del client CLI e un tool MCP: un contratto senza il suo `+server.ts`, o con un
 * `pathUnderBrand` che non combacia col percorso su disco, produce un tool ben formato che
 * compare in `tools/list`, viene offerto a ogni agente esterno e risponde 404.
 *
 * Il percorso su disco è l'inverso esatto di `pathFor`: gli si passa il nome della cartella
 * dinamica al posto del valore, e l'URL che torna È il percorso.
 *
 *   pathFor(GET_POST, '[slug]', '[id]')  ->  /api/v1/brands/%5Bslug%5D/posts/%5Bid%5D
 *   decodificato                         ->  /api/v1/brands/[slug]/posts/[id]
 *   + '/+server.ts'                      ->  src/routes/api/v1/brands/[slug]/posts/[id]/+server.ts
 *
 * Così RESOURCE_SEGMENT non è mai scritto qui: se domani `:id` diventa altro, il test lo segue.
 */

const SLUG_DIR = '[slug]';
const ID_DIR = '[id]';
const REPO_ROOT = fileURLToPath(new URL('../../../../../../', import.meta.url));

function routeFile(endpoint: BrandEndpoint): string {
  const url =
    endpoint.resource === undefined
      ? pathFor(endpoint, SLUG_DIR)
      : pathFor(endpoint, SLUG_DIR, ID_DIR);

  return `src/routes${url.split('/').map(decodeURIComponent).join('/')}/+server.ts`;
}

function exportsVerb(source: string, verb: string): boolean {
  const declared = new RegExp(`^export\\s+(const|let|var|(async\\s+)?function)\\s+${verb}\\b`, 'm');
  const listed = new RegExp(`^export\\s*\\{[^}]*\\b${verb}\\b`, 'm');

  return declared.test(source) || listed.test(source);
}

describe('BRAND_ENDPOINTS', () => {
  it('ogni contratto ha la sua rotta su disco', () => {
    const missing = BRAND_ENDPOINTS
      .filter((e) => !existsSync(join(REPO_ROOT, routeFile(e))))
      .map((e) => `${e.tool} -> ${routeFile(e)} non esiste`);

    expect(missing).toEqual([]);
  });

  it('ogni rotta esporta il verbo che il contratto dichiara', () => {
    const wrongVerb = BRAND_ENDPOINTS
      .filter((e) => {
        const file = join(REPO_ROOT, routeFile(e));

        return existsSync(file) && !exportsVerb(readFileSync(file, 'utf8'), e.method);
      })
      .map((e) => `${e.tool} -> ${routeFile(e)} non esporta ${e.method}`);

    expect(wrongVerb).toEqual([]);
  });

  // Un contratto che tace su `credits_exhausted` mentre la rotta lo restituisce mente a chi legge
  // le varianti d'errore per decidere cosa fare — e `statusForFailure` degrada quel 402 a 500, che
  // si legge come "guasto nostro" invece che "crediti finiti". Peggio di un contratto assente.
  it('chi chiama gateAiAction dichiara credits_exhausted', () => {
    const silent = BRAND_ENDPOINTS
      .filter((e) => {
        // Il gate vive sempre nell'handler che scrive: una GET condivide il file con la POST che
        // spende, ma legge e basta. Il metodo distingue i due senza analizzare il sorgente.
        if (e.method === 'GET') return false;

        const file = join(REPO_ROOT, routeFile(e));
        if (!existsSync(file) || !readFileSync(file, 'utf8').includes('gateAiAction')) return false;

        return !e.failures.some((f) => f.error === 'credits_exhausted');
      })
      .map((e) => `${e.tool} -> spende crediti ma non dichiara credits_exhausted`);

    expect(silent).toEqual([]);
  });

  /**
   * Una strada senza brand è una seconda promessa dello stesso contratto, e sbaglia allo stesso
   * modo: dichiararla senza scriverla produce un tool che accetta di essere chiamato senza slug e
   * risponde 404 — cioè l'agente torna a credere che lo strumento non ci sia.
   */
  it('ogni strada senza brand ha la sua rotta, e spende con un cancello che dichiara', () => {
    const broken: string[] = [];

    for (const endpoint of BRAND_ENDPOINTS) {
      const url = pathWithoutBrand(endpoint);
      if (!url) continue;

      const file = `src/routes${url}/+server.ts`;
      const full = join(REPO_ROOT, file);
      if (!existsSync(full)) {
        broken.push(`${endpoint.tool} -> ${file} non esiste`);
        continue;
      }

      const source = readFileSync(full, 'utf8');
      if (!exportsVerb(source, endpoint.method)) {
        broken.push(`${endpoint.tool} -> ${file} non esporta ${endpoint.method}`);
      }
      if (source.includes('gateOrgAiAction') && !endpoint.failures.some((f) => f.error === 'credits_exhausted')) {
        broken.push(`${endpoint.tool} -> spende crediti ma non dichiara credits_exhausted`);
      }
    }

    expect(broken).toEqual([]);
  });
});

/**
 * E L'INVERSO, che finora non lo verificava nessuno: le quattro prove qui sopra vanno tutte dal
 * registro alla rotta, quindi togliere una entry da BRAND_ENDPOINTS non fa fallire niente. La
 * rotta resta viva, raggiungibile e senza più nessun posto dove è descritta — nessun tool, nessun
 * contratto, nessun rosso.
 *
 * Una volta è una curiosità. Le letture rientrate dentro `query` sono trentatré, e trentatré
 * rotte che nessuno può elencare sono il modo in cui il percorso a chiave API diventa in silenzio
 * l'unica strada per un terzo del prodotto — perché `query` la chiave API la RIFIUTA
 * (`createQueryTool` pretende un client RLS-scoped, e `authenticate` sul percorso a chiave dà la
 * service role).
 *
 * Quindi una rotta senza contratto si DICHIARA qui. La lista non porta un motivo per riga perché
 * ventotto di queste esistevano già da prima e inventarne il motivo sarebbe peggio che tacerlo:
 * quello che la lista impone è che la riga si aggiunga a mano, in un diff che qualcuno legge, con
 * la domanda giusta davanti — questa rotta cos'è adesso, se non è più un tool? Superficie REST
 * voluta, o codice morto da cancellare.
 */
/** La rotta alla radice del brand: non ha un segmento da nominare, ma va dichiarata come le altre. */
const BRAND_ROOT = '.';

const REST_ONLY = [
  BRAND_ROOT,
  // La chat nella sidebar: il browser arriva con un cookie di sessione, non con un Bearer, quindi
  // queste due non passano da `authenticate` e non possono diventare un tool MCP. Restano rotte e
  // basta, ed è la superficie che `src/lib/server/brand-agent/` serve.
  'agent',
  'agent/assets',
  'agent-sessions',
  'agent-sessions/[id]',
  'analytics',
  'api-keys',
  'api-keys/[id]',
  'articles',
  'articles/[id]',
  'calendar',
  'connections',
  'connections/[id]',
  'connections/[id]/complete',
  'connections/catalog',
  // Le quattro rotte che scrivevano piano e settimana con un modello loro. Il tool esce — chi
  // chiama dazero è già un agente che scrive, e `save_plan` / `save_week_seeds` depositano il
  // testo suo — ma la rotta resta, perché l'autopilot passa da queste stesse funzioni su ogni
  // brand con un piano attivo.
  'captions/generate',
  'editorial-plan',
  // `discard_plan` metteva a `rejected` una riga sola: `update_row` fa lo stesso con la RLS di chi
  // chiama. Il tool esce, la rotta resta perché il CLI la chiama ancora (`cli/lib/api.ts`).
  'editorial-plan/discard',
  'editorial-plan/propose',
  'editorial-plan/replan-week',
  'editorial-plan/revise',
  'editorial-plan/update',
  'gtm',
  'gtm/update',
  'ideas',
  'knowledge',
  'library/scan',
  // `record_memory_used` segnava l'uso di una memoria per rallentarne il decadimento: una colonna
  // per riga, che `update_row` tocca. Il tool esce, la rotta resta per il CLI.
  'memory/used',
  // `generate_media` era la porta vecchia: inoltrava a `generate_image` e `generate_video` e la
  // sua stessa descrizione diceva di preferirli. Il tool esce, la rotta resta per chi l'ha cablata.
  'media/generate',
  // `create_product`, `update_person`, `update_product` e `update_competitor` erano un insert e un
  // update di una riga e nient'altro: `insert_row` e `update_row` li fanno con la RLS di chi
  // chiama. I tool escono, le rotte restano — il CLI le chiama ancora, e con `delete_product` e
  // `delete_competitor` ritirati nessun contratto rivendica più quelle due cartelle.
  'people/[id]',
  'posts/[id]/approve',
  'posts/[id]/media',
  'posts/[id]/publish',
  'posts/[id]/revoke',
  'posts/approve-all',
  'products',
  'products/[id]',
  'publishing',
  'rubrics',
  'rubrics/approve',
  'rubrics/propose',
  // `remove_blog_term` toglie una categoria, un tag o un autore: una `delete` che `delete_row` fa.
  // Il conto degli articoli toccati resta comodo per il CLI, quindi la rotta non se ne va.
  'settings/blog/terms/remove',
  'social/accounts',
  'studio',
  // `add_competitor` e `delete_competitor` erano un insert e una delete di una riga. I tool
  // escono, le rotte restano: `cli/lib/api.ts` le chiama entrambe.
  'studio/competitors',
  'studio/competitors/[id]',
  'studio/memory',
  'studio/memory/[id]',
  'studio/products',
  'voice',
  'web',
  // `generate_article` e `optimize_article` sono usciti per la stessa ragione: il markdown lo
  // scrive chi chiama e `create_article` lo deposita. Il cron del blog continua a
  // passare di qui.
  'web/article/[id]/optimize',
  'web/generate',
  'webhook',
  'weekly-plan',
  'weekly-plan/plan',
  'weekly-plan/produce',
  'weekly-plan/render',
  'weekly-plan/save',
];

const BRAND_ROUTES = 'src/routes/api/v1/brands/[slug]';

function serverFilesUnder(dir: string, sub = BRAND_ROUTES): string[] {
  const out: string[] = [];

  for (const name of readdirSync(dir).sort()) {
    const full = join(dir, name);

    if (statSync(full).isDirectory()) {
      out.push(...serverFilesUnder(full, `${sub}/${name}`));
      continue;
    }
    if (name === '+server.ts') out.push(`${sub}/+server.ts`);
  }

  return out;
}

describe('le rotte sotto [slug]', () => {
  const claimed = new Set(BRAND_ENDPOINTS.map(routeFile));
  const declared = new Set(
    REST_ONLY.map((r) => (r === BRAND_ROOT ? `${BRAND_ROUTES}/+server.ts` : `${BRAND_ROUTES}/${r}/+server.ts`))
  );
  const onDisk = serverFilesUnder(join(REPO_ROOT, BRAND_ROUTES));

  it('o le descrive un contratto, o si dichiarano', () => {
    expect(onDisk.filter((r) => !claimed.has(r) && !declared.has(r))).toEqual([]);
  });

  it('non dichiara rotte che non esistono, o che un contratto ha ripreso', () => {
    const alive = new Set(onDisk);

    expect([...declared].filter((r) => !alive.has(r) || claimed.has(r))).toEqual([]);
  });
});
