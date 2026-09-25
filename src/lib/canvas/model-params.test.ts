import { describe, it, expect } from 'vitest';
import { modelParamsOf } from './model-params';

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

  it('un video con generate_audio e seed booleani diventa Audio e Seed', () => {
    const params = modelParamsOf({
      generate_audio: { type: 'boolean' },
      seed: { type: 'boolean' }
    });

    expect(params).toEqual([
      { name: 'generate_audio', label: 'Audio', kind: 'boolean' },
      { name: 'seed', label: 'Seed', kind: 'boolean' }
    ]);
  });

  it('un param_schema vuoto non produce campi', () => {
    expect(modelParamsOf({})).toEqual([]);
  });

  it('un nome senza override diventa un label umanizzato', () => {
    const params = modelParamsOf({ style_strength: { type: 'range', min: 0, max: 1 } });

    expect(params).toEqual([{ name: 'style_strength', label: 'Style strength', kind: 'number', min: 0, max: 1 }]);
  });
});
