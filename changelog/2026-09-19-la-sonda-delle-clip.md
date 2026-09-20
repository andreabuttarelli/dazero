# La sonda delle clip: il craft UGC smette di essere una promessa

Il giudice delle clip esisteva e non guardava niente: nessuna sonda rendeva video. `eval:clip` è
quella sonda — rende clip vere sul percorso vero e le fa guardare.

```bash
npm run eval:clip
npm run eval:clip -- --clips=3 --model=bytedance/seedance-2-5
```

## Il percorso vero, non una scorciatoia

Il brief deterministico passa dall'agente di resa (`craftUgcShotBrief`) PRIMA del render, come in
produzione. Misurare il brief di template misurerebbe la rete di sicurezza, non il prodotto — e la
rete è precisamente ciò che il craft esiste per non dover usare.

Poi `renderVideo`, lo stesso che chiama `ugc-batch`. Poi `reviewClipAt` sull'URL che ne esce.

## Tre scene scelte per far cadere i controlli

Non scene qualunque: ognuna mette il modello davanti a ciò che rende peggio.

- **mani-occupate** — una moka in cucina: due mani già impegnate, dove compare la terza.
- **oggetto-fermo** — una lampada sulla scrivania: un oggetto che deve restare dov'è, dove si vede
  il teletrasporto.
- **parlato-lungo** — una battuta di quattordici parole, dove il labiale sbava se non tiene.

Il criterio è quello del CLAUDE.md: uno scenario che non può fallire è peso morto.

## Una clip di default, perché costa

Una clip è la cosa più cara che il prodotto compri, e questa sonda ne compra di vere. Il default è
UNA; `--clips=N` ne chiede di più e ognuna è un addebito. Non gira in CI, non gira su ogni commit:
gira prima di un merge che tocca il craft UGC, il prompt video o il modello.

## Il brand usa e getta, e lo Storage che la cascata non prende

`createFixture` / `destroyFixture` sono quelli di `eval:durability`, con il teardown nel `finally`
che regge anche quando lo scenario muore a metà.

Ma le clip stanno sotto `media/<userId>/generated/`, **indicizzate sull'utente**: la cascata sul
brand non se le porta via, e senza una pulizia esplicita ogni giro lascerebbe i suoi mp4 a terra per
sempre. È lo stesso inciampo che il CLAUDE.md già segnala per le immagini.

## Il primo giro: la sonda ha funzionato, la clip no

Tre giri, e nessuno ha prodotto una clip da guardare. Ma la sonda ha fatto esattamente il suo
mestiere: ha detto **«non ho guardato»** invece di stampare una tabella vuota che sembra verde.

La diagnosi, un passo alla volta:

1. Il primo giro diceva solo «la clip non è stata resa». Difetto **della sonda**: il `.catch`
   inghiottiva l'errore. Una sonda che nasconde il motivo costa quanto una che non gira.
2. Il secondo diceva «il render non ha restituito una url», e non bastava: `renderVideo` torna
   `undefined` e il motivo lo scrive in `ai_calls` — che il teardown porta via in cascata. Ora si
   legge **prima** di distruggere il brand, la stessa trappola che il CLAUDE.md segnala per il
   costo.
3. `ai_calls` era vuoto, quindi il fallimento era a monte del log. Chiamando il provider a mano:
   `HTTP 200`, task creato, e `state: "waiting"` — **la coda del provider è satura**, e il polling
   scade dopo dieci minuti.

Quindi il codice è giusto e la clip sta solo aspettando. Il messaggio ora lo dice: «il provider non
ha reso la clip entro il timeout (coda satura, non un difetto del brief)», distinto da un render
davvero fallito. Scriverli uguali farebbe sembrare rotto ciò che sta soltanto in fila.

## Una clip non resa non è verde

Se il render fallisce, la riga esce con `unrun` e il motivo, nel report e a schermo. Un rapporto che
confonde «nessun difetto» con «non ho guardato» è peggio di nessun rapporto — e su una sonda che
costa soldi è anche il modo più caro di illudersi.

## Il CLAUDE.md diceva una cosa non più vera

Diceva che `eval:durability` è «l'unico comando reale». Ne esistono tre: `durability` (il lavoro non
sparisce), `creative` (le immagini, giudicate sul mestiere dal 19/09) e ora `clip` (la resa dei
video). Corretto, con le tre domande che ciascuno risponde.

E aggiunta la lezione che questa sessione ha pagato: **stare in `package.json` non è la prova che
funzioni.** `eval:creative` era rotto da settimane — tre chiamate passavano ancora un argomento che
quelle firme non prendono più, e moriva al primo passo. Niente era rosso, perché nessun test copre
uno script e nessuno lo lanciava: costa. Una sonda che nessuno fa girare marcisce esattamente come
il prodotto che doveva sorvegliare.
