# API — 08 · Ads, prodotti e API key

Ads (campagne + remix), catalogo prodotti, API key.
Errori comuni di auth: vedi [01-overview](01-overview.md).

## `GET /api/v1/brands/:slug/ads`

Riepilogo campagne paid (campagne, totali, serie storica), candidati al boost (post organici vincenti) e ad account Zernio collegati.

**Query params**

| Param | Tipo | Obbligatorio | Descrizione |
|---|---|---|---|
| `sync` | string | No | Se `=1`, esegue prima `syncAdAccounts` + `syncAdMetrics` (best-effort) |

**Response** `200`:

```json
{
  "summary": {
    "campaigns": [
      {
        "id": "uuid",
        "name": "Boost · Provate il nostro kit",
        "platform": "metaads",
        "ad_type": "boost",
        "status": "active",
        "goal": "engagement",
        "budget_amount": 12,
        "budget_type": "daily",
        "currency": "EUR",
        "review_status": null,
        "proposal_reason": null,
        "post_id": "uuid",
        "created_at": "2026-08-01T10:00:00Z",
        "approved_at": "2026-08-02T09:00:00Z",
        "zernio_ad_id": "12345",
        "external_ids": { "creditedSpend": 4.2 },
        "error": null,
        "metrics": {
          "campaign_id": "uuid",
          "spend": 4.2,
          "impressions": 2100,
          "clicks": 88,
          "reach": 1900,
          "ctr": 4.19,
          "cpc": 0.05,
          "cpm": 2.0,
          "conversions": 2,
          "roas": null,
          "period_start": "2026-08-02",
          "period_end": "2026-08-13",
          "synced_at": "2026-08-13T08:00:00Z"
        },
        "source": "dazero"
      }
    ],
    "totals": { "spend": 4.2, "impressions": 2100, "clicks": 88, "reach": 1900, "conversions": 2, "active": 1, "proposed": 2 },
    "series": [
      { "date": "2026-08-13", "spend": 4.2, "impressions": 2100, "clicks": 88 }
    ],
    "accountAds": []
  },
  "candidates": [
    {
      "postId": "uuid",
      "historyId": null,
      "externalPostId": "9876",
      "platform": "instagram",
      "caption": "Il dietro le quinte del lab",
      "mediaUrl": "https://cdn.../img.jpg",
      "publishedAt": "2026-08-05T12:00:00Z",
      "url": "https://www.instagram.com/p/xyz",
      "score": 123.4,
      "metrics": { "likes": 40, "comments": 6, "shares": 3, "saves": 2, "impressions": 3200, "views": 0, "engagementRate": 0.012 },
      "reason": "Engagement rate 1.2% · 46 interactions"
    }
  ],
  "adAccounts": [
    { "id": "uuid", "platform": "metaads", "name": "Conto Ads principale", "currency": "EUR", "status": "active", "zernio_ad_account_id": "acc_1" }
  ]
}
```

**Errori specifici**

| Status | Body |
|---|---|
| `404` | `{"error":"Not found"}` — feature ads disabilitata |
| `403` | `{"error":"ads_not_on_plan"}` — piano senza ads |

**Esempio**:

```bash
curl -s "https://dazero.co/api/v1/brands/mio-brand/ads?sync=1" \
  -H "Authorization: Bearer $TOKEN"
```

---

## `POST /api/v1/brands/:slug/ads`

Esegue un'azione sulle campagne ads, selezionata dal campo `action` del body.

**Body**

