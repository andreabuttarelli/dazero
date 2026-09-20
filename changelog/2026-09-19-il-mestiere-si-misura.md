# Il mestiere si misura: i controlli binari sulle immagini rese

Il craft fotografico è entrato nei prompt ieri, e fino a qui nessuno sapeva dire se servisse a
qualcosa. Una regola nel prompt che nessuno verifica è una regola che il modello ignora — è già
successo col ricettario delle transizioni del motion, ed è il motivo per cui ogni skill di
`default-skills.ts` deve dichiarare il suo `gate`.

`photo-craft-review.ts` è quel gate, per la parte del mestiere che si può vedere.

## Sei domande che si rispondono guardando

Non «l'immagine è bella»: quello un modello lo risponde a caso, e un giudizio a caso è peggio di
nessun giudizio. Sei fatti, ognuno presente o assente nel fotogramma:

| id | cosa cerca |
|---|---|
| `contact-shadow` | la cucitura scura dove l'oggetto tocca il piano — la sua assenza è perché un prodotto sembra incollato |
| `no-lighting-gear` | softbox, stativi, pannelli entrati in scena perché il prompt li ha nominati |
| `product-state` | un prodotto aperto, stappato, smontato che nessuno aveva chiesto di aprire |
| `no-unasked-text` | parole inventate, prezzi, watermark, lettere storte |
| `material-texture` | la patina uniforme al posto di trama, grana, pori |
| `shadow-direction` | ombre che puntano in direzioni incompatibili |

Ognuno corrisponde a una promessa che `PHOTO_CRAFT_SPECS` fa al modello. Una regola del craft senza
il suo controllo qui è una riga che paghiamo a ogni render senza sapere se viene applicata: un test
verifica che i quattro difetti principali abbiano il loro id.

## NON è un cancello, ed è la differenza che conta

`reviewImageConstraints` **rifiuta** un render: un logo inventato su una maglietta è una violazione,
e l'immagine non si spedisce. Qui no. Un'ombra di contatto assente è un'immagine peggiore, non una
da buttare, e un cancello che scarta su un giudizio estetico brucia crediti veri su un parere.

Per questo il verdetto **non ha un `pass`**: non esiste un campo da cui far dipendere un rifiuto, e
un test lo fissa (`expect(verdict).not.toHaveProperty('pass')`). Chi un giorno volesse farne un
cancello deve cambiare il tipo, e vedrà il test rosso prima.

## Un giro non eseguito non è verde

Se il gateway cade, il verdetto esce con `checked: 0` e `unrun` valorizzato, e la riga stampata lo
**dichiara** invece di sembrare un pieno di successi. È la regola degli eval — un report che
confonde «nessun difetto» con «non ho guardato» è peggio di nessun report — applicata al singolo
render.

Stessa logica contro un modello che inventa: gli id fuori elenco vengono scartati prima del conto.
Un conteggio che si muove da solo non misura più niente.

## Dove finisce: la sonda creativa

`eval:creative` mostrava le immagini e lasciava decidere all'occhio, quindi «prima e dopo» era
un'impressione. Ora ogni slide resa passa dal giudice e il giro scrive `04-mestiere.md`: quanti
render ha guardato, quali controlli sono caduti e su quanti, una riga per file.

Questo è ciò che rende confrontabile un cambio ai prompt: due giri, due tabelle, e la domanda
«è peggiorato?» ha una risposta invece di un parere.

## Provato che discrimina, non solo che risponde

Un giudice che dice sempre «passa» è indistinguibile da uno che non guarda, ed è il modo normale in
cui un controllo estetico muore. Quindi due giri veri, stessa pipeline:

| input | verdetto |
|---|---|
| un barattolo di miele chiuso su lino, luce da sinistra | `6/6 passati` |
| lo stesso, con un brief che ORDINA il tappo tolto, il barattolo sospeso senza ombra, un softbox e uno stativo in campo, e la scritta «PURE HONEY 2026» | `5 su 6 caduti` |

E i cinque caduti sono esattamente quelli ordinati: `contact-shadow`, `no-lighting-gear`,
`product-state`, `no-unasked-text`, `shadow-direction`. Il sesto — `material-texture` — è passato, e
il brief non gli chiedeva niente.

## Tre difetti trovati mentre la si ricollegava

La sonda non girava più da un pezzo, e moriva prima di arrivare al modello:

- `proposeRubrics(null as never, BRAND, …)` — la firma ha **due** parametri, non tre.
- `planStrategy(null as never, BRAND, …)` e `executePlan(null as never, BRAND, …)` — stessa cosa.

Tutte e tre hanno perso il parametro `ai` in `80666f7e` («Drop the dead ai parameter from every
signature»), e la sonda è rimasta indietro: `TypeError: Cannot read properties of undefined` al
primo passo. Non è una svista isolata — è il prezzo di uno script che nessun test copre e che nessuno
lancia perché costa. Il `null as never` era già il segnale: un cast che spegne il compilatore su una
firma è un difetto in attesa di data.

Corrette tutte e tre. La sonda ora arriva al modello.

## Quello che questo commit NON fa

Non dice ancora se il craft migliora le immagini: per quello servono due giri veri, prima e dopo, e
costano. Il giudice è lo strumento, non la misura.

E i controlli valgono solo per le immagini. Il video non ha nemmeno il seam: `buildVideoPrompt` non
riceve il modello, quindi lì va costruito prima. Sta nel piano
(`docs/research/2026-09-19-craft-e-canvas.md`).
