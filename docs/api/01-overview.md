# API Reference — Overview

> Reference della REST API pubblica di feega, generata dal codice (`src/routes/api/v1/`) il 13/08/2026.
> Copre gli endpoint consumati dalla CLI (`feega-cli`) e dalle integrazioni esterne via API key.

## Base URL

| Ambiente | Base URL |
|---|---|
| Produzione | `https://feega.app/api/v1` |
| Dev locale | `http://localhost:5173/api/v1` (con `npm run dev`) |

## Autenticazione

Tutti gli endpoint richiedono un header `Authorization: Bearer <token>`. Il token può essere:

1. **API key** (`feega_live_…`) — long-lived, creata da `POST /api/v1/brands/:slug/api-keys` o dal pannello web. Hash SHA-256 nel DB, mostrata una sola volta.
2. **Supabase JWT** — il session token ottenuto da `feega login` (browser OAuth).

```bash
# Esempio di chiamata
curl -s "https://feega.app/api/v1/brands" -H "Authorization: Bearer $TOKEN"
```

### API key: scope e limiti

- Ogni key ha `permissions.brand_ids` (lista di brand o `"*"`) e `permissions.scopes` (`read`, `write`).
- **Key read-only**: qualsiasi metodo diverso da GET/HEAD viene rifiutato globalmente.
- **Tenant boundary**: con API key, la verifica di ownership del brand viene riapplicata manualmente
  (owner di org o brand member) — un brand fuori scope risponde **404** (non 403), per non rivelare quali slug esistono.
- Le API key **non possono crearne altre** (`POST /api-keys` richiede JWT).

## Errori comuni (tutti gli endpoint)

| Status | Body | Quando |
|---|---|---|
| `401` | `{"error":"Missing or invalid Authorization header"}` | Header Bearer assente |
| `401` | `{"error":"Invalid or expired token"}` | JWT non valido/scaduto |
| `401` | `{"error":"Invalid API key"}` | Key non riconosciuta |
| `404` | `{"error":"Brand not found"}` | Slug inesistente o fuori dallo scope della key |
| `403` | `{"error":"API key is read-only"}` | Scrittura con key senza scope `write` |
| `403` | `{"error":"API key does not have access to this brand"}` | Brand fuori dallo scope `brand_ids` |
| `402` | `{"error":"credits_exhausted"}` | CreditAI esauriti su azione a consumo (vedi sotto) |

Questi errori **non vengono ripetuti** nelle pagine di riferimento: ogni endpoint li può restituire in aggiunta ai propri.

## Azioni a consumo crediti (`gateAiAction`)

Gli endpoint che spendono AI richiedono **piano a pagamento + crediti** e scope `write`. Falliscono con `402 credits_exhausted` o `403 API key is read-only` **prima** di eseguire. Sono:

| Endpoint | Azione |
|---|---|
| `POST /brands/:slug/posts/:id/render` | Render immagine singola |
| `POST /brands/:slug/ads/remix` | Remix brief da ad competitor |
| `POST /brands/:slug/media/generate` | Genera media (immagine o video) |
| `POST /brands/:slug/media/images` | Genera immagine |
| `POST /brands/:slug/media/videos` | Genera video |
| `POST /brands/:slug/media/carousel` | Genera carosello |
| `POST /brands/:slug/media/refine` | Modifica un asset esistente |

**Non gated, di proposito**: `POST /brands/:slug/billing/portal` e
`POST /brands/:slug/billing/checkout` ([10-billing](10-billing.md)) non chiamano `gateAiAction` e
non guardano i crediti. Sarebbe circolare — chi ha finito i crediti è chi deve arrivare al
checkout. Restano scope `write`: il link porta anche a un bottone di disdetta.

## Convenzioni di risposta

- Successo: `200` (o `201` per creazione key), quasi sempre con `{"ok": true, …}`.
- Errore applicativo: body `{"error": "<messaggio>"}` con status 4xx/5xx. I messaggi sono stringhe stabili
  (es. `post_not_found`, `unknown_action`, `no_credits`) su cui i client possono fare match.
- Le risposte che includono dati AI (piani, strategie, review, captions) sono **dinamiche**: i campi
  sono stabili, i valori no.
- I POST con `action` usano `{"error":"Unknown action: <x>"}` per azioni non riconosciute.

## Timezone e date

- `scheduled_for` accettato senza offset viene interpretato nel **timezone del brand**; con `Z`/`±hh:mm` viene rispettato.
- Le risposte usano ISO 8601 UTC.

## Pagine del reference

| Pagina | Area |
|---|---|
| [02 — Brand core](02-brands-core.md) | `brands`, detail, calendar, publishing, media |
| [03 — Posts](03-posts.md) | Lista, edit, approve, publish, reschedule, render, revoke |
| [08 — Ads e gestione](08-ads-voice-gtm-misc.md) | Ads, remix, products, api-keys |

## Note

- Gli endpoint **cron** (`/tick`, `/work`) protetti da `CRON_SECRET` non fanno parte della API pubblica
  e sono documentati nelle rispettive doc di feature.
- I comandi CLI che consumano questi endpoint sono in `cli/` (fonte unica di CLI, MCP e skill).
