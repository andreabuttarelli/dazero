<script lang="ts">
  import {
    siAnthropic,
    siGoogle,
    siBytedance,
    siQwen,
    siMistralai,
    siPerplexity,
    siDeepseek,
    type SimpleIcon
  } from 'simple-icons';

  let { provider }: { provider: string } = $props();

  const ICON: Record<string, SimpleIcon> = {
    anthropic: siAnthropic,
    google: siGoogle,
    bytedance: siBytedance,
    'bytedance-seed': siBytedance,
    qwen: siQwen,
    mistralai: siMistralai,
    perplexity: siPerplexity,
    deepseek: siDeepseek
  };

  const icon = $derived(ICON[provider]);
  const letter = $derived(provider.charAt(0).toUpperCase());
</script>

{#if icon}
  <svg class="provider-icon" viewBox="0 0 24 24" width="12" height="12" fill={`#${icon.hex}`} aria-hidden="true">
    <path d={icon.path} />
  </svg>
{:else}
  <span class="provider-letter" aria-hidden="true">{letter}</span>
{/if}

<style>
  .provider-icon {
    flex: none;
    display: block;
  }

  .provider-letter {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    flex: none;
    width: 12px;
    height: 12px;
    font-size: 8px;
    line-height: 1;
    font-weight: 600;
    color: var(--paper, #fff);
    background: var(--ink-soft, #6e6e73);
    border-radius: 0;
  }
</style>
