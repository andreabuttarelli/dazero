import type { GuideEntry } from './index';

export default {
  slug: 'generare',
  title: 'Generare',
  content: `# Generare

## Modello e Genera

Ogni nodo che produce qualcosa (testo, immagine, video) ha un selettore modello in alto: solo i
modelli disponibili per quel medium compaiono. Il bottone **Genera** parte spento finché il nodo
non ha un modello scelto e qualcosa da generare — scritto nel nodo stesso o ricevuto da un nodo
testo collegato a monte.

Dopo il primo giro il bottone diventa **Rifai**: rigenerare non perde la versione precedente.

## Storico

Sotto il nodo compare una striscia con le generazioni passate — solo quelle andate a buon fine.
Un giro fallito non lascia una miniatura vuota nella striscia: semplicemente non compare. Cliccare
una miniatura passata la riporta in primo piano sul nodo, senza rigenerare nulla.

## Riprova

Quando un giro è bloccato o fallito, il nodo mostra **Riprova** al posto di Genera: stesso
prompt, stesso modello, un nuovo tentativo.

## Crediti

In alto sulla tela, il saldo crediti dell'organizzazione è sempre visibile — un click porta alla
pagina di fatturazione. Ogni generazione consuma crediti in base al medium e al modello scelto;
il saldo si aggiorna dopo ogni giro.

## Migliora prompt

Sui nodi immagine e video, lo switch **Migliora prompt** riscrive il testo con le buone pratiche
del modello scelto prima di generare — il prompt scritto nel nodo resta invariato, solo il giro
lo usa riscritto. È spento di default. Quando è acceso, il prezzo mostrato su Genera e Loop
include anche il costo della riscrittura.
`
} satisfies GuideEntry;
