import { describe, expect, it, vi, beforeEach } from 'vitest';
import { actions, load } from './+page.server';
import { fakeDb } from '$lib/server/db/fake-db';

const ORG = 'org-1';
const PROJECT = 'project-1';
const USER = 'user-1';

const { generateImagesWithoutBrandMock, safeFetchBytesMock } = vi.hoisted(() => ({
  generateImagesWithoutBrandMock: vi.fn(),
  safeFetchBytesMock: vi.fn()
}));
vi.mock('$lib/server/media-generate', () => ({
  generateImagesWithoutBrand: generateImagesWithoutBrandMock
}));
vi.mock('$lib/server/tool-guard', async (importOriginal) => ({
  ...(await importOriginal<typeof import('$lib/server/tool-guard')>()),
  safeFetchBytes: safeFetchBytesMock
}));

function fixture(rows: Record<string, unknown[]> = {}) {
  return fakeDb({
    orgs_members: [{ role: 'owner', orgs: { id: ORG, name: 'Org', slug: 'org' } }],
    projects: [{ id: PROJECT, name: 'Project', slug: 'project', brand_id: null, archived_at: null }],
    influencers: [],
    influencer_views: [],
    ...rows
  });
}

function event(fake: ReturnType<typeof fixture>, form?: Record<string, string | { file: File }>) {
  const body = new FormData();
  if (form) {
    for (const [key, value] of Object.entries(form)) {
      if (typeof value === 'string') body.set(key, value);
      else body.set(key, value.file);
    }
  }
  return {
    ...fake,
    request: new Request('http://localhost/p/project-1/influencers', { method: 'POST', body }),
    params: { projectId: PROJECT },
    locals: { safeGetSession: async () => ({ session: {}, user: { id: USER } }), db: async () => fake.db }
  };
}

beforeEach(() => {
  generateImagesWithoutBrandMock.mockReset();
  safeFetchBytesMock.mockReset();
  safeFetchBytesMock.mockResolvedValue({
    url: 'https://cdn/face.png',
    status: 200,
    ok: true,
    mime: 'image/png',
    bytes: Buffer.from([1, 2, 3])
  });
});

describe('load — la libreria influencer del progetto', () => {
  it('legge il catalogo + i propri attraverso listInfluencers, non una query propria', async () => {
    const fake = fixture({
      influencers: [
        {
          id: 'inf-1',
          org_id: null,
          template_of: null,
          name: 'Valeria',
          slug: 'valeria',
          gender: 'woman',
          age: 29,
          ethnicity: 'latin-american',
          body_type: 'athletic',
          height_band: 'average',
          summary: null,
          traits: {},
          source: 'catalogue',
          builder: null,
          consent: false,
          created_at: 'now'
        }
      ]
    });

    const out = (await load(event(fake) as never)) as { influencers: { id: string; name: string; source: string; canEdit: boolean }[] };

    expect(out.influencers).toHaveLength(1);
    expect(out.influencers[0]).toMatchObject({ id: 'inf-1', name: 'Valeria', source: 'catalogue', canEdit: false });
  });
});

describe('actions.template — "usa come modello" legge l\'origine per il builder', () => {
  it('chiama getInfluencer davvero e mappa i suoi attributi', async () => {
    const fake = fixture({
      influencers: [
        {
          id: 'inf-1',
          org_id: null,
          template_of: null,
          name: 'Valeria',
          slug: 'valeria',
          gender: 'woman',
          age: 29,
          ethnicity: 'latin-american',
          body_type: 'athletic',
          height_band: 'average',
          summary: 'A summary',
          traits: {},
          source: 'catalogue',
          builder: { gender: 'female' },
          consent: false,
          created_at: 'now'
        }
      ]
    });

    const result = await actions.template(event(fake, { influencerId: 'inf-1' }) as never);

    expect(result).toMatchObject({
      ok: true,
      template: {
        templateOf: 'inf-1',
        name: 'Valeria (copy)',
        gender: 'woman',
        ethnicity: 'latin-american',
        builder: { gender: 'female' }
      }
    });
  });

  it('un influencer inesistente torna 404, non un template vuoto', async () => {
    const fake = fixture();

    const result = await actions.template(event(fake, { influencerId: 'nope' }) as never);

    expect(result).toMatchObject({ status: 404 });
  });
});

describe('actions.generate — il volto prima, poi le viste, attraverso i repository veri', () => {
  it('crea la riga influencer via createInfluencer quando la generazione del volto riesce', async () => {
    generateImagesWithoutBrandMock.mockResolvedValue({
      ok: true,
      media: [{ id: 'm1', kind: 'image', mime: 'image/png', width: 1024, height: 1365, url: 'https://cdn/face.png', storage_path: 'x' }],
      model: 'gpt-image-2',
      renders: 1,
      costUsd: 0.02
    });

    const fake = fixture();
    const result = await actions.generate(
      event(fake, { name: 'Nova', prompt: 'a friendly presenter, warm smile' }) as never
    );

    expect(result).toMatchObject({ ok: true });
    expect(fake.calls.some((c) => c.table === 'influencers' && c.op === 'insert')).toBe(true);
    expect(fake.calls.some((c) => c.table === 'influencer_views' && c.op === 'insert')).toBe(true);
  });

  it('un volto che fallisce non scrive nessuna riga', async () => {
    generateImagesWithoutBrandMock.mockResolvedValue({ ok: false, error: 'render_failed' });

    const fake = fixture();
    const result = await actions.generate(event(fake, { name: 'Nova', prompt: 'a presenter' }) as never);

    expect(result).toMatchObject({ status: 422 });
    expect(fake.calls.some((c) => c.table === 'influencers' && c.op === 'insert')).toBe(false);
  });

  it('senza nome o descrizione, generateImagesWithoutBrand non viene nemmeno chiamato', async () => {
    const fake = fixture();
    const result = await actions.generate(event(fake, { name: '', prompt: '' }) as never);

    expect(result).toMatchObject({ status: 400 });
    expect(generateImagesWithoutBrandMock).not.toHaveBeenCalled();
  });
});

describe('actions.upload — foto caricate, il consenso è obbligatorio', () => {
  it('senza la spunta di consenso, niente riga scritta', async () => {
    const fake = fixture();
    const file = new File([new Uint8Array([1, 2, 3])], 'photo.jpg', { type: 'image/jpeg' });

    const result = await actions.upload(event(fake, { name: 'Marco', photo: { file } }) as never);

    expect(result).toMatchObject({ status: 400 });
    expect(fake.calls.some((c) => c.table === 'influencers' && c.op === 'insert')).toBe(false);
  });

  it('con consenso e almeno una foto, crea la riga e la vista attraverso i repository veri', async () => {
    const fake = fixture();
    const file = new File([new Uint8Array([1, 2, 3])], 'photo.jpg', { type: 'image/jpeg' });

    const result = await actions.upload(
      event(fake, { name: 'Marco', consent: 'on', photo: { file } }) as never
    );

    expect(result).toMatchObject({ ok: true });
    expect(fake.calls.some((c) => c.table === 'influencers' && c.op === 'insert')).toBe(true);
    expect(fake.calls.some((c) => c.table === 'influencer_views' && c.op === 'insert')).toBe(true);
  });
});
