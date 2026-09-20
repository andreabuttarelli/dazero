# Il video resta con un trasporto solo: `video.ts` non nomina più kie

`src/lib/server/kie.ts` e `src/lib/server/kie-jobs.ts` erano già stati cancellati, ma `video.ts`
continuava a importarli. Non compilava, e quello era il male minore: sotto ci stava un ramo intero
verso un fornitore spento, che non fallisce in modo rumoroso — aspetta. Bastava un id senza
prefisso, un modello fuori catalogo o una variabile d'ambiente per mandarci un render.

## Cosa esce

- `videoEndpoint()` — con un trasporto solo non c'era più niente da scegliere. Ogni chiamante
  va dritto a `renderOpenrouterVideo`.
- `videoTaskProvider()` — stessa ragione. `video-render-queue.ts` la usava per nominare il
  fornitore nel messaggio di resa: ora è una costante lì dentro.
- `buildJobInput()` e `buildTransformInput()` — i due dialetti di payload dell'API a job. Non
  avevano chiamanti di produzione fuori dai rami kie.
- `runAlephJob()` e tutto Runway Aleph: viveva fuori dall'API a job, su `/aleph/generate` e
  `/runway/record-detail`, ed era l'unica ragione per cui la tabella dei modelli dichiarava un
  campo `endpoint`.
- Le quattro righe `logAiCall({ provider: 'kie' })` e la matematica dei crediti accanto. Il costo
  ora arriva da `usage.cost` del gateway, che la riga in `ai_calls` la scrive già da sé nel
  trasporto — tenerne una seconda qui avrebbe duplicato la spesa nel registro.
- `env.KIE_VIDEO_RESOLUTION` / `env.KIE_VIDEO_UPSCALE_RESOLUTION`. Sono diventate le costanti
  `'480p'` / `'720p'` che erano già il loro ripiego: una variabile che nessuno ha mai impostato
  non è configurazione, è un valore con un giro in più.

## Cosa resta, di proposito

**Il marchio `openrouter:` sugli id.** Le righe storiche in `video_renders` lo portano, e il
riconciliatore legge il trasporto dalla RIGA, mai dalla configurazione di adesso. Una riga SENZA
marchio ora fallisce subito invece di restare `pending`: nessuno la può più risolvere, e lasciarla
girare la terrebbe in coda per l'ora intera della finestra di resa.

**La regola del mestiere.** `buildTransformInput` rifiutava un modello che non dichiara il ruolo
chiesto. Il payload se n'è andato, la regola no: sta in `transformVideo`, dove serve a non pagare
un giro di rete che non torna nulla.

## Due difetti trovati sulla strada

`transformVideo` scaricava la clip finita SENZA la chiave del gateway. Su OpenRouter quell'URL
risponde 401, quindi ogni refine riuscito perdeva il file al momento di riospitarlo. Ora passa
`openrouterVideoHeaders()` come fanno già gli altri due percorsi.

`upscaleVideo` chiedeva un `videoUrl` solo sul ramo OpenRouter. Adesso lo chiede sempre, perché
l'upscale che resta (`black-forest-labs/flux-video-upscale`) riparte dal FILE e non dal lavoro
originale: senza il file non c'è da dove ripartire, e dirlo subito costa zero giri di rete.

## I test

`video.no-kie.test.ts` guarda il TESTO di `video.ts`, `openrouter-video.ts` e
`openrouter-video-models.ts`. È l'unico modo di vedere un ramo che nessun altro test percorre: la
suite può essere verde su codice che non esegue mai.

Cancellato `video.kie-live.test.ts` — parlava con l'API di kie e basta. I due `describe` su
`buildJobInput` e `buildTransformInput` se ne vanno con le funzioni; quello sul rifiuto del
mestiere resta, riscritto contro `transformVideo`.

Riscritti invece di indebolire: «un modello che OpenRouter non ha resta su kie» diceva una cosa
che non è più vera — oggi quel modello non ha un trasporto, e il render si rifiuta dicendo perché.
«chi ha tenuto il lavoro si legge dall'id» difendeva `videoTaskProvider`: la proprietà è la stessa,
ora vive nel dispatch di `finishVideoRender`.
