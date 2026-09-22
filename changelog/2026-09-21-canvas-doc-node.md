# Doc in tela: markdown nato pieno, link pubblico a token

Il canvas prende un quinto tipo di nodo, `doc`: un documento markdown che si legge reso e si
scrive grezzo. Come l'iframe, nasce pieno e non produce — non entra in `GEN_MEDIUMS`, e
`defaultParamsFor` / `promptTooLong` non gli fanno domande che non hanno risposta.

## Payload vs colonne

`data` resta `{ content, public }` come vuole `NEW_DATABASE_STRUCTURE.md`. L'impronta del token
e l'eventuale scadenza vivono come **colonne** su `nodes` (`public_token_hash`,
`public_expires_at`), non dentro `data`:

- il payload del nodo resta autocontenuto e non spedisce l'impronta a ogni collaboratore della tela;
- la lookup anonima per hash (rotta `/d/[token]`) è un index scan grazie a
  `nodes_public_token_hash_idx` (unico, parziale);
- è la forma della decisione 7.

## Token, mai l'id

Riuso del patto di `shared-views.test.ts` / `shared-views.ts`: `mintShareToken` e
`hashShareToken` in `doc-node.ts` (via Web Crypto — il file serve anche al client per
`docNodeSize`), solo l'hash sul database, il token in chiaro mostrato una volta sola. Revocato
(impronta azzerata), scaduto e mai esistito cadono dallo stesso ramo: un 404 identico, nessun
oracolo.

«Nuovo link» conia un token diverso e invalida quello di prima: dopo un ricarico il vecchio URL
non è recuperabile, perché non è mai stato conservato.

## File

- `src/lib/canvas/doc-node.ts` — forma del nodo, dimensioni, token, `docShareLive`, render markdown sicuro (HTML grezzo escape-ato, `javascript:` spento — stessa scelta di `blog-site.ts`)
- `src/lib/canvas-node-data.ts` — `docOf` / `docData`, `NODE_TYPES` + `doc`
- `src/lib/canvas/addable.ts` + `addable-icons.ts` — `doc` addable, label `Documento`, icona FileText; **non** in `GEN_MEDIUMS`
- `src/lib/components/canvas/DocNode.svelte` — la tile (Leggi/Scrivi, link pubblico)
- `src/lib/server/repos/doc-share.ts` — `setDocShare` / `clearDocShare` (con `org_id`) e `readSharedDoc` (per hash, come `shared_views`)
- `src/routes/p/[projectId]/c/[canvasId]/+page.server.ts` — action `share`
- `src/routes/d/[token]/` — pagina pubblica, senza auth
- `supabase/canvas-migrations/20260921_doc_public_token.sql`
