import type { GuideEntry } from './index';

export default {
  slug: 'creare-un-post',
  title: 'Creare un post',
  content: `# Creare un post

## Dalla tela al post

Seleziona uno o più nodi sulla tela — testo, immagini, video — e usa **Crea post** nella barra
della selezione. Si apre il composer con il materiale scelto già dentro: un nodo testo collegato
entra come materiale scrivibile, non solo come didascalia fissa.

## Il marcatore "in un post"

Un nodo già usato in almeno un post mostra un piccolo indicatore sulla tessera della tela — un
punto con il titolo "Usato in un post" al passaggio del mouse. Serve a vedere a colpo d'occhio
quali materiali sono già stati impiegati, senza dover riaprire ogni post per controllare.

## Salvare o programmare

Dal composer, un post si può salvare come bozza per rivederlo più tardi, oppure approvare e
programmare per la pubblicazione a una data scelta. Il post appartiene al brand, non alla tela:
una volta creato compare nel calendario di quel brand, indipendentemente da quale tela l'ha
generato.
`
} satisfies GuideEntry;
