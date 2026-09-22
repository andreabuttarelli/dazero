<script lang="ts">
  // Stessa cornice di `/app/[brand]`: Tailwind + shadcn, sidebar fissa, area contenuto.
  // Il tenant nell'URL è il PROGETTO, non il brand — che resta una proprietà del progetto.
  import '$lib/styles/tailwind.css';
  import * as Sidebar from '$lib/components/ui/sidebar/index.js';
  import DashboardSidebar, {
    type NavGroup,
    type SwitcherBrand
  } from '$lib/components/DashboardSidebar.svelte';
  import { page } from '$app/stores';
  import { _ } from 'svelte-i18n';
  import House from '@lucide/svelte/icons/house';
  import Images from '@lucide/svelte/icons/images';
  import CalendarDays from '@lucide/svelte/icons/calendar-days';
  import Palette from '@lucide/svelte/icons/palette';
  import Send from '@lucide/svelte/icons/send';
  import Megaphone from '@lucide/svelte/icons/megaphone';
  import Library from '@lucide/svelte/icons/library';
  import Frame from '@lucide/svelte/icons/frame';
  import Building from '@lucide/svelte/icons/building';
  import { NAV_SECTION, NAV_TEAM_SPACES, NAV_OFF_SIDEBAR, type NavIconId } from '$lib/workbench-paths';
  import { SHELL_LAYOUT, readSidebarPanePx, writeSidebarPanePx } from '$lib/shell-prefs';
  import { browser } from '$app/environment';

  let { data, children } = $props();

  const base = $derived(`/p/${data.project.id}`);
  const path = $derived($page.url.pathname);
  const brandSlug = $derived(data.brand?.slug ?? '');
  const brandName = $derived(data.project.name);
  const settingsHref = `${base}/settings`;

  const userInitials = $derived(
    (data.profile.name ?? data.profile.email ?? '?')
      .split(/\s+/)
      .filter(Boolean)
      .slice(0, 2)
      .map((w: string) => w[0])
      .join('')
      .toUpperCase() || '?'
  );

  const PAGE_ICONS: Record<NavIconId, unknown> = {
    home: House,
    images: Images,
    calendar: CalendarDays,
    palette: Palette,
    send: Send,
    megaphone: Megaphone,
    library: Library,
    building: Building
  };

  function navTeamHref(teamPath: string) {
    const segment = teamPath.replace(/^\//, '');
    return segment ? `${base}/${segment}` : base;
  }

  /**
   * DUE REGIONI, DUE DOMANNE.
   *
   * Tele sono dove si lavora: oggetti che si aprono. Pagine sono il resto del progetto.
   * `section: true` è obbligatorio — senza, la label diventa un hub a una riga e le voci spariscono.
   */
  function navGroups(): NavGroup[] {
    const boards: NavGroup = {
      label: NAV_SECTION.boards,
      section: true,
      scroll: true,
      emptyLabel: NAV_SECTION.boardsEmpty,
      items: data.canvases.map((c: { id: string; name: string; href: string }) => ({
        href: c.href,
        label: c.name,
        icon: Frame,
        kind: 'board' as const,
        active: path === c.href
      }))
    };

    const pageItems = [...NAV_TEAM_SPACES, ...NAV_OFF_SIDEBAR].map((t) => {
      const href = navTeamHref(t.path);
      return {
        href,
        label: $_(t.labelKey),
        icon: PAGE_ICONS[t.icon],
        active: path === href || (href !== base && path.startsWith(`${href}/`)),
        key: t.path || 'home'
      };
    });

    return [boards, { label: NAV_SECTION.pages, section: true, items: pageItems }];
  }

  const groups = $derived(navGroups());

  /** Lo switcher è sul PROGETTO: un progetto è un insieme di tele con le sue pagine. */
  const switcherBrands = $derived<SwitcherBrand[]>(
    data.projects.map((p: { id: string; name: string; slug: string; href: string; active: boolean }) => ({
      id: p.id,
      name: p.name,
      slug: p.slug,
      logoUrl: null,
      href: p.href
    }))
  );

  let sidebarPanePx = $state(browser ? readSidebarPanePx() : SHELL_LAYOUT.SIDEBAR_W_DEFAULT);
  function clampSidebarW(px: number) {
    return Math.min(SHELL_LAYOUT.SIDEBAR_W_MAX, Math.max(SHELL_LAYOUT.SIDEBAR_W_MIN, Math.round(px)));
  }
  function onSidebarResizeStart(e: PointerEvent) {
    e.preventDefault();
    const startX = e.clientX;
    const startW = sidebarPanePx;
    const target = e.currentTarget as HTMLElement;
    target.setPointerCapture(e.pointerId);
    const onMove = (ev: PointerEvent) => {
      sidebarPanePx = clampSidebarW(startW + (ev.clientX - startX));
    };
    const onUp = (ev: PointerEvent) => {
      target.releasePointerCapture(e.pointerId);
      target.removeEventListener('pointermove', onMove);
      target.removeEventListener('pointerup', onUp);
      target.removeEventListener('pointercancel', onUp);
      writeSidebarPanePx(sidebarPanePx);
    };
    target.addEventListener('pointermove', onMove);
    target.addEventListener('pointerup', onUp);
    target.addEventListener('pointercancel', onUp);
  }
</script>

<div class="page">
  <Sidebar.Provider
    style={`--sidebar-width: ${sidebarPanePx}px; --sidebar-width-icon: 3.25rem;`}
  >
    <DashboardSidebar
      {brandName}
      brandWebsite={data.brand?.website ?? data.project.slug}
      brandInitials={(brandName ?? '?').slice(0, 2).toUpperCase()}
      brandHref={base}
      navGroups={groups}
      {settingsHref}
      settingsLabel={$_('app.nav.settings')}
      userName={data.profile.name ?? data.profile.email}
      userEmail={data.profile.email}
      userAvatarUrl={data.profile.avatarUrl ?? ''}
      {userInitials}
      brandPlan={''}
      signOutLabel={$_('app.account.signOut')}
      {brandSlug}
      projectId={data.project.id}
      {switcherBrands}
    />
    <div
      class="sidebar-split-handle"
      role="separator"
      aria-orientation="vertical"
      aria-label={$_('app.shell.resizeSidebar')}
      tabindex="0"
      onpointerdown={onSidebarResizeStart}
    ></div>

    <Sidebar.Inset class="bg-[var(--paper-2)] border-0">
      <div class="main">
        <div class="wb-frame">
          <div class="content-shell">
            {@render children()}
          </div>
        </div>
      </div>
    </Sidebar.Inset>
  </Sidebar.Provider>
</div>

<style>
  .page {
    background: var(--paper-2);
    min-height: 100dvh;
  }
  .sidebar-split-handle {
    display: none;
    position: fixed;
    top: 0;
    bottom: 0;
    left: var(--sidebar-width);
    width: 5px;
    margin-left: -2px;
    z-index: 30;
    cursor: col-resize;
    touch-action: none;
    background: transparent;
  }
  @media (min-width: 1024px) {
    .sidebar-split-handle {
      display: block;
    }
  }
  .main {
    height: 100dvh;
    margin: 0;
    display: flex;
    flex-direction: column;
    background: var(--paper);
    overflow: hidden;
    border: 0;
    min-width: 0;
  }
  .wb-frame {
    min-width: 0;
    flex: 1 1 auto;
    min-height: 0;
    overflow: hidden;
    position: relative;
    display: flex;
    flex-direction: column;
  }
  .content-shell {
    width: 100%;
    max-width: none;
    margin-inline: 0;
    padding: 0;
    box-sizing: border-box;
    flex: 1 1 auto;
    min-height: 0;
    display: flex;
    flex-direction: column;
  }
</style>
