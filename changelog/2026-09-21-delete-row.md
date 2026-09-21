# `delete_row`: togliere una riga, con un tetto più basso di tutti

Mancava il terzo verbo. Con `query`, `insert_row` e `update_row` l'agente può leggere, creare e
correggere qualunque tabella dell'allowlist — ma non togliere: una riga sbagliata restava lì per
sempre, o serviva un tool dedicato per ogni tabella, che è esattamente ciò che i tre generici
esistono per evitare.

## Il tetto è 10, non 50

`UPDATE_MAX_ROWS` è 50. Questo è 10, e l'asimmetria è il punto: un update sbagliato si riscrive —
se si sa cosa c'era prima — mentre una riga cancellata non torna, e nessun tetto la riporta
indietro. Dieci è quanto serve a ripulire una lista riempita male, e troppo poco perché un filtro
largo scritto per distrazione svuoti qualcosa che contava.

## Il rifiuto è INTERO

PostgREST non sa mettere un `LIMIT` su una `DELETE`. Togliere «le prime dieci» di un filtro che ne
prende venti lascerebbe dieci righe vive scelte da un ordine che nessuno ha chiesto — e nessuno
saprebbe quali. Si conta prima, e oltre il tetto non si tocca niente.

Il conteggio serve anche a distinguere «zero righe» da «fatto»: una delete che non trova niente
risponde comunque 200.

## L'invariante che è stata rovesciata, non aggirata

`write-tool.test.ts` conteneva un test dal nome esplicito: *«una cancellazione non è rifiutata: è
inesprimibile»*, che verificava l'assenza della stringa `.delete(` nel modulo. Era una decisione
vera, presa quando i tool di scrittura sono nati, e la si rovescia di proposito: senza una
cancellazione l'agente crea e corregge ma non toglie.

Al posto dell'impossibilità ci sono tre cose che rendono il danno limitato: il tetto più basso, il
filtro obbligatorio e il rifiuto intero. Il test non è stato cancellato ma riscritto — `.rpc(` e
`.upsert(` restano fuori, per una ragione diversa: il primo esegue codice del database, il secondo
sostituisce di nascosto una riga che esiste, cioè un update che nessuno ha chiesto.

## Dove vive

`DELETE /api/v1/brands/:slug/rows`, accanto a POST (insert) e PUT (update): il verbo HTTP è quello
dell'operazione, e il registro ne ricava `destructive` per tool — false sull'inserimento, true
sugli altri due, così il client lo sa PRIMA della chiamata.
