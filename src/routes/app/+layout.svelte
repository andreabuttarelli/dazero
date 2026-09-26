<script lang="ts">
  // Dashboard-only styling: Tailwind v4 + shadcn-svelte live here, scoped to /app so the
  // preflight/utilities never reach the hand-rolled marketing pages. The brand tokens
  // (colours, dark mode) come from app.css, already loaded by the root layout.
  import '$lib/styles/tailwind.css';

  let { children } = $props();
</script>

{@render children()}
