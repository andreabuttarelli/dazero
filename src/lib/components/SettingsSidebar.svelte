<script lang="ts">
  import * as Sidebar from '$lib/components/ui/sidebar/index.js';
  import * as Collapsible from '$lib/components/ui/collapsible/index.js';
  import { cn } from '$lib/utils.js';
  import { _ } from 'svelte-i18n';
  import { page } from '$app/stores';
  import { goto, invalidateAll, beforeNavigate } from '$app/navigation';
  import { untrack } from 'svelte';
  import {
    ArrowLeft,
    ChevronDown,
    CircleUserRound,
    CreditCard,
    Fingerprint,
    KeyRound,
    Link2,
    Moon,
    BookOpen,
    Package,
    Palette,
    SlidersHorizontal,
    Sun,
    Trash2,
    Users,
    Megaphone,
    Gift,
    LogIn,
  } from '@lucide/svelte';
  import { useSidebar } from '$lib/components/ui/sidebar/context.svelte.js';
  import { materialPress } from '$lib/actions/material-press.js';
  import { SETTINGS_BRAND_SECTIONS } from '$lib/components/settings/platforms';

  let {
    brandName = 'Brand',
    brandInitials = 'BR',
    logoUrl = '',
    brandHref = '/app',
    settingsBase = '/app/settings',
    forceOpenMobile = false,
  }: {
    brandName?: string;
    brandInitials?: string;
    logoUrl?: string;
    brandHref?: string;
    settingsBase?: string;
    /** Mobile settings map: render as a full-width page (not a sheet overlay). */
    forceOpenMobile?: boolean;
  } = $props();

  const sidebar = useSidebar();
  const path = $derived($page.url.pathname);
  /** Global FEATURE_ADS kill switch, from app/[brand]/+layout.server.ts. */
  const adsOn = $derived(!!$page.data.flags?.ads);
  /** Full-page map instead of the closed/open Sheet dance. */
  const asMobileMap = $derived(sidebar.isMobile && forceOpenMobile);

  // Close the mobile sheet as soon as navigation starts — not after the new page
  // finishes loading — so the drawer doesn't sit over the loading screen.
  beforeNavigate(() => {
    if (sidebar.isMobile && sidebar.openMobile && !forceOpenMobile) sidebar.setOpenMobile(false);
  });

  type SettingsNavItem = {
    href: string;
    label: string;
    icon: typeof Link2;
    id: string;
  };

  type SettingsNavSection = {
    id: string;
    label: string;
    items: SettingsNavItem[];
    collapsible?: boolean;
    icon?: typeof Link2;
  };

  const brandItems = $derived<SettingsNavItem[]>([
    {
      id: 'brand',
      href: `${settingsBase}/brand`,
      label: $_('app.studio.tabs.brand'),
      icon: Palette,
    },
    {
      id: 'products',
      href: `${settingsBase}/products`,
      label: $_('app.hub.overview.brand.products'),
      icon: Package,
    },
    {
      id: 'people',
      href: `${settingsBase}/people`,
      label: $_('app.studio.tabs.people'),
      icon: Users,
    },
    {
      id: 'library',
      href: `${settingsBase}/library`,
      label: $_('app.hub.web.library'),
      icon: BookOpen,
    },
    {
      id: 'demo-account',
      href: `${settingsBase}/demo-account`,
      label: $_('app.settings.demoAccount.nav'),
      icon: LogIn,
    },
  ]);

  const adsItems = $derived<SettingsNavItem[]>([
    {
      id: 'ads-accounts',
      href: `${settingsBase}/ads/accounts`,
      label: $_('app.settings.ads.accountsNav'),
      icon: Link2,
    },
    {
      id: 'ads',
      href: `${settingsBase}/ads`,
      label: $_('app.settings.ads.budgetNav'),
      icon: SlidersHorizontal,
    },
  ]);

  const sections = $derived<SettingsNavSection[]>([
    {
      id: 'brand',
      label: $_('app.nav.sectionBrand'),
      collapsible: true,
      icon: Fingerprint,
      items: brandItems,
    },
    ...(adsOn
      ? [
          {
            id: 'ads',
            label: $_('app.settings.ads.nav'),
            collapsible: true,
            icon: Megaphone,
            items: adsItems,
          } satisfies SettingsNavSection,
        ]
      : []),
    {
      id: 'publishing',
      label: $_('app.nav.sectionPublishing'),
      items: [
        {
          id: 'connected-accounts',
          href: `${settingsBase}/connected-accounts`,
          label: $_('app.settings.connectedAccounts'),
          icon: Link2,
        },
      ],
    },
    {
      id: 'workspace',
      label: $_('app.nav.workspace'),
      items: [
        {
          id: 'api-keys',
          href: `${settingsBase}/api-keys`,
          label: $_('app.settings.apiKeys.title'),
          icon: KeyRound,
        },
        {
          id: 'team',
          href: `${settingsBase}/team`,
          label: $_('app.settings.team.title'),
          icon: Users,
        },
      ],
    },
    {
      id: 'account',
      label: $_('app.nav.sectionAccount'),
      items: [
        {
          id: 'profile',
          href: `${settingsBase}/profile`,
          label: $_('app.settings.profile.title'),
          icon: CircleUserRound,
        },
        {
          id: 'appearance',
          href: `${settingsBase}/appearance`,
          label: $_('app.settings.appearance.title'),
          icon: Sun,
        },
        {
          id: 'billing',
          href: `${settingsBase}/billing`,
          label: $_('app.settings.billing.title'),
          icon: CreditCard,
        },
        {
          id: 'referrals',
          href: `${settingsBase}/referrals`,
          label: $_('app.settings.referrals.title'),
          icon: Gift,
        },
        {
          id: 'danger',
          href: `${settingsBase}/danger`,
          label: $_('app.settings.del.title'),
          icon: Trash2,
        },
      ],
    },
  ]);

  function isItemActive(item: SettingsNavItem) {
    if (path.includes('/facebook') || path.includes('/linkedin') || path.includes('/connect/')) {
      return item.id === 'connected-accounts';
    }
    const normalized = path.replace(/\/$/, '');
    const itemPath = item.href.replace(/\/$/, '');
    // Exact href match — avoids /settings/ads lighting up for /settings/ads/accounts.
    return normalized === itemPath;
  }

  const brandSectionActive = $derived(
    (SETTINGS_BRAND_SECTIONS as readonly string[]).some((s) =>
      path.replace(/\/$/, '').endsWith(`/settings/${s}`)
    ) ||
      path.replace(/\/$/, '').endsWith('/settings/library') ||
      path.replace(/\/$/, '').endsWith('/settings/demo-account')
  );
  const adsSectionActive = $derived(
    /\/settings\/ads(\/|$)/.test(path.replace(/\/$/, ''))
  );

  function sectionHasActive(section: SettingsNavSection) {
    if (section.id === 'brand') return brandSectionActive;
    if (section.id === 'ads') return adsSectionActive;
    return section.items.some((i) => isItemActive(i));
  }

  function itemActiveClass(active: boolean, large = false) {
    if (active) {
      return large
        ? 'bg-transparent font-semibold active:bg-[var(--paper)]'
        : 'bg-transparent font-semibold hover:bg-black/[0.04] dark:hover:bg-white/[0.06] active:bg-[var(--paper)]';
    }
    return large
      ? 'active:bg-[var(--paper)] hover:bg-black/[0.04] dark:hover:bg-white/[0.06]'
      : 'hover:bg-black/[0.04] dark:hover:bg-white/[0.06] active:bg-[var(--paper)]';
  }

  let openSections = $state<Record<string, boolean>>({ brand: true, ads: true });
  // Auto-open Brand/Ads when a child route is active. Must untrack openSections —
  // spreading it while writing a new object re-triggers the effect forever
  // (effect_update_depth_exceeded), which kills the settings shell + mobile drawer
  // on pages like /settings/products.
  $effect(() => {
    if (!brandSectionActive) return;
    if (untrack(() => openSections.brand)) return;
    openSections = { ...untrack(() => openSections), brand: true };
  });
  $effect(() => {
    if (!adsSectionActive) return;
    if (untrack(() => openSections.ads)) return;
    openSections = { ...untrack(() => openSections), ads: true };
  });
  const isSectionOpen = (id: string) => openSections[id] !== false;
  const setSectionOpen = (id: string, open: boolean) => {
    openSections = { ...openSections, [id]: open };
  };

  let theme = $state<'light' | 'dark'>('light');
  $effect(() => {
    if (typeof window === 'undefined') return;
    const read = () =>
      (document.documentElement.getAttribute('data-theme') as 'light' | 'dark') ?? 'light';
    theme = read();
    const obs = new MutationObserver(() => (theme = read()));
    obs.observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme'] });
    return () => obs.disconnect();
  });

  function toggleTheme() {
    const next = theme === 'light' ? 'dark' : 'light';
    document.documentElement.setAttribute('data-theme', next);
    localStorage.setItem('theme', next);
    theme = next;
  }

