import { describe, expect, it, vi, beforeEach } from 'vitest';
import { fakeDb } from '$lib/server/db/fake-db';

/**
 * UNA FUNZIONE NON ESISTE FINCHÉ NON È COLLEGATA (CLAUDE.md). Questo file prova che le action
 * `schedule`/`publishNow`/`cancel`/`reschedule` di +page.server.ts SONO quelle che il click nel
 * browser chiama — non una funzione isolata mai raggiunta — chiamando le `actions` vere,
 * esportate da questo file, con un `Db` vero (via `fakeDb`, che post-delivery.ts interroga per
 * davvero) e un `SocialPublisher` finto al SUO confine: `publish`/`postStatus`/`deletePost` sono
 * mock, tutto il resto (auth org_id, formatFor, scrittura del puntatore) gira per davvero.
 *
 * IL PERCORSO CHE QUESTO FILE PROVA, FILE PER FILE:
 *   +page.svelte (form action="?/schedule")
 *     → +page.server.ts::actions.schedule (legge la FormData, risolve org_id dal progetto)
 *       → post-delivery.ts::scheduleDelivery (formatFor, un publish() per account)
 *         → publishing/port.ts::SocialPublisher.publish (mock qui; Zernio nel vero deploy)
 */
const publish = vi.fn();
const postStatus = vi.fn();
const deletePost = vi.fn();

vi.mock('$lib/server/publishing', () => ({
  publisher: {
    kind: 'zernio',
    publish: (...a: unknown[]) => publish(...a),
    postStatus: (...a: unknown[]) => postStatus(...a),
    deletePost: (...a: unknown[]) => deletePost(...a)
  }
}));

const { actions } = await import('./+page.server');

const ORG = 'org-1';
const PROJECT = 'proj-1';
const BRAND = 'brand-1';
const POST_ID = 'post-1';
const ACCOUNT_ID = 'account-1';

function seedRows() {
  return {
    projects: [{ id: PROJECT, org_id: ORG }],
    posts: [
      {
        id: POST_ID,
        brand_id: BRAND,
        caption: 'Ciao dal test',
        per_platform: null,
        media: [{ assetId: 'asset-1', order: 0, role: 'media' }],
        zernio_post_ids: {}
      }
    ],
    social_accounts: [
      { id: ACCOUNT_ID, brand_id: BRAND, platform: 'instagram', zernio_account_id: 'zern-1', status: 'connected' }
    ],
    assets: [{ id: 'asset-1', type: 'image', url: 'https://cdn.feega.app/asset-1.jpg' }]
  };
}

function formEvent(fields: Record<string, string | string[]>, db: unknown) {
  const fd = new FormData();
  for (const [key, value] of Object.entries(fields)) {
    for (const v of Array.isArray(value) ? value : [value]) fd.append(key, v);
  }
  return {
    request: { formData: async () => fd },
    params: { projectId: PROJECT },
    locals: { db: async () => db }
  };
}

beforeEach(() => {
  publish.mockReset();
  postStatus.mockReset();
  deletePost.mockReset();
});

describe('actions.schedule: dal form al client Zernio', () => {
  it('chiama publish() con account e caption reali, non finge', async () => {
    publish.mockResolvedValue({ ok: true, postId: 'zernio-post-1' });
    const { db } = fakeDb(seedRows());

    const result = (await (actions.schedule as (e: unknown) => Promise<unknown>)(
      formEvent({ postId: POST_ID, accountId: ACCOUNT_ID, scheduledFor: '2030-01-01T10:00:00.000Z' }, db)
    )) as { scheduled: boolean; result: { deliveries: unknown[] } };

    expect(publish).toHaveBeenCalledTimes(1);
    expect(publish).toHaveBeenCalledWith(
      expect.objectContaining({
        accountId: 'zern-1',
        platform: 'instagram',
        content: 'Ciao dal test',
        scheduledFor: '2030-01-01T10:00:00.000Z'
      })
    );
    expect(result.scheduled).toBe(true);
    expect(result.result.deliveries).toEqual([{ accountId: ACCOUNT_ID, ok: true, zernioPostId: 'zernio-post-1' }]);
  });

  it('senza postId o account risponde 400 senza chiamare Zernio', async () => {
    const { db } = fakeDb(seedRows());

    const result = (await (actions.schedule as (e: unknown) => Promise<unknown>)(formEvent({ postId: '' }, db))) as {
      status: number;
    };

    expect(publish).not.toHaveBeenCalled();
    expect(result.status).toBe(400);
  });
});

describe('actions.publishNow: dal form al client Zernio, senza scheduledFor', () => {
  it('chiama publish() senza scheduledFor: publishNow lato Zernio', async () => {
    publish.mockResolvedValue({ ok: true, postId: 'zernio-post-2' });
    const { db } = fakeDb(seedRows());

    await (actions.publishNow as (e: unknown) => Promise<unknown>)(formEvent({ postId: POST_ID, accountId: ACCOUNT_ID }, db));

    expect(publish).toHaveBeenCalledWith(expect.objectContaining({ scheduledFor: undefined }));
  });
});

describe('actions.cancel: dal form a deletePost() su Zernio', () => {
  it('chiama deletePost() con l id Zernio del puntatore, non un id inventato', async () => {
    const withPointer = { ...seedRows(), posts: [{ ...seedRows().posts[0], zernio_post_ids: { [ACCOUNT_ID]: 'zernio-post-3' } }] };
    const { db } = fakeDb(withPointer);

    const result = (await (actions.cancel as (e: unknown) => Promise<unknown>)(
      formEvent({ postId: POST_ID, accountId: ACCOUNT_ID }, db)
    )) as { canceled: boolean };

    expect(deletePost).toHaveBeenCalledWith('zernio-post-3');
    expect(result.canceled).toBe(true);
  });

  it('un fallimento di Zernio torna un 502, e la action non lo scambia per successo', async () => {
    deletePost.mockRejectedValue(new Error('Zernio 500: boom'));
    const withPointer = { ...seedRows(), posts: [{ ...seedRows().posts[0], zernio_post_ids: { [ACCOUNT_ID]: 'zernio-post-3' } }] };
    const { db } = fakeDb(withPointer);

    const result = (await (actions.cancel as (e: unknown) => Promise<unknown>)(
      formEvent({ postId: POST_ID, accountId: ACCOUNT_ID }, db)
    )) as { status: number };

    expect(result.status).toBe(502);
  });
});

describe('actions.reschedule: cancella su Zernio e riconsegna con il nuovo orario', () => {
  it('chiama deletePost() e poi publish() con lo scheduledFor nuovo', async () => {
    publish.mockResolvedValue({ ok: true, postId: 'zernio-post-4' });
    const withPointer = { ...seedRows(), posts: [{ ...seedRows().posts[0], zernio_post_ids: { [ACCOUNT_ID]: 'zernio-post-old' } }] };
    const { db } = fakeDb(withPointer);

    const result = (await (actions.reschedule as (e: unknown) => Promise<unknown>)(
      formEvent({ postId: POST_ID, accountId: ACCOUNT_ID, scheduledFor: '2030-02-01T09:00:00.000Z' }, db)
    )) as { rescheduled: boolean };

    expect(deletePost).toHaveBeenCalledWith('zernio-post-old');
    expect(publish).toHaveBeenCalledWith(expect.objectContaining({ scheduledFor: '2030-02-01T09:00:00.000Z' }));
    expect(result.rescheduled).toBe(true);
  });
});
