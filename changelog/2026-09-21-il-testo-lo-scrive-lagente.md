# Il testo lo scrive l'agente, non un modello dentro il tool

Sette tool uscivano dal registro MCP con un modello loro che scriveva testo destinato a una
persona: `generate_article`, `optimize_article`, `propose_plan`, `revise_plan`, `plan_week`,
`replan_week`, `generate_captions`.

Chi li chiamava era già un agente che scrive, con davanti la conversazione e le skill del brand
(`humanizer`, `stop-slop`). Chiamarne uno pagava il ragionamento DUE volte — una per decidere di
chiamarlo, una dentro — e il secondo modello non aveva visto niente di quella conversazione.
Scriveva peggio, e costava.

## Cosa è uscito e cosa lo riceve

| ritirato | chi riceve il testo scritto fuori |
|---|---|
| `generate_article` | `create_article` (nuovo) + `update_article` |
| `optimize_article` | `update_article` |
| `propose_plan` | `save_plan` |
| `revise_plan` | `save_plan` (salvare di nuovo sostituisce la proposta pendente) |
| `plan_week` | `save_week_seeds` |
| `replan_week` | `save_week_seeds` (salvare di nuovo sostituisce il draft in review) |
| `generate_captions` | `create_post` per un post nuovo, `edit_post` per la copy di uno che c'è |

Restano 65 tool: 59 dal registro, 1 famiglia, 5 registrati a mano.

## Il buco che l'ipotesi non vedeva: `create_article`

La tabella di partenza diceva `generate_article → update_article`. È falso a metà.
`update_article` chiede un `id`: copre la RISCRITTURA, non la NASCITA, che era l'altra metà di
`generate_article`.

E `insert_row` non la copre. `brand_articles` ha **una sola policy RLS, `for select`**
(`0061_blog_articles.sql`): un insert con la sessione dell'utente viene rifiutato da Postgres.
È la stessa ragione per cui `publish_article` sopravvive ai generici, già scritta in
`KEPT_ON_PURPOSE`.

Quindi `create_article` è nuovo: contratto, rotta `POST /web/article/create`, e
`createArticle` accanto a `updateArticle`, che ne riusa i controlli su categoria, autore e tag.
Scrive col client admin per la stessa ragione di `publish_article`.

### Lo slug si decide alla nascita

Il blog pubblico risolve un articolo con `.maybeSingle()` su `slug`. Due righe con lo stesso slug
non se ne nascondono una: le rendono irraggiungibili **entrambe**. Nessun indice unico lo vieta
in database — `generateAndStore` slugifica e ignora le collisioni, e finora è andata bene perché
il modello variava i titoli.

Un agente esterno che deposita "Guida al caffè" due volte no. Il suffisso si decide quindi in
`articleSlug`, dove gli slug già presi sono noti, con quattro casi a fissarlo.

## Cosa NON è cambiato — il vincolo che contava

L'autopilot gira su ogni brand con un piano editoriale attivo (10 paganti, 33 trial) e non ha un
interruttore. Non è stato toccato niente di suo:

- `scheduler.ts`, i cron `/api/v1/autopilot/*`: zero diff.
- Le sette rotte REST esistono e funzionano, solo non sono più tool. Sono dichiarate in
  `REST_ONLY` di `registry.test.ts`, col motivo accanto.
- `proposeFirstPlan`, `planWeekStrategy`, `generateArticleFromTopic`, `caption-writer`: intatte.
- I contratti restano esportati dal barrel. `c0435fa0` ha pagato questa lezione un'ora prima:
  togliere l'export rompe le rotte con errori di TIPO, invisibili a chi esegue e confondibili coi
  trecento preesistenti. I sette sono nell'elenco di `retired-exports.test.ts`.

## Su `enhance_prompt`: resta

Produce testo, ma non per una persona: per un modello di immagini. La forma che ciascun modello
vuole — sezioni etichettate, paragrafo unico, comando quando edita — sta in una guida per modello
che vive qui, e un agente esterno non sa con quale modello stai per rendere né come vuole essere
parlato. Rifiuta di suo le riscritture che inventano un soggetto o dichiarano un'aspect ratio, e
in quel caso torna l'originale con `changed: false`: non è una seconda stesura del brief, è un
adattatore.

## Cosa è stato aggiustato di riflesso

- `produce_week` diceva «Call plan_week first»: ora nomina `save_week_seeds`.
- `tool-calls.test.ts` usava `propose_plan` come tool-che-prende-uno-slug. È il secondo nome che
  gli cade sotto (prima `approve_posts`), quindi ora usa `approve_plan`, che non genera niente.
- `migrated-writes.test.ts`: tolte le due righe di `propose_plan` e `revise_plan`.
- La skill e il suo mirror nel plugin, risincronizzati con `sync-plugin-skill.sh`.

## Quello che non ho verificato

`registry.test.ts > o le descrive un contratto, o si dichiarano` resta rosso su dieci rotte —
`agent/`, `memory/used`, `studio/competitors`, `settings/radar/sources`… Sono del giro di ritiri
precedente (`7eaf00e7`), non di questo: dichiarando le mie sette l'elenco passa da diciassette a
dieci. Non le ho toccate perché quel lavoro è in volo su un altro agente e la lista è una sola.
