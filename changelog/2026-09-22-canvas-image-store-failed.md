# Ogni run immagine finiva `store_failed`: il bucket non esisteva

Segnalato dopo il fix del timeout (`2026-09-22-canvas-image-node-hang.md`): il nodo non girava
più per sempre, ma non produceva mai un'immagine — `node_runs` diceva `status='failed',
error='store_failed'` per TUTTI e tre i run reali, zero eccezioni, e nessuno mai `running`.

## La diagnosi

Il modello risponde davvero — 40-70s di run, i byte tornano come data URL da
`renderPostImage`. Il fallimento è nel deposito:

```
runGenNode (canvas/generate.ts)
  → generateImagesWithoutBrand (media-generate.ts)
    → runImageJob → handOverImage → storeDrawing → storeBrandMediaBytes
      → supabase.storage.from('brand-knowledge').upload(...)
```

`select id from storage.buckets` sul progetto nuovo (`klnswzhhgrqvbfjzioul`) torna **zero righe**.
Non un bucket — nessuno. `brand-knowledge` (0021_brand_documents.sql) è una migrazione scritta
per il database VECCHIO e mai riapplicata al nuovo; `canvas-assets` non ha mai avuto una
migrazione affatto — nasceva a mano nel dashboard secondo MIGRATION_PLAN.md fase 2, lo stesso
difetto già documentato per `media` in `20260905140000_storage_tenant_isolation.sql`.

Il secondo difetto, che nascondeva il primo: `storeBrandMediaBytes` restituisce
`{ error: message }`, ma `storeDrawing` lo scartava (`if (stored.error) return null`), e
`handOverImage`/`depositImage` propagavano solo `null`. `runImageJob` vedeva un `null` e
rispondeva col token generico `store_failed`, sempre lo stesso qualunque fosse la causa reale —
bucket assente, scrittura respinta, campo mancante. Da UI era indebuggabile.

## La correzione

- `supabase/canvas-migrations/20260922_canvas_asset_buckets.sql`: crea `brand-knowledge` e
  `canvas-assets` (idempotente, `on conflict do nothing`) con le loro policy — solo bucket e
  storage.objects, NIENTE tabelle legacy (`brand_documents` non esiste più sullo schema nuovo).
  **Non ancora applicata**: il classificatore ha bloccato l'esecuzione diretta della DDL sul
  progetto — va lanciata a mano o con approvazione esplicita.
- `storeDrawing`/`handOverImage`/`depositImage` (`media-generate.ts`) ora portano la `reason` del
  fornitore fino a `ImageJobResult`, invece di scartarla in un `null`.
- `runGenNode` (`canvas/generate.ts`) scrive quella `reason` nell'errore del nodo:
  `store_failed: Bucket not found` invece di `store_failed` nudo.

## Cosa NON è stato verificato

La migrazione non è stata applicata (bloccata dal classificatore, va approvata esplicitamente).
Senza bucket, un run reale continuerà a fallire — ora con un errore leggibile invece di uno muto,
ma il difetto di fondo (nessun posto dove scrivere) resta finché la migrazione non gira.
