# Build più leggera, idratazione più veloce

Prima del primo deploy di produzione. Misure su `vite preview`, tela con 12 nodi.

- **Una funzione Vercel invece di quattro** (194 MB → 70 MB): adapter-vercel emette una funzione
  intera per ogni `config` distinto. Default dell'adapter a 300 s, le due rotte a 60 s lo ereditano.
  `scripts/single-function.test.ts` impedisce un nuovo valore.
- **Load della tela in parallelo**: run, testi dei run, prodotti e feed erano letti per nodo in
  serie, dopo aver riletto i nodi. `__data.json` della pagina 1220 → 391 ms.
- **Sentry fuori dal primo download**: il plugin avvolgeva `+layout.ts` con
  `wrapLoadWithSentry`, quindi `@sentry/core` entrava statico in ogni pagina nonostante l'init
  pigro di `hooks.client.ts`. `autoInstrument.load: false`; i load server restano strumentati.
- **Il foglio carica Calendar/Ads/Settings all'apertura** (`SHEET_PAGE_LOADERS`).
- **en.json da 176 KB a 31 KB**: 2.719 chiavi del prodotto cancellato. Il test in
  `src/lib/i18n/dictionary.test.ts` fallisce su una chiave che nessun codice nomina. Il
  dizionario delle docs lo carica solo il layout delle docs.
- **23 dipendenze senza import tolte** (Remotion, React, Tiptap, satori, …: 179 pacchetti), con
  `bake-motion-library.ts`, che importava un modulo già cancellato.
- **Controlli inerti fino all'idratazione**: `data-hydrating` su `<html>` da `app.html`, tolto
  dall'`onMount` del layout radice. Prima i click sulla rail finivano nel vuoto.

- **Secondo giro**: chat e pannello a sinistra da `CHROME_LOADERS` (prefetch al passaggio sulla
  rail, `ENTRY_PREFETCH`), `marked` solo quando un documento si monta (`doc-render.ts`),
  `SOCIAL_PLATFORMS` in un modulo senza import così `zod` resta sul server. JS della tela
  335 → 296 KB gzip; idratazione a 4x CPU + Fast 4G 3521 → 3302 ms.
- **Web Analytics solo sui build Vercel**: `/_vercel/insights/script.js` esiste solo lì; in preview
  e nel build node era un 404 in console a ogni pagina.

Scartato: rendere pigri i nodi della tela (servono al primo disegno). Quel che resta sul percorso
critico è `@xyflow` (75 KB gzip) e il client Supabase (58 KB), entrambi necessari al primo disegno.
