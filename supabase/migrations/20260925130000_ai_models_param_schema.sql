-- `ai_models.supported_parameters` sa SOLO i NOMI dei parametri (`{quality, background, n,
-- aspect_ratio, resolution, output_compression, seed}`), non come renderizzarli: `quality` è un
-- enum con sei valori su GPT Image 2.5 e quattro su GPT Image 2, `output_compression` è un range
-- 0-100, `seed` è un booleano. Un controllo generico nel toolbar (rule: "one generic control
-- renderer", CLAUDE.md) ha bisogno del TIPO e dei VALORI dichiarati, non solo del nome — altrimenti
-- ogni parametro torna a un `if` scritto a mano per famiglia, la cosa che la regola vieta.
--
-- OpenRouter pubblica quella forma già oggi, sulle stesse due rotte del sync esistente:
--
--   /images/models  → `supported_parameters` è un OGGETTO `{ paramName: { type, values|min|max } }`
--                     (verificato in diretta, 2026-09-25: `enum` con `values`, `range` con
--                     `min`/`max`, `boolean` senza altro campo). `ai_models-sync.ts` lo leggeva
--                     già per popolare `supported_parameters` (`toArray` prende solo le chiavi) e
--                     per `resolution` (`imageResolutionValues`, l'unico valore già estratto) —
--                     qui si tiene l'oggetto INTERO, non solo le chiavi o un valore isolato.
--   /videos/models  → niente oggetto equivalente: due campi booleani sciolti, `generate_audio` e
--                     `seed` (`true`/`false`/`null`), letti così come sono. `allowed_passthrough_
--                     parameters` esiste ma è un elenco di NOMI SENZA TIPO (`voice_id`,
--                     `cfg_scale`, `motion_prompt`…) specifico di ogni provider dietro
--                     OpenRouter: senza type/values dichiarati non è renderizzabile da un
--                     controllo generico, quindi resta fuori da `param_schema` finché OpenRouter
--                     non pubblica anche per lui una forma tipizzata.
alter table public.ai_models
  add column if not exists param_schema jsonb not null default '{}'::jsonb;

comment on column public.ai_models.param_schema is
  'Lo schema DICHIARATO di ogni parametro extra del modello, per il renderer generico del toolbar — {paramName: {type: enum|range|boolean, values?, min?, max?}}. Su image: `supported_parameters` di /images/models presa intera (non solo le chiavi). Su video: {generate_audio: {type: boolean}, seed: {type: boolean}} quando il modello li dichiara true/false — `allowed_passthrough_parameters` resta fuori, nessun type dichiarato da OpenRouter per quei nomi. Vuoto per chat, e per una riga non ancora sincronizzata.';
