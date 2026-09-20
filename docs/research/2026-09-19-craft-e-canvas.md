# Craft di superCMO e canvas editabile — cosa costruire, in che ordine

Due domande arrivate insieme: portare dentro le funzionalità di
[superCMO-skills](https://github.com/SupercmoHQ/superCMO-skills) (Apache-2.0) per alzare la qualità
di video, immagini, UGC e strategia; e dei canvas a scroll infinito dove vedere e far editare
all'AI memoria, branding, post e media.

Sono due lavori separati. Il craft si misura, il canvas si guarda: non condividono né il rischio né
l'ordine. Questo documento li tiene distinti e dice, per ognuno, cosa esiste già — che è molto più
di quanto sembrava all'inizio — e cosa manca davvero.

---

## Parte 0 — Le tre cose che cambiano il piano

Prima di qualunque stima, tre fatti verificati nel repo. Ognuno sposta il lavoro da "costruire" a
"ricollegare", e il secondo è un difetto attivo in produzione.

### 0.1 Il craft fotografico esiste già, e non arriva ai renderer

`src/lib/agent-docs/how/WRITE-IMAGE-PROMPTS.md` (121 righe) e `WRITE-VIDEO-PROMPTS.md` (125 righe)
sono guide di mestiere serie. La prima è condensata da un repo Apache-2.0, la seconda dalla guida
Seedance 2.5 di Higgsfield — il modello che il prodotto usa di più. Dicono le stesse cose di
superCMO: terminologia fotografica invece di aggettivi, la luce nominata, la texture chiesta
esplicitamente («waxy skin is what you get when nobody asks»), il *vibe* come lista di oggetti.

E hanno quattro regole che superCMO non ha, ognuna un difetto già pagato qui: mai chiedere testo
leggibile, mai dichiarare un aspect ratio, mai descrivere fisicamente una persona con foto
allegate, rispettare il medium del brand.

**Ma quelle guide vanno solo agli agenti di chat** (`IMAGE_MINTERS = content, motion, ugc`), via
`AGENT_FILES` in `src/lib/server/chat/agent-files.ts:143`. Il chokepoint da cui passa **ogni**
immagine del prodotto — `buildImageRequest`, `src/lib/server/content-preview/images.ts:229` — non
le vede mai. Verificato per grep: nessun modulo sotto `media-generator/`, `content-preview/`,
`ugc.ts`, `video.ts` o `motion-video/` importa le skill.

Il craft che un renderer riceve oggi è `HOUSE_LOOK` (`images.ts:114`): due righe.

> Il buco non è il mestiere. È il cavo fra il mestiere e chi disegna.

### 0.2 Il pavimento del craft è caduto, in silenzio, su quattro percorsi

`craftFloor` è il parametro che inietta craft nel prompt immagine (`images.ts:157`, spliccato a
`:229`). È alimentato da `designWallDigestSection()`, che legge un digest con scadenza a 30 giorni
(`DIGEST_MAX_AGE_DAYS = 30`, `src/lib/server/wall-digest.ts:44`).

Il wall pubblico è spento dal 29/08/2026 e i digest non si rigenerano più: **nel repo non esiste
più nessuna funzione che li scriva** — solo `readWallDigest` legge. Alla data di questo documento
il digest sul bucket è quindi scaduto o assente, e in entrambi i casi `wallDigestSection` torna
`''`: **`craftFloor` è stringa vuota.** Lo stesso vale per
`trendingWallDigestSection()`, che alimenta tre consumatori: `motion-video/agent.ts:697`,
`ugc-plan-agent.ts:301`, `ugc-batch.ts:477`.

Quattro percorsi di generazione hanno perso il loro pavimento e nessun test è diventato rosso —
perché non fallisce niente, le immagini diventano solo un po' peggiori. È esattamente il difetto
che il commento a `images.ts:358` diceva di voler evitare quando `renderWithQC` è stato tolto.

C'è un secondo buco, più piccolo, nello stesso punto: `renderPostImage` non applica mai un default
a `craftFloor`. Solo `renderBrandImage` e `renderCarouselSlide` lo fanno. Quindi il media-generator
(`agent.ts:493`) e i quattro render di `ugc-batch.ts` passano `undefined` e non hanno pavimento
**nemmeno quando il digest è fresco**.

### 0.3 Il canvas: la scrittura AI è risolta, il realtime no

Tutte le tabelle che un canvas toccherebbe — `posts`, `brand_media`, `brand_documents`,
`brand_memory`, `brand_kit`, `graphic_designs`, `chat_artifacts`, `brand_knowledge_edges` — sono
già in `QUERY_TABLES` e scrivibili da `insert_row` / `update_row`
(`src/routes/api/v1/brands/[slug]/rows/+server.ts`). Tutte con lo stesso gate,
`brand_id in (select auth_brand_ids())`.

Quel percorso ha invarianti forti, dichiarate in `src/lib/server/chat/write-tool.ts:1-36`: chiave
anon più JWT dell'utente, quindi **è Postgres a valutare le RLS** — un agente non può scrivere dove
la persona non potrebbe. Il service-role è rifiutato. Il delete è inesprimibile, non vietato.

«Le AI possono editare» non è da costruire.

**Ma il realtime non copre i contenuti.** Verificato per grep: zero `postgres_changes` in tutto il
repo, nessuna tabella nella publication `supabase_realtime`. Il canale brand è broadcast e presence
soltanto. «L'agente modifica un post e la tua tile si aggiorna» oggi non ha nessun canale.

---

## Parte 1 — Craft: cosa prendere da superCMO

### 1.1 Il metro, che il repo ha già stabilito

`src/lib/server/default-skills.ts:58-73` racconta come è stato valutato un repo esterno di skill:
107 skill lette, **2 tenute**, riscritte da zero con le proporzioni del prodotto e un gate in
codice. E la regola che ne è uscita, che vale identica qui:

> Una conoscenza vale solo se ha il suo controllo in codice. Ogni skill dichiara in `gate` il check
> che rifiuta l'imitazione.

Una regola nel prompt che nessuno verifica è una regola che il modello ignora — «è già successo col
ricettario delle transizioni del motion».

### 1.2 Cosa vale, misurato

L'inventario completo (23 skill, ~5.500 righe di Markdown) dice: **~700 righe di valore quasi
incondizionato**, ~600 da portare con tagli, ~1.400 di duplicazione e impalcatura da non toccare.

L'entanglement col loro tooling Python è **basso**: il craft vive in `references/*.md`, che si
staccano puliti; i `SKILL.md` vogliono la coda (`### Step N: Generate`, `## Edge cases`) amputata.

**Tier 1 — il nucleo:**

| File | Righe | Perché |
|---|---:|---|
| `references/photographic-craft.md` | 145 | Luce, ombra, materiale, ottica come *decisioni*, non aggettivi. Densità più alta del repo. |
| `references/ad-craft.md` | 123 | Direzione artistica di un'inserzione statica: focal point, reading path, test in scala di grigi, filtri di scarto. |
| `writing-video-scripts/SKILL.md` | 111 | Zero riferimenti a tool, verificato. Budget parole-al-secondo, 8 pattern di hook, regole del parlato. |
| `references/commercial-craft.md` | 107 | Product-identity lock, screen-lock, packshot. |
| `references/clip-craft.md` | 181 | Disciplina dei tagli, movimenti nominati, «le tre cose che il modello fa». |
| 6 × `prompt-*.md` (video) | 273 | Sostanza per-modello reale: sovrapposizione fra due file qualsiasi è 1-6 righe, tutte intestazioni. |
| `references/look-and-style.md` | 109 | Cosa riporta un disegno verso la fotografia. |

**Le regole singole più forti** — quelle che nominano un difetto e la sua cura, l'unica forma che
sopravvive a un porting:

- «**Chiedi l'ombra di contatto per nome** — la cucitura scura dove l'oggetto tocca ciò su cui
  poggia. Nessun modello la aggiunge da solo, e la sua assenza è il motivo più comune per cui un
  prodotto sembra incollato sopra.»
- «**Niente di ciò che fa la luce sta nell'inquadratura.** Un softbox scritto in un prompt è un
  oggetto, e viene disegnato lì in piedi.»
- «Una sorgente abbastanza grande da lusingare la pelle le toglie i pori: chiedi la texture
  visibile accanto.»
- «**Nulla può essere scritto come assente.** Una cosa nominata è una cosa disegnata.»
- «Descrivi un terzo lavoro — tieni una cosa, usane una seconda, indica la terza — e compare una
  terza mano.»
- «Non riservare spazio vuoto per un testo che nessuno ha chiesto: una regione chiesta come vuota
  torna come un blocco senza texture.»

**Per-modello: la vera gemma, e la più deperibile.** Il confronto col nostro è netto. La nostra
guida Seedance copre forma e ordine; quella di superCMO aggiunge il **catalogo dei modi di
fallire**, che da noi non c'è (verificato: zero occorrenze di riflessi, gemelli, watermark):

- i riflessi piatti (specchi, vetro, acqua ferma) tornano come duplicati rotti — l'acqua in
  movimento no;
- più di quattro persone di riferimento produce «gemelli»;
- un headshot più una figura intera, mai un foglio multi-vista, che legge come persone diverse;
- aggiunge sottotitoli, loghi e watermark da solo: vanno vietati esplicitamente;
- l'instabilità viene dall'affettare troppo una clip, non dal dichiarare quando parte ogni stacco.

Né `image-models.ts` né `video-models.ts` portano oggi una riga di guida di prompt: solo fatti di
trasporto (campi, aspect, durate, `maxPromptChars`). È lì che una guida per-modello va agganciata.

**La trappola:** i 10 `mode-*.md` dei product photo sembrano 738 righe e sono ~310 — **40% è
duplicazione verbatim**. Vanno deduplicati *prima* di portarli, in una tabella più dieci strofe
corte.

**Da non portare:** tutto `scripts/supercmo_skills/` (Python: client provider, server MCP, job —
hai già tutto in TypeScript, e Composio per i connettori), i due `pulling-*-ads.md` (349 righe,
runbook API duplicati fra loro), `supercmo-setup`, `onboarding-user`, e i 23 `evals/eval_cases.json`
(sono test di routing per keyword, non giudizi di qualità).

### 1.3 Licenza

Apache-2.0 con un NOTICE che ha contenuto sostanziale. Il §4 richiede: testo della licenza,
copyright (`Copyright (c) 2026 Kshitiz Kumar`), **propagazione della prima strofa del NOTICE**, e
una nota nei file modificati che dica che sono stati modificati. La strofa sui font Inter non si
applica se non porti i font.

Costo reale: un `NOTICE`, un `LICENSE`, una riga «modificato da». Non è un ostacolo. Vale la pena
ricordare il precedente del repo: per le due skill di design prese da `designer-skills` (MIT) non
servì un NOTICE perché furono *riscritte*, non copiate — «è ispirazione, non derivazione». Se il
testo si riscrive con i nostri numeri, vale lo stesso qui; se si copia, il NOTICE è dovuto.

---

## Parte 2 — Craft: il piano, in ordine

L'ordine non è negoziabile su un punto: **prima il modo di misurare, poi il testo.** Cambiare i
prompt di craft è precisamente il caso che il CLAUDE.md nomina («prima di un merge che tocca la
catena della chat, i prompt, i tool o il modello»), e senza un giudizio «sembra meglio» non è una
barra.

### Passo 1 — Riaccendere il pavimento (indipendente da superCMO)

Il difetto di §0.2 va chiuso a prescindere. È un bug, non una feature.

1. Un test che fallisce: con digest scaduto, `buildImageRequest` non contiene nessun pavimento di
   craft. Oggi passa in silenzio.
2. Il craft statico diventa il pavimento vero: una costante di prodotto che non scade, con il
   digest ambientale (quando c'è) *sopra*, non al posto suo. Il digest descrive «cosa funziona in
   questo momento»; il craft descrive come si fa una fotografia — non ha motivo di scadere.
3. `renderPostImage` applica il default, così i cinque chiamanti che oggi passano `undefined` lo
   ricevono.

Il test da imitare esiste già: `content-preview/craft-floor.test.ts` verifica **contenuto e
ordinamento** del pavimento, e che il soggetto resti primo. È il modello esatto.

### Passo 2 — Il giudizio, prima del testo

`reviewImageConstraints` (`src/lib/server/image-constraint-review.ts`) è già un giudice
multimodale con verdetto `{pass, issues}` e judge iniettabile. Oggi guarda una cosa sola: il
branding sull'abbigliamento.

Va esteso con i controlli **binari** del craft — quelli che sono fatti, non gusti:

- l'ombra di contatto c'è?
- compare attrezzatura d'illuminazione (softbox, stativo, pannello) in scena?
- lo stato del prodotto è cambiato (tappo tolto, scatola aperta) senza che il brief lo chiedesse?
- compare testo leggibile non richiesto?

E la sonda `eval:creative` — che **esiste** (`scripts/eval/creative.ts`), contrariamente a quanto
dice il CLAUDE.md, ma oggi *mostra* le immagini senza *giudicarle* — diventa il posto dove misurare
prima/dopo, riusando la forma `Fact[] {id, ok, detail}` di `eval:durability`.

> Regola: un controllo che non può fallire è peso morto. Se nessuno dei quattro fallisce sulle
> immagini di oggi, sono scritti male — non sono immagini perfette.

### Passo 3 — Il craft fotografico, un dominio solo

Solo ora il testo. Un dominio: **product photo**, perché è dove il buco è più largo (motion ha 135
righe di craft, le grafiche 66, la fotografia zero) e dove superCMO è più forte.

`photographic-craft.md` riscritto nella forma di casa — quella di `GRAPHIC_CRAFT_SPECS`
(`src/lib/design/graphic-craft.ts`): client-safe, numeri espliciti, e ogni regola che dichiara se è
controllata o no. Più 2-3 `mode-*.md` deduplicati.

Si misura col Passo 2. Se non migliora, le altre 2.900 righe restano fuori e hai speso un giorno.

### Passo 4 — Il cavo che manca: dal craft al renderer

Il gap di §0.1. `buildImageRequest` calcola già il modello a `images.ts:181-188`, **sopra** la
composizione del prompt a `:229`: una ricerca `craftFor(model)` lì dentro è un cambiamento di due
righe con l'id già in mano.

Sul video il seam non esiste: `buildVideoPrompt` (`video.ts:455`) non riceve mai il modello. Il
chiamante a `:919` ce l'ha in scope, quindi si passa di lì — non a valle in `buildJobInput`, che è
trasporto.

### Passo 5 — Le guide per-modello

Una riga in più in `image-models.ts` / `video-models.ts`: il craft per modello accanto al modello,
che è l'unico posto dove non diverge. È la regola del CLAUDE.md contro le condizioni sparse
applicata a un dominio dove oggi non è applicata — un modello nuovo è un file nuovo, non un `if` in
più.

Da portare per primi i tre che **non** hai: Kling, Seedream, gpt-image-2. Per Seedance hai già la
forma: serve solo il catalogo dei fallimenti.

E una nota che va scritta accanto: **queste guide invecchiano coi modelli.** Vanno datate, con il
modello a cui si riferiscono nel titolo, come già fa la nostra guida Seedance.

### Passo 5b — `enhance_prompt`: riscrivere il brief per il modello scelto — FATTO

Implementato il 19/09. Due note su ciò che il piano non aveva previsto: il controllo
anti-invenzione è finito su una **quota** invece che su un tetto di parole, perché un tetto secco
boccia i brief corti e un elenco di parole ammesse funziona in una lingua sola; e il tetto del
`tools/list` è stato tolto invece che alzato — era a 52 caratteri dal limite, quindi non separava
più una capacità nuova da una superficie fuori controllo.


I Passi 4 e 5 hanno messo il craft **accanto** al prompt: `buildImageRequest` e `buildVideoPrompt`
attaccano le note del modello al brief che ricevono. Ma il brief resta com'era scritto, e le note
sono istruzioni che il modello deve applicare da solo mentre disegna.

Questo passo fa l'altra metà: prende `(prompt, model)` e restituisce **il prompt riscritto** già
nella forma che quel modello vuole. Non un suggerimento da seguire — un testo da mandare.

La differenza è misurabile e va misurata: per GPT Image significa spezzare il brief in segmenti
etichettati su righe separate; per Nano Banana significa fonderlo in un paragrafo di frasi
connesse; per Seedream, se c'è un edit, trasformare la descrizione del risultato in un comando. Le
stesse tre regole che oggi *chiediamo* al modello di applicare.

**Dove vive.** `POST /api/v1/brands/:slug/prompts/enhance`, e senza slug la variante `/prompts/enhance`
per il brief che non appartiene a un brand — la stessa doppia forma di `generate_image`, che ha già
risolto quel problema. Contratto in `packages/api-contracts/`, così esce su CLI, MCP e WebMCP
insieme: è la ragione per cui quel registro esiste.

**Input**: `prompt`, `model` (uno del registro immagini o video — non un id libero), opzionali
`kind: 'image' | 'video'`, `shot_mode`, e `brand_style` per decidere se il look del brand entra.
**Output**: `{ prompt, model, changed: boolean, notes: string[] }` — il testo riscritto, e in
`notes` cosa è stato cambiato e perché. Un enhancer che riscrive senza dire cosa ha toccato è una
scatola nera su un testo che l'utente aveva scritto lui.

**Il gate.** Spende AI, quindi `gateAiAction` come ogni altro: piano a pagamento più crediti.
È una chiamata testuale sola, quindi costa poco, ma costa.

**Quattro vincoli che decidono se è utile o dannoso:**

1. **Non inventa soggetti.** Riscrive la forma, non il contenuto: se il brief dice «un barattolo di
   miele», il risultato parla di quel barattolo. Un enhancer che aggiunge un cane sul tavolo ha
   fatto un altro lavoro. È la cosa da testare per prima, perché è il modo in cui questi strumenti
   falliscono di solito.
2. **Non tocca le regole non negoziabili.** Le quattro di `WRITE-IMAGE-PROMPTS.md` — niente testo
   leggibile, niente aspect ratio, nessuna descrizione fisica di una persona con foto allegate, il
   medium del brand — valgono sul risultato, e vanno verificate DOPO la riscrittura, non sperate
   prima.
3. **Un modello sconosciuto torna il prompt invariato con `changed: false`**, mai un rifiuto e mai
   una riscrittura generica: è la stessa regola di `imageCraftFor`, che su un id che non conosce
   restituisce `''` invece di inventare.
4. **È idempotente abbastanza.** Ripassare un prompt già riscritto per lo stesso modello non deve
   gonfiarlo a ogni giro. Un test con due passaggi che confronta la lunghezza.

**Come si misura.** Il giudice del Passo 2 guarda l'immagine resa, quindi il confronto è già
disponibile: stesso brief, stesso modello, con e senza enhance, e si contano i controlli caduti. È
l'unico modo per sapere se serve — «il prompt sembra migliore» non è una barra, e un enhancer che
allunga il testo senza cambiare il risultato è costo puro.

**Da dove viene il testo del sistema.** Da `image-craft.ts` e `video-craft.ts`, che il Passo 5 ha
già scritto: l'enhancer non ha un secondo posto dove tenere le regole per modello, o quelle due
copie divergono al primo modello nuovo. Il registro è la fonte, l'enhancer un suo consumatore.

### Passo 6 — UGC — FATTO

Implementato il 19/09. Una nota su ciò che il piano aveva sbagliato: avevo previsto di scrivere
anche gli archi narrativi (claim → test → verdetto), ma `$lib/ugc-formats` li ha già, con le
battute in percentuale e `failsWhen` per ciascuna delle otto forme — meglio di come li avrei
scritti. Il craft si è limitato alla RESA, che non esisteva; un test verifica che non nomini
nessun id di formato, perché due registri degli stessi archi divergerebbero al primo formato nuovo.


`ugc-craft.ts` ha l'architettura giusta (agente pro per la resa, brief deterministico come rete,
RULE verbatim) e un'istruzione generica: *«riscrivilo come farebbe un vero regista»*. È un
segnaposto per il mestiere.

Il materiale UGC di superCMO è il più forte del repo su una cosa sola, la dottrina
dell'autenticità: «Chi guarda dà per scontato che al creator sia stato pagato per dirlo. Lodare il
prodotto più forte li convince solo di più. Quel che guadagna fiducia è la sensazione che il
creator l'avrebbe detto anche se il prodotto fosse stato brutto.»

Più le regole di resa che nominano un difetto: dai a ogni battuta un momento con la bocca chiusa
mentre le mani lavorano, perché il labiale è la cosa più debole che il modello rende; alza di un
gradino ogni performance, perché il modello la restituisce più piatta di come è scritta.

---

## Parte 3 — Canvas: cosa c'è e cosa manca

### 3.1 Dove sta il costo

| Pezzo | Costo | Nota |
|---|:--:|---|
| Scrittura AI sugli oggetti | **fatto** | `insert_row`/`update_row`, RLS valutate da Postgres |
| RLS per brand | **fatto** | `auth_brand_ids()` identico su tutte le tabelle |
| Board senza librerie | **precedente** | `media/+page.svelte` è già masonry in CSS `columns` |
| Tile dei post | **riusabile** | `SocialPostMockup.svelte` (397 righe) gestisce già i caroselli |
| Presence | **fatto** | `PresenceStack` + `presence-peers.ts` |
| Pan / zoom / culling | S-M | **greenfield**: nessuna infrastruttura esistente |
| Tabella posizioni + RLS | S | più la rigenerazione di `write-rules.ts` e `query-tables.ts` |
| Push realtime sui contenuti | **L** | il pezzo grosso: non esiste |
| Concorrenza | **L** | last-write-wins ovunque |

### 3.2 Il realtime, e la strada giusta

Due opzioni:

- `postgres_changes` sulle tabelle: sembra più automatico, ma apre la publication, chiede policy
  realtime per tabella e lega lo schema al trasporto.
- **Un broadcast in più sul canale che già esiste**: una variante in `BrandBroadcast`
  (`src/lib/server/realtime.ts:19-47`) più un listener, seguendo il pattern quintuplo già presente
  in `brand-channel.svelte.ts:113-161`. Il server emette dopo la scrittura, come fa
  `persistence.ts:957` per la chat. Niente publication, schema intatto.

La seconda. E con una disciplina che il canale già impone e che il canvas eredita: **il broadcast
porta transizioni, non stato.** Alla riconnessione bisogna re-idratare, come fa `#hydrateRuns()`.
Un canvas che si fida solo del broadcast mostra dati vecchi dopo ogni disconnessione — e le
disconnessioni sono la norma, non l'eccezione.

### 3.3 La concorrenza è il rischio vero

Nessun ETag, nessun `If-Match`, nessun `expected_updated_at` in tutto il repo. Ovunque
last-write-wins.

E c'è un precedente esplicito: la migrazione `0224_posts_updated_at.sql` ha aggiunto
`posts.updated_at` **con un trigger**, e la sua intestazione dice perché:

> nessun guard «leggi prima di scrivere» poteva dire se una riga era cambiata… una patch
> sovrascriveva in silenzio il lavoro di chi nel frattempo aveva modificato il post (persona sul
> browser, altro agente, autopilot).

La colonna c'è, il trigger c'è, **e nessun codice la usa come precondizione.** `edit_post` non ha
un campo versione.

Un canvas moltiplica quello scenario: più persone, più agenti, stessi oggetti, tutti visibili
insieme. E si chiude a poco: `update_row` accetta già un `where`, quindi `updated_at eq <ts>` è
esprimibile oggi, e `updateRow` torna `{matched, updated}` — zero righe aggiornate *è* il
conflitto, basta leggerlo.

### 3.4 Due vincoli che tagliano lo scope

**`chat_artifacts` resta fuori dal primo taglio.** La sua RLS è più stretta di tutte le altre
(`user_id = auth.uid()`) e **non esiste una policy di update**: gli artefatti sono per-persona e
immutabili. Un canvas condiviso non può mostrarli ai colleghi né renderli editabili senza una
migrazione che cambia un modello deliberato. In più: nessun componente li renderizza oggi.

**`graphic_designs` è invece il posto giusto per l'editing.** Un grafico lì non è un file di pixel
ma una *spec* — `{aspect, theme, blocks[]}` — versionata in append-only, con `media_url` per
mostrarla senza ri-renderizzare. È l'unico punto del prodotto dove «l'agente e la persona editano
la stessa cosa» è già sostenuto dal modello dati, e dove un edit è «cambia il titolo» invece di
«ricomponi tutto».

### 3.5 Dove vive, e il conto delle superfici

`app/[brand]/` ha già **60 voci**. Una 61ª rotta chiamata «canvas» che mostra gli stessi media di
`media`, `library`, `studio`, `media-generator`, `media-refs` e `design-lab` aggiunge confusione,
non chiarezza.

Il repo ha già stabilito il principio giusto altrove, in `share/[token]/+page.svelte:15`:

> Il workspace è la somma delle altre viste, non una vista in più.

Quindi: il canvas come **vista del `workbench`**, non come destinazione nuova. Quattro tipi di nodo
(post, media, documento/memoria, graphic design), sola lettura più spostamento nel primo taglio,
editing solo su `graphic_designs`.

La domanda che vale più di tutta la stima resta questa: **il canvas sostituisce qualcosa, o si
affianca?** Se sostituisce, il costo si ripaga. Se si affianca, paghi manutenzione doppia su due
viste degli stessi oggetti — e la paghi per sempre.

---

## Parte 4 — L'ordine complessivo

**Craft, in sequenza:**

1. Riaccendere il pavimento (§Passo 1) — *è un bug, vale da solo*
2. I controlli binari nel giudice + la sonda che li misura (§Passo 2)
3. Il craft fotografico su un dominio, misurato prima/dopo (§Passo 3)
4. Il cavo craft → renderer, immagine e video (§Passo 4)
5. Le guide per-modello (§Passo 5)
6. UGC (§Passo 6)

**Canvas, in sequenza:**

1. La precondizione `updated_at` + il test che riproduce la sovrascrittura silenziosa — *serve
   comunque, canvas o no*
2. Tabella delle posizioni + RLS, con rigenerazione di `write-rules.ts` e `query-tables.ts`
3. Pan/zoom + culling, CSS transform, nessuna libreria
4. Le tile, riusando i componenti che esistono
5. Il broadcast + la re-idratazione alla riconnessione
6. L'editing su `graphic_designs`, come nuova versione, mai come update

I due primi passi di ciascuna lista (pavimento caduto, sovrascrittura silenziosa) sono difetti
attivi: valgono indipendentemente dal fatto che il resto si faccia.

---

## Avvertenze

**Le migrazioni non vengono applicate dai deploy.** Tre file lo dichiarano (`0137:18`, `0203:25`,
`0108:21`). `node scripts/schema-drift-check.mjs` oggi dà verde sui nomi ma elenca 15 CHECK
allargati da verificare a mano. Prima di costruire sul trigger di `0224` o sulle policy di `0226`,
vanno confermati in produzione.

**Il CLAUDE.md è disallineato su un punto.** Dice che solo `eval:durability` esiste e nomina
`eval:creative` fra le cose che non esistono. `scripts/eval/creative.ts` c'è, è in `package.json`,
e gira il percorso vero (rubriche → piano → post → render). Va corretto — un documento che dice
«questo comando non esiste» su un comando che esiste costa una diagnosi sbagliata.

Aggiunta del 19/09: la sonda era anche **rotta**, e da un pezzo. Tre chiamate —
`proposeRubrics`, `planStrategy`, `executePlan` — passavano un `null as never` in testa, il
parametro `ai` rimosso da `80666f7e`. Moriva al primo passo con un `TypeError`. Corretta. È la
prova del costo di uno script che nessun test copre e che nessuno lancia perché costa: il
`null as never` era già il segnale, un cast che spegne il compilatore su una firma è un difetto
con una data di scadenza.

**Per farla girare in locale servono due cose che l'ambiente non dà.** `.env` contiene
`LLM_API_KEY=<la STESSA chiave che usi per OPENROUTER_API_KEY>` — il testo dell'istruzione, non
una chiave: da lì un 401 che sembra un difetto del codice. E vite-node non carica `.env` da solo,
serve `node --env-file=.env`. Infine il modello di default configurato (`z-ai/glm-5.3-flash`)
fallisce lo stream sullo schema delle rubriche (`server_error`), quindi la sonda intera non
arriva in fondo con quella configurazione — il giudice del mestiere sì, provato su un render
vero.

**Due file citati in giro non esistono:** `src/lib/motion-video/chain.ts` e
`media-generator/ugc-orchestrator.ts` (esistono solo i rispettivi `.test.ts`; l'orchestratore vero
è `ugc-agent.ts`). E `IMAGE_PROMPT_GUIDE` è nominato in un commento a `agent-files.ts:141` ma non
è definito da nessuna parte: commento scaduto, del tipo che il CLAUDE.md dice di non lasciare in
giro.

**Flux non esiste** in nessuno dei due registri di modelli, nonostante le 21 occorrenze del nome
nel repo. Le guide Flux di superCMO non servono finché non c'è il modello.
