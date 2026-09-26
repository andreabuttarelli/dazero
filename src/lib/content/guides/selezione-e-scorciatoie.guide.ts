import type { GuideEntry } from './index';

export default {
  slug: 'selezione-e-scorciatoie',
  title: 'Selezione e scorciatoie',
  content: `# Selezione e scorciatoie

## Selezionare

- **Trascinare sullo sfondo** disegna un rettangolo di selezione (marquee) attorno ai nodi che
  tocca.
- **Shift-click** o **⌘/Ctrl-click** su un nodo aggiunge o toglie quel nodo dalla selezione
  corrente.
- **⌘A / Ctrl+A** seleziona tutti i nodi della tela — non funziona mentre si scrive in un campo di
  testo.
- **Esc** deseleziona tutto.

Con più nodi selezionati, trascinarne uno li sposta tutti insieme, e nella barra della selezione
compaiono le proprietà comuni ai nodi scelti, modificabili una volta sola per tutti.

## Scorciatoie da tastiera

| Tasto | Azione |
|---|---|
| Backspace / Delete | Cancella la selezione |
| ⌘D / Ctrl+D | Duplica la selezione |
| ⌘C / Ctrl+C | Copia la selezione |
| ⌘V / Ctrl+V | Incolla al centro di quel che si sta guardando |
| ⌘Z / Ctrl+Z | Annulla |
| ⇧⌘Z / Ctrl+Shift+Z | Ripeti |
| Frecce | Sposta la selezione |
| Frecce + Shift | Sposta la selezione di un passo più lungo |
| 0 | Adatta la vista a tutta la tela |
| + / = | Zoom avanti |
| - | Zoom indietro |
| 1, 2, 3... | Aggiunge il tipo di nodo in quella posizione della barra |

Nessuna di queste scorciatoie scatta mentre si sta scrivendo in un campo di testo, tranne Esc, che
resta sempre disponibile per chiudere un menu o un overlay aperto. La cancellazione non chiede
conferma: un nodo cancellato per errore si riaggiunge con lo stesso gesto che l'ha creato.

## Copiare l'id di un nodo

Dal menu del nodo si copia il suo id — utile per riferirlo altrove, per esempio parlando con
l'agente in chat.
`
} satisfies GuideEntry;
