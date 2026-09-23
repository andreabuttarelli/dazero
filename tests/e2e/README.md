# E2E smoke suite

`npm run test:e2e` runs this directory with Playwright (Chromium only). The suite is
deterministic by construction: it boots `vite dev` with **placeholder** Supabase env
(`PUBLIC_SUPABASE_URL=http://localhost:54321`, placeholder anon key — see
`playwright.config.ts`) and only visits pages that answer without any external service.

## I file `@real`

`onboarding.real.spec.ts` vuole un database vero, con l'utente `test@dazero.co` e il brand `demo`
già seminati. `canvas.spec.ts` e `settings-brand.spec.ts` sono `@real` di un altro tipo: non
seminano niente a mano, si costruiscono ognuno la propria org/progetto/tela usa-e-getta con
`tests/e2e/fixtures/session.ts` (stesso pattern di `scripts/eval/canvas.ts` e
`scripts/eval/gen-node.ts`: service role, teardown SEMPRE in `finally`, Storage ripulito a parte
perché non è nella cascata di Postgres) e la smontano da sole. Login vero — si compila il form su
`/login`, non si inietta un cookie.

Tenute volutamente strette a smoke critici, non a copertura esaustiva: `canvas.spec.ts` prova che
la tela si apre senza errore e che un nodo testo genera per davvero (un giro reale, l'unico step a
pagamento — salta se manca `OPENROUTER_API_KEY`); `settings-brand.spec.ts` prova lo stato vuoto e
che "crea un brand" arrivi davvero a mostrare il form del brand appena creato. Una copertura più
larga (drag & drop, upload, angoli squadrati…) è stata scritta e tolta di nuovo: costa tempo reale
a ogni run e qui la CLAUDE.md chiede una funzione provata end-to-end, non ogni superficie coperta.

Tutti girano SOLO con `E2E_REAL_STACK=1`; senza, si saltano. Non si proteggono con
`PUBLIC_SUPABASE_URL`: quella la mette `playwright.config.ts` come segnaposto, c'è sempre, e una
guardia che non può scattare è una guardia che non esiste.

Il fixture `test` esportato da `tests/e2e/fixtures/session.ts` espone `{ page, session, admin,
seedNode }`: `page` è già loggato, `session` porta `orgId`/`projectId`/`canvasId`/`userId`,
`admin` è un client service-role per scrivere una precondizione (un nodo, un asset) prima che il
browser apra la pagina, `seedNode` è la scorciatoia per un nodo canvas.

## What is covered

| Target | Assertion style |
| --- | --- |
| `/changelog` | 200 + entry list has items (entries are in-code) |
| `/login` | 200 + form wiring (`action="?/login"`, named inputs, OAuth forms) |
| unknown route | 404 status + error-page card echoes the code |
| `/app`, `/app/[brand]` unauthenticated | 303 → `/login` via HTTP headers |
| `/robots.txt`, `/sitemap.xml` | 200 + stable document markers |

## What is deliberately excluded

- **Any `/app/[brand]` page content** and the API under `/api/v1/**`: those read Postgres
  (brands, posts, plans…). Testing them needs a seeded database or a mocked Supabase — that
  is integration/domain territory (see the durability scenarios in `scripts/eval/`), not a
  clone-and-run smoke tier. There is no db-free `/health` endpoint to assert either.
- **Real authentication**: the redirect tests stop at the destination URL; nothing logs in.
- **Copy assertions**: headings are i18n'd. Structure only.

## Running

```bash
npm run test:e2e                 # starts its own dev server on :4173
E2E_BASE_URL=http://host:port npx playwright test   # against an already-running instance

# @real: needs PUBLIC_SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY of a real project (.env), and a
# dev server that was started with those (not the placeholder env test:e2e starts on its own) —
# point E2E_BASE_URL at it, e.g. your own `npm run dev` on :5173:
E2E_REAL_STACK=1 E2E_BASE_URL=http://localhost:5173 npx playwright test canvas.spec.ts settings-brand.spec.ts onboarding.real.spec.ts
```

In CI (`.github/workflows/ci.yml`) retries are 1 with trace on first retry; locally 0 so
flakiness surfaces immediately.
