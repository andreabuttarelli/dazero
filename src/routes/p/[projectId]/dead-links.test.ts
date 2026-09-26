import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

/**
 * IL LINK PROMETTE, LA ROTTA MANTIENE. Tredici cron puntavano a rotte cancellate e niente li ha
 * presi: la stessa disattenzione, nell'interfaccia, è un bottone che non apre niente. Qui si
 * cammina ogni sorgente sotto `/p/[projectId]`, `/app` e i componenti condivisi, si trova ogni
 * `href`/`goto`/`redirect` scritto come stringa che punta dentro l'app, e si verifica che la
 * cartella esista sotto `src/routes` — come `+page.svelte`, `+page.server.ts` (un redirect è
 * comunque una pagina) o `+server.ts`.
 *
 * Un link dinamico — costruito da un id preso a runtime — non si può risolvere staticamente: la
 * via di fuga è dichiarata esplicitamente (ESCAPE_HATCH_SEGMENTS), non un allentamento della
 * prova. Se un segmento noto in anticipo (`studio`, `knowledge`, `/app/<slug>/...`) compare in un
 * link, quello resta sotto controllo pieno.
 */

const REPO_ROOT = fileURLToPath(new URL('../../../../', import.meta.url));
const ROUTES_DIR = join(REPO_ROOT, 'src/routes');

const SCAN_ROOTS = [
  'src/routes/p/[projectId]',
  'src/routes/app',
  'src/lib/components'
];

// Un altro agente sta ricostruendo la add-bar e l'upload della tela in questi percorsi: i loro
// link non sono di competenza di questo test, e leggerli ora significherebbe misurare un
// cantiere aperto invece del prodotto.
const EXCLUDED_DIRS = [
  'src/routes/p/[projectId]/c/[canvasId]',
  'src/lib/components/canvas'
];

function listSourceFiles(dir: string): string[] {
  const out: string[] = [];
  for (const name of readdirSync(dir)) {
    const full = join(dir, name);
    const rel = full.slice(REPO_ROOT.length);
    if (EXCLUDED_DIRS.some((ex) => rel === `/${ex}` || rel.startsWith(`/${ex}/`))) continue;
    const st = statSync(full);
    if (st.isDirectory()) {
      out.push(...listSourceFiles(full));
      continue;
    }
    if (/\.(svelte|ts)$/.test(name) && !name.endsWith('.test.ts')) out.push(full);
  }
  return out;
}

type Hit = { file: string; line: number; target: string };

