/**
 * IL CATALOGO DEL BUILDER — categoria → opzioni → immagine di anteprima → frammento di prompt,
 * una tabella sola (CLAUDE.md). Porta da `dalnulla/character-generator`: le stesse 13 categorie,
 * le stesse chiavi, le stesse anteprime (`static/influencer-builder/<categoria>/<chiave>.webp`) —
 * incluse specie e corna, un personaggio fantastico è un influencer legittimo quanto uno umano.
 *
 * Non tutte le categorie sono a griglia di immagini: `gender` ha un'icona invece di una foto (lo
 * stesso in dalnulla), `skin`/`eyeColor`/`hairColor` sono colori, non foto — le tre liste restano
 * qui accanto, nello stesso file, non sparse in tre componenti diversi.
 */

const PREVIEW_BASE = '/influencer-builder';

function previewUrl(category: string, key: string): string {
  return `${PREVIEW_BASE}/${category}/${key}.webp`;
}

export type BuilderOption = {
  key: string;
  label: string;
  imageUrl?: string;
  promptFragment: string;
};

export type BuilderCategory = {
  id: string;
  label: string;
  multiSelect: boolean;
  options: BuilderOption[];
};

function imageOptions(category: string, entries: { key: string; label: string; prompt?: string }[]): BuilderOption[] {
  return entries.map((e) => ({
    key: e.key,
    label: e.label,
    imageUrl: previewUrl(category, e.key),
    promptFragment: e.prompt ?? e.label
  }));
}

