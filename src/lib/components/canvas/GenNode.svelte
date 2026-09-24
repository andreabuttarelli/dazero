<script lang="ts">
  /**
   * IL NODO CHE PRODUCE, disegnato.
   *
   * Due fasce, e l'ordine non è estetico: sopra quel che è VENUTO FUORI, sotto COSA si chiede. Il
   * prompt sta in fondo perché è la riga che si riscrive dieci volte guardando il risultato che le
   * sta sopra — al contrario, ogni modifica spingerebbe il risultato fuori dallo sguardo.
   *
   * MODELLO, FORMATO, DURATA E RIPETIZIONE NON STANNO PIÙ QUI: stanno nella barra della selezione
   * (`SelectionToolbar.svelte`), che compare quando il nodo è scelto — la stessa barra che porta
   * duplica/collega/elimina, non una seconda accanto. Questo file resta il PRODOTTO — prompt,
   * risultato, storia — e legge ancora il catalogo (`choices`) perché `tooLong` e il motivo per
   * cui "Genera" è spento dipendono dal modello scelto, che il nodo continua a sapere.
   */
  import { runStateOf, promptTooLong, type GenNode, type ModelChoice } from '$lib/canvas/gen-node';
  import { blockedReason, canStartRun, shownIndex } from '$lib/canvas/gen-history';
  import { effectiveModel } from '$lib/canvas/default-models';

  let {
    node,
    choices = [],
    catalogueSynced = true,
    selected = false,
    loopQueued = 0,
    onchange,
    onrun,
    onrunloop,
    oncancelloop,
    onshow,
    onunlock,
    result
  }: {
    node: GenNode;
    /** I modelli che questo medium può usare, dal catalogo del brand. */
    choices?: ModelChoice[];
    /**
     * Il catalogo che alimenta `choices` ha almeno una riga per questo medium. `false` con
     * `choices` vuoto vuol dire "il sync non è ancora passato", non "questo medium non ha
     * modelli": un menù vuoto senza dirlo sembra un difetto, non la conseguenza accettata della
     * regola "non sincronizzato, non offerto" (`offerable-models.ts`).
     */
    catalogueSynced?: boolean;
    /** Solo il colore del bordo cambia con la selezione: i controlli stanno nella barra fuori. */
    selected?: boolean;
    /** Quanti biglietti di loop sono ancora in coda per QUESTO nodo — 0 = nessun loop in corso.
     *  Chi lo usa lo calcola da `node_runs` (`params.loop.phase === 'queued'`): il nodo non ha un
     *  `db`, mostra solo quel che gli si passa, come ogni altro suo stato. */
    loopQueued?: number;
    onchange?: (patch: Partial<GenNode>) => void;
    onrun?: () => void;
    /** Genera in loop — N combinazioni degli archi `iterate`, o N varianti (`repeat`) senza
     *  assi. Il nodo non pianifica né chiede conferma da sé: chi lo usa lo fa (`loop_plan`
     *  prima, poi `run_loop`, che METTE IN CODA — il cron gira le combinazioni nei minuti
     *  successivi, non questa chiamata). */
    onrunloop?: () => void;
    /** Ferma i biglietti non ancora reclamati — quelli già in corso finiscono comunque. */
    oncancelloop?: () => void;
    /** Rimettere in vetrina un giro di prima. Il nodo non sa scrivere: chiede a chi lo usa. */
    onshow?: (runId: string) => void;
    /** Sblocca una corsa che non torna più. Senza, il bottone resta spento per sempre. */
    onunlock?: () => void;
    /** Come si disegna quel che è uscito. Il nodo non sa da dove venga l'URL firmato. */
    result?: import('svelte').Snippet<[{ refId: string; text: string | null }]>;
  } = $props();

  /**
   * IL MODELLO CHE CONTA È QUELLO RISOLTO, non `node.model`: un nodo nato prima del default per
   * il suo medium (`default-models.ts`) non ha mai scritto un `model` in `nodes.data`, e senza
   * questo il bottone resterebbe spento su ogni nodo vecchio finché qualcuno non riapre un menù
   * che non c'è più.
   */
  const resolvedModel = $derived(effectiveModel(node.medium, node.model, choices));
  const choice = $derived(choices.find((c) => c.id === resolvedModel) ?? choices[0]);
  const state = $derived(runStateOf(node));
  const tooLong = $derived(!!choice && promptTooLong(node.prompt, choice));

  /**
   * PERCHÉ IL BOTTONE È SPENTO, da `gen-history` e non da una condizione scritta qui.
   *
   * Il difetto segnalato era «Genera non fa niente»: il bottone era collegato allo stato e a
   * nessun generatore, quindi si accendeva e taceva. Adesso lancia — e quando non può, lo dice.
   * Un bottone spento senza spiegazione è indistinguibile da uno rotto.
   *
   * `tooLong` resta qui e non nel registro: dipende dal CATALOGO, che il nodo ha e le funzioni
   * pure no — spostarlo là significherebbe passargli il modello scelto a ogni chiamata, per un
   * caso solo.
   */
  const blocked = $derived(
    tooLong && choice?.maxPromptChars ? `Prompt troppo lungo` : blockedReason(node, choices)
  );
  const canRun = $derived(canStartRun(node, choices) && !tooLong);
  const shown = $derived(shownIndex(node));

  const LABEL: Record<string, string> = {
    empty: 'Scrivi cosa vuoi',
    ready: 'Pronto',
    running: 'Sta lavorando…',
    done: 'Fatto',
    failed: 'Non è riuscito'
  };
