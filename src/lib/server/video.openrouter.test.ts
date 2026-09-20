import { describe, it, expect, vi, beforeEach } from 'vitest';

/**
 * IL CABLAGGIO: che il render arrivi davvero al gateway, e che un job consegnato resti
 * recuperabile DA CHI L'HA PRESO.
 *
 * La proprietà che costa se si rompe è la seconda. Una riga in coda sopravvive al deploy: se il
 * riconciliatore decidesse il fornitore dalla configurazione di adesso invece che dalla riga, non
 * ritroverebbe mai il job, e la clip già pagata resterebbe lì senza che nessuno se ne accorga.
 */

const M = vi.hoisted(() => ({
  env: {} as Record<string, string | undefined>,
  logged: [] as Record<string, unknown>[]
}));
vi.mock('$env/dynamic/private', () => ({ env: M.env }));
vi.mock('$lib/server/ai-log', () => ({
  logAiCall: (e: Record<string, unknown>) => void M.logged.push(e),
  getBrandContext: () => null,
  getOrgContext: () => null,
  withBrandContext: <T>(_b: string, fn: () => T) => fn()
}));

let hits: string[];

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });
}

function stubFetch(replies: Record<string, unknown> = {}) {
  const f = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input);
    hits.push(`${init?.method ?? 'GET'} ${url}`);
    if (url.includes('openrouter.ai/api/v1/videos') && init?.method === 'POST') {
      return json({ id: 'or-job-1', status: 'pending' }, 202);
    }
    if (url.includes('openrouter.ai/api/v1/videos/')) {
      return json(replies.poll ?? { status: 'pending' });
    }
    return new Response(new Uint8Array([1, 2, 3]), { status: 200 });
  });
  vi.stubGlobal('fetch', f);
  return f;
}

const RENDER = {
  model: 'bytedance/seedance-2-5',
  prompt: 'p',
  durationSeconds: 8,
  resolution: '480p',
  coverUrl: undefined,
  persistOpts: { captions: false, tighten: false },
  submittedAt: Date.now()
};

const supabase = {
  storage: {
    from: () => ({
      upload: async () => ({ error: null }),
      getPublicUrl: () => ({ data: { publicUrl: 'https://cdn.test/stored.mp4' } })
    })
  }
} as never;

