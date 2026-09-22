import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

/**
 * OGNI LINK PROMETTE UNA ROTTA. Un `href` o un `redirect()` scritto a mano non passa da
 * SvelteKit finché qualcuno non lo clicca — e quel giorno è un 404, non un errore di build.
 * Tredici cron di questo repo puntavano a rotte cancellate senza che niente se ne accorgesse;
 * questo test cammina lo stesso terreno per i link dentro `/p/[projectId]`, `/app` e i
 * componenti condivisi, e fa fallire la suite invece del clic dell'utente.
 *
 * COSA CATTURA: `href="/..."`, `href={`/...`}` e `redirect(3xx, '/...')` /
 * `redirect(3xx, `/...`)` il cui prefisso statico (fino al primo `${...}`) risolve senza
 * ambiguità a una cartella sotto `src/routes`. Un segmento dinamico (`${...}`) diventa un
 * jolly: risolve su QUALUNQUE figlio letterale o su una rotta `[param]` alla stessa altezza.
 *
 * COSA NON CATTURA — la via di fuga dichiarata qui, non un buco silenzioso: `href` costruiti
 * da funzioni pure altrove (es. `$lib/workbench-paths.ts`, coperto dal suo test), URL esterni
 * (`http…`), pagine dentro `c/[canvasId]` e componenti canvas (fuori scope, altro task in
 * corso), link il cui prefisso statico è troppo corto per risolvere (es. un singolo `${...}`
 * in testa: non c'è nulla da matchare prima del primo segmento), e un segmento LETTERALE
 * scritto a mano che per caso coincide con nessuna cartella reale MA la cartella accanto è
 * `[param]` (es. `settings/connect/typo-qui` "risolverebbe" attraverso `[platform]`, esattamente
 * come farebbe `settings/connect/facebook` che è vero): un valore scritto a mano per uno slot
 * dinamico e un nome di rotta sbagliato hanno la stessa forma sulla carta, e il testo da solo
 * non li distingue senza sapere cosa significa il parametro.
 */

const REPO_ROOT = fileURLToPath(new URL('../../', import.meta.url));
const ROUTES_ROOT = join(REPO_ROOT, 'src/routes');

const SCAN_DIRS = [
  'src/routes/p/[projectId]',
  'src/routes/app',
  'src/lib/components'
];

const EXCLUDE_PATH_PARTS = [
  '/p/[projectId]/c/[canvasId]',
  '/components/canvas/',
  '.test.ts'
];

function walk(dir: string, out: string[] = []): string[] {
  for (const name of readdirSync(dir).sort()) {
    const full = join(dir, name);
    if (statSync(full).isDirectory()) {
      walk(full, out);
      continue;
    }
    if (/\.(svelte|ts)$/.test(name)) out.push(full);
  }
  return out;
}

function isExcluded(path: string): boolean {
  return EXCLUDE_PATH_PARTS.some((part) => path.includes(part));
}

type FoundLink = { file: string; raw: string };

