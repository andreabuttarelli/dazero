# Post — Guida all'editing

Il comando `post` permette di gestire singoli post: modificare, approvare, pubblicare, riprogrammare, eliminare.

## Visualizzare un post

```bash
dazero post my-brand <post-id>
```

Mostra tutti i dettagli del post: platform, status, caption, pillar, format, slot, product.

## Modificare un post

### Caption

```bash
dazero post my-brand <post-id> edit --caption "Nuovo testo della caption"
```

### Prompt immagine

```bash
dazero post my-brand <post-id> edit --imagePrompt "Un caffè artigianale su sfondo chiaro"
```

### Piattaforme

```bash
dazero post my-brand <post-id> edit --platforms "instagram,facebook"
```

### Tipo contenuto

```bash
dazero post my-brand <post-id> edit --contentType carousel
```

### Data/ora

```bash
dazero post my-brand <post-id> edit --slot "2026-06-20T10:00"
```

### Prodotto associato

```bash
dazero post my-brand <post-id> edit --product "Pizza Margherita"
```

### Modifiche multiple

```bash
dazero post my-brand <post-id> edit \
  --caption "Nuovo testo" \
  --platforms "instagram" \
  --slot "2026-06-20T10:00"
```

## Approvare un post

```bash
dazero post my-brand <post-id> approve
```

Approva il post e lo schedula per la pubblicazione tramite Zernio.

## Pubblicare immediatamente

```bash
dazero post my-brand <post-id> publish
```

Pubblica il post subito, indipendentemente dallo scheduling.

## Riprogrammare

```bash
dazero post my-brand <post-id> reschedule --scheduledFor "2026-06-20T10:00"
```

Cancella lo scheduling esistente e programma il post per la nuova data.

## Eliminare un post

```bash
dazero post my-brand <post-id> reject
```

Elimina il post. Funziona solo per post con status `pending_user`.

## Generare l'immagine mancante

```bash
dazero post my-brand <post-id> render
```

Disegna l'immagine dal prompt già scritto sul post. Un render, nessun controllo automatico:
guarda il risultato prima di approvare.

## Uso con AI

Questi comandi sono la fallback REST, brand-scoped. Un agente collegato via MCP lavora sui post
con un tool set diverso e org-scoped — `list_posts`, `create_post`, `set_post_status` — non lo
stesso percorso di questo comando: vedi [`skills/dazero/references/tools.md`](../skills/dazero/references/tools.md).

## ID del post

L'ID del post si ottiene da:
- `dazero content my-brand` — lista tutti i post con ID
- Dashboard web — click su un post per vedere l'ID
