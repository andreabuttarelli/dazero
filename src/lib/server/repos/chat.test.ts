import { describe, expect, it } from 'vitest';
import { fakeDb, filtersOf } from '$lib/server/db/fake-db';
import { agentActor, SIDEBAR_AGENT_KEY } from '$lib/server/repos/actor';
import { HISTORY_LIMIT, loadTurns, openThread, saveTurn } from './chat';

const ORG = '11111111-1111-1111-1111-111111111111';
const PROJECT = '22222222-2222-2222-2222-222222222222';
const USER = '33333333-3333-3333-3333-333333333333';
const THREAD = '44444444-4444-4444-4444-444444444444';

describe('openThread — un thread per progetto e utente, sempre dentro la org', () => {
  it('riapre quello esistente invece di crearne un altro', async () => {
    const { db, calls } = fakeDb({ chat_threads: [{ id: THREAD }] });

    const id = await openThread(db, { orgId: ORG, projectId: PROJECT, userId: USER });

    expect(id).toBe(THREAD);
    expect(calls.some((c) => c.op === 'insert')).toBe(false);
  });

  it('la ricerca è scopata su org, progetto e utente', async () => {
    const { db, calls } = fakeDb({ chat_threads: [{ id: THREAD }] });

    await openThread(db, { orgId: ORG, projectId: PROJECT, userId: USER });

    expect(filtersOf(calls, 'select')).toMatchObject({ org_id: ORG, project_id: PROJECT, created_by: USER });
  });

  it('l insert porta org_id — senza, la service role scriverebbe nel tenant sbagliato', async () => {
    const { db, calls } = fakeDb({ chat_threads: [] });

    await openThread(db, { orgId: ORG, projectId: PROJECT, userId: USER, brandId: null });

    const insert = calls.find((c) => c.op === 'insert')!;
    expect(insert.payload).toMatchObject({
      org_id: ORG,
      project_id: PROJECT,
      created_by: USER,
      surface: 'sidebar'
    });
  });
});

describe('saveTurn — seq progressivo e actor agente', () => {
  it('scrive actor_kind agent, actor_id e agent_key', async () => {
    const { db, calls } = fakeDb({ chat_messages: [{ seq: 4 }] });

    await saveTurn(db, {
      orgId: ORG,
      threadId: THREAD,
      role: 'user',
      content: 'ciao',
      actor: agentActor(USER)
    });

    const insert = calls.find((c) => c.op === 'insert')!;
    expect(insert.payload).toMatchObject({
      org_id: ORG,
      thread_id: THREAD,
      seq: 5,
      actor_kind: 'agent',
      actor_id: USER,
      agent_key: SIDEBAR_AGENT_KEY
    });
  });

  it('la lettura della storia è scopata su org e thread', async () => {
    const { db, calls } = fakeDb({ chat_messages: [] });

    await loadTurns(db, { orgId: ORG, threadId: THREAD });

    expect(filtersOf(calls, 'select')).toMatchObject({ org_id: ORG, thread_id: THREAD });
    expect(calls.find((c) => c.op === 'select')!.limit).toBe(HISTORY_LIMIT);
  });
});