// Cattura il contenuto di `href="…"`, `href={`…`}`, `goto(`…`)`, `goto('…')`, `redirect(3xx, `…`)`
// quando comincia con `/` — un percorso interno. Le stringhe letterali (`'…'`) e i template
// (`` `…` ``) entrano nello stesso gruppo; un `${…}` dentro il template resta nel testo catturato
// e lo si tratta come segmento dinamico più sotto.
const HREF_PATTERNS = [
  /href="(\/[^"]*)"/g,
  /href=\{`(\/[^`]*)`\}/g,
  /goto\(`(\/[^`]*)`/g,
  /goto\('(\/[^']*)'/g,
  /redirect\(30[1-9],\s*`(\/[^`]*)`/g,
  /redirect\(30[1-9],\s*'(\/[^']*)'/g
];

function findHits(file: string): Hit[] {
  const source = readFileSync(file, 'utf8');
  const lines = source.split('\n');
  const hits: Hit[] = [];

  lines.forEach((lineText, i) => {
    for (const pattern of HREF_PATTERNS) {
      pattern.lastIndex = 0;
      let m: RegExpExecArray | null;
      while ((m = pattern.exec(lineText))) {
        hits.push({ file, line: i + 1, target: m[1] });
      }
    }
  });

  return hits;
}

/**
 * Un `(nome)` è un GRUPPO di rotta: organizza il filesystem ma non esiste nell'URL — `/privacy`
 * vive sotto `src/routes/(public)/privacy`, e chi scrive `href="/privacy"` non sa né deve sapere
 * che quel gruppo esiste. La ricerca prova ogni cartella figlia che combacia col segmento, PIÙ
 * ogni gruppo `(…)`: un gruppo può contenere l'esatta prossima cartella, un altro no.
 */
function candidateDirs(dir: string, segment: string): string[] {
  if (!existsSync(dir) || !statSync(dir).isDirectory()) return [];
  const entries = readdirSync(dir).filter((e) => statSync(join(dir, e)).isDirectory());

  const direct = entries.filter((e) => e === segment || /^\[.+\]$/.test(e));
  const groups = entries.filter((e) => /^\(.+\)$/.test(e));

  return [...direct.map((e) => join(dir, e)), ...groups.map((e) => join(dir, e))];
}

/**
 * Le rotte VERE, come cartelle: una cartella conta se sotto ha una foglia raggiungibile
 * (`+page.svelte`, `+page.server.ts` — un redirect è comunque una pagina — o `+server.ts`).
 * `[id]`, `[slug]`, `[channel]`… restano wildcard: un link con un id vero al posto del nome del
 * parametro deve combaciare lo stesso. Un gruppo `(pubblico)` si attraversa senza consumare un
 * segmento dell'URL — vedi `candidateDirs`.
 */
function isRealRoute(urlPath: string): boolean {
  const segments = urlPath.split('/').filter(Boolean);

  function walk(dir: string, remaining: string[]): boolean {
    if (remaining.length === 0) {
      if (!existsSync(dir)) return false;
      const leaves = readdirSync(dir);
      return (
        leaves.includes('+page.svelte') || leaves.includes('+page.server.ts') || leaves.includes('+server.ts')
      );
    }

    const [segment, ...rest] = remaining;
    for (const candidate of candidateDirs(dir, segment)) {
      const consumesSegment = !/^\(.+\)$/.test(candidate.split('/').pop() ?? '');
      if (walk(candidate, consumesSegment ? rest : remaining)) return true;
    }
    return false;
  }

  return walk(ROUTES_DIR, segments);
}

/**
 * Un `${…}` dentro il template resta come testo: non lo si può risolvere staticamente, quindi il
 * segmento che lo contiene si tratta come wildcard — la prova cammina lo stesso il resto del
 * percorso, non lo scarta intero.
 */
function normalizeDynamicSegments(urlPath: string): string {
  return urlPath
    .split('/')
    .map((seg) => (seg.includes('${') ? '[dyn]' : seg))
    .join('/');
}

/**
 * VIA DI FUGA DICHIARATA, non implicita: un link che non comincia con uno di questi prefissi
 * viene verificato per intero. Aggiungere qui una voce è una riga in un diff che qualcuno legge,
 * con la domanda giusta davanti — questo link è davvero irrisolvibile, o è solo comodo escluderlo?
 */
const ESCAPE_HATCH_PREFIXES = [
  // Storage/asset signing, non una rotta di pagina.
  '/a/',
  // Ancora client-side dentro la stessa pagina.
  '#'
];

function isEscapeHatch(target: string): boolean {
  return ESCAPE_HATCH_PREFIXES.some((p) => target.startsWith(p));
}

function stripQueryAndHash(target: string): string {
  return target.split('#')[0].split('?')[0];
}

describe('nessun link interno punta a una rotta che non esiste', () => {
  const files = SCAN_ROOTS.flatMap((root) => listSourceFiles(join(REPO_ROOT, root)));

  it('ha trovato file da controllare (il test non passa vuoto per errore)', () => {
    expect(files.length).toBeGreaterThan(20);
  });

  const allHits = files.flatMap(findHits);

  it('ha trovato almeno un link interno da verificare (altrimenti la prova non prova niente)', () => {
    expect(allHits.length).toBeGreaterThan(10);
  });

  const dead = allHits
    .filter((h) => !isEscapeHatch(h.target))
    .map((h) => ({ ...h, path: normalizeDynamicSegments(stripQueryAndHash(h.target)) }))
    .filter((h) => !isRealRoute(h.path))
    .map((h) => `${h.file.slice(REPO_ROOT.length)}:${h.line} -> ${h.target}`);

  it('ogni href/goto/redirect statico risolve a una cartella con +page.svelte, +page.server.ts o +server.ts', () => {
    expect(dead).toEqual([]);
  });
});
