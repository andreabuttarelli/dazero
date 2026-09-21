# Via il cancello della beta chiusa

`/waitlist` era già uscita con il sito marketing. Quello che era rimasto erano dodici
`throw redirect(303, '/waitlist')` che puntavano a una rotta inesistente: non un residuo estetico
ma un 404 vivo su login, callback OAuth, consenso MCP e ingresso nell'app — il modo più silenzioso
di chiudere fuori chi paga.

Ripuntare i redirect avrebbe conservato il meccanismo. È il meccanismo a non servire più: il
prodotto non si entra dopo una call, quindi il cancello esce tutto.

## Cosa esce

`canEnter(supabase)` e `userCanEnter(userId)` da `src/lib/server/access.ts`. Il file resta con i
suoi due export vivi — `flagEnabled` e `ownsBrand` — e la distinzione è quella che conta:
`ownsBrand` risponde *di chi è questo brand*, ed è un confine di sicurezza; `canEnter` rispondeva
*questa persona può entrare*, ed era una porta commerciale. Trenta chiamate a `canEnter` spegnevano
rotte con un 403 o un redirect; nessuna di quelle rotte perde una verifica di proprietà, perché non
ne faceva una.

In `cli-auth.ts` la guardia stava in `authenticate`, una volta per CLI e MCP. Tolta quella,
`authenticate` è rimasta un passaggio diretto a `resolveCaller`.

## Cosa esce con lui, perché esisteva solo per lui

- `/admin/users`: la pagina aveva due sole azioni, approva e revoca. Senza cancello non approva
  niente, e nessuna pagina ci linkava.
- Il sollecito a chi aspettava (`nudgePending` nel tick, `pendingToNudge`, i tre template
  `pendingEmail*` e le loro stringhe). Leggeva `closed_beta` e scriveva alla coda: due cose che non
  esistono più.
- `waitlistActive`, che oltre a chiudere l'app riscriveva i titoli del login e il CTA della hero.
- Le sette chiavi i18n che restavano solo per quelle varianti.

## Cosa resta in piedi di proposito

**L'autenticazione.** Ogni file toccato faceva vero lavoro di auth attorno alla riga del cancello:
sign-in, sign-up, reset password, scambio del codice OAuth, ripresa di `/oauth/authorize`, PKCE,
consegna alla CLI. È uscita la riga, non il resto.

**`profiles.approved_at`.** La colonna sopravvive perché `accept_brand_invite` ci scrive ancora:
toglierla romperebbe l'accettazione di un invito, che col cancello non c'entra. Nessuno la legge
più per decidere chi passa.

## Il database

`20260921220000_drop_waitlist.sql`, un `drop` e non un `COMMENT ON TABLE`. La regola di
`20260921180000` — marcare invece di cancellare — vale per una tabella il cui scrittore ha perso i
chiamanti ma potrebbe riaverli. Qui la funzionalità è rimossa, non sospesa: non resta un lettore,
un writer o una rotta da ripristinare. L'ordine dei drop va dall'esterno verso l'interno
(`can_enter` → `is_approved` → `is_user_approved`), o il drop di quella interna trascina le altre
in cascata o fallisce per dipendenza.

I deploy qui non eseguono le migration: va applicata a mano.

## I test

`access.test.ts` misurava solo il cancello ed esce. I tre casi in `cli-auth.test.ts` che
verificavano il 403 diventano due che verificano quello che conta adesso: un JWT valido passa,
un'assenza di `Authorization` si prende un 401. In `no-cross-tenant-writes.test.ts` `canEnter`
compariva come *fixture negativa* — l'esempio di un controllo che non è una verifica di proprietà.
L'esempio vale ancora, la funzione no: sostituita con un controllo di sessione, che dice la stessa
cosa senza nominare una funzione che non esiste.
