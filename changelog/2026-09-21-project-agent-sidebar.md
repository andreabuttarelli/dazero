# La chat di sidebar è agnostica al brand

La chat della sidebar nasceva agganciata al brand: `POST /api/v1/brands/:slug/agent` e ogni tool
era un tool di brand. Il prodotto nuovo è un **progetto** con tele e nodi, e `projects.brand_id` è
nullable — si apre una tela per esplorare, e solo quando il materiale diventa qualcosa da
pubblicare si decide per chi. Una chat che senza brand non si apriva è la forma vecchia del
problema.

## Cosa è stato costruito

**`POST|GET /api/v1/projects/:projectId/agent`** (più `GET …/agent/assets`). Stessa forma di
stream della vecchia rotta (`toUIMessageStreamResponse`), stesso body `{ message }`, stessa
risposta di history `{ threadId, messages }`. Il tenant passa da `findProjectForUser`: la query
cammina le membership con `org_id`, non si fida della RLS su un id arrivato dall'URL.

**Tool di progetto/tela, sempre presenti:** `list_canvases`, `list_nodes`, `create_node`,
`update_node` (versionato — zero righe è `{ outcome: 'conflict' }`, mai un successo silenzioso),
`move_node`, `connect_nodes`, `delete_node`, `list_assets`, `run_node`, `list_runs`. Mappati 1:1
sui repository nuovi (`repos/canvas`, `repos/assets`, `repos/node-runs`, `canvas/generate`).
Ogni scrittura è firmata `{ actor_kind: 'agent', actor_id: <la persona>, agent_key: 'sidebar' }`.

**Tool di brand, solo se `project.brand_id` è settato:** il percorso MCP remoto esistente
(`openBrandMcp`). Senza brand **non compaiono** — un tool che promette e fallisce riempie il
turno di rifiuti; meglio assente. Il prompt dice lo scope (progetto, tele, brand o «no brand —
publishing tools are not available») e **non** dice che serve un brand.

## Decisioni

- **La vecchia rotta di brand resta.** `ChatPanel`/`AssetsPanel` la usano ancora finché l'agent UI
  non finisce il rewrite su `projectId`. Niente ripuntamento forzato: due superfici per poco, poi
  la vecchia si toglie con i suoi caller.
- **Thread e messaggi sullo schema nuovo** (`chat_threads` / `chat_messages` con `org_id`, `seq`,
  `actor_*`), in `repos/chat.ts` — così `tenancy.test.ts` li vede. La copia di brand
  (`brand-agent/thread.ts` e `turns.ts`) resta sullo shape vecchio per la vecchia rotta.
- **`runGenNode` accetta `actor`.** Prima marchiava `actorKind: 'user'` e basta: un agente che
  generava risultava un click umano. Assente = comportamento di prima, così la pagina del canvas
  (di un altro agent) non cambia.
- **`logAiCall` porta `actor_kind` / `actor_id` / `agent_key` / `project_id`, e `orgId` esplicito
  batte lo scope**: il turno di progetto deve poter atterrare in `ai_calls` con l'org anche quando
  c'è un brand (lo schema nuovo ha `org_id not null`).
- **Cancello crediti:** brand se c'è (`gateAiAction`), org se non c'è (`gateOrgAiAction`). La spesa
  di `run_node` segue la stessa regola (`withBrandContext` / `withOrgContext`).

## Test

- `project-agent/tool-surface.test.ts` — senza brand i tool di brand sono ASSENTI; con un brand
  ci sono, e non tolgono quelli di progetto.
- `project-agent/project-tools.test.ts` — `update_node` conflitto vs scritto; `create_node` e
  `run_node` firmano `actor_kind: 'agent'` + `actor_id`; ogni write porta `org_id`.
- `repos/chat.test.ts` — thread e messaggi scopati su `org_id`; insert con actor.
- `repos/tenancy.test.ts` esteso a scansionare `project-agent/`.
