import { describe, expect, it } from 'vitest';
import { BUILDER_CATEGORIES, describeBuilderSelections } from './influencer-builder-options';

describe('BUILDER_CATEGORIES — il catalogo portato da dalnulla', () => {
  it('ha le 13 categorie, incluse le fantastiche (species, horns)', () => {
    expect(BUILDER_CATEGORIES.map((c) => c.id)).toEqual([
      'species',
      'gender',
      'ethnicity',
      'skinCondition',
      'mouth',
      'eyeType',
      'ears',
      'hair',
      'facialHair',
      'glasses',
      'earrings',
      'piercings',
      'horns'
    ]);
  });

  it('ogni opzione con immagine punta sotto /influencer-builder', () => {
    for (const category of BUILDER_CATEGORIES) {
      for (const option of category.options) {
        if (option.imageUrl) {
          expect(option.imageUrl).toMatch(/^\/influencer-builder\//);
        }
      }
    }
  });

  it('skinCondition e piercings sono multi-selezione, il resto no', () => {
    const multi = BUILDER_CATEGORIES.filter((c) => c.multiSelect).map((c) => c.id);
    expect(multi.sort()).toEqual(['piercings', 'skinCondition'].sort());
  });
});

describe('describeBuilderSelections — le scelte diventano un prompt', () => {
  it('una selezione singola per categoria produce un frammento', () => {
    const prompt = describeBuilderSelections({ gender: 'female', ethnicity: 'asian' });
    expect(prompt).toContain('female');
    expect(prompt).toContain('Asian');
  });

  it('una categoria multi-selezione unisce più frammenti', () => {
    const prompt = describeBuilderSelections({ piercings: ['nose-ring', 'septum'] });
    expect(prompt).toContain('Nose Ring');
    expect(prompt).toContain('Septum');
  });

  it('un colore scelto entra come "skin tone #hex"', () => {
    const prompt = describeBuilderSelections({ skinColor: '#8D5524' });
    expect(prompt).toBe('skin tone #8D5524');
  });

  it('il testo libero va in coda', () => {
    const prompt = describeBuilderSelections({ gender: 'male', freeText: 'wearing a red jacket' });
    expect(prompt).toBe('male, wearing a red jacket');
  });

  it('nessuna selezione produce una stringa vuota, non un errore', () => {
    expect(describeBuilderSelections({})).toBe('');
  });

  it('un\'opzione "none" non aggiunge un frammento vuoto', () => {
    const prompt = describeBuilderSelections({ glasses: 'none', gender: 'male' });
    expect(prompt).toBe('male');
  });
});
