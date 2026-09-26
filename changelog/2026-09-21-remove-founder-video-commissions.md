# Le commissioni video ai founder escono dal prodotto

Era un servizio **a mano** dentro un prodotto software: l'utente apriva "Crea contenuto", sceglieva
il tipo `team`, scriveva un brief con fino a tre immagini di riferimento, e la richiesta finiva in
una coda che un founder svuotava girando e montando la clip a mano, per poi consegnarla nel brand
come post da approvare. La tela infinita non ha un posto dove metterlo: un tool dove l'utente e
l'agente generano quando decidono loro non può avere un pulsante che mette in fila una persona.

## Perché ora, e non una scelta a metà

La metà di *fulfilment* — `src/routes/admin/`, cioè `/admin/videos` che leggeva la coda e
consegnava — era già uscita. Da sola era la configurazione peggiore possibile: la metà utente
restava viva e **accettava richieste in una coda che nessuno poteva più leggere**. Un cliente Pro
poteva spendere una delle sue due commissioni del mese su un brief che non sarebbe arrivato a
nessuno, e il prodotto gli rispondeva «la richiesta è arrivata, la troverai qui fra i contenuti».
Questa metà è il resto.

## Cosa è uscito

- `src/routes/app/[brand]/content/request-video/+server.ts` — l'endpoint che depositava la
  commissione e caricava le immagini di riferimento nel bucket `media`.
- `src/lib/server/video-requests.ts` — intero. `founderVideoBudget`, `createVideoRequest` e
  `listVideoRequests` servivano solo questa funzionalità: nessun altro chiamante, verificato con
  grep prima di cancellare invece di spogliare il file.
- `founderVideoQuota` / `FOUNDER_VIDEO_QUOTAS` da `src/lib/server/plans.ts` — il gate per piano
  (`pro: 2`, tutti gli altri zero) che non gatea più niente. **`videoCap()` non si tocca**: è il
  guardrail interno delle clip AI, un'altra cosa con un nome simile.
- Il tipo `'team'` da `CreateContentModal.svelte`: il ramo che postava su `request-video`, la prop
  `founderVideos` ({ remaining, quota }), il badge con la quota residua, il titolo di
  "Available from the Pro plan", la nota esplicativa e i due stili che solo loro usavano.
- Il caricamento nel `+page.server.ts` del calendario e il flash `'team'` nella pagina.
- Otto chiavi i18n del blocco `app.content.single` e l'intero blocco `app.content.videoRequests`,
  che era **già orfano**: il pannello che lo leggeva era uscito col resto e nessuna `$_()` lo
  chiamava più.

## Cosa NON è uscito, e perché va detto

**La generazione video AI resta intera.** `src/remotion/`, `src/lib/motion-video/`, il tipo
`video` del modale e `create-single` sono un'altra funzionalità: si chiamavano entrambe "video" e
sono due cose diverse. Le altre tre modalità del modale — upload, foto, carosello — passano tutte
da `create-single` e non hanno mai toccato questo codice.

`onDone` ha perso il campo `kind`, che aveva due valori di cui uno era `'team'`: con un valore
solo non è un dato, è rumore che il chiamante deve ancora disambiguare.

## La tabella si marca, non si cancella

`20260921230000_deprecate_video_requests.sql` mette un `COMMENT ON TABLE`, al contrario di
`drop_waitlist` e `drop_autopilot` che invece droppano. La differenza non è stilistica: lì lo
stato era una scrittura che il cron si faceva addosso fra un giro e l'altro, qui le righe sono
**richieste di clienti paganti** e le clip che ne sono uscite. È storico commerciale, e
`reference_urls` punta a oggetti nel bucket `media` che la cascata su `brands` non tocca: droppare
la tabella li lascerebbe orfani senza nemmeno l'elenco per ritrovarli.

Il commento non entra in `deprecated-tables.test.ts`: quel test legge due file di migrazione
specifici e tiene l'elenco delle tabelle marcate *da quelli*. Aggiungere una terza migrazione con
la stessa forma non lo rompe, e includerla vorrebbe dire allargare quel test mentre tre agenti
stanno potando la suite.

## `admins` / `is_admin()`: restano, ma sono senza chiamanti

Verificato, perché la domanda era esplicita. In `src/` **zero** riferimenti: `/admin` girava sul
client service-role, che salta la RLS, quindi non usava `is_admin()` nemmeno lui. In SQL i
chiamanti erano due, e nessuno dei due è più in piedi:

- `can_enter()` in `0009_app_flags.sql`, che `20260921220000_drop_waitlist.sql` ha già droppato;
- le policy di `video_requests`, che in realtà **non** lo usano (usano `auth_brand_ids()`) — il
  commento in testa a `0050` lo nomina solo per descrivere il fulfilment.

Quindi restano in piedi senza un chiamante, ma non sono roba di questa funzionalità: chi li
ritira lo faccia in una migrazione sua, dove la prova sta insieme alla decisione.
