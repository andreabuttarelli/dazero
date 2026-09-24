import type { GuideEntry } from './index';

export default {
  slug: 'loop',
  title: 'Loop',
  content: `# Loop

Un loop gira più generazioni dello stesso nodo in un colpo solo, una per ogni combinazione di
valori collegati.

## Impostare un asse

Un asse nasce da un nodo **lista** collegato a un nodo che genera. Sul filo che li unisce, un
click apre un pannello dove si sceglie la modalità del filo: **fisso** (lo stesso valore per ogni
giro) o **itera** (un valore diverso per ogni giro, uno per ogni elemento della lista). Solo un
filo in modalità itera con sorgente una lista conta come asse — un filo itera collegato a un nodo
che non è una lista non produce un asse.

## Combinazione fra più assi

Con più assi collegati in modalità itera, per default il loop fa il prodotto **cartesiano**: ogni
valore del primo asse incrociato con ogni valore del secondo, e così via — il numero totale è il
prodotto delle lunghezze di tutti gli assi. In modalità **zip**, invece, gli assi si accoppiano per
indice — il primo valore di ognuno insieme, poi il secondo di ognuno insieme — e vince l'asse più
corto: se le liste hanno lunghezze diverse, il loop si ferma quando la più corta finisce.

Un nodo senza assi collegati usa invece **repeat N**: N varianti dello stesso prompt fisso, senza
combinazioni.

## Soglie di sicurezza

Sopra 50 combinazioni il loop chiede conferma esplicita prima di partire. Sopra 1000 si rifiuta e
chiede di dividere il lavoro in più loop più piccoli.

## L'elenco dei risultati

Un loop produce un nodo lista con un elemento per combinazione. Ogni elemento può essere
rigenerato singolarmente se non convince, senza rifare l'intero loop.

## Il bottone Loop

Il bottone compare solo quando il nodo ha almeno un asse utile — un asse con almeno due valori
diversi da combinare — e mostra quante combinazioni farebbe (per esempio "×12"). Senza un asse
collegato il bottone resta nascosto: non c'è niente da combinare.

## Scegliere un risultato

Il nodo **select** prende una lista di risultati e ne fissa uno per indice — utile per portare a
valle solo l'elemento scelto da un loop, invece dell'intera lista.
`
} satisfies GuideEntry;
