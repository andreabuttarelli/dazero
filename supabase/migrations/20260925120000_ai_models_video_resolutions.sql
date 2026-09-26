-- `ai_models` non porta le risoluzioni che OGNI modello video accetta davvero: `offerable-models.ts`
-- offriva lo stesso `VIDEO_RESOLUTIONS = ['480p', '720p']` a QUALUNQUE modello sincronizzato, e
-- `alibaba/happyhorse-1.0` — che su `/videos/models` dichiara `supported_resolutions: ["720p",
-- "1080p"]`, mai 480p — veniva offerto con un 480p che il fornitore rifiuta (`video_renders`
-- cb1de6e2, "Input should be '1080P' or '720P'").
--
-- OpenRouter pubblica il campo su QUELLA rotta (verificato in diretta, 2026-09-25): un array di
-- stringhe minuscole (`360p`, `480p`, `720p`, `768p`, `1080p`, `1K`, `2K`, `4K`) — non un tetto in
-- pixel, il token esatto che `POST /videos` valida. Nessuna maiuscola: l'errore visto in
-- `video_renders` viene da un validatore diverso di quello stesso endpoint, non da un secondo
-- formato da inventare qui.
alter table public.ai_models
  add column if not exists supported_resolutions text[] not null default '{}';

comment on column public.ai_models.supported_resolutions is
  'Solo per catalogue=video: video_renders.resolution di OpenRouter (/videos/models, supported_resolutions) — i token esatti che POST /videos valida per QUESTO modello, minuscoli (720p, 1080p, 4K…). Vuoto per chat/image, dove il campo non esiste su quella rotta.';
