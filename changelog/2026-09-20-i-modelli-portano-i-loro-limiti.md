# `get_media_models` porta i limiti, non solo i nomi

La lettura diceva QUALI modelli un mestiere accetta — `{id, label}` — e si fermava lì. Ma chi
sceglie deve poi costruire una richiesta: venti secondi, 9:16, tre riferimenti. Nessuno di quei
vincoli usciva da qui, quindi un agente li scopriva dal rifiuto del provider, dopo aver pagato
il giro di rete.

I limiti esistono già nei due registri (`video-models.ts`, `image-models.ts`) e sono per modello,
non globali: Seedance 2.5 fa 30 secondi, Grok Imagine 15; GPT Image 2 inoltra 16 riferimenti,
Qwen 3. Si fermavano al nostro confine.

Ora ogni scelta porta i suoi:

- **video** — `minDuration`, `maxDuration`, `aspectRatios`, `maxPromptChars`, `generateAudio`
- **immagini** — `aspectRatios`, `maxRefs`

**I due insiemi sono diversi, e restano diversi.** Una foto non dura, una clip non ha un tetto di
riferimenti: dichiarare un campo vuoto per simmetria direbbe che esiste e vale zero, che è peggio
di non dirlo. I campi video sono opzionali sulle scelte immagine e viceversa, e il contratto rifiuta
una scelta senza `aspectRatios` — il solo campo che entrambi hanno davvero.

Un solo punto tocca i registri: `slotChoices`. Era già l'unica cosa che decideva cosa un selettore
può offrire, ed è rimasta l'unica — il browser e gli agenti esterni leggono la stessa funzione.
