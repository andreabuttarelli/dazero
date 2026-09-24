<script lang="ts">
  import Type from '@lucide/svelte/icons/type';
  import ImageIcon from '@lucide/svelte/icons/image';
  import Video from '@lucide/svelte/icons/video';
  import AudioLines from '@lucide/svelte/icons/audio-lines';
  import FileText from '@lucide/svelte/icons/file-text';
  import { modalityBadges } from '$lib/canvas/connectors';

  let { inputModalities = [] }: { inputModalities?: string[] } = $props();

  const ICON: Record<string, typeof Type> = {
    type: Type,
    image: ImageIcon,
    video: Video,
    'audio-lines': AudioLines,
    'file-text': FileText
  };

  const badges = $derived(modalityBadges(inputModalities));
</script>

{#if badges.length}
  <span class="modality-icons">
    {#each badges as badge (badge.modality)}
      {@const Icon = ICON[badge.icon]}
      <span class="modality-icon" style={`color:${badge.color}`} title={badge.label} aria-label={badge.label}>
        <Icon size={11} strokeWidth={1.8} />
      </span>
    {/each}
  </span>
{/if}

<style>
  .modality-icons {
    display: inline-flex;
    align-items: center;
    gap: 3px;
  }

  .modality-icon {
    display: inline-flex;
  }
</style>