export const BUILDER_CATEGORIES: readonly BuilderCategory[] = [
  {
    id: 'species',
    label: 'Species',
    multiSelect: false,
    options: imageOptions('species', [
      { key: 'human', label: 'Human' },
      { key: 'alien', label: 'Alien' },
      { key: 'cat', label: 'Cat' },
      { key: 'dog', label: 'Dog' },
      { key: 'dwarf', label: 'Dwarf' },
      { key: 'elf', label: 'Elf' },
      { key: 'ghost', label: 'Ghost' },
      { key: 'mermaid', label: 'Mermaid' },
      { key: 'orc', label: 'Orc' },
      { key: 'robot', label: 'Robot' }
    ])
  },
  {
    id: 'gender',
    label: 'Gender',
    multiSelect: false,
    options: [
      { key: 'male', label: 'Male', promptFragment: 'male' },
      { key: 'female', label: 'Female', promptFragment: 'female' },
      { key: 'trans-woman', label: 'Trans Woman', promptFragment: 'trans woman' },
      { key: 'trans-man', label: 'Trans Man', promptFragment: 'trans man' },
      { key: 'non-binary', label: 'Non-binary', promptFragment: 'non-binary' }
    ]
  },
  {
    id: 'ethnicity',
    label: 'Ethnicity',
    multiSelect: false,
    options: imageOptions('ethnicity', [
      { key: 'african', label: 'African' },
      { key: 'asian', label: 'Asian' },
      { key: 'european', label: 'European' },
      { key: 'indian', label: 'Indian' },
      { key: 'middle-eastern', label: 'Middle Eastern' },
      { key: 'latino', label: 'Latino' },
      { key: 'mixed', label: 'Mixed' },
      { key: 'pacific-islander', label: 'Pacific Islander' }
    ])
  },
  {
    id: 'skinCondition',
    label: 'Skin condition',
    multiSelect: true,
    options: imageOptions('skin-condition', [
      { key: 'none', label: 'None', prompt: '' },
      { key: 'vitiligo', label: 'Vitiligo' },
      { key: 'freckles', label: 'Freckles' },
      { key: 'birthmarks', label: 'Birthmarks' },
      { key: 'scars', label: 'Scars' },
      { key: 'burns', label: 'Burns' },
      { key: 'albinism', label: 'Albinism' },
      { key: 'tattoos', label: 'Tattoos' },
      { key: 'moles', label: 'Moles' },
      { key: 'spots', label: 'Spots' }
    ])
  },
  {
    id: 'mouth',
    label: 'Mouth',
    multiSelect: false,
    options: imageOptions('mouth', [
      { key: 'normal', label: 'Normal', prompt: '' },
      { key: 'small', label: 'Small' },
      { key: 'large', label: 'Large' },
      { key: 'no-teeth', label: 'No Teeth' },
      { key: 'fangs', label: 'Fangs' },
      { key: 'sharp-teeth', label: 'Sharp Teeth' },
      { key: 'forked-tongue', label: 'Forked Tongue' }
    ])
  },
  {
    id: 'eyeType',
    label: 'Eyes',
    multiSelect: false,
    options: imageOptions('eye-type', [
      { key: 'human', label: 'Human', prompt: '' },
      { key: 'cat', label: 'Cat eyes' },
      { key: 'dog', label: 'Dog eyes' },
      { key: 'glowing', label: 'Glowing' },
      { key: 'insect', label: 'Insect' },
      { key: 'mechanical', label: 'Mechanical' },
      { key: 'reptile', label: 'Reptile' }
    ])
  },
  {
    id: 'ears',
    label: 'Ears',
    multiSelect: false,
    options: imageOptions('ears', [
      { key: 'human', label: 'Human', prompt: '' },
      { key: 'no-ears', label: 'No ears' },
      { key: 'pointed', label: 'Pointed' },
      { key: 'elf', label: 'Elf' },
      { key: 'cat-ears', label: 'Cat ears' },
      { key: 'wing-ears', label: 'Wing ears' }
    ])
  },
  {
    id: 'hair',
    label: 'Hair',
    multiSelect: false,
    options: imageOptions('hair', [
      { key: 'bald', label: 'Bald' },
      { key: 'buzz-cut', label: 'Buzz Cut' },
      { key: 'short', label: 'Short' },
      { key: 'medium', label: 'Medium' },
      { key: 'long', label: 'Long' },
      { key: 'very-long', label: 'Very Long' },
      { key: 'curly', label: 'Curly' },
      { key: 'afro', label: 'Afro' },
      { key: 'braids', label: 'Braids' },
      { key: 'ponytail', label: 'Ponytail' },
      { key: 'mohawk', label: 'Mohawk' },
      { key: 'dreadlocks', label: 'Dreadlocks' }
    ])
  },
  {
    id: 'facialHair',
    label: 'Facial hair',
    multiSelect: false,
    options: imageOptions('facial-hair', [
      { key: 'none', label: 'None', prompt: '' },
      { key: 'stubble', label: 'Stubble' },
      { key: 'mustache', label: 'Mustache' },
      { key: 'goatee', label: 'Goatee' },
      { key: 'full-beard', label: 'Full Beard' },
      { key: 'long-beard', label: 'Long Beard' }
    ])
  },
  {
    id: 'glasses',
    label: 'Glasses',
    multiSelect: false,
    options: imageOptions('glasses', [
      { key: 'none', label: 'None', prompt: '' },
      { key: 'round', label: 'Round' },
      { key: 'square', label: 'Square' },
      { key: 'cat-eye', label: 'Cat-eye' },
      { key: 'aviator', label: 'Aviator' },
      { key: 'rimless', label: 'Rimless' },
      { key: 'sunglasses', label: 'Sunglasses' },
      { key: 'monocle', label: 'Monocle' }
    ])
  },
  {
    id: 'earrings',
    label: 'Earrings',
    multiSelect: false,
    options: imageOptions('earrings', [
      { key: 'none', label: 'None', prompt: '' },
      { key: 'studs', label: 'Studs' },
      { key: 'hoops', label: 'Hoops' },
      { key: 'dangles', label: 'Dangles' },
      { key: 'ear-cuffs', label: 'Ear Cuffs' },
      { key: 'plugs', label: 'Plugs/Gauges' }
    ])
  },
  {
    id: 'piercings',
    label: 'Piercings',
    multiSelect: true,
    options: imageOptions('piercings', [
      { key: 'none', label: 'None', prompt: '' },
      { key: 'nose-ring', label: 'Nose Ring' },
      { key: 'nose-stud', label: 'Nose Stud' },
      { key: 'lip-ring', label: 'Lip Ring' },
      { key: 'eyebrow', label: 'Eyebrow' },
      { key: 'septum', label: 'Septum' }
    ])
  },
  {
    id: 'horns',
    label: 'Horns',
    multiSelect: false,
    options: imageOptions('horns', [
      { key: 'none', label: 'None', prompt: '' },
      { key: 'small', label: 'Small' },
      { key: 'large', label: 'Large' },
      { key: 'ram', label: 'Ram' },
      { key: 'demon', label: 'Demon' },
      { key: 'antlers', label: 'Antlers' }
    ])
  }
] as const;

