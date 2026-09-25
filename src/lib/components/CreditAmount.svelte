<script lang="ts">
  import CreditIcon from './CreditIcon.svelte';
  import { formatCredits } from './credit-amount-format';

  let { amount, approx = false }: { amount: number; approx?: boolean } = $props();

  const displayed = $derived(formatCredits(amount, { approx }));
  const label = $derived(`${formatCredits(amount)} crediti`);
</script>

<span class="credit-amount" aria-label={label}>
  <span aria-hidden="true">{displayed}</span>
  <CreditIcon />
</span>

<style>
  .credit-amount {
    display: inline-flex;
    align-items: baseline;
    gap: 0.15em;
  }
</style>
