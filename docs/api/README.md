# feega — API Reference (pubblica)

Reference completa della REST API pubblica di feega, **generata dal codice** il 13/08/2026
(`src/routes/api/v1/`). Copre tutti gli endpoint consumati dalla CLI (`feega-cli`) e dalle
integrazioni esterne via API key — request, response, query params, body, errori e snippet curl.

## Indice

| Pagina | Endpoint |
|---|---|
| [01 — Overview](01-overview.md) | Auth (JWT/API key), errori comuni, gate crediti, convenzioni |
| [02 — Brand core](02-brands-core.md) | `GET /brands`, `GET /brands/:slug`, `/calendar`, `/publishing`, `/media` |
| [03 — Posts](03-posts.md) | `/posts` (list/edit/delete), `/approve`, `/publish`, `/reschedule`, `/render`, `/revoke`, `/approve-all` |
| [08 — Ads e gestione](08-ads-voice-gtm-misc.md) | `/ads`, `/ads/remix`, `/products`, `/api-keys` |
| [11 — Billing](11-billing.md) | `/billing/portal`, `/billing/checkout` — link Stripe che l'agente consegna all'umano |
| [12 — Impostazioni: modelli media](12-settings-models.md) | `/settings/models` — quale modello disegna e quale gira, per brand |
| [13 — Impostazioni: come lavora il brand](13-settings-brand.md) | `/settings/brand` — fuso, piattaforme, hashtag, esempi di voce |

## Regole di manutenzione

- Ogni endpoint nuovo o modificato **deve** aggiornare la pagina corrispondente (stessa PR).
- Le pagine riflettono il codice, non l'intento: status, body e messaggi di errore vanno copiati dal codice.
- Gli endpoint cron (`/tick`, `/work` protetti da `CRON_SECRET`) non sono API pubblica e vivono nelle doc di feature.
- Se un endpoint cambia auth (es. nuovo `gateAiAction`), aggiornare anche la tabella "Azioni a consumo crediti" in [01](01-overview.md).

## Fuori da questa reference

| Superficie | Dove |
|---|---|
| Endpoint cron (CRON_SECRET) | Doc di feature (es. 10-geo-audit, 13-radar, 19-weekly-recap) |
| API tools pubbliche del sito (`/api/tools/*`) | Sito marketing — non ancora documentate |
| Chat web (`/api/v1/chat/*`, session auth) | 24-chat-optimization |
| Beacon anonimi (`/blog/hit`, `/links/hit`) | 27-site-crawl, specs 31-p3 |
