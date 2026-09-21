# La skill e i test dicono la verità sui dieci tool ritirati

`7eaf00e7` ha tolto dieci tool dal registro e ha lasciato dietro di sé tredici test
rossi e una documentazione che continuava a nominarli. Qui i test tornano verdi
dicendo la premessa nuova, non zittendola, e la skill smette di mandare un agente
su un nome che non esiste più.

## I test riscritti, e cosa era cambiato sotto

- `cli/skills/tools-coverage.test.ts` — `approve_posts` era nell'elenco dei tool
  registrati a mano con il suo motivo; non è più registrato, quindi la riga esce.
  Le tre soglie minime (71/7/71) misuravano una superficie che si è ristretta di
  dieci: scendono a 60/6/60. Restano il guardiano contro un estrattore che smette
  di estrarre, che è il loro unico mestiere.
- `cli/mcp/migrated-writes.test.ts` — `discard_plan` e `add_competitor` erano due
  delle dieci forme catturate prima della migrazione al registry. Non sono più
  tool: la forma da difendere è solo quella dei tool che un client vede ancora.
- `cli/mcp/studio-writes.test.ts` — `RETIRED` conteneva i quattro CRUD assorbiti
  da `insert_row`/`update_row`; ora ne contiene sette, con i tre di questo giro.
  Il test sulle annotazioni distruttive perdeva il suo soggetto (`delete_product`)
  e lo ritrova su `delete_person` e su `delete_row`, che è il più pericoloso dei
  quattro generici e il solo che non era coperto.
- `cli/mcp/read-tools.test.ts` — `get_ads` stava fra le nove letture che RESTANO
  perché non sono select. È uscito dal registro con le altre nove, quindi passa
  fra le ritirate: era l'unione di `ad_campaigns` e `ad_metrics` con un verdetto
  sopra, e il verdetto lo dà `ads_action`, che resta.
- `cli/mcp/tool-calls.test.ts` — chiamava `approve_posts` come
  tool-che-prende-uno-slug-e-fallisce-senza-bearer. Serviva solo per quello, e
  `propose_plan` lo è uguale.

## Tre difetti veri, non premesse vecchie

I primi due sono la stessa cosa in due posti: **un nome ritirato dentro un testo
che viaggia nel prompt di ogni turno**. Il modello lo legge come esistente per
l'intera sessione e scopre che non c'è solo chiamandolo, a metà di qualcosa.

1. `MCP_INSTRUCTIONS` (`cli/mcp/server.ts`) elencava `get_ads` fra le «eight other
   reads», e le istruzioni arrivano al client PRIMA di `tools/list`.
2. Tre descrizioni del registro mandavano a un tool ritirato: `ads_action` diceva
   «Read get_ads first», `approve_plan` rimandava a `discard_plan`,
   `research_competitors` a `add_competitor`.

Entrambi sono ora tenuti da un test — `non nominano una lettura che non esiste
più` in `read-tools.test.ts`, e `nessuna descrizione manda a uno dei dieci tool
ritirati` in `packages/api-contracts/src/index.test.ts`. Il secondo è volutamente
stretto ai dieci nomi invece di estrarre ogni cosa che somiglia a un tool: le
descrizioni citano anche colonne e rotte, e un estrattore che le confonde fallisce
su tutto tranne che sul difetto. La versione larga, provata e scartata, segnalava
sedici endpoint su ventotto nomi, quasi tutti falsi.

3. **Non corretto, riferito**: `src/routes/api/v1/.../settings/radar/sources/+server.ts`
   e `.../settings/blog/terms/remove/+server.ts` importano `ADD_RADAR_SOURCE`,
   `REMOVE_RADAR_SOURCE` e `REMOVE_BLOG_TERM` da `@anomalia/api-contracts`, che
   non li ha mai riesportati dal barrel. `svelte-check` lo dice da prima di
   `7eaf00e7` (verificato su `HEAD~1`): è un difetto preesistente e fuori da
   questo lavoro.

## La documentazione

`cli/skills/anomalia/references/tools.md` e `SKILL.md`. La copia sotto
`cli/plugins/` è generata da `cli/scripts/sync-plugin-skill.sh` e non si modifica
a mano.

Il criterio: **un nome ritirato non si cancella, si redirige**. Chi cercava
`add_competitor` deve trovare cosa usare adesso, non un buco. Quindi la sezione
«Writing a row» porta una lista in prosa dei dieci con la tabella accanto a
ognuno, e ogni sezione di dominio — Studio, Radar, Blog, Piani, Memoria — dice la
strada nuova al posto in cui prima nominava il tool.

La lista è in prosa e non in tabella per una ragione meccanica: `tools-coverage`
legge i nomi dei tool dalla **prima cella** di ogni riga di tabella, quindi un
nome ritirato là dentro fa fallire il test che quella documentazione deve
soddisfare. Una tabella «prima → adesso» si contraddiceva da sola.

Sopravvivono le regole che erano attaccate ai ritirati:

- la normalizzazione che `add_radar_source` faceva (subreddit senza `r/`, `rss`
  con lo schema) ora la deve fare chi chiama, ed è scritto;
- il conteggio `articles_affected` che `remove_blog_term` restituiva non esiste
  più: la skill dice di leggerlo con `query` PRIMA della cancellazione;
- l'identità di una sorgente Radar è la coppia `(kind, value)`, quindi il `where`
  del `delete_row` ne porta due.

La regola «Do NOT call `list_brands` to find a slug» resta valida in tutti e tre i
punti in cui compare: `list_brands` non è stato ritirato. Nessun'altra regola
simile era attaccata a un tool sparito.

`delete_row` non era documentato affatto, benché esista da `31c06796`. Ora c'è, con
le tre cose che si pagano se non si sanno: `where` obbligatoria e non vuota, tetto
di **10 righe per chiamata**, e rifiuto INTERO quando il filtro ne prende di più —
contate prima che qualcosa se ne vada, così niente resta cancellato a metà.