| Campo | Tipo | Obbligatorio | Descrizione |
|---|---|---|---|
| `action` | string | Sì | `propose` \| `approve` \| `reject` \| `duplicate` \| `delete` \| `pause` \| `resume` \| `toggle` \| `sync` \| `create` |
| `campaignId` | string | per `approve`/`reject`/`duplicate`/`delete`/`pause`/`resume`/`toggle` | ID campagna (`ad_campaigns.id`) |
| `extra` | object | No | Gli altri campi dell'azione, se preferisci raggrupparli invece di metterli in cima al corpo |
| `budgetAmount` | number | No | `approve`: budget giornaliero proposto; `create`: budget |
| `goal` | string | No | `approve`: `engagement` \| `traffic` \| `awareness` \| `video_views`; `create`: default `traffic` |
| `adId` | string | No | Solo `toggle`: se presente agisce sulla singola creativa |
| `next` | string | No | Solo `toggle`: `active` \| `paused` (qualsiasi altro valore = `paused`) |
| `platform` | string | No | Solo `create` — default `metaads` |
| `name` | string | No | Solo `create` — default `"Standalone ad"` |
| `campaignType` | string | No | Solo `create` — `SEARCH` o `DISPLAY` (Google) |
| `adAccountId` | string | No | Solo `create` |
| `keywords` | string[] | No | Solo `create` — targeting Google |
| `headline` / `headlines` | string / string[] | No | Solo `create` — headline (Google) |
| `body` / `descriptions` | string / string[] | No | Solo `create` — testi (Google) |
| `imageUrl` / `squareImageUrl` | string | No | Solo `create` — immagini |
| `businessName` | string | No | Solo `create` |
| `landingPageUrl` | string | No | Solo `create` |

**Response** `200` (varia per action):

```json
{ "ok": true, "created": 3, "candidates": 3 }          // propose
{ "ok": true, "zernioAdId": "12345" }                   // approve
{ "ok": true, "id": "uuid", "copiedCampaignId": "uuid" } // duplicate
{ "ok": true, "next": "paused" }                        // toggle
{ "ok": true, "accounts": 2, "metrics": 1 }             // sync
{ "ok": true, "id": "uuid" }                            // create
```

`reject`/`delete`/`pause`/`resume`: `{"ok": true}`

**Errori specifici**

| Status | Body |
|---|---|
| `400` | `{"error":"unknown_action"}` |
| `400` | `{"error":"missing_campaignId"}` |
| `400` | `{"error":"<errore dal layer ads>"}` (es. `goal_not_supported:...`) |
| `404` | `{"error":"Not found"}` |
| `403` | `{"error":"ads_not_on_plan"}` |

**Esempio**:

```bash
curl -s -X POST "https://dazero.co/api/v1/brands/mio-brand/ads" \
  -H "Authorization: Bearer $TOKEN" -H "Content-Type: application/json" \
  -d '{"action":"approve","campaignId":"0f3d...","budgetAmount":15,"goal":"engagement"}'
```

---

## `GET /api/v1/brands/:slug/ads/remix`

Elenco dei remix brief attuali del brand, ordinati per rank.

**Response** `200`:

```json
{
  "briefs": [
    {
      "id": "uuid",
      "sourceAdId": "1012345678",
      "sourcePageName": "Competitor X",
      "sourceBody": "Testo dell'ad sorgente...",
      "sourceThumbnail": "https://.../thumb.jpg",
      "sourceLibraryUrl": "https://www.facebook.com/ads/library/?id=1012345678",
      "rank": 1,
      "strategy": "Riprendi la struttura hook-problema-soluzione...",
      "keep": "La promessa chiara nel primo secondo",
      "change": "Riscrivi in voce del brand, prodotto nostro",
      "hook": "Stufo di risultati che non arrivano?",
      "headline": "Il metodo che funziona davvero",
      "body": "Testo remixato...",
      "cta": "Scopri di più",
      "productName": "Kit Completo",
      "visualPrompt": "Flat lay del kit su sfondo neutro, luce naturale...",
      "status": "proposed"
    }
  ]
}
```

**Errori specifici**: `404` `{"error":"Not found"}` (feature off) · `403` `{"error":"ads_not_on_plan"}`

**Esempio**:

```bash
curl -s "https://dazero.co/api/v1/brands/mio-brand/ads/remix" \
  -H "Authorization: Bearer $TOKEN"
```

---

## `POST /api/v1/brands/:slug/ads/remix`

Analizza gli ad dei competitor con la visione AI e sostituisce i remix brief precedenti con una nuova batch classificata (max 5, rank da 1). Se il body include un pool `ads`, salta la raccolta automatica. **Consuma crediti.**

**Body**

