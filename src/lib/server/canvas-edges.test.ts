import { describe, it, expect, vi } from 'vitest';
import { saveCanvasEdge } from './canvas';

const okClient = () => {
  const upsert = vi.fn().mockResolvedValue({ error: null });
  return { client: { from: () => ({ upsert }) } as never, upsert };
};

const base = {
  brandId: 'b1',
  userId: 'u1',
  canvasId: 'c1',
  sourceItemId: 's1',
  targetItemId: 't1',
  kind: 'derives_from'
};

describe('salvare una connessione della tela', () => {
  it('scrive una linea buona', async () => {
    const { client, upsert } = okClient();

    expect(await saveCanvasEdge(client, base)).toEqual({ ok: true });
    expect(upsert).toHaveBeenCalledOnce();
  });

  it('rifiuta un verso che il check boccerebbe, e nomina quelli ammessi', async () => {
    const { client, upsert } = okClient();

    const saved = await saveCanvasEdge(client, { ...base, kind: 'nasce_da' });

    expect(saved).toMatchObject({ ok: false });
    // Il messaggio deve dire COSA si può scrivere: un agente che legge «kind non ammesso» e basta
    // riprova con un'altra invenzione.
    expect(saved.ok === false && saved.error).toContain('derives_from');
    expect(upsert).not.toHaveBeenCalled();
  });

  it('rifiuta il cappio prima del database', async () => {
    const { client, upsert } = okClient();

    const saved = await saveCanvasEdge(client, { ...base, targetItemId: base.sourceItemId });

    expect(saved).toMatchObject({ ok: false });
    expect(upsert).not.toHaveBeenCalled();
  });

  it('rifiuta una linea senza i suoi due capi', async () => {
    const { client, upsert } = okClient();

    expect(await saveCanvasEdge(client, { ...base, targetItemId: '' })).toMatchObject({ ok: false });
    expect(upsert).not.toHaveBeenCalled();
  });

  it('riporta l errore del database invece di dirsi riuscito', async () => {
    const upsert = vi.fn().mockResolvedValue({ error: { message: 'duplicate key' } });
    const client = { from: () => ({ upsert }) } as never;

    expect(await saveCanvasEdge(client, base)).toEqual({ ok: false, error: 'duplicate key' });
  });
});
