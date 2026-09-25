import { describe, expect, it } from 'vitest';
import { commonPropertiesOf, dynamicParamsOf, GEN_FIELDS } from './common-properties';

const node = (type: string, data: Record<string, unknown>) => ({ type, data });

describe('cosa hanno in comune più nodi selezionati', () => {
  it('stesso modello su tutti: "same"', () => {
    const out = commonPropertiesOf([
      node('image', { model: 'x' }),
      node('image', { model: 'x' })
    ]);

    expect(out.type).toBe('image');
    expect(out.model).toEqual({ kind: 'same', value: 'x' });
  });

  it('modelli diversi: "mixed", non un valore inventato', () => {
    const out = commonPropertiesOf([
      node('image', { model: 'x' }),
      node('image', { model: 'y' })
    ]);

    expect(out.model).toEqual({ kind: 'mixed' });
  });

  it('tipi diversi non condividono niente: il pannello resta vuoto', () => {
    const out = commonPropertiesOf([node('text', {}), node('image', { model: 'x' })]);

    expect(out.type).toBeNull();
    expect(out.model).toEqual({ kind: 'absent' });
  });

  it('il testo non ha aspect ratio: resta "absent" anche se tutti coincidono su altro', () => {
    const out = commonPropertiesOf([node('text', { model: null }), node('text', { model: null })]);

    expect(out.aspectRatio).toEqual({ kind: 'absent' });
  });

  it('aspect ratio comune su più immagini', () => {
    const out = commonPropertiesOf([
      node('image', { model: 'x', params: { aspectRatio: '1:1' } }),
      node('image', { model: 'x', params: { aspectRatio: '1:1' } })
    ]);

    expect(out.aspectRatio).toEqual({ kind: 'same', value: '1:1' });
  });

  it('una selezione vuota non condivide niente', () => {
    const out = commonPropertiesOf([]);

    expect(out.type).toBeNull();
  });

  it('un solo nodo: il suo valore È il comune', () => {
    const out = commonPropertiesOf([node('video', { model: 'z' })]);

    expect(out.model).toEqual({ kind: 'same', value: 'z' });
  });

  it('durata comune su più video', () => {
    const out = commonPropertiesOf([
      node('video', { model: 'x', params: { duration: 5 } }),
      node('video', { model: 'x', params: { duration: 5 } })
    ]);

    expect(out.duration).toEqual({ kind: 'same', value: 5 });
  });

  it('audio diverso: "mixed"', () => {
    const out = commonPropertiesOf([
      node('video', { model: 'x', params: { audio: true } }),
      node('video', { model: 'x', params: { audio: false } })
    ]);

    expect(out.audio).toEqual({ kind: 'mixed' });
  });

  it('il testo non ha durata né audio: restano "absent"', () => {
    const out = commonPropertiesOf([
      node('text', { model: 'x', params: {} }),
      node('text', { model: 'x', params: {} })
    ]);

    expect(out.duration).toEqual({ kind: 'absent' });
    expect(out.audio).toEqual({ kind: 'absent' });
  });

  it('un solo nodo video: la sua durata È il comune, dalla STESSA tabella', () => {
    const out = commonPropertiesOf([node('video', { model: 'z', params: { duration: 8 } })]);

    expect(out.duration).toEqual({ kind: 'same', value: 8 });
  });
});

describe('GEN_FIELDS — una tabella sola, letta sia da un nodo solo che da una selezione', () => {
  it('elenca model, aspectRatio, duration, resolution, audio, repeat — i campi che GenNode mostra', () => {
    const ids = GEN_FIELDS.map((f) => f.id);
    expect(ids).toEqual(['model', 'aspectRatio', 'duration', 'resolution', 'audio', 'repeat']);
  });

  it('repeat si applica anche al testo: non dipende dal modello', () => {
    const byId = Object.fromEntries(GEN_FIELDS.map((f) => [f.id, f]));
    expect(byId.repeat.appliesTo('text')).toBe(true);
  });

  it('aspectRatio, duration, resolution e audio non si applicano al testo', () => {
    const byId = Object.fromEntries(GEN_FIELDS.map((f) => [f.id, f]));
    expect(byId.aspectRatio.appliesTo('text')).toBe(false);
    expect(byId.duration.appliesTo('text')).toBe(false);
    expect(byId.resolution.appliesTo('text')).toBe(false);
    expect(byId.audio.appliesTo('text')).toBe(false);
    expect(byId.model.appliesTo('text')).toBe(true);
  });

  it('duration, resolution e audio si applicano a image e video', () => {
    const byId = Object.fromEntries(GEN_FIELDS.map((f) => [f.id, f]));
    expect(byId.duration.appliesTo('image')).toBe(true);
    expect(byId.duration.appliesTo('video')).toBe(true);
    expect(byId.resolution.appliesTo('image')).toBe(true);
    expect(byId.resolution.appliesTo('video')).toBe(true);
    expect(byId.audio.appliesTo('image')).toBe(true);
    expect(byId.audio.appliesTo('video')).toBe(true);
  });
});

describe('un campo che il tipo prevede ma che nessuno ha ancora scelto resta mostrato', () => {
  it('un\'immagine nuova, senza params, ha il formato "unset", non "absent"', () => {
    const out = commonPropertiesOf([{ type: 'image', data: { prompt: '', params: {} } }]);
    expect(out.aspectRatio).toEqual({ kind: 'unset' });
  });

  it('un video nuovo ha durata e audio "unset"', () => {
    const out = commonPropertiesOf([{ type: 'video', data: { prompt: '' } }]);
    expect(out.duration).toEqual({ kind: 'unset' });
    expect(out.audio).toEqual({ kind: 'unset' });
  });
});

describe('dynamicParamsOf — i campi extra del modello scelto (ai_models.param_schema)', () => {
  it('stesso valore su tutti i nodi: "same"', () => {
    const nodes = [
      { type: 'image', data: { params: { quality: 'low' } } },
      { type: 'image', data: { params: { quality: 'low' } } }
    ];

    expect(dynamicParamsOf(nodes, ['quality'])).toEqual({ quality: { kind: 'same', value: 'low' } });
  });

  it('valori diversi: "mixed"', () => {
    const nodes = [
      { type: 'image', data: { params: { quality: 'low' } } },
      { type: 'image', data: { params: { quality: 'high' } } }
    ];

    expect(dynamicParamsOf(nodes, ['quality'])).toEqual({ quality: { kind: 'mixed' } });
  });

  it('nessun nodo ha ancora scelto un valore: "unset"', () => {
    const nodes = [{ type: 'image', data: { params: {} } }];

    expect(dynamicParamsOf(nodes, ['quality'])).toEqual({ quality: { kind: 'unset' } });
  });
});