| Campo | Tipo | Obbligatorio | Descrizione |
|---|---|---|---|
| `ads` | object[] | No | Pool di ad (Ad Library). Campi `NormalizedAd` (es. `adArchiveId`, `pageName`, `body`, `cta`, `linkUrl`, `platforms`, `displayFormat`, `thumbnailUrl`, `startDate`, `isActive`) o `MetaAdDigestItem` (`id`/`adArchiveId`, `title`, `ctaText`, `mediaType`, `imageUrl`, `videoUrl`); serve `id`/`adArchiveId` non vuoto |

**Response** `200`:

```json
{
  "ok": true,
  "briefs": [
    {
      "sourceAdId": "1012345678",
      "sourcePageName": "Competitor X",
      "sourceBody": "Testo sorgente...",
      "sourceThumbnail": "https://.../thumb.jpg",
      "sourceLibraryUrl": "https://www.facebook.com/ads/library/?id=1012345678",
      "rank": 1,
      "strategy": "...",
      "keep": "...",
      "change": "...",
      "hook": "...",
      "headline": "...",
      "body": "...",
      "cta": "...",
      "productName": "Kit Completo",
      "visualPrompt": "...",
      "status": "proposed"
    }
  ]
}
```

**Errori specifici**

| Status | Body |
|---|---|
| `400` | `{"error":"no_competitor_ads"}` |
| `400` | `{"error":"no_remix_briefs"}` |
| `400` | `{"error":"<messaggio errore AI>"}` |
| `404` | `{"error":"Not found"}` |
| `403` | `{"error":"ads_not_on_plan"}` |
| `402` | `{"error":"credits_exhausted"}` |

**Esempio**:

```bash
curl -s -X POST "https://dazero.co/api/v1/brands/mio-brand/ads/remix" \
  -H "Authorization: Bearer $TOKEN" -H "Content-Type: application/json" \
  -d '{"ads":[{"adArchiveId":"1012345678","pageName":"Competitor X","body":"...","cta":"Shop Now"}]}'
```

---

## `GET /api/v1/brands/:slug/products`

Elenca tutti i prodotti del catalogo (ordinati per data di creazione).

**Response** `200`:

```json
{
  "products": [
    {
      "id": "uuid",
      "title": "Kit Completo",
      "kind": "product",
      "pricing": "€89",
      "imageCount": 3,
      "featured": true
    }
  ]
}
```

**Esempio**:

```bash
curl -s "https://dazero.co/api/v1/brands/mio-brand/products" -H "Authorization: Bearer $TOKEN"
```

---

## `POST /api/v1/brands/:slug/products`

Ri-sincronizza l'intero catalogo dal sito e-commerce del brand (Shopify / WooCommerce): elimina i prodotti esistenti e reinserisce quelli rilevati. Per aggiungere **una** offerta senza cancellare le altre c'è [`POST /studio/products`](04-studio.md).

**Body**: nessuno

**Response** `200`:

```json
{ "ok": true, "platform": "Shopify", "synced": 14 }
```

**Errori specifici**

| Status | Body |
|---|---|
| `400` | `{"error":"No website URL set for this brand."}` |
| `400` | `{"error":"No e-commerce platform detected on the site."}` |
| `400` | `{"error":"No products found on the site."}` |
| `500` | `{"error":"Sync failed: <dettaglio>"}` |

**Esempio**:

```bash
curl -s -X POST "https://dazero.co/api/v1/brands/mio-brand/products" \
  -H "Authorization: Bearer $TOKEN"
```

---

## `PUT /api/v1/brands/:slug/products/:id`

Aggiorna i campi di un singolo prodotto. Solo i campi presenti nel body cambiano: le altre colonne restano identiche. Un campo non dichiarato viene **rifiutato**, non ignorato. Tool MCP: `update_product`.

**Body**

| Campo | Tipo | Obbligatorio | Descrizione |
|---|---|---|---|
| `title` | string | No | Nuovo titolo |
| `description` | string | No | Nuova descrizione |
| `pricing` | string | No | Nuovo prezzo (testo libero) |
| `url` | string | No | Dove sta l'offerta |
| `featured` | boolean | No | Evidenziato sì/no |

**Response** `200`:

```json
{ "ok": true }
```

**Errori specifici**

