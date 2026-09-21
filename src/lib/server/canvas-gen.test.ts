import { describe, it, expect, vi } from 'vitest';
import { saveGenNode, moveCanvasItem } from './canvas-gen';

function writer(result: { data?: unknown; error?: unknown } = { data: { id: 'new-1' }, error: null }) {
  const maybeSingle = vi.fn().mockResolvedValue(result);
  const select = vi.fn(() => ({ maybeSingle }));
  const insert = vi.fn(() => ({ select }));
  const eqBrand = vi.fn().mockResolvedValue({ error: result.error ?? null });
  const eqItem = vi.fn(() => ({ eq: eqBrand }));
  const update = vi.fn(() => ({ eq: eqItem }));

  return { client: { from: () => ({ insert, update }) } as never, insert, update, eqItem, eqBrand };
}

const gen = {
  brandId: 'b1',
  userId: 'u1',
  canvasId: 'c1',
  itemId: null,
  medium: 'image',
  prompt: 'un gatto',
  model: 'm1',
  params: '{"aspectRatio":"1:1"}',
  x: 10,
  y: 20,
  w: 360,
  h: 460
};

describe('salvare un nodo che produce', () => {
  it('lo crea quando non ha ancora un id, e restituisce quello nuovo', async () => {
    const { client, insert } = writer();

    const saved = await saveGenNode(client, gen);

    expect(saved).toEqual({ ok: true, id: 'new-1' });
    expect(insert).toHaveBeenCalledWith(
      expect.objectContaining({ ref_kind: 'gen', medium: 'image', ref_id: null })
    );
  });

  it('aggiorna quello che esiste invece di crearne un secondo', async () => {
    const { client, insert, update } = writer();

    const saved = await saveGenNode(client, { ...gen, itemId: 'i1' });

    expect(saved).toEqual({ ok: true, id: 'i1' });
    expect(insert).not.toHaveBeenCalled();
    expect(update).toHaveBeenCalledOnce();
  });

  it('rifiuta un medium che il check boccerebbe, e nomina quelli buoni', async () => {
    const { client, insert } = writer();

    const saved = await saveGenNode(client, { ...gen, medium: 'audio' });

    expect(saved.ok).toBe(false);
    expect(saved.ok === false && saved.error).toContain('image');
    expect(insert).not.toHaveBeenCalled();
  });

  it('rifiuta parametri che non sono JSON, invece di scrivere una colonna rotta', async () => {
    const { client, insert } = writer();

    const saved = await saveGenNode(client, { ...gen, params: 'non-json' });

    expect(saved.ok).toBe(false);
    expect(insert).not.toHaveBeenCalled();
  });

  it('rifiuta misure che non sono numeri: un NaN darebbe una tile irraggiungibile', async () => {
    const { client, insert } = writer();

    expect((await saveGenNode(client, { ...gen, x: Number.NaN })).ok).toBe(false);
    expect(insert).not.toHaveBeenCalled();
  });
});

describe('spostare una tile', () => {
  it('scrive solo la posizione: un trascinamento non tocca il prompt', async () => {
    const { client, update } = writer();

    const saved = await moveCanvasItem(client, { brandId: 'b1', itemId: 'i1', x: 5, y: 6 });

    expect(saved).toEqual({ ok: true });
    expect(update).toHaveBeenCalledWith({ x: 5, y: 6 });
  });

  it('filtra anche sul brand: l id da solo verrebbe da chi lo manda', async () => {
    const { client, eqItem, eqBrand } = writer();

    await moveCanvasItem(client, { brandId: 'b1', itemId: 'i1', x: 5, y: 6 });

    expect(eqItem).toHaveBeenCalledWith('id', 'i1');
    expect(eqBrand).toHaveBeenCalledWith('brand_id', 'b1');
  });

  it('rifiuta una posizione che non è un numero', async () => {
    const { client, update } = writer();

    expect((await moveCanvasItem(client, { brandId: 'b1', itemId: 'i1', x: Number.NaN, y: 0 })).ok).toBe(
      false
    );
    expect(update).not.toHaveBeenCalled();
  });
});

describe('idratare un nodo che produce', () => {
  it('senza risultato NON è una tile sparita: è un nodo che deve ancora girare', async () => {
    const { hydrateCanvasItems } = await import('./canvas');

    const [item] = hydrateCanvasItems(
      [{ ref_kind: 'gen', ref_id: null } as never],
      {} as never
    );

    // `missing` dipinge il riquadro «questa cosa non c'è più». Su un nodo appena creato sarebbe
    // una bugia: non è sparito niente, non è ancora stato fatto.
    expect(item.missing).toBe(false);
    expect(item.ref).toBeNull();
  });

  it('con un risultato che non si trova più, invece, lo dice', async () => {
    const { hydrateCanvasItems } = await import('./canvas');

    const [item] = hydrateCanvasItems(
      [{ ref_kind: 'gen', ref_id: 'sparito' } as never],
      { media: new Map() } as never
    );

    expect(item.missing).toBe(true);
  });
});

describe('caricare una tela con nodi che hanno prodotto', () => {
  it('cerca il risultato di un `gen` fra i media, invece di cercare una tabella che non esiste', async () => {
    const { loadCanvasItems } = await import('./canvas');

    const tables: string[] = [];
    const client = {
      from: (table: string) => {
        tables.push(table);
        const rows =
          table === 'brand_canvas_items'
            ? [{ id: 't1', ref_kind: 'gen', ref_id: 'm1', x: 0, y: 0, w: 1, h: 1, z: 0 }]
            : [{ id: 'm1', kind: 'image', url: 'https://x/y.png' }];
        const q = {
          select: () => q,
          eq: () => q,
          order: () => Promise.resolve({ data: rows }),
          in: () => Promise.resolve({ data: rows })
        };
        return q;
      }
    } as never;

    const [item] = await loadCanvasItems(client, 'c1');

    // Senza una riga per `gen` in REF_SELECT, `spec.table` è undefined e la lettura della tela
    // muore — cioè un nodo che ha prodotto rende illeggibile TUTTA la tela.
    expect(tables).toContain('brand_media');
    expect(item.missing).toBe(false);
    expect(item.ref).toMatchObject({ id: 'm1' });
  });
});
