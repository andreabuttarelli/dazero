<script lang="ts">
  import CreditIcon from './CreditIcon.svelte';

  let { amount, approx = false }: { amount: number; approx?: boolean } = $props();

  const label = $derived(`${amount.toLocaleString()} crediti`);
</script>

<span class="credit-amount" aria-label={label}>
  <span aria-hidden="true">{approx ? '~' : ''}{amount.toLocaleString()}</span>
  <CreditIcon />
</span>

<style>
  .credit-amount {
    display: inline-flex;
    align-items: baseline;
    gap: 0.15em;
  }
</style>
