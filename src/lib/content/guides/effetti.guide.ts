import type { GuideEntry } from './index';

export default {
  slug: 'effetti',
  title: 'Effetti sulle immagini',
  content: `# Effetti sulle immagini

Il nodo **Effetti** trasforma un'immagine con una pila di effetti — pixel, ASCII, retinatura,
glitch, duotono e altri — con un'anteprima dal vivo.

## Collegare un'immagine

Aggiungi un nodo **Effetti** dalla barra in basso, poi collega un nodo immagine (caricata o
generata) alla sua porta d'ingresso. Finché non applichi, il nodo mostra l'immagine collegata con
l'etichetta "Non applicato".

## Aprire l'editor

Clicca **Apri editor** sul nodo, oppure fai doppio clic sul nodo. A sinistra c'è l'anteprima,
a destra la pila; **Prima** e **Dopo** confrontano l'originale con il risultato.

## Costruire la pila

Scegli un effetto da **Aggiungi effetto**: entra in fondo alla pila con i suoi valori di partenza.
Gli effetti si applicano dall'alto in basso, quindi l'ordine cambia il risultato — spostali con
le frecce. L'occhio spegne un effetto senza perderne i valori, il cestino lo toglie.

## Applicare

**Applica** calcola l'immagine alla risoluzione piena e la salva: il nodo mostra il risultato e
lo passa ai nodi collegati a valle. **Annulla** chiude senza salvare. Se l'immagine a monte
cambia, il nodo lo segnala con **Input cambiato · Riapplica**: riapri l'editor e applica di nuovo.
`
} satisfies GuideEntry;