export type ColorPreset = { color: string; label: string };

export const SKIN_COLOR_PRESETS: readonly ColorPreset[] = [
  { color: '#FDEBD0', label: 'Light' },
  { color: '#F5CBA7', label: 'Fair' },
  { color: '#E0AC69', label: 'Medium' },
  { color: '#C68642', label: 'Tan' },
  { color: '#8D5524', label: 'Brown' },
  { color: '#6B3A2A', label: 'Dark Brown' },
  { color: '#3B1F12', label: 'Deep' },
  { color: '#F0E68C', label: 'Golden' }
];

export const EYE_COLOR_PRESETS: readonly ColorPreset[] = [
  { color: '#634e34', label: 'Brown' },
  { color: '#2874A6', label: 'Blue' },
  { color: '#2E7D32', label: 'Green' },
  { color: '#8D6E63', label: 'Hazel' },
  { color: '#90A4AE', label: 'Gray' },
  { color: '#FF8F00', label: 'Amber' },
  { color: '#7B1FA2', label: 'Violet' },
  { color: '#C62828', label: 'Red' }
];

export const HAIR_COLOR_PRESETS: readonly ColorPreset[] = [
  { color: '#1a1a1a', label: 'Black' },
  { color: '#4a2f1b', label: 'Brown' },
  { color: '#d4a44c', label: 'Blonde' },
  { color: '#8B2500', label: 'Red' },
  { color: '#9E9E9E', label: 'Gray' },
  { color: '#FFFFFF', label: 'White' },
  { color: '#E91E63', label: 'Pink' },
  { color: '#1565C0', label: 'Blue' },
  { color: '#2E7D32', label: 'Green' }
];

export type BuilderSelections = {
  [categoryId: string]: string | string[] | undefined;
} & {
  skinColor?: string;
  eyeColor?: string;
  hairColor?: string;
  freeText?: string;
};

function labelsFor(category: BuilderCategory, value: string | string[] | undefined): string[] {
  if (!value) return [];
  const keys = Array.isArray(value) ? value : [value];
  return keys
    .map((key) => category.options.find((o) => o.key === key)?.promptFragment)
    .filter((v): v is string => Boolean(v && v.trim()));
}

/**
 * LE SELEZIONI DIVENTANO IL PROMPT DEL VOLTO — una frase per categoria scelta, unite con virgole,
 * più il testo libero alla fine. `generateInfluencer` (`influencer-create.ts`) aggiunge poi il
 * frammento della vista specifica (`influencer-views.ts`): questo è solo il personaggio, non
 * l'inquadratura.
 */
export function describeBuilderSelections(selections: BuilderSelections): string {
  const parts: string[] = [];

  for (const category of BUILDER_CATEGORIES) {
    parts.push(...labelsFor(category, selections[category.id]));
  }

  if (selections.skinColor) parts.push(`skin tone ${selections.skinColor}`);
  if (selections.eyeColor) parts.push(`eye color ${selections.eyeColor}`);
  if (selections.hairColor) parts.push(`hair color ${selections.hairColor}`);
  if (selections.freeText?.trim()) parts.push(selections.freeText.trim());

  return parts.join(', ');
}
