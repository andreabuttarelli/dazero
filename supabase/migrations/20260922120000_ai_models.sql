-- Cosa un modello ACCETTA, letto dal gateway invece di scritto a mano.
--
-- Il canvas collega nodi di testo, immagine e video fra loro, e prima di girare deve sapere se il
-- modello scelto prende davvero quell'input — un'immagine mandata a un modello solo-testo torna
-- un errore del provider, dopo aver speso. `image-models.ts` e `video-models.ts` dichiarano i
-- dettagli di integrazione (quale campo vuole i riferimenti, quanti ne accetta un modello preciso,
-- le durate) e restano dove sono: quelli sono FATTI NOSTRI, di come chiamiamo ogni famiglia.
--
-- La MODALITA' — testo, immagine, audio, video in ingresso e in uscita — non e' un fatto nostro:
-- e' quello che OpenRouter pubblica su `/models` (`architecture.input_modalities`,
-- `output_modalities`, `supported_parameters`), e cambia sotto di noi (un modello aggiunge
-- l'audio, un altro sparisce). Scriverlo a mano in un file .ts vuol dire un secondo elenco che
-- diverge dal primo la settimana in cui OpenRouter aggiorna il suo — la stessa lezione di
-- `chat_model_catalog`, ma qui il rischio e' peggiore: un rifiuto o un'accettazione sbagliata
-- scoperti dopo aver pagato un render, non un modello assente dal menu.
--
-- Righe, non un file: un cron aggiorna `ai_models` come sync-models aggiornava (aggiorna ancora,
-- vedi `chat_model_catalog`) il menu della chat. Un modello non piu` pubblicato non si cancella
-- da solo — resta con `synced_at` vecchio, cosi` un giro su di lui si vede dire ESATTAMENTE perche`
-- rifiuta un input («il listino non lo conferma da 9 giorni»), invece di sparire senza traccia.
create table if not exists public.ai_models (
  id text primary key,
  provider text not null default 'openrouter',
  label text,
  input_modalities text[] not null default '{}',
  output_modalities text[] not null default '{}',
  supported_parameters text[] not null default '{}',
  pricing jsonb not null default '{}'::jsonb,
  synced_at timestamptz not null default now(),
  created_at timestamptz not null default now()
);

alter table public.ai_models enable row level security;

-- Nessuna policy: come `chat_model_catalog`, si legge solo con la service role — questo repo non
-- interroga mai Postgres dal browser, e la CLI passa sempre dall'API (vedi CLAUDE.md).

comment on table public.ai_models is
  'Cosa un modello accetta in ingresso/uscita, sincronizzato da OpenRouter /models. Aggiornato dal cron di sync, mai a mano: un valore assente e'' "non ancora sincronizzato", mai "no" per assunzione.';
comment on column public.ai_models.input_modalities is
  'architecture.input_modalities di OpenRouter: text, image, audio, video fra quelli che dichiara.';
comment on column public.ai_models.output_modalities is
  'architecture.output_modalities di OpenRouter.';
comment on column public.ai_models.supported_parameters is
  'supported_parameters di OpenRouter (tools, reasoning, …) — la stessa lista che openrouter-models.ts gia'' legge per la chat.';
comment on column public.ai_models.synced_at is
  'Ultima volta che QUESTA riga ha corrisposto al listino vero. Vecchia non vuol dire sbagliata: vuol dire non riconfermata — chi legge la mostra, non la nasconde.';
