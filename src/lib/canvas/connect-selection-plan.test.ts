import { describe, expect, it } from 'vitest';
import { planConnectSelection } from './connect-selection-plan';

const source = (id: string, type: string) => ({ id, type });

describe('collegare una selezione a un nodo che genera', () => {
  it('collega un testo alla porta text', () => {
    const plan = planConnectSelection({
      sources: [source('a', 'text')],
      target: { kind: 'image', modalities: { input: ['text', 'image'] } }
    });

    expect(plan.wires).toEqual([{ sourceId: 'a', connector: 'text' }]);
    expect(plan.rejected).toEqual([]);
  });

  it('collega più immagini sulla stessa porta a valore multiplo', () => {
    const plan = planConnectSelection({
      sources: [source('a', 'image'), source('b', 'image')],
      target: { kind: 'video', modalities: { input: ['text', 'image'] } }
    });

    expect(plan.wires.map((w) => w.sourceId)).toEqual(['a', 'b']);
    expect(plan.wires.every((w) => w.connector === 'images')).toBe(true);
  });

  it('rifiuta la seconda sorgente su una porta a valore singolo, non la scarta muta', () => {
    const plan = planConnectSelection({
      sources: [source('a', 'text'), source('b', 'text')],
      target: { kind: 'image', modalities: { input: ['text'] } }
    });

    expect(plan.wires).toEqual([{ sourceId: 'a', connector: 'text' }]);
    expect(plan.rejected).toEqual([{ sourceId: 'b', why: expect.stringContaining('occupata') }]);
  });

  it('rifiuta un medium che il modello del bersaglio non accetta', () => {
    const plan = planConnectSelection({
      sources: [source('a', 'video')],
      target: { kind: 'image', modalities: { input: ['text', 'image'] } }
    });

    expect(plan.wires).toEqual([]);
    expect(plan.rejected).toEqual([{ sourceId: 'a', why: expect.stringContaining('videos') }]);
  });

  it('rifiuta una sorgente senza un medium — un feed social, per esempio', () => {
    const plan = planConnectSelection({
      sources: [source('a', 'social_account_feed')],
      target: { kind: 'text', modalities: { input: [] } }
    });

    expect(plan.wires).toEqual([]);
    expect(plan.rejected[0].sourceId).toBe('a');
  });

  it('un documento alimenta testo, come un nodo text', () => {
    const plan = planConnectSelection({
      sources: [source('a', 'doc')],
      target: { kind: 'text', modalities: { input: [] } }
    });

    expect(plan.wires).toEqual([{ sourceId: 'a', connector: 'text' }]);
  });
});
