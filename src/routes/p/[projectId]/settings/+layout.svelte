<script lang="ts">
  import { onMount } from 'svelte';
  import { page } from '$app/stores';
  import { goto } from '$app/navigation';
  import {
    SETTINGS_BRAND_SECTIONS,
    SETTINGS_SECTIONS
  } from '$lib/components/settings/platforms';
  import PageHead from '$lib/components/PageHead.svelte';
  import { _ } from 'svelte-i18n';
  // Stili condivisi con /app/billing, che monta le stesse primitive fuori da questo layout.
  import '$lib/styles/settings-shell.css';

  let { data, children } = $props();
  const settingsBase = $derived(`/p/${data.project.id}/settings`);
  const path = $derived($page.url.pathname);
  /** OAuth intermediate pages keep their own full-page UI. */
  const isOauthFlow = $derived(
    path.includes('/settings/facebook') ||
      path.includes('/settings/linkedin') ||
      path.includes('/settings/connect/')
  );

  const isBrandKit = $derived(
    (SETTINGS_BRAND_SECTIONS as readonly string[]).some((s) =>
      path.replace(/\/$/, '').endsWith(`/settings/${s}`)
    )
  );

  type SettingsHead = { title: string; subtitle?: string };

  const head = $derived.by((): SettingsHead => {
    const p = path.replace(/\/$/, '');
    const base = `/p/${data.project.id}/settings`;
    const map: Record<string, SettingsHead> = {
      [`${base}/brand`]: {
        title: $_('app.studio.tabs.brand')
      },
      [`${base}/products`]: {
        title: $_('app.studio.tabs.productsTitle')
      },
      [`${base}/connected-accounts`]: {
        title: $_('app.settings.connectedAccounts')
      },
      [`${base}/ads`]: {
        title: $_('app.settings.ads.capsTitle')
      },
      [`${base}/ads/accounts`]: {
        title: $_('app.settings.ads.accountsTitle')
      },
      [`${base}/api-keys`]: {
        title: $_('app.settings.apiKeys.title')
      },
      [`${base}/team`]: {
        title: $_('app.settings.team.title')
      },
      [`${base}/profile`]: {
        title: $_('app.settings.profile.title')
      },
      [`${base}/appearance`]: {
        title: $_('app.settings.appearance.title')
      },
      [`${base}/billing`]: {
        title: $_('app.settings.billing.title')
      },
      [`${base}/danger`]: {
        title: $_('app.settings.del.title')
      }
    };
    return map[p] ?? { title: $_('app.nav.settings') };
  });

  // Legacy `#section` bookmarks → path-based pages (hash can survive the root redirect).
  onMount(() => {
    if (isOauthFlow) return;
    const hash = $page.url.hash.replace(/^#/, '');
    if (!hash || !(SETTINGS_SECTIONS as readonly string[]).includes(hash)) return;
    const p = path.replace(/\/$/, '');
    if (p.endsWith(`/${hash}`)) return;
    goto(`${settingsBase}/${hash}${$page.url.search}`, { replaceState: true });
  });
</script>

{#if isOauthFlow}
  {@render children()}
{:else}
  <div class="content settings-shell" class:brand-kit={isBrandKit}>
    <PageHead title={head.title} subtitle={head.subtitle ?? null} />
    <div class="settings">
      {@render children()}
    </div>
  </div>
{/if}

<style>
  .page-section {
    margin: 0 0 4px;
    font-size: 11px;
    font-weight: 700;
    letter-spacing: 0.04em;
    text-transform: uppercase;
    color: var(--ink-soft, #6e6e73);
  }
  .page-sub {
    margin: 6px 0 0;
    max-width: 42rem;
  }

  form { margin: 0; }
</style>
