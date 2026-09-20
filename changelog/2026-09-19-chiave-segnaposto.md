# Un segnaposto non è una chiave

`.env` aveva ancora `LLM_API_KEY=<la STRINGA della chiave>`, il segnaposto mai sostituito. Non è
vuoto, quindi passava tutto: `llmApiKey()` lo restituiva, `llmConfigured()` diceva di sì,
`llmClient()` non si fermava, e la stringa fra parentesi angolari partiva sul filo come Bearer.

OpenRouter rispondeva `401 Missing Authentication header`. La strategia GTM moriva tre varianti su
tre, più lo spec del funnel — e l'unica traccia era un 401 di un terzo, che manda a cercare la
chiave scaduta, il gateway giù, il provider cambiato. La causa era nostra e la sapevamo già.

## Dove sta il controllo

In `llmApiKey()`, non nei quaranta call site. `llmConfigured()` ci poggia sopra, `llmClient()`
alza già `LLM_API_KEY is not configured`: una riga sola e tutti quelli che chiedono la chiave
ereditano il rifiuto, con l'errore nominato che `.env.example` promette da sempre.

La forma riconosciuta è `^<.*>$`. Non un elenco di segnaposti noti — `<your-key>`, `<inserisci…>`,
`<LLM_API_KEY>` sono infiniti e il prossimo non sarebbe in elenco — ma la convenzione che li
accomuna: nessuna chiave vera è avvolta in parentesi angolari.

## Perché non un controllo di prefisso

`sk-or-v1-` avrebbe rifiutato il segnaposto, ma anche ogni gateway OpenAI-compatibile che non sia
OpenRouter — `LLM_BASE_URL` esiste apposta. Una guardia che rompe una configurazione legittima per
intercettarne una sbagliata costa più di quello che salva.

## Il test

`llm.test.ts` prova tre segnaposti diversi, che una chiave vera passa intatta, e che `llmClient()`
si ferma invece di spedire. Scritto prima della correzione e visto fallire: 4 rossi, con il caso
della chiave vera già verde — così il test non è vuoto.