const HREF_DOUBLE_QUOTE = /href="(\/[^"]*)"/g;
const HREF_TEMPLATE = /href=\{`(\/[^`]*)`\}/g;
const REDIRECT_SINGLE = /redirect\(\s*3\d\d\s*,\s*'(\/[^']*)'/g;
const REDIRECT_TEMPLATE = /redirect\(\s*3\d\d\s*,\s*`(\/[^`]*)`/g;

function extractLinks(source: string, file: string): FoundLink[] {
  const found: FoundLink[] = [];
  for (const re of [HREF_DOUBLE_QUOTE, HREF_TEMPLATE, REDIRECT_SINGLE, REDIRECT_TEMPLATE]) {
    re.lastIndex = 0;
    let m: RegExpExecArray | null;
    while ((m = re.exec(source))) {
      found.push({ file, raw: m[1] });
    }
  }
  return found;
}

/** A path segment that came from `${...}` interpolation: a wildcard, matched against any child. */
const DYNAMIC_SEGMENT = '\u0000DYNAMIC\u0000';

/**
 * Turns `/p/${projectId}/ads/${channel}` into ['p', DYNAMIC, 'ads', DYNAMIC]. Drops query/hash.
 *
 * A `${...}` that itself contains a backtick (`${qs ? `?${qs}` : ''}`) truncates the outer
 * capture at the inner backtick — the extraction regex cannot see past it, so the raw string
 * arrives already cut mid-expression, with one `${` left unclosed. That's unparseable, not
 * dead: it is the declared escape hatch, skipped rather than misjudged.
 */
function toSegments(raw: string): string[] | null {
  const opens = (raw.match(/\$\{/g) ?? []).length;
  const closes = (raw.match(/\}/g) ?? []).length;
  if (opens !== closes) return null;
  const templated = raw.replace(/\$\{[^}]*\}/g, DYNAMIC_SEGMENT);
  const withoutQuery = templated.split('?')[0].split('#')[0];
  const segments = withoutQuery.split('/').filter((s) => s.length > 0);
  // A link whose very first segment is a wildcard has no static prefix to resolve at all —
  // that's the declared escape hatch, not a defect: skip it instead of guessing.
  if (segments.length === 0 || segments[0] === DYNAMIC_SEGMENT) return null;
  return segments;
}

function isRouteDir(dir: string): boolean {
  if (!existsSync(dir) || !statSync(dir).isDirectory()) return false;
  return (
    existsSync(join(dir, '+page.svelte')) ||
    existsSync(join(dir, '+page.server.ts')) ||
    existsSync(join(dir, '+server.ts')) ||
    existsSync(join(dir, '+layout.svelte')) ||
    existsSync(join(dir, '+layout.server.ts'))
  );
}

function childCandidates(dir: string, segment: string): string[] {
  if (!existsSync(dir)) return [];
  const names = readdirSync(dir).filter((n) => statSync(join(dir, n)).isDirectory());
  if (segment === DYNAMIC_SEGMENT) {
    return names.filter((n) => n.startsWith('[')).map((n) => join(dir, n));
  }
  // A literal segment matches its own folder first — `facebook` under `settings/connect/`
  // really does mean the `[platform]` folder, a hand-typed value for a dynamic slot, and that
  // is common enough (`settings/connect/facebook`, `ads/connect/googleads`) that refusing to
  // fall through would flag real links as dead. The cost, accepted rather than hidden: a typo'd
  // literal segment (`/p/does-not-exist`) can also "resolve" this way, through `[projectId]`.
  // Static text can't tell a real value from a typo without knowing what the param means — this
  // is that limit, not a bug to chase further.
  const literal = names.find((n) => n === segment);
  if (literal) return [join(dir, literal)];
  return names.filter((n) => n.startsWith('[') && !n.startsWith('[...')).map((n) => join(dir, n));
}

/** Resolves segments against the route tree, branching over `[param]` folders at dynamic spots. */
function resolves(segments: string[]): boolean {
  let frontier = [ROUTES_ROOT];
  for (const segment of segments) {
    const next: string[] = [];
    for (const dir of frontier) {
      next.push(...childCandidates(dir, segment));
    }
    if (next.length === 0) return false;
    frontier = next;
  }
  return frontier.some(isRouteDir);
}

describe('internal links resolve to a real route', () => {
  const files = SCAN_DIRS.flatMap((d) => walk(join(REPO_ROOT, d))).filter((f) => !isExcluded(f));

  const links = files.flatMap((file) => {
    const rel = file.slice(REPO_ROOT.length);
    return extractLinks(readFileSync(file, 'utf8'), rel);
  });

  it('found at least one static link to check (the scan itself did not go silent)', () => {
    expect(links.length).toBeGreaterThan(20);
  });

  it('every static href/redirect resolves under src/routes', () => {
    const dead = links
      .map(({ file, raw }) => ({ file, raw, segments: toSegments(raw) }))
      .filter((l): l is { file: string; raw: string; segments: string[] } => l.segments !== null)
      .filter((l) => !resolves(l.segments))
      .map((l) => `${l.file} -> ${l.raw}`);

    expect(dead).toEqual([]);
  });
});
