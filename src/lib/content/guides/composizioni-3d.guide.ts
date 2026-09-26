import type { GuideEntry } from './index';

export default {
  slug: 'composizioni-3d',
  title: 'Composizioni 3D',
  content: `# Composizioni 3D

Il nodo **Composizione** dispone più immagini in una scena 3D animata — griglia obliqua,
carosello, nube spaziale, anello, spirale, flusso verticale o coverflow — con una camera che si
muove nel tempo.

## Collegare le immagini

Aggiungi un nodo **Composizione**, poi collega una o più immagini alla sua porta d'ingresso,
direttamente o attraverso un nodo **Lista**. Il nodo mostra quante immagini sono collegate finché
non apri l'editor. Se un layout richiede più elementi, le immagini collegate vengono ripetute in
sequenza fino a completare la figura.

## Aprire l'editor

Clicca **Apri editor** sul nodo, oppure fai doppio clic. A sinistra c'è l'anteprima 3D con una
barra di riproduzione; a destra le impostazioni: layout, camera, sfondo, durata e formato.

## Layout e camera

Ogni layout ha i suoi parametri — colonne, spaziatura, profondità, moto e distribuzione — e ogni
modifica appare subito nell'anteprima. La camera segue un percorso scelto fra i preset (fisso,
orbita lenta, avvicinamento, carrello), con i propri parametri.

Il movimento percorre sempre un loop chiuso con easing expo: il fotogramma finale coincide con
quello iniziale e la durata scelta governa l'intero ciclo.

**Ripristina** riporta il layout e la camera selezionati ai loro valori progettati, insieme a
sfondo, durata e formato.

## Salvare

**Salva** scrive le impostazioni sul nodo. **Annulla** chiude senza salvare. L'esportazione in
video arriva in un secondo momento: per ora l'editor prepara la scena, non ne produce il file.
`
} satisfies GuideEntry;
