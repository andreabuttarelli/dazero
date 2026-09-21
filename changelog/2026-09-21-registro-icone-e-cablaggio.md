# Un nome e un'icona per tipo, e la verifica degli archi che finalmente morde

## Il registro

I nomi stavano già in `ADDABLE_LABEL`; le icone no — vivevano dentro `CanvasAddBar`, in un
`const ICON` locale. Le superfici che le mostrano però sono tre: la barra in basso, il menù del
doppio clic e la targhetta sul nodo. Le altre due avrebbero dovuto riscriverle, e due elenchi a
mano divergono al primo cambio — in silenzio, e solo su una delle superfici: un globo in fondo
allo schermo e un quadrato sul nodo, per la stessa cosa.

`ADDABLE_ICON` sta in un file suo e non accanto ai nomi per una ragione precisa: quelle sono
icone di Lucide, cioè COMPONENTI, e `addable.ts` lo importano anche moduli che girano sul server.
Tirarsi dentro quattro componenti Svelte per leggere un elenco di stringhe significherebbe pagarli
ovunque, anche dove non si disegna niente.

La targhetta sul nodo è **sempre** visibile, a differenza delle proprietà: da lontano, con lo zoom
stretto, è l'unica cosa che dice cosa sia un riquadro quando il contenuto è vuoto o è una miniatura
illeggibile. L'etichetta del medium è sparita dall'overlay, dove ormai ripeteva la targhetta.

## La verifica degli archi non mordeva

Questo è il difetto che conta. `canConnect` e `verdictBetween` erano scritti e coperti da test —
24 verdi — ma rispondono su un `CanvasNode`, e **le tile del workbench non ne portavano nessuno**.
La regola, giustamente, non rifiuta quel che non conosce: il risultato era una verifica verde in
un file e nessun arco rifiutato nel prodotto.

Stessa forma per altre due: il verso si salvava sempre `derives_from` — una derivazione scritta
anche fra due cose che non si derivano, cioè un dato falso che nessuno aveva chiesto — e il
pannello dell'arco non si apriva perché i due callback non erano passati.

Tre difetti di CABLAGGIO, non di logica. Nessun test sul modello poteva vederli, e infatti nessuno
li ha visti: `workbench-wiring.test.ts` guarda la pagina e li prende. L'ho visto fallire su tutti
e tre, e il primo tentativo era troppo debole — cercava UNA occorrenza di `tileNode`, che il ramo
delle pagine incorporate soddisfaceva da solo. Ne pretende due: una verifica che morde a metà è il
caso peggiore, perché sembra funzionare finché non si collega proprio l'altra.
