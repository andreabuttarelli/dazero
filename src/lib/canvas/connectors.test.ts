import { describe, it, expect } from 'vitest';
import {
  connectorsFor,
  orphanedByModelChange,
  CONNECTOR_TYPES,
  CONNECTOR_STYLE,
  connectorsForNode,
  portAccepts,
  portActive,
  outputConnectorOf,
  type Modalities,
  type WiredConnector
} from './connectors';

const modalities = (input: string[]): Modalities => ({ input });

describe('connectorsFor — text, sempre il minimo', () => {
  it('un nodo testo ha solo il connettore testo, qualunque cosa dica il modello', () => {
    expect(connectorsFor('text', modalities(['text', 'image']))).toEqual(['text']);
  });
});

describe('connectorsFor — immagine: derivato dalle modalità del modello scelto', () => {
  it('un modello che prende solo testo mostra solo il connettore testo', () => {
    expect(connectorsFor('image', modalities(['text']))).toEqual(['text']);
  });

  it('un modello che prende testo e immagini mostra entrambi i connettori', () => {
    expect(connectorsFor('image', modalities(['text', 'image']))).toEqual(['text', 'images']);
  });

  it('un modello che prende anche audio e video li mostra tutti — MAI first_frame/last_frame: non è un nodo video', () => {
    const out = connectorsFor('image', modalities(['text', 'image', 'audio', 'video']));
    expect(out).toEqual(['text', 'images', 'videos', 'audios']);
    expect(out).not.toContain('first_frame');
    expect(out).not.toContain('last_frame');
  });

  it('ogni combinazione di modalità produce ESATTAMENTE i connettori di quella combinazione', () => {
    expect(connectorsFor('image', modalities(['text', 'audio']))).toEqual(['text', 'audios']);
    expect(connectorsFor('image', modalities(['text', 'video']))).toEqual(['text', 'videos']);
    expect(connectorsFor('image', modalities([]))).toEqual([]);
  });
});

describe('connectorsFor — video: gli stessi connettori di immagine, PIÙ i due slot di fotogramma', () => {
  it('un modello video che prende testo e immagini ha anche first_frame e last_frame', () => {
    const out = connectorsFor('video', modalities(['text', 'image']));
    expect(out).toEqual(['text', 'images', 'first_frame', 'last_frame']);
  });

  it('un modello video che prende SOLO testo non ha slot di fotogramma: non c\'è un\'immagine da collegarci', () => {
    expect(connectorsFor('video', modalities(['text']))).toEqual(['text']);
  });

  it('con anche audio e video in ingresso, tutti i connettori compaiono', () => {
    const out = connectorsFor('video', modalities(['text', 'image', 'audio', 'video']));
    expect(out).toEqual(['text', 'images', 'first_frame', 'last_frame', 'videos', 'audios']);
  });
});

describe('CONNECTOR_TYPES — il vocabolario chiuso', () => {
  it('sono esattamente i sei dichiarati, in un ordine stabile', () => {
    expect(CONNECTOR_TYPES).toEqual(['text', 'images', 'first_frame', 'last_frame', 'videos', 'audios']);
  });
});

describe('orphanedByModelChange — quali fili un cambio di modello lascerebbe senza porta', () => {
  const wired = (connector: WiredConnector['connector'], edgeId = 'e1'): WiredConnector => ({
    edgeId,
    sourceNodeId: `src-${edgeId}`,
    connector
  });

  it('nessun orfano quando il nuovo modello mantiene lo stesso connettore: nessun dialogo', () => {
    const nextConnectors = connectorsFor('video', modalities(['text', 'image']));

    expect(orphanedByModelChange([wired('images')], nextConnectors)).toEqual([]);
  });

  it('un connettore a valore multiplo che sparisce (videos) nomina esattamente quell\'arco', () => {
    const nextConnectors = connectorsFor('video', modalities(['text', 'image']));

    expect(orphanedByModelChange([wired('videos')], nextConnectors)).toEqual([wired('videos')]);
  });

  it('uno slot a valore singolo che sparisce (last_frame) nomina esattamente quell\'arco', () => {
    const nextConnectors = connectorsFor('video', modalities(['text']));

    expect(orphanedByModelChange([wired('last_frame')], nextConnectors)).toEqual([wired('last_frame')]);
  });

  it('nessun arco collegato: mai un orfano, qualunque cambio', () => {
    expect(orphanedByModelChange([], [])).toEqual([]);
  });

  it('due archi, uno solo sopravvive: solo quello che cade compare nell\'elenco', () => {
    const survives = wired('text', 'e1');
    const falls = wired('last_frame', 'e2');

    expect(orphanedByModelChange([survives, falls], ['text'])).toEqual([falls]);
  });
});

