import { describe, it, expect } from 'vitest';
import {
  connectorsFor,
  orphanedByModelChange,
  CONNECTOR_TYPES,
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
