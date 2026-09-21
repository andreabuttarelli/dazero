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
   * IL MEDIUM VIAGGIA NEL `dataTransfer`, non in una variabile di modulo: durante un trascinamento
   * il puntatore può uscire dalla finestra e rientrare, e uno stato appeso fuori dall'evento
   * sopravvive a un trascinamento annullato — il nodo successivo nascerebbe del tipo sbagliato.
   */
  import Type from '@lucide/svelte/icons/type';
  import Image from '@lucide/svelte/icons/image';
  import Video from '@lucide/svelte/icons/video';
  import { GEN_MEDIUMS, type GenMedium } from '$lib/canvas/gen-node';
  import { CANVAS_DRAG_MEDIUM } from '$lib/canvas/new-node';

  let { onpick }: { onpick?: (medium: GenMedium) => void } = $props();

  const ICON = { text: Type, image: Image, video: Video };
  const LABEL: Record<GenMedium, string> = {
    text: 'Testo',
    image: 'Immagine',
    video: 'Video'
  };
</script>

<div class="add-bar">
  {#each GEN_MEDIUMS as medium (medium)}
    {@const Icon = ICON[medium]}
    <button
      type="button"
      title={LABEL[medium]}
      aria-label={LABEL[medium]}
      draggable="true"
      onclick={() => onpick?.(medium)}
      ondragstart={(e) => e.dataTransfer?.setData(CANVAS_DRAG_MEDIUM, medium)}
    >
      <Icon size={17} strokeWidth={1.7} />
      <span>{LABEL[medium]}</span>
    </button>
  {/each}
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

  /* Su schermo stretto restano le icone: tre etichette affiancate mangerebbero la tela, che è
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
