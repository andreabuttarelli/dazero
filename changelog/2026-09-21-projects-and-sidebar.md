# La dashboard dei progetti e la sidebar che regge il lavoro

## Perché

Tre cose si sono viste usando il prodotto, e hanno cambiato la navigazione insieme.

L'ingresso atterrava dentro una tela per inerzia. Ma un progetto è un insieme di tele con le
sue pagine, e scegliere *con cosa* lavorare è un gesto suo, non un passaggio da saltare.

La sidebar di `/app/[brand]` era la buona — e mancava del tutto sulla tela, che si apriva a
tutto schermo senza nulla attorno. Due pezzi di quella barra restavano spenti sul progetto
nuovo perché chiedevano un brand: il segmented control (Chat · Pagine · Media) e il tasto
Upgrade. Sono domande della shell e del piano, non del brand.

La chat si rifiutava di aprirsi senza un brand (`Apri un progetto con un brand per chattare.`).
Sbagliato per il prodotto nuovo: `projects.brand_id` è nullable di proposito — si apre una
tela per esplorare, e solo quando il materiale diventa qualcosa da pubblicare si decide per chi.

## Cosa

**Navigazione**

```
/                     dashboard dei progetti
/p/<projectId>/       progetto → la prima tela
/p/<projectId>/c/<id> una tela
/p/<projectId>/…      pagine del progetto (materials, calendar, ads, settings…)
```

`/app/[brand]/*` decade come indirizzo: il tenant nell'URL è il **progetto**, il brand è una
*proprietà* del progetto. 16 alberi di pagine spostati da `routes/app/[brand]/X` a
`routes/p/[projectId]/X`, `params.brand` risolto dal progetto via `brandSlugOf`.

**Sidebar** — `DashboardSidebar` di `/app/[brand]`, montata com'è su `/p/[projectId]`:

- **Tele** sopra, **Pagine** sotto: due regioni, non una lista piatta. Le righe delle tele sono
  *oggetti* (cornice + un segno in coda), le pagine hanno l'icona nuda — una tela è una
  bacheca che si apre, non una pagina.
- `SPACE_ICONS[i]` (mappatura posizionale delle icone) sostituito da una mappa per token:
  inserire una riga nell'inventario spostava tutte le icone successive, in silenzio.
- Rail di accento a 2px sulla riga attiva + wash. Densità riga 28px, gap 4px. La lista Tele
  scrolla (`max-h-56`) così 12 tele e 9 pagine non spingono fuori il footer.
- **Segmented control e Upgrade**: `DashboardSidebar` li chiudeva con `{#if brandSlug}`. Tolto
  — `showUpgrade` è una domanda sul piano, il selettore è una domanda della shell.

**Media** — scaffale a 2 colonne, tile 1:1 con anteprima vera (video: primo fotogramma + play),
skeleton a 6 tile in caricamento, `Nessun media, per ora.` quando è vuoto, retry silenzioso
in errore. Scroll interno: 40 asset non spingono fuori il footer.

**Chat** — bolle utente/assistente, i tool come timeline (`create post · fatto`) invece che
JSON, autoscroll che **non strappa** la vista se chi legge è tornato su. Composer che cresce,
Enter invia / Shift+Enter a capo, `Interrompi` mentre scrive. E soprattutto: **non chiede un
brand**. Lavora sul progetto; quando il progetto ha un brand, quegli strumenti entrano.

**Google Ads** via dalla nav e dall'inventario pinnato.

## Scartato

**Dare un brand fittizio al progetto** perché la chat e il segmented si accendessero: avrebbe
finto che esista qualcosa da pubblicare, e ogni tool di brand avrebbe fallito in modo credibile.

**Una mappatura icone per posizione** l'ho lasciata stare dopo averla vista rompersi: una riga
inserita nell'inventario spostava ogni icona dopo di essa e nessun test lo vedeva.

## Verifica

`workbench-paths.test.ts` 7/7 (l'inventario resta inchiodato, e il pin si aggiorna con la
stessa modifica — è la sua ragione d'essere). Media shelf e chat panel verificati nel browser
su un progetto senza brand: la chat si apre, il media shelf mostra gli stati giusti.

## Da fare quando il gruppo chiude

- Il **media shelf** e la **chat** parlano ancora con `/api/v1/brands/:slug/agent` finché
  l'endpoint di progetto non atterra (un agente lo sta costruendo). C'è un adattatore unico
  (`brand-agent/chat-endpoint.ts`) da rovesciare quando arriva.
- `gen-run-wiring.test.ts` è rosso per il lavoro in corso sullo stato dei run — non di questo
  gruppo.