| Status | Body |
|---|---|
| `400` | `{"error":"invalid_input","details":[…]}` — campo sconosciuto o tipo sbagliato |
| `400` | `{"error":"no_fields"}` — nessun campo da cambiare |
| `404` | `{"error":"not_found"}` — l'id non esiste **o** è di un altro brand: la risposta è la stessa |
| `500` | `{"error":"<messaggio Supabase>"}` |

**Esempio**:

```bash
curl -s -X PUT "https://dazero.co/api/v1/brands/mio-brand/products/PRODUCT_ID" \
  -H "Authorization: Bearer $TOKEN" -H "Content-Type: application/json" \
  -d '{"featured":true,"pricing":"€99"}'
```

---

## `DELETE /api/v1/brands/:slug/products/:id`

Elimina un prodotto del brand. Tool MCP: `delete_product`.

**Response** `200`:

```json
{ "ok": true }
```

**Errori specifici**

| Status | Body |
|---|---|
| `404` | `{"error":"not_found"}` — l'id non esiste **o** è di un altro brand |
| `500` | `{"error":"<messaggio Supabase>"}` |

**Esempio**:

```bash
curl -s -X DELETE "https://dazero.co/api/v1/brands/mio-brand/products/PRODUCT_ID" \
  -H "Authorization: Bearer $TOKEN"
```

---

## `GET /api/v1/brands/:slug/api-keys`

Elenca le API key dell'utente che hanno accesso a questo brand (mai le chiavi raw).

**Response** `200`:

```json
{
  "keys": [
    {
      "id": "uuid",
      "name": "CI deploy",
      "key_prefix": "dazero_live_a1",
      "permissions": { "brand_ids": ["BRAND_ID"], "scopes": ["read", "write"] },
      "created_at": "2026-06-01T10:00:00Z",
      "last_used_at": "2026-08-12T09:00:00Z"
    }
  ]
}
```

**Errori specifici**

| Status | Body |
|---|---|
| `403` | `{"error":"API key does not have access to this brand"}` |
| `500` | `{"error":"<messaggio Supabase>"}` |

**Esempio**:

```bash
curl -s "https://dazero.co/api/v1/brands/mio-brand/api-keys" -H "Authorization: Bearer $TOKEN"
```

---

## `POST /api/v1/brands/:slug/api-keys`

Crea una nuova API key. Richiede JWT (le API key non possono crearne altre). La chiave raw viene restituita **una sola volta**.

**Body**

| Campo | Tipo | Obbligatorio | Descrizione |
|---|---|---|---|
| `name` | string | No | Default `"API Key"` |
| `scopes` | string[] | No | Default `["read"]`; valori validi `read`/`write` (invalidi scartati, `read` sempre forzato) |
| `all_brands` | boolean | No | Se `true`, key per tutti i brand (`brand_ids: "*"`); default: solo questo brand |

**Response** `201`:

```json
{
  "key": {
    "id": "uuid",
    "name": "CI deploy",
    "key_prefix": "dazero_live_a1",
    "permissions": { "brand_ids": ["BRAND_ID"], "scopes": ["read", "write"] },
    "created_at": "2026-08-13T10:00:00Z",
    "raw": "dazero_live_<48 hex>"
  },
  "message": "Copy this key now — you will not be able to see it again."
}
```

**Errori specifici**

| Status | Body |
|---|---|
| `403` | `{"error":"API keys cannot create API keys — sign in with the CLI"}` |
| `500` | `{"error":"<messaggio Supabase>"}` |

**Esempio**:

```bash
curl -s -X POST "https://dazero.co/api/v1/brands/mio-brand/api-keys" \
  -H "Authorization: Bearer $TOKEN" -H "Content-Type: application/json" \
  -d '{"name":"CI deploy","scopes":["read","write"]}'
```

---

## `DELETE /api/v1/brands/:slug/api-keys/:id`

Revoca una API key. La key deve appartenere all'utente autenticato ed essere scopedata su questo brand.

**Response** `200`:

```json
{ "deleted": true }
```

**Errori specifici**

| Status | Body |
|---|---|
| `404` | `{"error":"API key not found"}` |
| `500` | `{"error":"<messaggio Supabase>"}` |

**Esempio**:

```bash
curl -s -X DELETE "https://dazero.co/api/v1/brands/mio-brand/api-keys/KEY_ID" \
  -H "Authorization: Bearer $TOKEN"
```
