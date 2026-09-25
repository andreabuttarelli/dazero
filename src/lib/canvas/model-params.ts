/**
 * `ai_models.param_schema` → I CAMPI CHE IL TOOLBAR MOSTRA, per un modello scelto. Non ogni
 * parametro dichiarato diventa un controllo: alcuni hanno già la propria UI (`aspectRatio`,
 * `resolution`), uno è wiring (`input_references`), uno lo decide il prodotto (`n`, sempre 1).
 * L'esclusione vive in UNA tabella, con la ragione accanto — mai uno `if` sparso per nome.
 */

export type ParamSchemaEntry = { type: 'enum'; values: string[] } | { type: 'boolean' } | { type: 'range'; min: number; max: number };

export type ModelParam =
  | { name: string; label: string; kind: 'enum'; values: string[] }
  | { name: string; label: string; kind: 'boolean' }
  | { name: string; label: string; kind: 'number'; min?: number; max?: number };

const EXCLUDED_PARAMS: Readonly<Record<string, string>> = {
  aspect_ratio: 'ha il suo controllo dedicato (ModelChoice.aspectRatios)',
  resolution: 'ha il suo controllo dedicato (ModelChoice.resolutions)',
  input_references: 'wiring — quanti riferimenti il nodo inoltra, non un\'impostazione utente',
  n: 'il prodotto ne rende sempre uno',
  duration: 'ha il suo controllo dedicato (ModelChoice.durationOptions)',
  generate_audio: 'ha il suo controllo dedicato (ModelChoice.generateAudio, il campo "audio")'
};

const LABEL_OVERRIDES: Readonly<Record<string, string>> = {
  quality: 'Qualità',
  background: 'Sfondo',
  output_compression: 'Compressione',
  generate_audio: 'Audio',
  seed: 'Seed'
};

function humanize(name: string): string {
  const words = name.replace(/_/g, ' ');
  return words.charAt(0).toUpperCase() + words.slice(1);
}

function labelOf(name: string): string {
  return LABEL_OVERRIDES[name] ?? humanize(name);
}

function paramOf(name: string, entry: ParamSchemaEntry): ModelParam | null {
  const label = labelOf(name);

  if (entry.type === 'enum') return { name, label, kind: 'enum', values: entry.values };
  if (entry.type === 'boolean') return { name, label, kind: 'boolean' };
  if (entry.type === 'range') return { name, label, kind: 'number', min: entry.min, max: entry.max };

  return null;
}

/**
 * COSA SPEDIRE AL PROVIDER, DAI PARAMETRI CHE IL NODO PORTA. `params` è `nodes.data.params`, lo
 * stesso oggetto piatto che tiene sia i campi con un controllo suo (`aspectRatio`, `duration`…)
 * sia quelli dinamici (`quality`, `output_compression`…) — nessuna distinzione a livello di
 * schema. Qui si prendono SOLO i nomi che `declared` elenca (`ModelChoice.params`, quello che il
 * modello SCELTO dichiara ORA): un nome rimasto da un modello precedente, o mai dichiarato da
 * nessuno, non parte — mai un token che quel provider non si aspetta.
 */
export function extraParamsOf(params: Record<string, unknown>, declared: ModelParam[]): Record<string, unknown> {
  const extra: Record<string, unknown> = {};

  for (const param of declared) {
    if (param.name in params) extra[param.name] = params[param.name];
  }

  return extra;
}

export function modelParamsOf(schema: Record<string, unknown>): ModelParam[] {
  const params: ModelParam[] = [];

  for (const [name, raw] of Object.entries(schema)) {
    if (name in EXCLUDED_PARAMS) continue;

    const entry = raw as ParamSchemaEntry;
    const param = paramOf(name, entry);
    if (param) params.push(param);
  }

  return params;
}
