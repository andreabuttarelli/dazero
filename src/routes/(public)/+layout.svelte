<script lang="ts">
  import { page } from '$app/stores';

  let { children } = $props();

  const canonical = $derived($page.url.origin + $page.url.pathname);
  const ogImage = $derived($page.url.origin + '/og.png');
</script>

<svelte:head>
  <link rel="canonical" href={canonical} />

  <meta property="og:site_name" content="feega" />
  <meta property="og:type" content="website" />
  <meta property="og:url" content={canonical} />
  <meta property="og:locale" content="en_US" />
  <meta property="og:image" content={ogImage} />
  <meta property="og:image:width" content="1200" />
  <meta property="og:image:height" content="630" />
  <meta property="og:image:alt" content="feega — An AI that runs your social media" />

  <meta name="twitter:card" content="summary_large_image" />
  <meta name="twitter:image" content={ogImage} />
</svelte:head>

{@render children()}