</script>

<div class="gen" class:is-running={state === 'running'} class:is-chosen={selected}>
  <!-- Il risultato, quando c'è. Il testo lo mostra qui perché è esso stesso il prodotto; immagine
       e video li disegna chi usa il nodo, che sa da dove viene l'URL firmato. -->
  <div class="gen-body">
    {#if state === 'running'}
      <div class="gen-busy">
        <span class="gen-dots" aria-label={LABEL.running}><i></i><i></i><i></i></span>
        <button type="button" class="gen-unlock" onclick={() => onunlock?.()}>Sblocca</button>
      </div>
    {:else if state === 'failed'}
      <div class="gen-fail" role="alert">
        <p class="gen-fail-title">{LABEL.failed}</p>
        {#if node.error}
          <p class="gen-fail-why">{node.error}</p>
        {/if}
        <button type="button" class="gen-unlock" onclick={() => onrun?.()} disabled={!canRun}>Riprova</button>
      </div>
    {:else if node.refId && result}
      {@render result({ refId: node.refId, text: node.runs.find((r) => r.mediaId === node.refId)?.text ?? null })}
    {:else}
      <p class="gen-hint">{LABEL[state]}</p>
    {/if}
  </div>

  <!-- LA STORIA, sotto il risultato e sopra il prompt: si guarda quel che è uscito, si sceglie
       fra i giri fatti, si riscrive la frase. Una striscia e non frecce, perché con le frecce per
       sapere quante generazioni ci sono bisogna premerle fino in fondo.

       Compare da DUE giri in su: con uno solo sarebbe una fila di un elemento che dice quel che il
       corpo del nodo già mostra, e ruberebbe altezza al risultato. -->
  {#if node.runs.length > 1}
    <div class="gen-past" role="group" aria-label="Generazioni di prima">
      {#each node.runs as run, i (run.id)}
        <button
          type="button"
          class="gen-past-one"
          class:is-shown={i === shown}
          title={run.prompt}
          aria-label={`Generazione ${i + 1} di ${node.runs.length}`}
          aria-pressed={i === shown}
          onclick={() => onshow?.(run.id)}
        >
          {i + 1}
        </button>
      {/each}
    </div>
  {/if}

  <footer class="gen-foot">
    <textarea
      class="gen-prompt"
      rows="2"
      placeholder={node.medium === 'text' ? 'Di cosa deve parlare…' : 'Descrivi cosa vuoi vedere…'}
      value={node.prompt}
      oninput={(e) => onchange?.({ prompt: e.currentTarget.value })}
    ></textarea>

    <div class="gen-actions">
      <!-- Il perché sta ACCANTO al bottone spento, non altrove: un motivo che non si vede da dove
           si preme è un motivo che nessuno legge. -->
      {#if blocked}
        <span class="gen-warn" class:is-soft={!tooLong}>
          {blocked}{#if tooLong && choice?.maxPromptChars}
            ({node.prompt.length}/{choice.maxPromptChars}){/if}
        </span>
      {/if}
      {#if loopQueued > 0 && oncancelloop}
        <button type="button" class="gen-loop" onclick={() => oncancelloop?.()}>
          Annulla loop ({loopQueued})
        </button>
      {:else if onrunloop}
        <button type="button" class="gen-loop" onclick={() => onrunloop?.()} disabled={!canRun}>
          Loop
        </button>
      {/if}
      <button type="button" onclick={() => onrun?.()} disabled={!canRun}>
        {state === 'done' ? 'Rifai' : 'Genera'}
      </button>
    </div>
  </footer>
</div>

<style>
  /*
   * UN NODO GALLEGGIA, non è appoggiato.
   *
   * Su una tela è tutto su un piano solo: un bordo da un pixel è l'unica cosa che separa il nodo
   * dallo sfondo, e a zoom ridotto sparisce — restano rettangoli che si confondono col pattern.
   * L'ombra dà la profondità che il bordo da solo non ha, e cresce con la selezione perché il
   * nodo su cui si sta lavorando deve stare AVANTI agli altri, non solo essere contornato.
   *
   * `--paper` e non `--paper-2`: il nodo è il foglio, e la tela è ciò che gli sta sotto. Invertiti
   * — come erano — il nodo era più scuro dello sfondo, che è il contrario di quel che galleggia.
   */
  .gen {
    position: relative;
    display: flex;
    flex-direction: column;
    height: 100%;
    min-height: 0;
    background: var(--paper, #fff);
    border: 1px solid var(--line, #e5e5e5);
    box-shadow:
      0 1px 2px rgb(0 0 0 / 0.05),
      0 8px 24px -12px rgb(0 0 0 / 0.2);
    transition:
      box-shadow 140ms ease,
      border-color 140ms ease;
  }
  .gen:hover {
    box-shadow:
      0 1px 2px rgb(0 0 0 / 0.06),
      0 12px 32px -14px rgb(0 0 0 / 0.26);
  }
  .gen.is-chosen {
    border-color: var(--accent, #c485fe);
    box-shadow:
      0 0 0 1px var(--accent, #c485fe),
      0 16px 40px -16px rgb(0 0 0 / 0.3);
  }

  .gen.is-running {
    border-color: var(--accent, #c485fe);
  }

  @media (prefers-reduced-motion: reduce) {
    .gen {
      transition: none;
    }
  }

  /*
   * IL RISULTATO ARRIVA AI BORDI. Il nodo esiste per guardare quel che è uscito: dentro un
   * `padding` diventa una miniatura con una cornice attorno, e su una clip verticale la cornice
   * è più larga del contenuto. Il taglio col raggio del guscio è quel che dà il bordo pulito
   * senza che l'immagine debba saperlo.
   *
   * Il taglio vale per il CONTENUTO, non per il nodo: `overflow: hidden` sul nodo intero
   * mangerebbe la fascia delle proprietà, che sporge apposta.
   */
  .gen-body {
    flex: 1;
    min-height: 0;
    display: flex;
    align-items: center;
    justify-content: center;
    overflow: hidden;
    background: var(--paper-2, #f9f9f9);
  }

  /* Il contenuto che il chiamante disegna riempie la fascia invece di galleggiarci dentro:
     `contain` e non `cover` perché un'immagine tagliata a metà non si può giudicare, ed è il
     giudizio la ragione per cui sta lì. */
  .gen-body :global(img),
  .gen-body :global(video) {
    width: 100%;
    height: 100%;
    object-fit: contain;
    display: block;
  }

  .gen-hint {
    margin: 0;
    padding: 10px;
    font-size: 12px;
    text-align: center;
    color: var(--ink-soft, #6e6e73);
  }

  .gen-busy {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 10px;
    padding: 12px;
  }

  .gen-fail {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 6px;
    padding: 14px 12px;
    text-align: center;
  }
  .gen-fail-title {
    margin: 0;
    font-size: 12.5px;
    font-weight: 650;
    color: var(--ink, #1d1d1f);
  }
  .gen-fail-why {
    margin: 0;
    max-width: 28ch;
    font-size: 11px;
    line-height: 1.4;
    color: var(--ink-soft, #6e6e73);
    overflow-wrap: anywhere;
  }

  .gen-unlock {
    padding: 4px 12px;
    font: inherit;
    font-size: 11.5px;
    border: 1px solid var(--line-2, #d2d2d7);
    background: var(--paper, #fff);
    color: var(--ink, #1d1d1f);
    cursor: pointer;
  }
  .gen-unlock:hover {
    background: var(--paper-2, #f9f9f9);
  }
  .gen-unlock:disabled {
    opacity: 0.35;
    cursor: default;
  }

  .gen-foot {
    padding: 8px 9px 9px;
    border-top: 1px solid var(--line, #e5e5e5);
    background: var(--paper, #fff);
  }
  .gen-prompt {
    width: 100%;
    resize: none;
    border: 1px solid var(--line-2, #d2d2d7);
    padding: 6px 8px;
    font: inherit;
    font-size: 12.5px;
    line-height: 1.45;
    color: var(--ink, #1d1d1f);
    background: var(--paper-2, #f9f9f9);
  }
  .gen-prompt:focus {
    outline: none;
    border-color: var(--accent, #c485fe);
  }

  .gen-actions {
    display: flex;
    align-items: center;
    justify-content: flex-end;
    gap: 8px;
    margin-top: 6px;
  }
  .gen-warn {
    font-size: 11px;
    color: #c0392b;
  }
  /* «Manca ancora qualcosa» non è un errore: in rosso, aprire un nodo nuovo sembrerebbe aver già
     sbagliato qualcosa. Il rosso resta a quel che il modello rifiuterebbe davvero. */
  .gen-warn.is-soft {
    color: var(--ink-soft, #6e6e73);
  }

  /*
   * LA STRISCIA DEI GIRI FATTI. Numeri e non miniature: una miniatura dentro una fascia alta
   * venti pixel è illeggibile — si distinguerebbero due immagini simili solo aprendole — e
   * caricarne dieci costringerebbe il nodo a scaricare dieci file per una fila che spesso nessuno
   * guarda. Il prompt di quel giro sta nel `title`, che è dove si cerca quando i numeri non
   * bastano.
   */
  .gen-past {
    display: flex;
    gap: 4px;
    flex-wrap: wrap;
    padding: 5px 9px;
    border-top: 1px solid var(--line, #e5e5e5);
    background: var(--paper, #fff);
  }
  .gen-past-one {
    min-width: 20px;
    padding: 1px 5px;
    font-size: 10.5px;
    line-height: 1.5;
    color: var(--ink-soft, #6e6e73);
    background: var(--paper-2, #f9f9f9);
    border: 1px solid var(--line-2, #d2d2d7);
    cursor: pointer;
  }
  .gen-past-one.is-shown {
    color: var(--paper, #fff);
    background: var(--ink, #1d1d1f);
    border-color: var(--ink, #1d1d1f);
  }
  button {
    padding: 4px 12px;
    font: inherit;
    font-size: 12px;
    border: none;
    background: var(--ink, #1d1d1f);
    color: var(--paper, #fff);
    cursor: pointer;
  }
  button:disabled {
    opacity: 0.35;
    cursor: default;
  }
  /* Secondario a "Genera": stesso posto, meno peso — il loop è l'azione meno frequente delle due. */
  .gen-loop {
    background: var(--paper, #fff);
    color: var(--ink, #1d1d1f);
    border: 1px solid var(--line-2, #d2d2d7);
  }
  .gen-loop:hover:not(:disabled) {
    background: var(--paper-2, #f9f9f9);
  }

  .gen-dots {
    display: inline-flex;
    gap: 5px;
  }
  .gen-dots i {
    width: 6px;
    height: 6px;
    background: var(--accent, #c485fe);
    animation: gen-blink 1.2s infinite;
  }
  .gen-dots i:nth-child(2) {
    animation-delay: 0.2s;
  }
  .gen-dots i:nth-child(3) {
    animation-delay: 0.4s;
  }
  @keyframes gen-blink {
    0%, 60%, 100% { opacity: 0.25; }
    30% { opacity: 1; }
  }
  @media (prefers-reduced-motion: reduce) {
    .gen-dots i { animation: none; opacity: 0.5; }
  }
</style>
