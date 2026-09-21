import { describe, expect, it } from 'vitest';
import { planDelete } from './delete-plan';

const edge = (id: string, source: string, target: string) => ({ id, source, target });

describe('cosa cade quando si cancella una selezione', () => {
  it('toglie le tile scelte', () => {
    const plan = planDelete({ ids: ['a', 'b'], edges: [], undeletable: [] });

    expect(plan.itemIds).toEqual(['a', 'b']);
  });

  it('porta via anche le linee appese a quelle tile', () => {
    // `on delete cascade` le toglie dal database, ma lo stato del client non lo sa: senza
    // questo l'arco resterebbe disegnato verso un nodo che non c'è più.
    const edges = [edge('e1', 'a', 'c'), edge('e2', 'c', 'a'), edge('e3', 'c', 'd')];

    const plan = planDelete({ ids: ['a'], edges, undeletable: [] });

    expect(plan.edgeIds.sort()).toEqual(['e1', 'e2']);
  });

  it('lascia stare quel che non è una riga', () => {
    // Il recap è disegnato ma non sta in `brand_canvas_items`: mandarne l'id al server darebbe
    // un errore rosso su un gesto che l'utente legge come innocuo.
    const plan = planDelete({ ids: ['recap', 'a'], edges: [], undeletable: ['recap'] });

    expect(plan.itemIds).toEqual(['a']);
  });

  it('non chiede niente al server se resta solo quel che non si cancella', () => {
    const plan = planDelete({ ids: ['recap'], edges: [], undeletable: ['recap'] });

    expect(plan.itemIds).toEqual([]);
    expect(plan.empty).toBe(true);
  });

  it('una selezione vuota non è una cancellazione', () => {
    expect(planDelete({ ids: [], edges: [], undeletable: [] }).empty).toBe(true);
  });
});