</script>

{#snippet brandHead()}
  <a
    href={brandHref}
    class="flex h-full w-full items-center gap-2.5 px-1.5 text-sidebar-foreground no-underline transition-colors hover:bg-sidebar-accent active:bg-[var(--paper)] touch-manipulation cursor-pointer"
  >
    <ArrowLeft class="size-3.5 shrink-0 text-muted-foreground" strokeWidth={1.8} />
    <div
      class="flex aspect-square size-7 shrink-0 items-center justify-center overflow-hidden bg-sidebar-primary text-sidebar-primary-foreground"
    >
      {#if logoUrl}
        <img
          src={logoUrl}
          alt=""
          class="size-7 object-cover"
          loading="lazy"
          onerror={(e) => e.currentTarget.remove()}
        />
      {:else}
        <span class="text-[9px] font-bold">{brandInitials}</span>
      {/if}
    </div>
    <div class="min-w-0 flex-1">
      <span class="block truncate text-[13px] font-semibold leading-tight">{brandName}</span>
      <span class="block truncate text-[11px] text-muted-foreground leading-tight"
        >{$_('app.nav.settings')}</span
      >
    </div>
  </a>
{/snippet}

{#snippet navSections(large = false)}
  {#each sections as section, si (section.id)}
    {#if si > 0}
      <div class={cn('my-3 h-px bg-sidebar-border', large ? 'mx-1' : 'mx-0.5')}></div>
    {/if}
    {#if section.collapsible}
      {@const hasActive = sectionHasActive(section)}
      {@const open = isSectionOpen(section.id)}
      {@const SectionIcon = section.icon ?? Fingerprint}
      <div class={cn(large ? 'px-1' : 'px-0')}>
        <button
          type="button"
          class={cn(
            'flex w-full items-center gap-2 text-left text-sidebar-foreground transition-colors touch-manipulation cursor-pointer',
            large ? 'h-12 px-2.5 text-[16px] font-semibold' : 'h-8 px-1.5 text-[12.5px] font-medium',
            hasActive ? 'font-semibold' : 'hover:bg-black/[0.04] dark:hover:bg-white/[0.06]'
          )}
          style={hasActive ? 'color: var(--accent)' : undefined}
          onclick={() => setSectionOpen(section.id, !open)}
          aria-expanded={open}
        >
          <SectionIcon class={large ? 'size-5' : 'size-3.5'} strokeWidth={1.7} />
          <span class="flex-1">{section.label}</span>
          <ChevronDown
            class={cn(
              large ? 'size-5' : 'size-3.5',
              'text-sidebar-foreground/40 transition-transform',
              open && 'rotate-180'
            )}
          />
        </button>
        {#if open}
          <nav
            class={cn(
              'mt-0.5 flex flex-col border-l border-sidebar-border',
              large ? 'ml-4 gap-1 pl-2' : 'ml-[14px] gap-0.5 pl-1.5'
            )}
          >
            {#each section.items as item (item.id)}
              {@const Icon = item.icon}
              {@const active = isItemActive(item)}
              <a
                href={item.href}
                class={cn(
                  'flex items-center gap-2.5 px-3 text-sidebar-foreground no-underline transition-colors touch-manipulation cursor-pointer',
                  large ? 'h-11 text-[15px]' : 'h-8 text-[12.5px]',
                  itemActiveClass(active, large)
                )}
                style={active ? 'color: var(--accent)' : undefined}
              >
                <Icon class={large ? 'size-4.5' : 'size-3.5'} strokeWidth={1.7} />
                <span>{item.label}</span>
              </a>
            {/each}
          </nav>
        {/if}
      </div>
    {:else}
      <div class={cn(large ? 'mb-1 px-2.5' : 'mb-1 px-1.5')}>
        <span
          class={cn(
            'font-medium uppercase tracking-wider text-muted-foreground/70',
            large ? 'text-[12px]' : 'text-[9.5px]'
          )}>{section.label}</span
        >
      </div>
      <nav class={cn('flex flex-col', large ? 'gap-1' : 'gap-0.5')}>
        {#each section.items as item (item.id)}
          {@const Icon = item.icon}
          {@const active = isItemActive(item)}
          <a
            href={item.href}
            class={cn(
              'flex items-center gap-2.5 px-3 text-sidebar-foreground no-underline transition-colors touch-manipulation cursor-pointer',
              large ? 'h-12 text-[16px]' : 'h-8 text-[12.5px]',
              itemActiveClass(active, large)
            )}
            style={active ? 'color: var(--accent)' : undefined}
          >
            <Icon class={large ? 'size-5' : 'size-3.5'} strokeWidth={1.7} />
            <span>{item.label}</span>
          </a>
        {/each}
      </nav>
    {/if}
  {/each}
{/snippet}

{#snippet foot(large = false)}
  <button
    type="button"
    class={cn(
      'flex w-full items-center gap-2 px-2.5 text-left text-sidebar-foreground transition-colors hover:bg-sidebar-accent active:bg-[var(--paper)] touch-manipulation cursor-pointer',
      large ? 'h-12 text-[15px]' : 'py-2 text-[12.5px]'
    )}
    onclick={toggleTheme}
  >
    {#if theme === 'dark'}
      <Sun class="size-3.5 shrink-0" strokeWidth={1.7} />
    {:else}
      <Moon class="size-3.5 shrink-0" strokeWidth={1.7} />
    {/if}
    <span>{theme === 'dark' ? $_('app.account.lightMode') : $_('app.account.darkMode')}</span>
  </button>

{/snippet}

{#if asMobileMap}
  <div class="settings-mobile-map" use:materialPress>
    <header class="settings-mobile-map-head">
      {@render brandHead()}
    </header>
    <div class="settings-mobile-map-body">
      {@render navSections(true)}
    </div>
    <footer class="settings-mobile-map-foot">
      {@render foot(true)}
    </footer>
  </div>
{:else}
  <Sidebar.Root collapsible="icon">
    <Sidebar.Header class="shell-top-header gap-0 border-b border-sidebar-border px-3 group-data-[collapsible=icon]:px-2">
      {@render brandHead()}
    </Sidebar.Header>

    <Sidebar.Content class="flex-1 gap-0 px-2.5 py-3 group-data-[collapsible=icon]:px-2 group-data-[collapsible=icon]:py-2.5">
      {#each sections as section, si (section.id)}
        {#if si > 0}
          <Sidebar.Separator class="mx-0 my-3" />
        {/if}
        {#if section.collapsible}
          {@const hasActive = sectionHasActive(section)}
          {@const SectionIcon = section.icon ?? Fingerprint}
          <Collapsible.Root
            class="group/collapsible"
            open={isSectionOpen(section.id)}
            onOpenChange={(v) => {
              setSectionOpen(section.id, v);
            }}
          >
            <Sidebar.Group class="p-0">
              <Sidebar.Menu class="gap-0.5">
                <Sidebar.MenuItem>
                  <Collapsible.Trigger>
                    {#snippet child({ props })}
                      <Sidebar.MenuButton
                        {...props}
                        size="sm"
                        isActive={hasActive}
                        class={cn(
                          hasActive
                            ? 'bg-transparent font-semibold hover:bg-black/[0.04] dark:hover:bg-white/[0.06] active:bg-[var(--paper)]'
                            : 'font-medium hover:bg-black/[0.04] dark:hover:bg-white/[0.06] active:bg-[var(--paper)]'
                        )}
                        style={hasActive ? 'color: var(--accent)' : undefined}
                      >
                        <SectionIcon class="size-3.5" strokeWidth={1.7} />
                        <span class="flex-1 text-[12.5px]">{section.label}</span>
                        <ChevronDown
                          class="size-3.5 text-sidebar-foreground/40 transition-transform group-data-[state=open]/collapsible:rotate-180"
                        />
                      </Sidebar.MenuButton>
                    {/snippet}
                  </Collapsible.Trigger>
                  <Collapsible.Content>
                    <div class="mt-0.5 ml-[14px] border-l border-sidebar-border pl-1.5">
                      <Sidebar.Menu class="gap-0.5">
                        {#each section.items as item (item.id)}
                          {@const Icon = item.icon}
                          {@const active = isItemActive(item)}
                          <Sidebar.MenuItem>
                            <Sidebar.MenuButton
                              isActive={active}
                              tooltipContent={item.label}
                              class={cn(
                                'h-8 text-[12.5px]',
                                active
                                  ? 'bg-transparent font-semibold hover:bg-black/[0.04] dark:hover:bg-white/[0.06] active:bg-[var(--paper)]'
                                  : 'hover:bg-black/[0.04] dark:hover:bg-white/[0.06] active:bg-[var(--paper)]'
                              )}
                              style={active ? 'color: var(--accent)' : undefined}
                            >
                              {#snippet child({ props })}
                                <a href={item.href} {...props}>
                                  <Icon class="size-3.5" strokeWidth={1.7} />
                                  <span>{item.label}</span>
                                </a>
                              {/snippet}
                            </Sidebar.MenuButton>
                          </Sidebar.MenuItem>
                        {/each}
                      </Sidebar.Menu>
                    </div>
                  </Collapsible.Content>
                </Sidebar.MenuItem>
              </Sidebar.Menu>
            </Sidebar.Group>
          </Collapsible.Root>
        {:else}
          <Sidebar.Group class="p-0">
            <Sidebar.GroupLabel
              class="mb-1.5 h-auto! px-1.5 py-0 text-[9.5px] font-semibold uppercase tracking-wider text-muted-foreground/70"
            >
              {section.label}
            </Sidebar.GroupLabel>
            <Sidebar.Menu class="gap-0.5">
              {#each section.items as item (item.id)}
                {@const Icon = item.icon}
                {@const active = isItemActive(item)}
                <Sidebar.MenuItem>
                  <Sidebar.MenuButton
                    isActive={active}
                    tooltipContent={item.label}
                    class={cn(
                      'h-8 text-[12.5px]',
                      active
                        ? 'bg-transparent font-semibold hover:bg-black/[0.04] dark:hover:bg-white/[0.06] active:bg-[var(--paper)]'
                        : 'hover:bg-black/[0.04] dark:hover:bg-white/[0.06] active:bg-[var(--paper)]'
                    )}
                    style={active ? 'color: var(--accent)' : undefined}
                  >
                    {#snippet child({ props })}
                      <a href={item.href} {...props}>
                        <Icon class="size-3.5" strokeWidth={1.7} />
                        <span>{item.label}</span>
                      </a>
                    {/snippet}
                  </Sidebar.MenuButton>
                </Sidebar.MenuItem>
              {/each}
            </Sidebar.Menu>
          </Sidebar.Group>
        {/if}
      {/each}
    </Sidebar.Content>

    <Sidebar.Footer class="mt-auto gap-1 border-t border-sidebar-border px-2.5 py-3 group-data-[collapsible=icon]:px-2 group-data-[collapsible=icon]:py-2.5">
      {@render foot(false)}
    </Sidebar.Footer>
  </Sidebar.Root>
{/if}

<style>
  .settings-mobile-map {
    display: flex;
    flex-direction: column;
    width: 100%;
    min-height: 100dvh;
    background: var(--sidebar-bg, var(--paper-2, var(--sidebar, #f5f5f7)));
    color: var(--sidebar-foreground, var(--ink));
    padding: 24px 22px 32px;
    box-sizing: border-box;
  }
  .settings-mobile-map-head {
    flex-shrink: 0;
    margin-bottom: 8px;
    padding-bottom: 16px;
    border-bottom: 1px solid var(--sidebar-line, var(--line, var(--sidebar-border)));
  }
  .settings-mobile-map-body {
    flex: 1;
    min-height: 0;
    overflow-y: auto;
    padding-top: 16px;
  }
  .settings-mobile-map-foot {
    flex-shrink: 0;
    margin-top: 20px;
    padding-top: 16px;
    border-top: 1px solid var(--sidebar-line, var(--line, var(--sidebar-border)));
    display: flex;
    flex-direction: column;
    gap: 4px;
  }
</style>
