<script lang="ts">
  /**
   * COSA SI PUÒ METTERE SULLA TELA, RESO VISIBILE.
   *
   * Il doppio clic fa la stessa cosa, ma non si scopre: niente sulla tela dice che esiste, e una
   * scorciatoia che nessuno trova vale quanto una funzione che non c'è.
   *
   * DUE GESTI, UNA SOLA CREAZIONE. Il clic dice «mettilo dove capita» e il trascinamento «mettilo
   * QUI» — su una tela il punto conta, ed è la ragione per cui non basta il bottone. Ma la tile la
   * costruisce una funzione sola, in `CanvasFlow`: due strade che se la fabbricano per conto loro
   * divergono al primo campo aggiunto, e il difetto si vede solo su una delle due.
   *
   * E ACCANTO, LA SCHEDA DELLE SCORCIATOIE. Sta qui e non in un ascoltatore suo perché questa è
   * già la barra che rende visibile quel che la tela sa fare: una scorciatoia che nessuno trova
   * vale quanto una funzione che non c'è, e le sole due strade per incontrarla sono il numero nel
   * `title` di ogni voce e questa scheda. Non prende il tasto `?`, che è della scheda globale del
   * prodotto: due ascoltatori sullo stesso tasto aprirebbero due pannelli sovrapposti.
   *
   * COSA SI STA TRASCINANDO VIAGGIA NEL `dataTransfer`, non in una variabile di modulo: durante un
   * trascinamento il puntatore può uscire dalla finestra e rientrare, e uno stato appeso fuori
   * dall'evento sopravvive a un trascinamento annullato — il nodo successivo nascerebbe del tipo
   * sbagliato.
   */
  import Type from '@lucide/svelte/icons/type';
  import Image from '@lucide/svelte/icons/image';
  import Video from '@lucide/svelte/icons/video';
  import Globe from '@lucide/svelte/icons/globe';
  import Keyboard from '@lucide/svelte/icons/keyboard';
  import { CANVAS_ADDABLE, ADDABLE_LABEL, type Addable } from '$lib/canvas/addable';
  import { CANVAS_DRAG_MEDIUM } from '$lib/canvas/new-node';
  import { CANVAS_SHORTCUTS } from '$lib/canvas/shortcuts';

  let { onpick }: { onpick?: (what: Addable) => void } = $props();

  const ICON = { text: Type, image: Image, video: Video, iframe: Globe };

  let showKeys = $state(false);

  const isMac =
    typeof navigator !== 'undefined' &&
    /mac|iphone|ipad/i.test(navigator.platform || navigator.userAgent);

  /** 'mod' → ⌘ o Ctrl, secondo la macchina. Le altre etichette passano com'erano. */
  const keyLabel = (k: string) => (k === 'mod' ? (isMac ? '⌘' : 'Ctrl') : k);
</script>

<div class="add-bar">
  {#each CANVAS_ADDABLE as what, i (what)}
    {@const Icon = ICON[what]}
    <!-- Il numero nel `title` è il posto in cui la scorciatoia si incontra SENZA cercarla: la
         scheda accanto la elenca, ma la si apre solo sospettando che esista. -->
    <button
      type="button"
      title={`${ADDABLE_LABEL[what]} (${i + 1})`}
      aria-label={ADDABLE_LABEL[what]}
      draggable="true"
      onclick={() => onpick?.(what)}
      ondragstart={(e) => e.dataTransfer?.setData(CANVAS_DRAG_MEDIUM, what)}
    >
      <Icon size={17} strokeWidth={1.7} />
      <span>{ADDABLE_LABEL[what]}</span>
    </button>
  {/each}

  <button
    type="button"
    class="keys-toggle"
    title="Scorciatoie da tastiera"
    aria-label="Scorciatoie da tastiera"
    aria-expanded={showKeys}
    onclick={() => (showKeys = !showKeys)}
  >
    <Keyboard size={17} strokeWidth={1.7} />
  </button>

  {#if showKeys}
    <!-- Generata da `CANVAS_SHORTCUTS`, che è la stessa lista che i tasti usano: una scheda
         scritta a mano accanto al riconoscimento diverge al primo tasto cambiato, e a divergere
         è sempre quella che l'utente legge. -->
    <ul class="keys">
      {#each CANVAS_SHORTCUTS as row, i (row.id + i)}
        <li>
          <span>{row.label}</span>
          <span class="combo">
            {#each row.keys as k (k)}<kbd>{keyLabel(k)}</kbd>{/each}
          </span>
        </li>
      {/each}
    </ul>
  {/if}
</div>

<style>
  .add-bar {
    position: absolute;
    z-index: 12;
    bottom: 18px;
    left: 50%;
    transform: translateX(-50%);
    display: flex;
    gap: 3px;
    padding: 4px;
    border-radius: 999px;
    background: var(--paper, #fff);
    border: 1px solid var(--line-2, #d2d2d7);
    box-shadow: 0 4px 18px rgb(0 0 0 / 0.1);
  }

  button {
    display: inline-flex;
    align-items: center;
    gap: 6px;
    padding: 6px 12px;
    font: inherit;
    font-size: 12.5px;
    color: var(--ink, #1d1d1f);
    background: none;
    border: none;
    border-radius: 999px;
    cursor: grab;
  }
  button:hover,
  button:focus-visible {
    background: var(--paper-2, #f9f9f9);
  }
  button:active {
    cursor: grabbing;
  }

  .keys-toggle {
    padding: 6px 9px;
    cursor: pointer;
    color: var(--ink-soft, #6e6e73);
  }

  /* Sopra la barra e non sotto: sotto uscirebbe dal riquadro della tela e verrebbe tagliata. */
  .keys {
    position: absolute;
    z-index: 13;
    bottom: calc(100% + 8px);
    right: 0;
    width: max-content;
    min-width: 230px;
    max-height: 46vh;
    overflow-y: auto;
    margin: 0;
    padding: 6px;
    list-style: none;
    border-radius: 12px;
    background: var(--paper, #fff);
    border: 1px solid var(--line-2, #d2d2d7);
    box-shadow: 0 6px 20px rgb(0 0 0 / 0.12);
  }
  .keys li {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 14px;
    padding: 5px 8px;
    font-size: 12.5px;
    color: var(--ink, #1d1d1f);
  }
  .combo {
    display: inline-flex;
    gap: 3px;
    flex-shrink: 0;
  }
  kbd {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    min-width: 18px;
    height: 18px;
    padding: 0 4px;
    border: 1px solid var(--line, #e5e5e5);
    border-radius: 5px;
    background: var(--paper-2, #f9f9f9);
    font-family: inherit;
    font-size: 11px;
    color: var(--ink-soft, #6e6e73);
  }

  /* Su schermo stretto restano le icone: quattro etichette affiancate mangerebbero la tela, che è
     la cosa che si sta guardando. */
  @media (max-width: 560px) {
    button span {
      display: none;
    }
    button {
      padding: 8px;
    }
  }
</style>
