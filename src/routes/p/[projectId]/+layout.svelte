<script lang="ts">
  /**
   * IL GUSCIO DEL PROGETTO: tela infinita al centro, rail flottante a sinistra, chat a destra —
   * la stessa gerarchia per ogni rotta sotto `/p/[projectId]`, di cui il canvas è la HOME
   * (`+page.server.ts` reindirizza già alla prima tela).
   *
   * La cromatura del canvas (rail, top bar, chat, fogli) monta SOLO sopra la rotta della tela
   * (`/c/[canvasId]`): le altre rotte (Assets, Brands, Ads, Settings) restano pagine intere — è
   * così che rispondono a un link diretto, un refresh o uno schermo mobile, e su desktop il rail
   * apre le stesse pagine come pannello o foglio invece di navigarci sopra.
   */
  import '$lib/styles/tailwind.css';
  import { page } from '$app/state';
  import { onDestroy } from 'svelte';
  import CanvasTopBar from '$lib/components/canvas/CanvasTopBar.svelte';
  import FloatingRail from '$lib/components/canvas/FloatingRail.svelte';
  import CanvasLeftPanel from '$lib/components/canvas/CanvasLeftPanel.svelte';
  import CanvasChatPanel from '$lib/components/canvas/CanvasChatPanel.svelte';
  import CanvasSheet from '$lib/components/canvas/CanvasSheet.svelte';
  import CanvasMobileTabs from '$lib/components/canvas/CanvasMobileTabs.svelte';
  import CanvasMobileMore from '$lib/components/canvas/CanvasMobileMore.svelte';
  import { openSheet } from '$lib/canvas/sheet-nav';
  import { sheetEntryForPath, type NavEntry } from '$lib/shell-nav';
  import { readChatOpen, writeChatOpen } from '$lib/shell-prefs';
  import { browser } from '$app/environment';

  let { data, children } = $props();

  const CANVAS_ROUTE_ID = '/p/[projectId]/c/[canvasId]';
  const onCanvasRoute = $derived(page.route.id === CANVAS_ROUTE_ID);

  const projectId = $derived(data.project.id);
  const canvasId = $derived(page.params.canvasId ?? '');
  const currentCanvas = $derived(data.canvases.find((c: { id: string }) => c.id === canvasId));
  const activeSheetId = $derived(page.state.sheet ? sheetEntryForPath(page.state.sheet.path)?.id ?? null : null);

  let leftPanel = $state<'assets' | 'brands' | null>(null);
  let chatOpen = $state(browser ? readChatOpen() : true);
  let mobileMoreOpen = $state(false);
  let mobileView = $state<'canvas' | 'chat'>('canvas');

  const MOBILE_QUERY = '(max-width: 767px)';
  let isMobile = $state(browser ? matchMedia(MOBILE_QUERY).matches : false);
  if (browser) {
    const mql = matchMedia(MOBILE_QUERY);
    const onChange = () => (isMobile = mql.matches);
    mql.addEventListener('change', onChange);
    onDestroy(() => mql.removeEventListener('change', onChange));
  }

  function toggleChat() {
    chatOpen = !chatOpen;
    writeChatOpen(chatOpen);
  }

  function onRailPanel(entry: NavEntry) {
    leftPanel = leftPanel === entry.id ? null : (entry.id as 'assets' | 'brands');
  }

  function onRailSheet(entry: NavEntry) {
    void openSheet(projectId, entry.path);
  }

  function onMobileTab(tab: { id: string }) {
    if (tab.id === 'canvas' || tab.id === 'chat') {
      mobileView = tab.id;
      return;
    }
    if (tab.id === 'more') {
      mobileMoreOpen = true;
    }
  }
</script>

<div class="project-shell">
  {#if onCanvasRoute && !isMobile}
    <CanvasTopBar
      projectName={data.project.name}
      projects={data.projects.map((p: { id: string; name: string; href: string }) => ({ id: p.id, name: p.name, href: p.href }))}
      canvasName={currentCanvas?.name ?? ''}
      canvases={data.canvases}
      {chatOpen}
      onToggleChat={toggleChat}
    />

    <div class="canvas-row">
      <div class="canvas-stage">
        {@render children()}
        <FloatingRail
          activePanel={leftPanel}
          activeSheet={activeSheetId}
          onPanel={onRailPanel}
          onSheet={onRailSheet}
        />
        {#if leftPanel}
          <CanvasLeftPanel
            {projectId}
            kind={leftPanel}
            labelKey={leftPanel === 'assets' ? 'app.nav2.materials' : 'app.nav2.brands'}
            onclose={() => (leftPanel = null)}
          />
        {/if}
        <CanvasSheet {projectId} />
      </div>

      <CanvasChatPanel {projectId} brandSlug={data.brand?.slug ?? ''} open={chatOpen} />
    </div>
  {:else if onCanvasRoute && isMobile}
    <div class="mobile-canvas">
      <div class="mobile-view" class:is-hidden={mobileView !== 'canvas'}>
        {@render children()}
      </div>
      {#if mobileView === 'chat'}
        <div class="mobile-chat">
          <CanvasChatPanel {projectId} brandSlug={data.brand?.slug ?? ''} open={true} />
        </div>
      {/if}
    </div>
    <CanvasMobileTabs {projectId} active={mobileView} onselect={onMobileTab} />
    <CanvasMobileMore {projectId} open={mobileMoreOpen} onOpenChange={(open) => (mobileMoreOpen = open)} />
  {:else}
    {@render children()}
  {/if}
</div>

<style>
  .project-shell {
    height: 100dvh;
    display: flex;
    flex-direction: column;
    background: var(--paper-2, #f9f9f9);
  }

  .canvas-row {
    flex: 1 1 auto;
    min-height: 0;
    display: flex;
  }

  .canvas-stage {
    position: relative;
    flex: 1 1 auto;
    min-width: 0;
    min-height: 0;
    overflow: hidden;
  }

  .mobile-canvas {
    flex: 1 1 auto;
    min-height: 0;
    position: relative;
  }
  .mobile-view {
    height: 100%;
  }
  .mobile-view.is-hidden {
    display: none;
  }
  .mobile-chat {
    position: absolute;
    inset: 0;
  }
</style>
