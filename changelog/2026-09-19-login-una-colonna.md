# Il login perde il pannello di destra

La pagina `/login` era una griglia `1fr 1fr`: a sinistra il form, a destra un `aside.auth-showcase`
— gradiente, due glow in `::before`/`::after`, e un finto thread di chat con quattro servizi presi
da `login.showcase.*`. Sotto gli 880px quel pannello era già `display: none`: il mobile vedeva solo
il form.

Ora non lo vede nessuno. Tolto il markup, tolte le sue regole (pannello, glow, `.sc-mark`,
`.chat-*`), tolto l'import di `BrandMark` che serviva solo lì.

## Una colonna, non una colonna vuota

`.split` resta ma diventa `display: flex` con `.form-pane { flex: 1 }`: il form si prende la
larghezza intera e resta centrato da `.pane`, senza una seconda colonna che occupa metà schermo
per niente. La media query a 880px sopravvive solo per il centraggio del testo, che era l'unica
parte non legata al pannello.

## Le stringhe restano

`login.showcase.*` non è stato rimosso dai locale file: vive in cinque lingue e toglierlo tocca
file che altri stanno modificando. Una chiave non referenziata non costa nulla a runtime; il
prossimo giro di pulizia dei locali se la prende.
