import { describe, it, expect } from 'vitest';
import {
  GEN_MEDIUMS,
  defaultParamsFor,
  genNodeSize,
  isGenMedium,
  promptTooLong,
  runStateOf,
  type GenNode,
  type ModelChoice
} from './gen-node';

const choice = (over: Partial<ModelChoice> = {}): ModelChoice => ({
  id: 'm1',
  label: 'Modello',
  aspectRatios: ['1:1', '9:16'],
  ...over
});

const node = (over: Partial<GenNode> = {}): GenNode => ({
  id: 'n1',
  medium: 'image',
  model: 'm1',
  prompt: 'un gatto',
  params: {},
  refId: null,
  runs: [],
  ...over
});

describe('il medium di un nodo che produce', () => {
  it('sono i tre della tela, e nient altro', () => {
    expect(GEN_MEDIUMS).toEqual(['text', 'image', 'video']);
  });

  it('rifiuta un medium inventato prima che arrivi al check', () => {
    expect(isGenMedium('audio')).toBe(false);
    expect(isGenMedium('video')).toBe(true);
  });
});

describe('lo stato di un nodo', () => {
  it('senza prompt non è pronto: manca la sola cosa che serve sempre', () => {
    expect(runStateOf(node({ prompt: '' }))).toBe('empty');
    expect(runStateOf(node({ prompt: '   ' }))).toBe('empty');
  });

  it('col prompt è pronto a girare', () => {
    expect(runStateOf(node())).toBe('ready');
  });

  it('un nodo che ha già prodotto è fatto, non di nuovo pronto', () => {
    // Senza questo stato il nodo tornerebbe «pronto» dopo aver girato, e il bottone inviterebbe a
    // pagare una seconda volta la stessa cosa.
    expect(runStateOf(node({ refId: 'media-1' }))).toBe('done');
  });

  it('un nodo in corso lo dice, e non si rilancia', () => {
    expect(runStateOf(node({ running: true }))).toBe('running');
  });

  it('un nodo che ha già prodotto resta fatto anche mentre se ne rifà un altro', () => {
    expect(runStateOf(node({ refId: 'media-1', running: true }))).toBe('running');
  });
});

describe('i parametri che un modello accetta', () => {
  it('parte dal primo formato che il modello serve davvero', () => {
    // Un default scritto a mano («1:1») è il modo per farsi rifiutare da un modello che fa solo
    // verticale, dopo aver speso.
    expect(defaultParamsFor(choice({ aspectRatios: ['9:16', '1:1'] }))).toMatchObject({
      aspectRatio: '9:16'
    });
  });

  it('per un video parte dalla durata minima, non da un numero inventato', () => {
    const params = defaultParamsFor(choice({ minDuration: 5, maxDuration: 20 }));

    expect(params.duration).toBe(5);
  });

  it('senza durate dichiarate non inventa una durata', () => {
    expect(defaultParamsFor(choice()).duration).toBeUndefined();
  });

  it('senza formati dichiarati non inventa un formato', () => {
    expect(defaultParamsFor(choice({ aspectRatios: [] })).aspectRatio).toBeUndefined();
  });
});

describe('il tetto del prompt', () => {
  it('avverte PRIMA della chiamata quando il modello lo dichiara', () => {
    expect(promptTooLong('x'.repeat(11), choice({ maxPromptChars: 10 }))).toBe(true);
    expect(promptTooLong('x'.repeat(10), choice({ maxPromptChars: 10 }))).toBe(false);
  });

  it('senza tetto dichiarato non inventa un limite', () => {
    expect(promptTooLong('x'.repeat(10_000), choice())).toBe(false);
  });
});

describe('la misura di un nodo sulla tela', () => {
  it('il testo è basso e largo: è una casella di scrittura', () => {
    expect(genNodeSize('text').h).toBeLessThan(genNodeSize('image').h);
  });

  it('immagine e video sono alti abbastanza da mostrare quel che producono', () => {
    expect(genNodeSize('image').h).toBeGreaterThan(300);
    expect(genNodeSize('video').h).toBeGreaterThan(300);
  });
});
