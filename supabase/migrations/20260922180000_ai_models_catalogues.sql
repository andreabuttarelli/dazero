-- `ai_models` copriva un solo listino (`/models`, testo) quando in realtà OpenRouter ne
-- pubblica TRE, su tre rotte diverse: `/models` (chat), `/images/models` (52 modelli immagine,
-- fra cui Seedream, GPT Image 2/2.5, Qwen — NESSUNO dei quali compare su `/models`) e
-- `/videos/models` (29 modelli video — zero dei quali compaiono su `/models`, il motivo per cui
-- un sync che leggeva solo `/models` aveva SEMPRE zero righe con `output_modalities` che
-- contenesse `video`, non un caso limite: una lettura dalla rotta sbagliata).
--
-- I TRE LISTINI HANNO ID IN COMUNE. `google/gemini-3-pro-image` è sia un modello di chat (parla,
-- e in più emette immagini) sia una riga del listino immagini (con `supported_parameters` propri
-- di quella rotta — `aspect_ratio`, `quality`, `input_references`). Sono due fatti diversi sullo
-- stesso id, e un solo upsert su `id` li farebbe scrivere l'uno sopra l'altro: quale dei due
-- resta in tabella dipenderebbe dall'ordine in cui il sync chiama le rotte, non da quale dei due
-- serve al chiamante. `catalogue` è la terza colonna che manca dalla chiave: non "che tipo di
-- modello è" (un modello può emettere immagine E essere di chat), ma "da QUALE rotta viene
-- questa riga" — la stessa domanda che decide quale corpo mandare per generare.
--
-- Il video non ha `architecture.{input,output}_modalities`: quella rotta pubblica
-- `supported_frame_images`/`generate_audio`/`supported_durations` invece, la stessa forma che
-- `openrouter-video-models.ts` legge già. Le modalità per una riga video si RICAVANO da quei
-- campi al sync (sempre `video` in uscita, `text` sempre in ingresso, `image` se accetta un
-- fotogramma, `audio` se genera audio) — non è un'invenzione: è la stessa traduzione che
-- `video-models.ts` faceva a mano riga per riga, ora scritta una volta sola nel sync.
alter table public.ai_models
  add column if not exists catalogue text not null default 'chat';

alter table public.ai_models
  add constraint ai_models_catalogue_check check (catalogue in ('chat', 'image', 'video'));

alter table public.ai_models drop constraint if exists ai_models_pkey;
alter table public.ai_models add primary key (id, catalogue);

comment on table public.ai_models is
  'Cosa un modello accetta in ingresso/uscita, sincronizzato da OpenRouter — tre listini (chat /models, image /images/models, video /videos/models), una riga per (id, catalogue). Aggiornato dal cron di sync, mai a mano: una riga assente significa che il modello NON e'' offribile, non che le sue capacita'' sono ignote.';
comment on column public.ai_models.catalogue is
  'Da quale listino OpenRouter viene questa riga: chat (/models), image (/images/models) o video (/videos/models). Lo stesso id puo'' comparire su piu'' listini con fatti diversi — un modello di chat che emette anche immagini non e'' la riga che genera un''immagine.';

-- La policy di lettura esisteva già in produzione (applicata fuori da una migration mentre la
-- tabella veniva popolata per la prima volta): questo blocco la rende idempotente e la fa vivere
-- nel file, non solo nel database — altrimenti uno schema ricreato da zero (branch, ambiente
-- locale) nascerebbe senza, e ogni lettura del picker fallirebbe silenziosamente per RLS.
drop policy if exists ai_models_readable on public.ai_models;
create policy ai_models_readable on public.ai_models for select to authenticated using (true);
