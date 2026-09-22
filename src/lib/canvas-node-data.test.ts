import { describe, expect, it } from 'vitest';
import {
  NODE_TYPES,
  docData,
  docOf,
  frameOf,
  genOf,
  isNodeType,
  newNodeRow
} from '$lib/canvas-node-data';

describe('cosa una riga di `nodes` può essere', () => {
  it('i tipi che la pagina disegna, e niente che non sappia disegnare', () => {
    expect(NODE_TYPES).toEqual(['text', 'image', 'video', 'iframe', 'doc']);
  });

  it('un tipo che non è dei suoi non si riconosce', () => {
    expect(isNodeType('post')).toBe(false);
    expect(isNodeType('doc')).toBe(true);
    expect(isNodeType('text')).toBe(true);
  });
});

describe('un nodo che produce, letto dalla riga', () => {
  it('il medium è il tipo: non c`è una seconda colonna che possa contraddirlo', () => {
    const node = genOf({ id: 'n1', type: 'video', data: {} });

    expect(node).toMatchObject({ id: 'n1', medium: 'video' });
  });

  it('prompt, modello e parametri vengono da `data`', () => {
    const node = genOf({
      id: 'n1',
      type: 'image',
      data: { prompt: 'un gatto', model: 'nano-banana', params: { aspectRatio: '1:1' } }
    });

    expect(node).toMatchObject({
      prompt: 'un gatto',
      model: 'nano-banana',
      params: { aspectRatio: '1:1' }
    });
  });

  it('una riga appena nata non è una riga rotta: si legge coi suoi vuoti', () => {
    expect(genOf({ id: 'n1', type: 'text', data: {} })).toEqual({
      id: 'n1',
      medium: 'text',
      model: null,
      prompt: '',
      params: {},
      refId: null,
      runs: [],
      running: false,
      error: null
    });
  });

  it('un iframe non è un nodo che produce', () => {
    expect(genOf({ id: 'n1', type: 'iframe', data: {} })).toBeNull();
  });

  it('un `data` che mente sul tipo dei campi non rompe la pagina', () => {
    const node = genOf({ id: 'n1', type: 'image', data: { prompt: 7, model: [], params: 'no' } });

    expect(node).toMatchObject({ prompt: '', model: null, params: {} });
  });
});

describe('una pagina incorporata, letta dalla riga', () => {
  it("l'indirizzo e l'HTML vengono da `data`, e il modo lo dice quale è pieno", () => {
    expect(frameOf({ id: 'n1', type: 'iframe', data: { url: 'https://esempio.it' } })).toEqual({
      id: 'n1',
      source: 'url',
      url: 'https://esempio.it',
      html: ''
    });
  });

  it("con dell'HTML si apre sul codice", () => {
    expect(frameOf({ id: 'n1', type: 'iframe', data: { html: '<b>ciao</b>' } })).toMatchObject({
      source: 'html',
      html: '<b>ciao</b>'
    });
  });

  it('un nodo che produce non è una pagina incorporata', () => {
    expect(frameOf({ id: 'n1', type: 'text', data: {} })).toBeNull();
  });
});

describe('un documento, letto dalla riga', () => {
  it('il markdown e il flag pubblico vengono da `data`', () => {
    expect(docOf({ id: 'n1', type: 'doc', data: { content: '# Ciao', public: true } })).toEqual({
      id: 'n1',
      content: '# Ciao',
      public: true
    });
  });

  it('una riga appena nata non è una riga rotta: si legge coi suoi vuoti', () => {
    expect(docOf({ id: 'n1', type: 'doc', data: {} })).toEqual({
      id: 'n1',
      content: '',
      public: false
    });
  });

  it('un `data` che mente sul tipo dei campi non rompe la pagina', () => {
    expect(docOf({ id: 'n1', type: 'doc', data: { content: 7, public: 'si' } })).toEqual({
      id: 'n1',
      content: '',
      public: false
    });
  });

  it('un nodo che produce non è un documento', () => {
    expect(docOf({ id: 'n1', type: 'text', data: {} })).toBeNull();
    expect(docOf({ id: 'n1', type: 'iframe', data: {} })).toBeNull();
  });
});

describe('con che `data` nasce una riga', () => {
  it('un nodo che produce nasce vuoto: il modello lo sceglie chi disegna', () => {
    expect(newNodeRow('image')).toEqual({ prompt: '', model: null, params: {}, refId: null });
  });

  it("una pagina incorporata nasce sull'indirizzo, che è il caso di nove volte su dieci", () => {
    expect(newNodeRow('iframe')).toEqual({ url: '', html: '' });
  });

  it('un documento nasce vuoto e privato', () => {
    expect(newNodeRow('doc')).toEqual({ content: '', public: false });
  });
});

describe('quel che di un documento si scrive', () => {
  it('fa il giro di andata e ritorno di `content` e `public`, e nient\'altro', () => {
    const node = { id: 'n1', content: '# Bozza', public: true };
    const written = docData(node);

    expect(written).toEqual({ content: '# Bozza', public: true });
    expect(docOf({ id: 'n1', type: 'doc', data: written })).toEqual(node);
  });
});

describe('un gen node porta anche il perché non è partito', () => {
  it('error arriva dal data, e mancante resta null', () => {
    expect(genOf({ id: 'n1', type: 'image', data: { error: 'render_failed' } })?.error).toBe('render_failed');
    expect(genOf({ id: 'n1', type: 'image', data: {} })?.error).toBeNull();
  });
});
