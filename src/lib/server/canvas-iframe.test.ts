import { describe, it, expect, vi } from 'vitest';
import { saveIframeNode } from './canvas-iframe';

function writer(result: { data?: unknown; error?: unknown } = { data: { id: 'new-1' }, error: null }) {
  const maybeSingle = vi.fn().mockResolvedValue(result);
  const select = vi.fn(() => ({ maybeSingle }));
  const insert = vi.fn(() => ({ select }));
  const eqBrand = vi.fn().mockResolvedValue({ error: result.error ?? null });
  const eqItem = vi.fn(() => ({ eq: eqBrand }));
  const update = vi.fn(() => ({ eq: eqItem }));

  return { client: { from: () => ({ insert, update }) } as never, insert, update };
}

const base = {
  brandId: 'b1',
  userId: 'u1',
  canvasId: 'c1',
  itemId: null,
  url: 'https://example.com',
  html: '',
  x: 10,
  y: 20,
  w: 560,
  h: 420
};

describe('salvare una pagina incorporata', () => {
  it('la crea con il suo indirizzo, e senza puntare a nessuna riga', async () => {
    const { client, insert } = writer();

    const saved = await saveIframeNode(client, base);

    expect(saved).toEqual({ ok: true, id: 'new-1' });
    // `ref_id` null SEMPRE: non c'è nessuna tabella a cui puntare, a differenza di `gen`.
    expect(insert).toHaveBeenCalledWith(
      expect.objectContaining({ ref_kind: 'iframe', ref_id: null, url: 'https://example.com/' })
    );
  });

  it("scrive l'HTML quando è quello il modo, e lascia l'indirizzo null", async () => {
    const { client, insert } = writer();

    const saved = await saveIframeNode(client, { ...base, url: '', html: '<h1>ciao</h1>' });

    expect(saved.ok).toBe(true);
    expect(insert).toHaveBeenCalledWith(
      expect.objectContaining({ html: '<h1>ciao</h1>', url: null })
    );
  });

  it("usa l'id che il client ha già coniato, invece di restituirne un secondo", async () => {
    // Lo stesso difetto che `gen` ha già pagato: con un id provvisorio scambiato dopo, la tela si
    // ritrova la copia vecchia accanto a quella nuova — il fantasma che resta indietro.
    const { client, insert } = writer({ data: { id: 'mio-id' }, error: null });

    const saved = await saveIframeNode(client, { ...base, newId: 'mio-id' });

    expect(saved).toEqual({ ok: true, id: 'mio-id' });
    expect(insert).toHaveBeenCalledWith(expect.objectContaining({ id: 'mio-id' }));
  });

  it('aggiorna quella che esiste invece di crearne una seconda', async () => {
    const { client, insert, update } = writer();

    const saved = await saveIframeNode(client, { ...base, itemId: 'i1' });

    expect(saved).toEqual({ ok: true, id: 'i1' });
    expect(insert).not.toHaveBeenCalled();
    expect(update).toHaveBeenCalledOnce();
  });
});

describe('quel che il database rifiuterebbe, si rifiuta prima', () => {
  it('RIFIUTA javascript:, e non lo manda al database', async () => {
    // Il difetto che conta: i brand sono condivisi, quindi la tile la apre qualcun altro. Il
    // vincolo in migrazione lo boccia comunque, ma come 23514 — qui torna una frase.
    const { client, insert } = writer();

    const saved = await saveIframeNode(client, { ...base, url: 'javascript:alert(document.cookie)' });

    expect(saved.ok).toBe(false);
    expect(insert).not.toHaveBeenCalled();
  });

  it('rifiuta data: e file:', async () => {
    const { client, insert } = writer();

    expect((await saveIframeNode(client, { ...base, url: 'data:text/html,<script>x</script>' })).ok).toBe(false);
    expect((await saveIframeNode(client, { ...base, url: 'file:///etc/passwd' })).ok).toBe(false);
    expect(insert).not.toHaveBeenCalled();
  });

  it('rifiuta entrambi i modi insieme: il renderer non saprebbe quale disegnare', async () => {
    const { client, insert } = writer();

    const saved = await saveIframeNode(client, { ...base, url: 'https://example.com', html: '<h1>x</h1>' });

    expect(saved.ok).toBe(false);
    expect(insert).not.toHaveBeenCalled();
  });

  it('rifiuta una tile vuota: né indirizzo né HTML non si disegna', async () => {
    const { client, insert } = writer();

    const saved = await saveIframeNode(client, { ...base, url: '', html: '' });

    expect(saved.ok).toBe(false);
    expect(insert).not.toHaveBeenCalled();
  });

  it('rifiuta una posizione che non è un numero', async () => {
    // Un `NaN` arriva davvero: è un trascinamento interrotto. Scritto darebbe una tile
    // irraggiungibile, che non si vede e quindi non si può più spostare.
    const { client, insert } = writer();

    const saved = await saveIframeNode(client, { ...base, x: Number.NaN });

    expect(saved.ok).toBe(false);
    expect(insert).not.toHaveBeenCalled();
  });

  it('spiega il rifiuto invece di nominare un vincolo', async () => {
    const { client } = writer();

    const saved = await saveIframeNode(client, { ...base, url: 'javascript:alert(1)' });

    expect(saved.ok === false && saved.error).toMatch(/http/i);
  });
});

describe("l'indirizzo si normalizza prima di scriverlo", () => {
  it('completa lo schema mancante, invece di scrivere una riga che il check boccia', async () => {
    const { client, insert } = writer();

    await saveIframeNode(client, { ...base, url: 'example.com' });

    expect(insert).toHaveBeenCalledWith(
      expect.objectContaining({ url: 'https://example.com/' })
    );
  });
});