describe('il cablaggio del video verso OpenRouter', () => {
  beforeEach(() => {
    vi.resetModules();
    for (const k of Object.keys(M.env)) delete M.env[k];
    Object.assign(M.env, { OPENROUTER_API_KEY: 'o' });
    M.logged.length = 0;
    hits = [];
  });

  it('l’invio va a OpenRouter, e l’id resta marchiato', async () => {
    stubFetch();
    const { submitVideoRender } = await import('./video');
    const out = await submitVideoRender('una tazza che fuma', { model: 'bytedance/seedance-2-5' });

    expect(out?.taskId).toBe('openrouter:or-job-1');
    expect(hits.some((h) => h.includes('openrouter.ai'))).toBe(true);
  });

  it('il riconciliatore segue la RIGA, e non rimanda niente', async () => {
    stubFetch({
      poll: {
        status: 'completed',
        unsigned_urls: ['https://openrouter.ai/api/v1/videos/or-job-1/content?index=0'],
        usage: { cost: 0.64 }
      }
    });
    const { finishVideoRender } = await import('./video');
    const outcome = await finishVideoRender(supabase, 'user-1', {
      ...RENDER,
      taskId: 'openrouter:or-job-1'
    });

    expect(outcome.status).toBe('done');
    expect(hits.filter((h) => h.startsWith('POST')), 'nessun secondo invio').toEqual([]);
    expect(M.logged.at(-1)).toMatchObject({
      provider: 'openrouter',
      model: 'bytedance/seedance-2.5',
      ok: true,
      flatCostUsd: 0.64
    });
  });

  /**
   * Una riga senza marchio è di un trasporto che non esiste più: nessuno la può risolvere.
   *
   * Dirlo subito la chiude. Restare `pending` la lascerebbe girare nel riconciliatore fino alla
   * finestra di resa, un'ora di tick su un lavoro che non tornerà mai.
   */
  it('un id senza marchio non ha più nessuno a cui chiedere, e lo dice subito', async () => {
    stubFetch();
    const { finishVideoRender } = await import('./video');

    const outcome = await finishVideoRender(supabase, 'user-1', { ...RENDER, taskId: 'task-senza-marchio' });

    expect(outcome.status).toBe('failed');
    expect(hits, 'nemmeno un giro di rete').toEqual([]);
  });

  it('la clip si scarica con la chiave: senza, OpenRouter risponde 401', async () => {
    const f = stubFetch({
      poll: {
        status: 'completed',
        unsigned_urls: ['https://openrouter.ai/api/v1/videos/or-job-1/content?index=0'],
        usage: { cost: 0.64 }
      }
    });
    const { finishVideoRender } = await import('./video');
    await finishVideoRender(supabase, 'user-1', { ...RENDER, taskId: 'openrouter:or-job-1' });

    const download = f.mock.calls.find(([u]) => String(u).includes('/content?index=0'));
    expect((download?.[1] as RequestInit)?.headers).toMatchObject({ authorization: 'Bearer o' });
  });

  /**
   * C'È UN TRASPORTO SOLO, quindi un modello fuori dal suo catalogo non ha un ripiego: aveva un
   * altro fornitore da cui passare, e quel fornitore non esiste più.
   *
   * Il render si rifiuta con il motivo, invece di partire verso un'API che non risponde.
   */
  it('un modello che OpenRouter non ha non ha un trasporto, e il render si rifiuta', async () => {
    stubFetch();
    const err = vi.spyOn(console, 'error').mockImplementation(() => {});
    const { submitVideoRender } = await import('./video');

    const out = await submitVideoRender('p', { model: 'un/modello-che-non-esiste' });

    expect(out, 'nessun render senza trasporto').toBeUndefined();
    expect(err).toHaveBeenCalledWith(expect.stringMatching(/non è nel catalogo video/));
    expect(hits, 'nemmeno un giro di rete').toEqual([]);
    err.mockRestore();
  });

  /**
   * I RIFERIMENTI PASSANO, e prima no.
   *
   * La versione precedente di questo test fissava l'opposto: un render con riferimenti veniva
   * dirottato altrove, perché sulla superficie video di OpenRouter quei campi «non esistevano».
   * Esistono: si chiamano `input_references` e accettano immagini, audio e video insieme.
   */
  it('i riferimenti passano da OpenRouter, come input_references', async () => {
    stubFetch();
    const { submitVideoRender } = await import('./video');
    await submitVideoRender('p', {
      model: 'bytedance/seedance-2-5',
      referenceImageUrls: ['https://cdn.test/ref.png'],
      referenceAudioUrls: ['https://cdn.test/voce.mp3']
    });

    expect(hits.some((h) => h.includes('openrouter.ai'))).toBe(true);
  });

  /**
   * IL REFINE PASSA DA OPENROUTER, come ogni altro render.
   *
   * Seedance 2.5 dichiara quel ruolo — provato contro il gateway: legge un `video_url` in
   * `input_references` — e il video sorgente arriva lì, non fra i fotogrammi iniziali.
   */
  it('un refine su un modello OpenRouter arriva al gateway', async () => {
    stubFetch({
      poll: {
        status: 'completed',
        unsigned_urls: ['https://openrouter.ai/api/v1/videos/or-job-1/content?index=0'],
        usage: { cost: 0.3 }
      }
    });
    const { transformVideo } = await import('./video');

    await transformVideo({
      supabase,
      userId: 'user-1',
      role: 'refine',
      videoUrl: 'https://cdn.test/clip.mp4',
      prompt: 'luce più calda',
      model: 'bytedance/seedance-2-5'
    });

    expect(hits.some((h) => h.includes('openrouter.ai'))).toBe(true);
  });

  /**
   * L'UPSCALE PRENDE UN VIDEO, non un id di lavoro.
   *
   * `black-forest-labs/flux-video-upscale`, `upscale_factor` 1.5–3×. Provato contro il gateway: una
   * richiesta senza video torna «requires video input: include an input_references entry of type
   * video_url» — quindi il video non è opzionale, ed è la forma dell'ingresso.
   *
   * Si riparte dal FILE, mai dal lavoro originale. Chi chiama il file ce l'ha già
   * (`post.media_url`), quindi non serve conservare nulla.
   */
  it('una clip si ingrandisce dal suo file', async () => {
    stubFetch({
      poll: {
        status: 'completed',
        unsigned_urls: ['https://openrouter.ai/api/v1/videos/or-job-1/content?index=0'],
        usage: { cost: 0.2 }
      }
    });
    const { upscaleVideo } = await import('./video');

    const out = await upscaleVideo(supabase, 'user-1', 'openrouter:or-job-1', '720p', {
      videoUrl: 'https://cdn.test/clip.mp4'
    });

    expect(out).toBeTruthy();
    expect(hits.some((h) => h.includes('openrouter.ai'))).toBe(true);
  });

  it('senza il file una clip non si ingrandisce: non c è da dove ripartire', async () => {
    stubFetch();
    const { upscaleVideo } = await import('./video');

    expect(await upscaleVideo(supabase, 'user-1', 'openrouter:or-job-1', '720p')).toBeUndefined();
    expect(hits, 'nemmeno un giro di rete').toEqual([]);
  });
});
