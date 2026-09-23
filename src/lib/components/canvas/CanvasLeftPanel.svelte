<script lang="ts">
  import { _ } from 'svelte-i18n';
  import ProjectDragPanel from './ProjectDragPanel.svelte';
  import X from '@lucide/svelte/icons/x';

  /**
   * IL PANNELLO ACCANTO ALLA TELA — Assets o Brands, uno alla volta (CLAUDE.md: "One left panel
   * at a time"). La tela resta interattiva dietro: non è un `Sheet`, è un riquadro non modale che
   * la rail apre e chiude, e da cui si trascina direttamente su `CanvasFlow` (`ProjectDragPanel`
   * fa già questo — qui solo l'intestazione e la chiusura).
   */
  let {
    projectId,
    kind,
    labelKey,
    onclose
  }: {
    projectId: string;
    kind: 'assets' | 'brands';
    labelKey: string;
    onclose: () => void;
  } = $props();
</script>

<div class="left-panel">
  <div class="left-panel-head">
    <h3>{$_(labelKey)}</h3>
    <button type="button" class="close" onclick={onclose} aria-label={$_('app.shell.closePanel')}>
      <X size={14} />
    </button>
  </div>
  <div class="left-panel-body">
    <ProjectDragPanel {projectId} {kind} />
  </div>
</div>

<style>
  .left-panel {
    position: absolute;
    z-index: 15;
    left: 60px;
    top: 12px;
    bottom: 12px;
    width: 260px;
    display: flex;
    flex-direction: column;
    background: var(--paper, #fff);
    border: 1px solid var(--line, #ededef);
    box-shadow: 0 2px 10px rgba(0, 0, 0, 0.06);
  }

  .left-panel-head {
    flex: 0 0 auto;
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 10px 10px 8px 12px;
    border-bottom: 1px solid var(--line, #ededef);
  }
  .left-panel-head h3 {
    margin: 0;
    font-size: 12.5px;
    font-weight: 700;
    color: var(--ink, #1d1d1f);
  }

  .close {
    display: grid;
    place-items: center;
    width: 24px;
    height: 24px;
    appearance: none;
    border: 0;
    background: transparent;
    color: var(--ink-soft, #6e6e73);
    cursor: pointer;
  }
  .close:hover {
    background: var(--paper-2, #f9f9f9);
    color: var(--ink, #1d1d1f);
  }

  .left-panel-body {
    flex: 1;
    min-height: 0;
    padding: 8px 10px;
  }
</style>
