import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { createClient } from '@supabase/supabase-js';
import { env } from '../_shims/env-private';
import { createUserDb } from '$lib/server/db/client';
import { enterApp, ENTRY_DEPS } from '$lib/server/tenancy/entry';

const admin = createClient(env.PUBLIC_SUPABASE_URL!, env.SUPABASE_SERVICE_ROLE_KEY!, {
  auth: { persistSession: false, autoRefreshToken: false }
});
const email = `bootstrap-${randomUUID()}@example.com`;
const password = randomUUID();
let userId: string | undefined;

try {
  const created = await admin.auth.admin.createUser({ email, password, email_confirm: true });
  if (created.error) {
    throw created.error;
  }
  userId = created.data.user.id;

  const anon = createClient(env.PUBLIC_SUPABASE_URL!, env.PUBLIC_SUPABASE_ANON_KEY!, {
    auth: { persistSession: false, autoRefreshToken: false }
  });
  const signed = await anon.auth.signInWithPassword({ email, password });
  if (signed.error) {
    throw signed.error;
  }
  const db = createUserDb(signed.data.session.access_token);
  const memberships = await db.rpc('auth_org_ids');
  if (memberships.error) {
    throw memberships.error;
  }
  assert.deepEqual(memberships.data, []);
  const [first, concurrent] = await Promise.all([
    enterApp(db, ENTRY_DEPS, signed.data.user),
    enterApp(db, ENTRY_DEPS, signed.data.user)
  ]);
  assert.deepEqual(concurrent, first);
  const second = await enterApp(db, ENTRY_DEPS, signed.data.user);
  assert.deepEqual(second, first);
  const projects = await db.from('projects').select('id, brand_id').eq('org_id', first.orgId);
  if (projects.error) {
    throw projects.error;
  }
  assert.equal(projects.data.length, 1);
  assert.equal(projects.data[0].brand_id, null);
  console.log('PASS: authenticated bootstrap creates one brandless project and reuses its canvas');
} catch (error) {
  console.error('FAIL:', error instanceof Error ? error.message : error);
  process.exitCode = 1;
} finally {
  if (userId) {
    const memberships = await admin.from('orgs_members').select('org_id').eq('user_id', userId);
    if (memberships.error) {
      throw memberships.error;
    }
    for (const membership of memberships.data ?? []) {
      const deleted = await admin.from('orgs').delete().eq('id', membership.org_id);
      if (deleted.error) {
        throw deleted.error;
      }
    }
    const deleted = await admin.auth.admin.deleteUser(userId);
    if (deleted.error) {
      throw deleted.error;
    }
    console.log('Disposable account and workspace removed');
  }
}
