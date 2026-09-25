import { describe, it, expect } from 'vitest';
import {
  connectorsFor,
  orphanedByModelChange,
  CONNECTOR_TYPES,
  CONNECTOR_STYLE,
  connectorsForNode,
  portAccepts,
  anyPortAccepts,
  portListValued,
  portActive,
  outputConnectorOf,
  modalityBadges,
  type Modalities,
  type WiredConnector
} from './connectors';

const modalities = (input: string[]): Modalities => ({ input });

describe('connectorsFor — text: la porta testo è sempre lì, il resto segue il modello', () => {
  it('un modello di solo testo ha solo il connettore testo', () => {
    expect(connectorsFor('text', modalities(['text']))).toEqual(['text']);
  });

  it('un modello che legge anche immagini apre il connettore immagini, MAI first_frame/last_frame: non è un nodo video', () => {
    const out = connectorsFor('text', modalities(['text', 'image']));
    expect(out).toEqual(['text', 'images']);
    expect(out).not.toContain('first_frame');
    expect(out).not.toContain('last_frame');
  });

  it('un modello che legge anche video e audio apre entrambi i connettori', () => {
    expect(connectorsFor('text', modalities(['text', 'image', 'video', 'audio']))).toEqual([
      'text',
      'images',
      'videos',
      'audios'
    ]);
  });

  it('senza modalità note (nessun modello ancora risolto) resta comunque il connettore testo', () => {
    expect(connectorsFor('text', modalities([]))).toEqual(['text']);
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

  it("un nodo effects esce come un'immagine — la stessa porta di un nodo image", () => {
    expect(outputConnectorOf('effects')).toBe('images');
  });
});

describe('modalityBadges — le icone di un modello nel menù, una per modalità', () => {
  it('una modalità di input diventa un distintivo con icona, colore ed etichetta', () => {
    const badges = modalityBadges(['text']);
    expect(badges).toEqual([{ modality: 'text', icon: 'type', color: CONNECTOR_STYLE.text.color, label: 'Text' }]);
  });

  it('ogni modalità nota ha il suo distintivo, nell\'ordine dichiarato — non quello del modello', () => {
    const badges = modalityBadges(['video', 'text', 'audio', 'image']);
    expect(badges.map((b) => b.modality)).toEqual(['text', 'image', 'video', 'audio']);
  });

  it('image/video/audio riusano il colore della porta che aprono (CONNECTOR_STYLE)', () => {
    const badges = modalityBadges(['image', 'video', 'audio']);
    expect(badges.find((b) => b.modality === 'image')?.color).toBe(CONNECTOR_STYLE.images.color);
    expect(badges.find((b) => b.modality === 'video')?.color).toBe(CONNECTOR_STYLE.videos.color);
    expect(badges.find((b) => b.modality === 'audio')?.color).toBe(CONNECTOR_STYLE.audios.color);
  });

  it('file (PDF/documenti) ha il suo distintivo anche senza una porta corrispondente', () => {
    const badges = modalityBadges(['text', 'file']);
    expect(badges.find((b) => b.modality === 'file')).toMatchObject({ icon: 'file-text' });
  });

  it('una modalità sconosciuta non genera un distintivo a caso', () => {
    expect(modalityBadges(['text', 'something-new'])).toEqual([
      { modality: 'text', icon: 'type', color: CONNECTOR_STYLE.text.color, label: 'Text' }
    ]);
  });

  it('nessuna modalità nota, nessun distintivo', () => {
    expect(modalityBadges([])).toEqual([]);
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

  it('un nodo testo ha sempre il suo connettore testo, anche senza catalogo', () => {
    expect(connectorsForNode('text', null, [])).toEqual(['text']);
  });

  const textChoices = [
    { id: 'anthropic/claude-haiku-4.5', inputModalities: ['text', 'image'] },
    { id: 'meta/llama-text-only', inputModalities: ['text'] }
  ];

  it('un nodo testo con un modello vision apre anche il connettore immagini', () => {
    expect(connectorsForNode('text', 'anthropic/claude-haiku-4.5', textChoices)).toEqual(['text', 'images']);
  });

  it('un nodo testo con un modello solo testo NON mostra il connettore immagini', () => {
    expect(connectorsForNode('text', 'meta/llama-text-only', textChoices)).toEqual(['text']);
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

describe('una linea lasciata sul nodo atterra sulla porta del suo tipo', () => {
  it("un'immagine lasciata sulla porta text di un nodo che ha images va su images", async () => {
    const { landingPort } = await import('./connectors');
    expect(landingPort('text', 'images', ['text', 'images'])).toBe('images');
  });

  it('una porta giusta scelta a mano resta quella', async () => {
    const { landingPort } = await import('./connectors');
    expect(landingPort('first_frame', 'images', ['text', 'images', 'first_frame'])).toBe('first_frame');
  });

  it('senza una porta compatibile resta quella su cui è stata lasciata', async () => {
    const { landingPort } = await import('./connectors');
    expect(landingPort('text', 'videos', ['text'])).toBe('text');
  });
});

describe('le porte di una lista: tipizzate, a più fili', () => {
  it('una lista di immagini accetta un filo images, rifiuta un filo text', () => {
    expect(anyPortAccepts(['images'], 'images')).toBe(true);
    expect(anyPortAccepts(['images'], 'text')).toBe(false);
  });

  it('una lista vuota accetta entrambi', () => {
    expect(anyPortAccepts(['text', 'images'], 'text')).toBe(true);
    expect(anyPortAccepts(['text', 'images'], 'images')).toBe(true);
  });

  it('la porta text di una lista prende più fili; quella di un nodo testo no', () => {
    expect(portListValued('list', 'text')).toBe(true);
    expect(portListValued('text', 'text')).toBe(false);
    expect(portListValued('image', 'images')).toBe(true);
  });
});
