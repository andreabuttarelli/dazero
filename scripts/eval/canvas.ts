import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { env } from '../_shims/env-private';
import { connectCanvas, type CanvasChange } from '$lib/realtime/canvas-channel';
import type { PresencePeer } from '$lib/realtime/presence-peers';

const WAIT_MS = 15_000;
const POLL_MS = 50;
const url = env.PUBLIC_SUPABASE_URL!;
const options = { auth: { persistSession: false, autoRefreshToken: false } };
const admin = createClient(url, env.SUPABASE_SERVICE_ROLE_KEY!, options);
const userIds: string[] = [];
const clients: SupabaseClient[] = [];
const cleanups: Array<() => void> = [];
const orgId = randomUUID();
const projectId = randomUUID();
const canvasId = randomUUID();
const scenarios = new Map([
  ['member presence', 'unrun'],
  ['node insert reaches collaborator', 'unrun'],
  ['node move reaches collaborator', 'unrun'],
  ['outsider cannot read nodes', 'unrun'],
  ['outsider presence rejected', 'unrun']
]);
let orgCreated = false;

async function checked<T>(result: PromiseLike<{ data: T; error: { message: string } | null }>): Promise<T> {
  const response = await result;
  if (response.error) {
    throw new Error(response.error.message);
  }
  return response.data;
}

async function account() {
  const email = `canvas-eval-${randomUUID()}@example.com`;
  const password = randomUUID();
  const created = await checked(admin.auth.admin.createUser({ email, password, email_confirm: true }));
  assert.ok(created.user);
  userIds.push(created.user.id);
  await checked(admin.from('profiles').upsert({ id: created.user.id, email, name: 'Canvas eval' }));
  const client = createClient(url, env.PUBLIC_SUPABASE_ANON_KEY!, options);
  clients.push(client);
  const signed = await checked(client.auth.signInWithPassword({ email, password }));
  assert.ok(signed.session);
  await client.realtime.setAuth(signed.session.access_token);
  return { client, userId: created.user.id };
}

async function until(predicate: () => boolean, label: string): Promise<void> {
  const deadline = Date.now() + WAIT_MS;
  while (!predicate()) {
    if (Date.now() >= deadline) {
      throw new Error(`Timeout: ${label}`);
    }
    await new Promise((resolve) => setTimeout(resolve, POLL_MS));
  }
}

function passed(name: string) {
  scenarios.set(name, 'pass');
  console.log(`PASS: ${name}`);
}

try {
  console.log(JSON.stringify({ unrun: [...scenarios.keys()], reason: 'Not yet executed' }));
  const first = await account();
  const second = await account();
  const outsider = await account();
  await checked(admin.from('orgs').insert({ id: orgId, name: 'Canvas eval', slug: `canvas-eval-${orgId}` }));
  orgCreated = true;
  await checked(admin.from('orgs_members').insert([
    { org_id: orgId, user_id: first.userId, role: 'owner' },
    { org_id: orgId, user_id: second.userId, role: 'member' }
  ]));
  await checked(admin.from('projects').insert({ id: projectId, org_id: orgId, name: 'Canvas eval', slug: 'canvas-eval' }));
  await checked(admin.from('canvases').insert({ id: canvasId, org_id: orgId, project_id: projectId, name: 'Canvas eval' }));
  await checked(first.client.rpc('auth_org_ids'));

  let peers: PresencePeer[] = [];
  const events: CanvasChange[] = [];
  const connected = new Set<string>();
  let channelError: unknown;
  for (const member of [first, second]) {
    cleanups.push(connectCanvas({
      client: member.client,
      canvasId,
      peer: { userId: member.userId, name: 'Canvas eval', avatar: null, path: `/app/c/${canvasId}`, threadId: null },
      onChange: (event) => { if (member === second) { events.push(event); } },
      onPeers: (value) => { if (member === second) { peers = value; } },
      onReconnect: () => { connected.add(member.userId); },
      onError: (error) => { channelError = error; }
    }));
  }
  await until(() => connected.size === 2 || !!channelError, 'member subscriptions');
  if (channelError) {
    throw new Error('Member realtime subscription failed');
  }
  await until(() => peers.some((peer) => peer.userId === first.userId), 'member presence');
  passed('member presence');

  const nodeId = randomUUID();
  await checked(first.client.from('nodes').insert({
    id: nodeId, org_id: orgId, project_id: projectId, canvas_id: canvasId,
    type: 'text', x: 10, y: 20, data: { prompt: 'Realtime eval' }, actor_kind: 'user', actor_id: first.userId
  }));
  await until(() => events.some((event) => event.eventType === 'INSERT' && event.new.id === nodeId), 'node insert');
  passed('node insert reaches collaborator');
  await checked(first.client.from('nodes').update({ x: 120, y: 240 }).eq('id', nodeId));
  await until(() => events.some((event) => event.eventType === 'UPDATE' && event.new.id === nodeId && event.new.x === 120 && event.new.y === 240), 'node move');
  passed('node move reaches collaborator');

  const hidden = await checked(outsider.client.from('nodes').select('id').eq('canvas_id', canvasId));
  assert.deepEqual(hidden, []);
  passed('outsider cannot read nodes');
  const outsiderChannel = outsider.client.channel(`canvas:${canvasId}`, { config: { private: true } });
  outsiderChannel.on('presence', { event: 'sync' }, () => {});
  let outsiderStatus = '';
  outsiderChannel.subscribe((status) => { outsiderStatus = status; });
  await until(() => ['SUBSCRIBED', 'CHANNEL_ERROR'].includes(outsiderStatus), 'outsider authorization verdict');
  assert.equal(outsiderStatus, 'CHANNEL_ERROR', 'Outsider joined private canvas');
  passed('outsider presence rejected');
} catch (error) {
  console.error('FAIL:', error instanceof Error ? error.message : 'Unknown evaluation error');
  process.exitCode = 1;
} finally {
  for (const cleanup of cleanups) {
    cleanup();
  }
  const cleanupErrors: string[] = [];
  for (const client of clients) {
    await client.removeAllChannels().catch(() => { cleanupErrors.push('remove realtime channels'); });
  }
  if (orgCreated) {
    await checked(admin.from('orgs').delete().eq('id', orgId)).catch(() => { cleanupErrors.push('delete disposable organization'); });
  }
  for (const userId of userIds) {
    await checked(admin.auth.admin.deleteUser(userId)).catch(() => { cleanupErrors.push('delete disposable account'); });
  }
  console.log(JSON.stringify({ scenarios: Object.fromEntries(scenarios), unrun: [...scenarios].filter(([, status]) => status === 'unrun').map(([name]) => name), cleanupErrors }));
  if (cleanupErrors.length) {
    process.exitCode = 1;
  }
}
