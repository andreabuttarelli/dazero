# Il turno della chat di brand arriva alla fine del lavoro

`MAX_STEPS = 12` era il default della prima versione della chat in sidebar, scritto nello stesso
commit che l'ha introdotta (`48088a7b`). Non è una soglia misurata: è quanto basta a rispondere a
una domanda, e non a fare un lavoro.

La differenza la fa come l'agente scrive. I tool che ha sono `query`, `insert_row` e `update_row`,
e **`insert_row` scrive UNA riga per chiamata**: disporre dieci post su una tela sono dieci passi,
dopo l'analisi, le letture e le scritture che quei post li hanno prodotti. A 12 il turno finiva a
metà dell'opera, e per il modello non c'era modo di dirlo — la risposta si interrompeva e basta.

Ora sono 80, e questa è la parte meno interessante.

## Il limite che morde davvero è il tempo, e prima non c'era

Alzare i passi senza toccare altro avrebbe spostato il difetto, non risolto: la rotta gira con
`maxDuration: 300`, e un turno che usa davvero 80 passi quei 300 secondi li supera. Superarli non
è un turno che finisce — è una risposta troncata a metà frase, **senza `onFinish`**, quindi senza
il turno salvato in `chat_messages` e senza la riga in `ai_calls`. Il lavoro è stato pagato e non
risulta da nessuna parte.

Così lo stop è doppio: passi esauriti **oppure** deadline a 270s. Il margine di 30 secondi è per
quello che succede dopo l'ultimo passo — chiudere l'MCP, salvare il turno, scrivere il costo.
È lo stesso schema che `seo-agent.ts` e `strategy-agent.ts` usano già, e riusa la loro
`deadlineReached` invece di scriverne una seconda.

## Perché un modulo invece di due costanti nel `+server.ts`

Dov'erano prima non erano verificabili: per controllare che il margine ci fosse bisognava montare
la rotta. In `limits.ts` il test dice tre cose che prima nessuno poteva affermare — che i passi
bastano per una tela, che la deadline sta **sotto** `maxDuration`, e che lo stop scatta davvero su
entrambe le condizioni.

Il numero di scaglione (300) vive lì accanto proprio perché il test possa confrontarli: se un
domani si sale a 800, il margine che non fosse stato aggiornato lo dice un test rosso, non un
turno perso in produzione.

## Quello che non è stato fatto

Non si è salito di scaglione. 800 secondi emettono una funzione serverless in più, ed è una
decisione di costo che vuole dati: se i turni cominceranno a chiudere sistematicamente sulla
deadline invece che sui passi, allora la domanda diventa sensata. Oggi non c'è nessuna misura che
la ponga.