describe('porte visibili: colore ed etichetta per ogni tipo', () => {
  it('ogni tipo di connettore ha etichetta e colore, e i colori sono tutti diversi', () => {
    const colors = CONNECTOR_TYPES.map((c) => CONNECTOR_STYLE[c].color);
    for (const c of CONNECTOR_TYPES) {
      expect(CONNECTOR_STYLE[c].label.length).toBeGreaterThan(0);
      expect(CONNECTOR_STYLE[c].color).toMatch(/^#[0-9a-f]{6}$/i);
    }
    expect(new Set(colors).size).toBe(colors.length);
  });

  it("l'uscita di un nodo ha il tipo di ciò che produce", () => {
    expect(outputConnectorOf('text')).toBe('text');
    expect(outputConnectorOf('image')).toBe('images');
    expect(outputConnectorOf('video')).toBe('videos');
    expect(outputConnectorOf('iframe')).toBeNull();
  });
});

describe('connectorsForNode: le porte seguono il modello che il nodo MOSTRA', () => {
  const choices = [
    { id: 'img/default', inputModalities: ['text', 'image'] },
    { id: 'img/text-only', inputModalities: ['text'] }
  ];

  it('senza un modello salvato usa il primo del catalogo, come fa il nodo a schermo', () => {
    expect(connectorsForNode('image', null, choices)).toEqual(['text', 'images']);
  });

  it('con un modello salvato usa quello', () => {
    expect(connectorsForNode('image', 'img/text-only', choices)).toEqual(['text']);
  });

  it('un modello salvato che non è più nel catalogo non inventa porte', () => {
    expect(connectorsForNode('image', 'img/gone', choices)).toEqual([]);
  });

  it('un catalogo vuoto non inventa porte', () => {
    expect(connectorsForNode('image', null, [])).toEqual([]);
  });

  it('un nodo testo ha sempre il suo connettore testo', () => {
    expect(connectorsForNode('text', null, [])).toEqual(['text']);
  });
});

describe('mentre tiri un filo, restano accese solo le porte dove può entrare', () => {
  it("un'immagine entra in Images e nei due fotogrammi, non in Text", () => {
    expect(portAccepts('images', 'images')).toBe(true);
    expect(portAccepts('first_frame', 'images')).toBe(true);
    expect(portAccepts('last_frame', 'images')).toBe(true);
    expect(portAccepts('text', 'images')).toBe(false);
  });

  it('il testo entra solo in Text, il video solo in Video', () => {
    expect(portAccepts('text', 'text')).toBe(true);
    expect(portAccepts('images', 'text')).toBe(false);
    expect(portAccepts('videos', 'videos')).toBe(true);
    expect(portAccepts('first_frame', 'videos')).toBe(false);
  });

  it('senza un filo in corso è tutto acceso', () => {
    expect(portActive(null, 'target', 'text')).toBe(true);
    expect(portActive(null, 'source', 'images')).toBe(true);
  });

  it("tirando da un'uscita testo: accese le entrate Text, spente le altre entrate e le altre uscite", () => {
    const origin = { side: 'source', type: 'text' } as const;
    expect(portActive(origin, 'target', 'text')).toBe(true);
    expect(portActive(origin, 'target', 'images')).toBe(false);
    expect(portActive(origin, 'source', 'text')).toBe(false);
  });

  it("tirando all'indietro da un'entrata First frame: accese solo le uscite immagine", () => {
    const origin = { side: 'target', type: 'first_frame' } as const;
    expect(portActive(origin, 'source', 'images')).toBe(true);
    expect(portActive(origin, 'source', 'text')).toBe(false);
    expect(portActive(origin, 'target', 'first_frame')).toBe(false);
  });

  it('un filo da una porta senza tipo non spegne niente', () => {
    const origin = { side: 'source', type: null } as const;
    expect(portActive(origin, 'target', 'videos')).toBe(true);
  });
});

describe('la porta da cui tiri resta accesa', () => {
  it("l'uscita di origine non si spegne, le altre uscite sì", () => {
    const origin = { side: 'source', type: 'text', nodeId: 'a', handleId: null } as const;
    expect(portActive(origin, 'source', 'text', { nodeId: 'a', handleId: null })).toBe(true);
    expect(portActive(origin, 'source', 'text', { nodeId: 'b', handleId: null })).toBe(false);
  });

  it("l'entrata di origine non si spegne, le altre entrate dello stesso nodo sì", () => {
    const origin = { side: 'target', type: 'first_frame', nodeId: 'v', handleId: 'first_frame' } as const;
    expect(portActive(origin, 'target', 'first_frame', { nodeId: 'v', handleId: 'first_frame' })).toBe(true);
    expect(portActive(origin, 'target', 'last_frame', { nodeId: 'v', handleId: 'last_frame' })).toBe(false);
  });
});
