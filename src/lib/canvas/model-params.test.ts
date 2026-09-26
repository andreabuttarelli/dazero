import { describe, it, expect } from 'vitest';
import { modelParamsOf, extraParamsOf, snapDynamicParams } from './model-params';

describe('modelParamsOf', () => {
  it('GPT Image 2.5: quality, background, output_compression diventano campi, aspect_ratio e resolution no', () => {
    const params = modelParamsOf({
      aspect_ratio: { type: 'enum', values: ['1:1', '16:9'] },
      quality: { type: 'enum', values: ['auto', 'low', 'medium', 'high', 'xhigh', 'max'] },
      background: { type: 'enum', values: ['auto', 'opaque', 'transparent'] },
      output_compression: { type: 'range', min: 0, max: 100 },
      n: { type: 'range', min: 1, max: 4 }
    });

    expect(params).toEqual([
      { name: 'quality', label: 'Qualità', kind: 'enum', values: ['auto', 'low', 'medium', 'high', 'xhigh', 'max'] },
      { name: 'background', label: 'Sfondo', kind: 'enum', values: ['auto', 'opaque', 'transparent'] },
      { name: 'output_compression', label: 'Compressione', kind: 'number', min: 0, max: 100 }
    ]);
  });

  it('un Seedream con solo resolution e input_references non produce nessun campo', () => {
    const params = modelParamsOf({
      resolution: { type: 'enum', values: ['2K', '4K'] },
      input_references: { type: 'range', min: 0, max: 8 }
    });

    expect(params).toEqual([]);
  });

  it('generate_audio ha già un controllo dedicato (il campo "audio"): non diventa un campo extra', () => {
    const params = modelParamsOf({
      generate_audio: { type: 'boolean' },
      seed: { type: 'boolean' }
    });

    expect(params).toEqual([{ name: 'seed', label: 'Seed', kind: 'boolean' }]);
  });

  it('un param_schema vuoto non produce campi', () => {
    expect(modelParamsOf({})).toEqual([]);
  });

  it('un nome senza override diventa un label umanizzato', () => {
    const params = modelParamsOf({ style_strength: { type: 'range', min: 0, max: 1 } });

    expect(params).toEqual([{ name: 'style_strength', label: 'Style strength', kind: 'number', min: 0, max: 1 }]);
  });
});

describe('extraParamsOf — cosa spedire al provider oltre ai campi con controllo dedicato', () => {
  it('un modello che dichiara "quality" lo manda, invariati aspectRatio/duration/resolution/audio/repeat', () => {
    const declared = [{ name: 'quality', label: 'Qualità', kind: 'enum' as const, values: ['low', 'high'] }];

    const extra = extraParamsOf(
      { aspectRatio: '1:1', duration: 5, resolution: '2K', audio: true, repeat: 2, quality: 'low' },
      declared
    );

    expect(extra).toEqual({ quality: 'low' });
  });

  it('un nome che il modello NON dichiara non parte, anche se presente in nodes.data.params', () => {
    const extra = extraParamsOf({ aspectRatio: '1:1', quality: 'low' }, []);

    expect(extra).toEqual({});
  });

  it('nessun params extra dichiarato: oggetto vuoto, non undefined', () => {
    expect(extraParamsOf({ aspectRatio: '1:1' }, [])).toEqual({});
  });
});

describe('snapDynamicParams — un cambio modello non deve mai lasciare un token che il nuovo rifiuta', () => {
  const QUALITY = { name: 'quality', label: 'Qualità', kind: 'enum' as const, values: ['low', 'high'] };
  const SEED = { name: 'seed', label: 'Seed', kind: 'number' as const, min: 0, max: 100 };
  const AUDIO = { name: 'transparent', label: 'Transparent', kind: 'boolean' as const };

  it('un valore ancora offerto dal nuovo modello resta com\'è', () => {
    expect(snapDynamicParams([QUALITY], { quality: 'high' })).toEqual({ quality: 'high' });
  });

  it('un valore enum che il nuovo modello non offre più scivola al primo dei suoi', () => {
    expect(snapDynamicParams([QUALITY], { quality: 'xhigh' })).toEqual({ quality: 'low' });
  });

  it('un nome che il nuovo modello non dichiara più sparisce', () => {
    expect(snapDynamicParams([QUALITY], { quality: 'low', background: 'transparent' })).toEqual({ quality: 'low' });
  });

  it('numero e booleano passano invariati: non hanno un elenco chiuso da cui scivolare', () => {
    expect(snapDynamicParams([SEED, AUDIO], { seed: 42, transparent: true })).toEqual({ seed: 42, transparent: true });
  });

  it('un campo dichiarato ma mai scelto resta assente, mai un default inventato', () => {
    expect(snapDynamicParams([QUALITY], {})).toEqual({});
  });
});
