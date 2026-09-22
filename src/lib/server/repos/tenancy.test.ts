import { describe, expect, it } from 'vitest';
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { SERVICE_ROLE_USES } from '$lib/server/db/service-role-uses';

/**
 * IL GUARDIANO DEL NUOVO SCHEMA.
 *
 * Ogni tabella porta `org_id`, e la RLS la difende — ma solo per chi arriva con la chiave anon.
 * La service role ha `bypassrls`, quindi una lettura scopata su `project_id` da sola attraversa
 * il tenant: un id che arriva dall'URL è di chiunque finché qualcuno non lo lega a un'org.
 *
 * Tre regole, e leggono il sorgente dei repository perché è l'unico posto dove il nuovo codice
 * parla col database. Un repository nuovo che si dimentica l'org viene visto qui, non in
 * produzione.
 */
const REPOS = fileURLToPath(new URL('.', import.meta.url));
const PROJECT_AGENT = fileURLToPath(new URL('../project-agent/', import.meta.url));

const TENANT_FILTER = /\.eq\(\s*['"]org_id['"]/;
const SCOPED_BY_CHILD = /\.eq\(\s*['"](project_id|canvas_id|node_id|post_id|brand_id)['"]/;
const READ = /\.select\(/;
const WRITE = /\.(insert|update|upsert|delete)\(/;
const ORG_IN_PAYLOAD = /org_id:/;

/**
 * Le tabelle senza `org_id`, in un posto solo, con accanto CHI le difende al posto suo. Chiedere
 * `org_id` qui vorrebbe dire una colonna che non esiste, quindi la regola lo dichiara invece di
 * inciampare. Una tabella nuova senza `org_id` è una riga in più QUI, e una decisione presa.
 *
 *   post_sources  il genitore: chiave primaria fatta delle due FK, e una policy difende il post
 *   profiles      l'utente: la policy è `id = auth.uid()`, il tenant è la persona, non l'org
 *   orgs          sé stessa: la policy è `id in auth_org_ids()`, la colonna org_id sarebbe id
 */
const TENANT_BY_OTHER_MEANS = new Set(['post_sources', 'profiles', 'orgs']);
const TABLE = /\.from\(\s*['"]([a-z_]+)['"]/;

function tableOf(chain: string): string {
  return chain.match(TABLE)?.[1] ?? '';
}

type Finding = { file: string; line: number; chain: string };

function chainsFrom(src: string): { at: number; chain: string }[] {
  const out: { at: number; chain: string }[] = [];
  for (let at = src.indexOf('.from('); at !== -1; at = src.indexOf('.from(', at + 1)) {
    out.push({ at, chain: src.slice(at).split(';')[0] });
  }
  return out;
}

function finding(file: string, src: string, at: number, chain: string): Finding {
  return { file, line: src.slice(0, at).split('\n').length, chain: chain.replace(/\s+/g, ' ').slice(0, 120) };
}

/** Una lettura scopata su un figlio (project, canvas, node) e su nient'altro esce dall'org. */
export function readsAcrossOrgs(file: string, src: string): Finding[] {
  const out: Finding[] = [];
  for (const { at, chain } of chainsFrom(src)) {
    if (!READ.test(chain) || WRITE.test(chain)) continue;
    if (!SCOPED_BY_CHILD.test(chain)) continue;
    if (TENANT_FILTER.test(chain)) continue;
    if (TENANT_BY_OTHER_MEANS.has(tableOf(chain))) continue;

    out.push(finding(file, src, at, chain));
  }
  return out;
}

/**
 * Una scrittura porta l'org nel payload E la ripete nel `WHERE` quando filtra su un id esterno.
 * Senza il `WHERE`, un `org_id` nel `SET` sposta la riga nel tenant nominato da chi chiama.
 */
export function writesAcrossOrgs(file: string, src: string): Finding[] {
  const out: Finding[] = [];
  for (const { at, chain } of chainsFrom(src)) {
    if (!WRITE.test(chain)) continue;
    if (TENANT_BY_OTHER_MEANS.has(tableOf(chain))) continue;
    if (/\.insert\(/.test(chain)) {
      if (ORG_IN_PAYLOAD.test(chain)) continue;
      out.push(finding(file, src, at, chain));
      continue;
    }
    if (TENANT_FILTER.test(chain)) continue;

    out.push(finding(file, src, at, chain));
  }
  return out;
}

function repoFiles(): string[] {
  const from = (dir: string) =>
    readdirSync(dir)
      .filter((n) => n.endsWith('.ts') && !n.includes('.test.'))
      .map((n) => join(dir, n));

  return [...from(REPOS), ...from(PROJECT_AGENT)];
}

const report = (findings: Finding[]) =>
  findings.map((f) => `${f.file.slice(REPOS.length)}:${f.line}\n    ${f.chain}`).join('\n');

describe('la regola riconosce il difetto', () => {
  it('segnala una lettura scopata solo su project_id', () => {
    const src = "await db.from('assets').select('*').eq('project_id', projectId);";

    expect(readsAcrossOrgs('assets.ts', src)).toHaveLength(1);
  });

  it('accetta la stessa lettura con org_id accanto', () => {
    const src = "await db.from('assets').select('*').eq('org_id', orgId).eq('project_id', projectId);";

    expect(readsAcrossOrgs('assets.ts', src)).toEqual([]);
  });

  it('segnala un insert senza org_id nel payload', () => {
    const src = "await db.from('nodes').insert({ project_id: projectId, type, x, y });";

    expect(writesAcrossOrgs('canvas.ts', src)).toHaveLength(1);
  });

  it('accetta un insert che porta org_id', () => {
    const src = "await db.from('nodes').insert({ org_id: orgId, project_id: projectId, type, x, y });";

    expect(writesAcrossOrgs('canvas.ts', src)).toEqual([]);
  });

  it('segnala un update scopato solo sull id', () => {
    const src = "await db.from('nodes').update({ x, y }).eq('id', nodeId);";

    expect(writesAcrossOrgs('canvas.ts', src)).toHaveLength(1);
  });

  it('accetta un update che ripete org_id nel WHERE', () => {
    const src = "await db.from('nodes').update({ x, y }).eq('id', nodeId).eq('org_id', orgId);";

    expect(writesAcrossOrgs('canvas.ts', src)).toEqual([]);
  });

  it('segnala una delete scopata solo sull id', () => {
    const src = "await db.from('nodes_connections').delete().eq('id', connectionId);";

    expect(writesAcrossOrgs('canvas.ts', src)).toHaveLength(1);
  });

  it('lascia stare una tabella ponte, che org_id non ce l ha', () => {
    const src = "await db.from('post_sources').select('post_id, node_id, role').eq('post_id', postId);";

    expect(readsAcrossOrgs('posts.ts', src)).toEqual([]);
  });

  it('l eccezione vale solo per le tabelle dichiarate', () => {
    const src = "await db.from('scheduled_posts').select('*').eq('post_id', postId);";

    expect(readsAcrossOrgs('publishing.ts', src)).toHaveLength(1);
  });
});

describe('i repository non escono dall org', () => {
  const files = repoFiles();

  it('ha trovato i repository da controllare', () => {
    expect(files.length).toBeGreaterThan(3);
  });

  it('nessuna lettura scopata su un figlio senza org_id', () => {
    const findings = files.flatMap((f) => readsAcrossOrgs(f, readFileSync(f, 'utf-8')));

    expect(findings, `la RLS non difende la service role:\n${report(findings)}`).toEqual([]);
  });

  it('nessuna scrittura senza org_id nel payload o nel WHERE', () => {
    const findings = files.flatMap((f) => writesAcrossOrgs(f, readFileSync(f, 'utf-8')));

    expect(findings, `il WHERE è scopato, il SET no:\n${report(findings)}`).toEqual([]);
  });
});

/**
 * La service role scavalca la RLS: ogni punto che la usa sta nel registro, con la riga che dice
 * perché. Il registro è una tabella sola — il CLAUDE.md chiede che le eccezioni si dichiarino
 * accanto al modello che le governa, non sparse in un `if` per volta.
 */
describe('ogni uso della service role è dichiarato', () => {
  it('ogni voce porta una giustificazione', () => {
    for (const use of SERVICE_ROLE_USES) {
      expect(use.why.length, `${use.path} non dice perché`).toBeGreaterThan(20);
    }
  });

  it('nessun repository costruisce un client service role', () => {
    const offenders = repoFiles().filter((f) => /createServiceRoleClient|createAdminClient/.test(readFileSync(f, 'utf-8')));

    expect(offenders, 'un repository riceve il client, non lo sceglie').toEqual([]);
  });

  it('il report dei file in project-agent non esce dall org', () => {
    const agentFiles = readdirSync(PROJECT_AGENT)
      .filter((n) => n.endsWith('.ts') && !n.includes('.test.'))
      .map((n) => join(PROJECT_AGENT, n));
    const findings = agentFiles.flatMap((f) => [
      ...readsAcrossOrgs(f, readFileSync(f, 'utf-8')),
      ...writesAcrossOrgs(f, readFileSync(f, 'utf-8'))
    ]);

    expect(findings).toEqual([]);
  });
});
