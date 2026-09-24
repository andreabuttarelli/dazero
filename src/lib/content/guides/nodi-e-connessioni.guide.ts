import type { GuideEntry } from './index';

export default {
  slug: 'nodi-e-connessioni',
  title: 'Nodi e connessioni',
  content: `# Nodi e connessioni

## Aggiungere un nodo

Dalla barra in basso sulla tela: testo, immagine, video, prodotto o lista. Ogni voce ha un numero
— **1**, **2**, **3**... — e lo stesso numero sulla tastiera aggiunge quel tipo senza aprire il
menu.

Trascinando un file dalla libreria degli asset, o un elemento dal pannello brand (un colore, un
prodotto), sulla tela nasce un nodo già pieno — niente da riempire dopo.

## Cosa scorre in un filo

Un filo porta contenuto diverso a seconda del tipo del nodo a monte:

- **Testo**: se il nodo ha già generato, porta il testo generato; se non ha ancora generato, porta
  il suo prompt — il testo a monte fa da prompt per il nodo a valle quando quest'ultimo non ne ha
  uno proprio.
- **Doc**: porta il contenuto del documento.
- **Immagine/video collegati**: per default sono un riferimento visivo, non un fotogramma
  d'apertura o chiusura — il modello li guarda, non parte da loro.

## Le porte le decide il modello

Un nodo che genera (testo, immagine, video) non ha porte fisse: le porte che vede dipendono dal
modello scelto in quel momento. Cambiare modello può aprire o chiudere ingressi — per esempio un
modello video che accetta audio apre una porta audio, uno che non lo accetta no.

## I colori dei fili

Ogni tipo di porta ha un colore fisso, sempre lo stesso ovunque sulla tela:

- Testo — blu
- Immagini — verde
- Video — rosa
- Audio — arancione
- Primo fotogramma — viola
- Ultimo fotogramma — azzurro

## Primo e ultimo fotogramma

Un nodo video può avere due ingressi distinti per lo stesso concetto di "immagine": una porta per
il **primo fotogramma** e una per l'**ultimo fotogramma**. Collegare un'immagine su quelle porte,
invece che su un ingresso generico, le dà quel ruolo temporale — di apertura o di chiusura del
video — invece che essere solo un riferimento visivo.
`
} satisfies GuideEntry;
