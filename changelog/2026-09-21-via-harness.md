# Via l'harness, e il pacchetto che gli stava dietro

`npm install` falliva: le patch di `@ai-sdk/harness` e `@ai-sdk/harness-pi` erano state scritte
per 1.0.87 e 1.0.89, e le versioni installate erano 1.0.117 e 1.0.119. Rigenerarle avrebbe
rimesso in piedi qualcosa che nessuno chiamava.

## Era già morto dal 4 settembre

L'harness serviva alla chat, rimossa in `3d1ad402`. Da allora `startHarnessTurn` aveva un solo
riferimento fuori da sé: una frase in un commento. `createHarnessRuntime`, nessuno. Il commento
in testa ad `adapters.ts` diceva ancora «chi chiama: craft-model.ts, via `harnessSdkModel`» —
falso: `craft-model.ts` importa `$lib/server/llm` direttamente, e quella riga era rimasta a
descrivere una dipendenza già invertita.

I test invece c'erano, sei file: provavano un codice che nessun percorso di produzione
raggiungeva. Sono andati via con lui — un test verde su codice morto è peggio di nessun test,
perché sembra copertura.

Resta `@ai-sdk/harness` come transitiva dei due sandbox, che sono vivi: `createVercelSandboxProvider`
lo usa la rotta `sweep`. `adapters.ts` da 505 righe passa a 78, e conserva le tre fabbriche che
qualcuno chiama davvero.

## Il difetto che la rimozione ha scoperto

Il workbench ha cominciato a rispondere 500, e non per il canvas: `@modelcontextprotocol/sdk`
**non era dichiarato in nessun `package.json` dell'app**. Arrivava come dipendenza transitiva
dell'harness, e `mcp-client.ts` — la chat di brand, scritta ieri — se lo ritrovava lì per caso.
Tolto l'harness, l'import non risolveva più e il build moriva con
«Rollup failed to resolve import».

Era una bomba a orologeria indipendente da questo lavoro: sarebbe esplosa al primo aggiornamento
che avesse spostato quella transitiva. Ora è una dipendenza dichiarata, dove la usa chi la usa.

Lezione, e vale oltre questo caso: **un import che funziona non prova che il pacchetto sia tuo.**
Finché qualcun altro lo tira dentro, funziona; il giorno che smette, non è un avviso — è un
build rotto.
