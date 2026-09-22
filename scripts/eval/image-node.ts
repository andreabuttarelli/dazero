import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { env } from '../_shims/env-private';
import { runGenNode } from '$lib/server/canvas/generate';
import { GPT_IMAGE_25_FLARE_MODEL } from '$lib/image-models';

/**
 * LA PROVA CHE UN'IMMAGINE ATTERRA DAVVERO, NON SOLO CHE IL BUCKET ESISTE.
 *
 * `eval:canvas.ts` prova che il realtime funziona; questo prova che il motore che i nodi
 * immagine chiamano (`runGenNode` → `generateImagesWithoutBrand` → il bucket `brand-knowledge`)
 * produce un file vero. Un bucket creato e una policy scritta non bastano: `store_failed` può
 * ancora tornare se il modello non risponde, se `storage.upload` viene respinto per un motivo che
 * la policy non dice, o se la riga in `assets` nasce senza un file dietro. Solo scaricare
 * l'oggetto e contarne i byte chiude la domanda.
 *
 * Un solo render, il modello più economico del catalogo (`gpt-image-2.5-flare`, ~$0,0053 —
 * vedi il commento in `$lib/image-models.ts`): questo giro spende soldi veri.
 */
const url = env.PUBLIC_SUPABASE_URL!;
const options = { auth: { persistSession: false, autoRefreshToken: false } };
const admin = createClient(url, env.SUPABASE_SERVICE_ROLE_KEY!, options);
const BUCKET = 'brand-knowledge';

const orgId = randomUUID();
const projectId = randomUUID();
const canvasId = randomUUID();
const nodeId = randomUUID();

let userId: string | undefined;
let userClient: SupabaseClient | undefined;
let orgCreated = false;
let storagePath: string | undefined;

const scenarios = new Map([
  ['disposable user + org + project + canvas exist', 'unrun'],
  ['image node created on canvas', 'unrun'],
  ['runGenNode reaches status done', 'unrun'],
  ['assets row is generated/image with a url', 'unrun'],
  ['the object is genuinely in Storage, non-zero bytes', 'unrun'],
  ["node data has running:false and no error", 'unrun']
]);

async function checked<T>(result: PromiseLike<{ data: T; error: { message: string } | null }>): Promise<T> {
  const response = await result;
  if (response.error) {
    throw new Error(response.error.message);
  }
  return response.data;
}

function passed(name: string) {
  scenarios.set(name, 'pass');
  console.log(`PASS: ${name}`);
}

try {
  console.log(JSON.stringify({ unrun: [...scenarios.keys()], reason: 'Not yet executed' }));

  const email = `image-node-eval-${randomUUID()}@example.com`;
  const password = randomUUID();
  const created = await checked(admin.auth.admin.createUser({ email, password, email_confirm: true }));
  assert.ok(created.user);
  userId = created.user.id;
  await checked(admin.from('profiles').upsert({ id: userId, email, name: 'Image node eval' }));

  userClient = createClient(url, env.PUBLIC_SUPABASE_ANON_KEY!, options);
  const signed = await checked(userClient.auth.signInWithPassword({ email, password }));
  assert.ok(signed.session);

  await checked(admin.from('orgs').insert({ id: orgId, name: 'Image node eval', slug: `image-node-eval-${orgId}` }));
  orgCreated = true;
  await checked(admin.from('orgs_members').insert({ org_id: orgId, user_id: userId, role: 'owner' }));
  await checked(admin.from('projects').insert({ id: projectId, org_id: orgId, name: 'Image node eval', slug: 'image-node-eval' }));
  await checked(admin.from('canvases').insert({ id: canvasId, org_id: orgId, project_id: projectId, name: 'Image node eval' }));
  passed('disposable user + org + project + canvas exist');

  const node = await checked(userClient.from('nodes').insert({
    id: nodeId,
    org_id: orgId,
    project_id: projectId,
    canvas_id: canvasId,
    type: 'image',
    x: 0,
    y: 0,
    data: {},
    actor_kind: 'user',
    actor_id: userId
  }).select('version').single());
  passed('image node created on canvas');

  const outcome = await runGenNode(userClient as never, {
    orgId,
    projectId,
    canvasId,
    nodeId,
    userId,
    medium: 'image',
    prompt: 'a single red circle on a white background',
    model: GPT_IMAGE_25_FLARE_MODEL,
    params: { aspectRatio: '1:1' },
    expectedVersion: node.version
  });

  if (outcome.kind !== 'done') {
    if (outcome.kind === 'refused') {
      const run = await admin
        .from('node_runs')
        .select('error')
        .eq('org_id', orgId)
        .eq('node_id', nodeId)
        .order('started_at', { ascending: false })
        .limit(1)
        .maybeSingle();
      console.error('node_runs.error:', run.data?.error ?? outcome.error);
    } else {
      console.error('runGenNode did not finish:', JSON.stringify(outcome));
    }
    throw new Error(`runGenNode did not reach done (kind: ${outcome.kind})`);
  }
  assert.equal(outcome.run.status, 'done');
  passed('runGenNode reaches status done');

  assert.equal(outcome.asset.source, 'generated');
  assert.equal(outcome.asset.type, 'image');
  assert.ok(outcome.asset.url, 'asset.url must be non-null');
  storagePath = outcome.asset.url!;
  passed('assets row is generated/image with a url');

  const downloaded = await admin.storage.from(BUCKET).download(storagePath);
  if (downloaded.error) {
    throw new Error(`Storage download failed for ${storagePath}: ${downloaded.error.message}`);
  }
  const bytes = downloaded.data.size;
  assert.ok(bytes > 0, `stored object must have non-zero bytes, got ${bytes}`);
  console.log(`Stored object bytes: ${bytes}`);
  passed('the object is genuinely in Storage, non-zero bytes');

  const shownNode = await checked(admin.from('nodes').select('data').eq('org_id', orgId).eq('id', nodeId).single());
  const shownData = shownNode.data as { running?: boolean; error?: string | null };
  assert.equal(shownData.running, false);
  assert.equal(shownData.error ?? null, null);
  passed("node data has running:false and no error");

  const runRow = await admin
    .from('node_runs')
    .select('cost_usd')
    .eq('org_id', orgId)
    .eq('node_id', nodeId)
    .order('started_at', { ascending: false })
    .limit(1)
    .maybeSingle();
  console.log(`node_runs.cost_usd: ${runRow.data?.cost_usd ?? 'null (no ai_calls row billed in scope)'}`);
} catch (error) {
  console.error('FAIL:', error instanceof Error ? error.message : 'Unknown evaluation error');
  process.exitCode = 1;
} finally {
  const cleanupErrors: string[] = [];

  if (storagePath) {
    await admin.storage.from(BUCKET).remove([storagePath]).catch(() => { cleanupErrors.push('remove stored object'); });
  }
  if (orgCreated) {
    await checked(admin.from('orgs').delete().eq('id', orgId)).catch(() => { cleanupErrors.push('delete disposable organization'); });
  }
  if (userId) {
    await checked(admin.auth.admin.deleteUser(userId)).catch(() => { cleanupErrors.push('delete disposable account'); });
  }

  console.log(JSON.stringify({ scenarios: Object.fromEntries(scenarios), unrun: [...scenarios].filter(([, status]) => status === 'unrun').map(([name]) => name), cleanupErrors }));
  if (cleanupErrors.length) {
    process.exitCode = 1;
  }
}
