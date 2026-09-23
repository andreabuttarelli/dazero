/**
 * LE VISTE DI UN INFLUENCER — una tabella sola, come CLAUDE.md chiede: chiave, etichetta,
 * proporzioni e il pezzo di prompt che genera quella vista, tutti nello stesso punto. Presa dai
 * 378 `talent_views` di anomalia (`SELECT DISTINCT view_key, label, aspect_ratio, sort_order FROM
 * talent_views`): 7 viste per volto, lo stesso ordine con cui il catalogo importato le porta.
 *
 * `promptFragment` è quel che si aggiunge alla descrizione base per generare QUESTA vista dal
 * volto frontale già fatto (`influencer-create.ts`: frontale prima, poi le altre con il frontale
 * come riferimento) — non un prompt completo, un pezzo che si concatena.
 */
export type InfluencerViewKey =
  | 'face-front'
  | 'body-front'
  | 'face-three-quarter'
  | 'face-profile'
  | 'hands-detail'
  | 'body-three-quarter'
  | 'body-back';

export type InfluencerViewSpec = {
  key: InfluencerViewKey;
  label: string;
  aspectRatio: '3:4' | '1:1';
  sortOrder: number;
  promptFragment: string;
};

export const INFLUENCER_VIEWS: readonly InfluencerViewSpec[] = [
  {
    key: 'face-front',
    label: 'Face · Front',
    aspectRatio: '3:4',
    sortOrder: 10,
    promptFragment: 'Portrait, face front and centered, neutral studio background, looking straight at the camera.'
  },
  {
    key: 'body-front',
    label: 'Body · Front',
    aspectRatio: '3:4',
    sortOrder: 20,
    promptFragment: 'Full body shot, standing, facing the camera directly, neutral studio background.'
  },
  {
    key: 'face-three-quarter',
    label: 'Face · Three-quarter',
    aspectRatio: '3:4',
    sortOrder: 30,
    promptFragment: 'Portrait, head turned to a three-quarter angle, neutral studio background.'
  },
  {
    key: 'face-profile',
    label: 'Face · Profile',
    aspectRatio: '3:4',
    sortOrder: 40,
    promptFragment: 'Portrait, exact side profile, neutral studio background.'
  },
  {
    key: 'hands-detail',
    label: 'Hands',
    aspectRatio: '1:1',
    sortOrder: 50,
    promptFragment: 'Close-up detail shot of the hands, resting naturally, neutral studio background.'
  },
  {
    key: 'body-three-quarter',
    label: 'Body · Three-quarter',
    aspectRatio: '3:4',
    sortOrder: 60,
    promptFragment: 'Full body shot, body turned to a three-quarter angle, neutral studio background.'
  },
  {
    key: 'body-back',
    label: 'Body · Back',
    aspectRatio: '3:4',
    sortOrder: 70,
    promptFragment: 'Full body shot from behind, neutral studio background.'
  }
] as const;

export const FACE_FRONT_VIEW: InfluencerViewSpec = INFLUENCER_VIEWS[0];

export function influencerViewByKey(key: string): InfluencerViewSpec | undefined {
  return INFLUENCER_VIEWS.find((v) => v.key === key);
}
