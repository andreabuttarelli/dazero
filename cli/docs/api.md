# API Reference

Tutti gli endpoint sono sotto `/api/v1/` e richiedono autenticazione Bearer token. Questa pagina
copre le rotte brand-scoped (`/api/v1/brands/:slug/*`) che il CLI chiama — la fallback quando MCP
non è connesso. Un agente MCP non passa da qui: legge e scrive con `query`/`insert_row`/
`update_row`/`delete_row`/`run_node_generation`, org-scoped, non brand-scoped — vedi
[`skills/dazero/references/tools.md`](../skills/dazero/references/tools.md).

## Autenticazione

```
Authorization: Bearer <jwt_token>
```

Il token viene ottenuto tramite il flow OAuth della CLI. Viene salvato in `~/.config/dazero/session.json` e rinnovato automaticamente.

## Brand

### GET /api/v1/brands

Lista tutti i brand dell'utente.

**Response:**
```json
[
  {
    "id": "uuid",
    "name": "My Brand",
    "slug": "my-brand",
    "pendingCount": 3
  }
]
```

### GET /api/v1/brands/:slug

Dettaglio completo di un brand.

**Response:**
```json
{
  "brand": { ... },
  "pendingCount": 3,
  "productCount": 12,
  "accountCount": 3,
  "logoUrl": "https://..."
}
```

## Posts

### GET /api/v1/brands/:slug/posts

Lista post con filtro opzionale.

**Query params:**
- `status` (opzionale): `pending_user`, `approved`, `scheduled`, `published`, `failed`

**Response:**
```json
[
  {
    "id": "uuid",
    "brand_id": "uuid",
    "platform": "instagram",
    "caption": "...",
    "status": "pending_user",
    "slot": "2026-06-20T10:00:00Z",
    "scheduled_for": "2026-06-20T10:00:00Z",
    "format": "carousel",
    "product_name": "Pizza Margherita",
    "created_at": "2026-06-19T08:00:00Z"
  }
]
```

### PUT /api/v1/brands/:slug/posts/:id

Modifica un post.

**Body:**
```json
{
  "caption": "Nuovo testo",
  "image_prompt": "Un caffè artigianale",
  "platforms": ["instagram", "facebook"],
  "content_type": "carousel",
  "slot": "2026-06-20T10:00:00Z",
  "product_name": "Pizza Margherita"
}
```

### DELETE /api/v1/brands/:slug/posts/:id

Elimina un post (solo status `pending_user`).

### POST /api/v1/brands/:slug/posts/:id/approve

Approva e schedula un singolo post.

### POST /api/v1/brands/:slug/posts/approve-all

Approva tutti i post pending.

**Response:**
```json
{
  "results": [
    { "id": "uuid", "ok": true },
    { "id": "uuid", "ok": false, "error": "..." }
  ]
}
```

### POST /api/v1/brands/:slug/posts/:id/reschedule

Riprogramma un post.

**Body:**
```json
{ "scheduled_for": "2026-06-20T10:00:00Z" }
```

### POST /api/v1/brands/:slug/posts/:id/publish

Pubblica immediatamente un post.

### POST /api/v1/brands/:slug/posts/:id/render

Genera l'immagine mancante dal prompt del post.

**Response:**
```json
{ "ok": true, "url": "https://...", "error": null }
```

## Calendar

### GET /api/v1/brands/:slug/calendar?month=YYYY-MM

Calendario mensile dei post schedulati.

## Prodotti

### GET /api/v1/brands/:slug/products

Lista prodotti del catalogo.

### POST /api/v1/brands/:slug/products

Re-importa il catalogo dallo store collegato (Shopify/Woo).

**Response:**
```json
{ "ok": true, "platform": "shopify", "synced": 24, "rejected": [] }
```

## Ads

### GET /api/v1/brands/:slug/ads

Campagne, spesa, metriche e candidati boost.

### POST /api/v1/brands/:slug/ads

Azione sulle ads (`action` nel body: `sync`, `propose`, `approve`, `pause`, `resume`, `duplicate`,
`delete`, `create`, …) — vedi [`cli/commands/ads.ts`](../commands/ads.ts) per il mapping completo
dei flag CLI su questo endpoint.

### POST /api/v1/brands/:slug/ads/remix

Remix di ads competitor/trending in brief creativi in brand voice.

## Billing

### POST /api/v1/brands/:slug/billing/checkout

Apre il checkout Stripe per l'upgrade del piano.

### POST /api/v1/brands/:slug/billing/portal

Apre il portale di billing Stripe (fatture, carta, cambio piano, cancellazione).

## Errori

Tutti gli endpoint restituiscono errori in questo formato:

```json
{ "error": "Messaggio di errore" }
```

Codici HTTP:
- `401` — Token mancante o invalido
- `404` — Brand o risorsa non trovata
- `500` — Errore interno del server
