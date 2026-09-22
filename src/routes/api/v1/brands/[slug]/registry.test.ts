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
 * Quindi una rotta senza contratto si DICHIARA qui. La lista non porta un motivo per riga perché
 * gran parte di queste esistevano già da prima e inventarne il motivo sarebbe peggio che
 * tacerlo: quello che la lista impone è che la riga si aggiunga a mano, in un diff che qualcuno
 * legge, con la domanda giusta davanti — questa rotta cos'è adesso, se non è più un tool?
 * Superficie REST voluta, o codice morto da cancellare.
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
  // `ads_action` chiama funzioni sue (approva, rifiuta, duplica, propone) senza passare da un
  // contratto: il CLI la raggiunge con `api.adsAction`, non con `ADS_ACTION`.
  'ads',
  'api-keys',
  'api-keys/[id]',
  'calendar',
  'posts/[id]/approve',
  'posts/[id]/publish',
  'posts/[id]/revoke',
  'posts/approve-all',
  'products',
  // `update_product` era un update di una riga e nient'altro: `update_row` lo fa con la RLS di
  // chi chiama. Il tool esce, la rotta resta — il CLI la chiama ancora.
  'products/[id]',
  'publishing',
  'social/accounts',
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
