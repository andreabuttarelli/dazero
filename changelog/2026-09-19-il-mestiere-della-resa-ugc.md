# Il mestiere della resa UGC, dove c'era un segnaposto

`ugc-craft.ts` aveva l'architettura giusta da mesi: un agente sul tier pro che riscrive il brief
deterministico, le RULE tenute verbatim, il ripiego sul brief di template se sbaglia. E
un'istruzione che era un segnaposto — *«riscrivilo come farebbe un vero regista»*.

Chiedere mestiere a un modello senza dirgli quale è il modo esatto di ottenere la media di quello
che ha visto in addestramento.

## Quello che il modello video rende male, scritto

Ogni riga nomina un difetto di resa, non un gusto di regia:

- **Conta le mani a ogni momento.** Un telefono tenuto a distanza di braccio ne occupa una, quindi
  ne resta libera una sola. Descrivi un terzo compito — tieni una cosa, usane una seconda, indica
  la terza — e nel fotogramma compare una terza mano.
- **Dai a ogni battuta un momento con la bocca chiusa** mentre le mani lavorano. Il labiale è la
  cosa più debole che questi modelli rendono, e il parlato continuo lo sbava per tutta la clip.
- **Alza ogni performance di un gradino** rispetto al livello che vuoi sullo schermo: il modello la
  restituisce più piatta di come è scritta. E dentro ogni battuta qualcosa deve CAMBIARE — il peso
  che si sposta, un respiro che atterra, un sorriso che rompe dopo una pausa. Una battuta senza
  cambiamenti esce come un fermo immagine.
- **Niente sotto la scala di un arto.** Muovere, tenere, inclinare, sollevare e camminare rendono.
  Svitare un tappo, tirare un laccio, premere un erogatore, chiudere una cerniera no: se la battuta
  ha bisogno della cosa in uno stato nuovo, si APRE con la cosa già in quello stato.
- **Le posizioni tengono dentro una battuta.** Un cambiamento non dichiarato rende come un
  teletrasporto, e una volta cambiato resta cambiato.
- **Niente si può scrivere come assente**, nemmeno un suono. Una cosa nominata è una cosa resa.

E la dottrina che separa una recensione da una lode: chi guarda dà per scontato che al creator sia
stato pagato per dirlo, quindi lodare più forte lo convince solo di più. Si fa una affermazione, la
si mette alla prova sulla camera, e solo allora si dà il verdetto — che vale qualcosa proprio
perché chi guarda ha visto la prova. Una concessione vera compra più di un altro superlativo.

## Non gli archi, che ci sono già

`$lib/ugc-formats` tiene le otto forme con le loro battute in percentuale, `productEarly`,
`failsWhen`, «con quale formato viene confuso». Quella è la drammaturgia, ed è scritta bene.

Avevo cominciato a scrivere un secondo registro di archi prima di leggerla: sarebbe stata la copia
che diverge al primo formato nuovo. Un test ora verifica che questo file **non nomini nessun id di
formato** — il craft dice COME si rende una battuta, non QUALI battute ci sono.

## Il cavo, e la closure che legge il modello al momento giusto

Il craft entra nel prompt PRIMA del brief da riscrivere: sono le regole con cui va riscritto, e un
modello che le legge dopo il testo le applica alla metà che ha ancora in mente. Un test fissa
l'ordine.

Con lui arrivano le note del modello video, dal registro del Passo 4. E qui c'era una trappola:
`lockedModel` è deciso DOPO la definizione di `briefFor`, e può ancora cambiare — un remake o un
audio di riferimento lo forzano su Seedance. Passarlo per valore avrebbe dato le note del modello
sbagliato; la closure lo legge quando `briefFor` viene davvero chiamata, che è più in basso.
Verificato sul prompt vero: Seedance riceve le note Seedance, Grok quelle di Grok, un modello ignoto
nessuna.

## Quello che questo commit NON fa

Il giudice del mestiere guarda le immagini, non le clip: i difetti di resa che queste regole
prevengono — la terza mano, il teletrasporto, il labiale sbavato — nessuno li misura ancora su un
video reso. È il filo che resta, e sta nel piano.
