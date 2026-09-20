# Il pavimento del craft non è mai vuoto

Il percorso immagine aveva un posto apparecchiato per il mestiere — `craftFloor`, con la sua
posizione già decisa nel prompt, dopo il soggetto e prima dello stile del brand — e da qualche
settimana ci arrivava dentro una stringa vuota.

`craftFloor` lo riempiva **solo** `designWallDigestSection()`, il digest distillato dal muro
pubblico. Quel digest scade a 30 giorni (`DIGEST_MAX_AGE_DAYS`), il muro è spento dal 29/08, e nel
repo non esiste più nessuna funzione che ne scriva uno: resta `readWallDigest`, e basta. Scaduto o
assente, `wallDigestSection` torna `''`.

Quindi ogni immagine del prodotto usciva con il solo `HOUSE_LOOK`: due righe che dicono «evita i
cliché AI». Nessun test è diventato rosso, perché un pavimento che sparisce non rompe niente — rende
solo le immagini un po' peggiori. È lo stesso modo silenzioso in cui il mestiere era già uscito dal
percorso quando è stato tolto `renderWithQC`, ed è il motivo per cui quel commento diceva di tenerlo
«in una funzione sola, così i cinque chiamanti non se lo ricopiano e non se lo dimenticano».

## Il mestiere c'era già, ma non arrivava a chi disegna

`agent-docs/how/WRITE-IMAGE-PROMPTS.md` è una guida fotografica seria, e ha le quattro regole che
qui non si violano. Ma è un `AGENT_FILE`: la leggono gli agenti di chat, e il renderer non l'ha mai
vista. Verificato per grep — nessun modulo sotto `content-preview/`, `media-generator/`, `ugc.ts` o
`video.ts` importa una skill.

Il buco non era il mestiere. Era il cavo fra il mestiere e chi disegna.

## Due pavimenti, sommati invece che alternativi

`PHOTO_CRAFT_SPECS` (`$lib/design/photo-craft.ts`) è il pavimento di **prodotto**: come si fa una
fotografia — luce come cinque decisioni e non un aggettivo, l'ombra di contatto chiesta per nome, il
gloss da togliere nominando la texture vera, lo stato del prodotto che non cambia. Non ha ragione di
scadere, quindi non scade.

Il digest del wall resta il pavimento **ambientale** — «cosa funziona in questo momento nel campo» —
e ora si somma sopra invece di sostituirlo. Prima erano in alternativa: passare il digest *come*
`craftFloor` significava che un digest vuoto rimpiazzava il mestiere con niente. Se il muro
tornasse domani, adesso aggiunge.

Client-safe in `$lib/design/` come `GRAPHIC_CRAFT_SPECS` e `MOTION_CRAFT_SPECS`, per la stessa
ragione: la UI deve poter mostrare le stesse regole che il modello riceve.

## Il default sta nel chokepoint, non nei wrapper

`buildImageRequest` è l'unica funzione che compone un prompt immagine: ci passano tutti e tredici i
chiamanti. Il default vive lì.

Prima lo passavano solo `renderBrandImage` e `renderCarouselSlide`. Gli altri cinque —
il media-generator (`agent.ts:493`) e i quattro render di `ugc-batch.ts` — passavano `undefined` e
restavano senza pavimento **anche quando il digest era fresco**. Era un secondo buco dentro il
primo, e si chiude da solo mettendo il default dove passano tutti.

Un `craftFloor` esplicito **sostituisce**, non si somma: chi ne passa uno su misura ha deciso, e
sommargli sotto il default gli rimetterebbe in bocca proprio le regole che stava scavalcando. C'è un
test che lo fissa.

## Il test che mancava

`craft-floor.test.ts` verificava che il digest, *quando c'è*, entri e nell'ordine giusto. Nessuno
verificava il caso che è diventato la produzione: **il digest non c'è**. Il suo terzo caso — «senza
digest il prompt resta identico a prima» — certificava il buco invece di vederlo.

`craft-floor-never-empty.test.ts` mette il mock a `''`, che è la produzione di oggi, e chiede che il
craft ci sia lo stesso: su `buildImageRequest`, su `renderPostImage` (il chokepoint, non solo i suoi
due wrapper), su `renderBrandImage` e su ogni slide di un carosello. I quattro casi falliscono sul
codice di prima con un `AssertionError`, non con un errore di import.

## Le fonti, e cosa non è stato preso

Forma, ordine e vincoli vengono da `WRITE-IMAGE-PROMPTS.md`, che è già nostro. Le regole che nominano
un difetto di resa — l'ombra di contatto, la sorgente che non sta in scena, il gloss, lo stato del
prodotto, la terza mano che compare se descrivi un terzo lavoro — sono riprese da
`photographic-craft.md` di [SuperCMO Skills](https://github.com/SupercmoHQ/superCMO-skills)
(Copyright (c) 2026 Kshitiz Kumar, Apache-2.0) e **riscritte**, non copiate: nostro vocabolario,
nostri vincoli, nessuna riga trasportata. È la stessa scelta fatta per le due skill di design prese
da `designer-skills` in `default-skills.ts` — ispirazione, non derivazione — e per la stessa ragione
non serve un NOTICE. La fonte si attribuisce lo stesso, qui, perché nel dubbio si attribuisce.

Del resto di quel repo non è entrato niente: i client Python, il loro server MCP e i loro `eval`
(che sono test di routing per keyword, non giudizi di qualità) non hanno posto qui.

## Quello che questo commit NON fa

Non misura se le immagini migliorano. `reviewImageConstraints` guarda ancora una cosa sola — il
branding sull'abbigliamento — e `eval:creative` mostra le immagini senza giudicarle. Finché i
controlli binari del craft (l'ombra di contatto c'è? c'è un softbox in scena? lo stato del prodotto
è cambiato?) non stanno nel giudice, questo resta un pavimento **rimesso dov'era**, non un
miglioramento dimostrato. Il piano sta in `docs/research/2026-09-19-craft-e-canvas.md`.

Il video non è toccato: `buildVideoPrompt` non riceve nemmeno il modello, quindi lì il seam va
costruito prima.
