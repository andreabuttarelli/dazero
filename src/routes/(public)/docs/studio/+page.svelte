<script lang="ts">
  import { _, locale } from 'svelte-i18n';
  import { toc } from '$lib/stores/toc';

  $effect(() => {
    toc.set([
    { title: $_('docs.studio.s0'), href: '#brand-kit' },
    { title: $_('docs.studio.s1'), href: '#products' },
  ]);
  });
</script>

<svelte:head>
  <title>{$_('docs.studio.s5')}</title>
  <meta name="description" content={$_('docs.studio.s6')} />
</svelte:head>

<div class="docs-breadcrumb"><a href={'/docs'}>{$_('docs.studio.s7')}</a><span>/</span>{$_('docs.studio.s8')}</div>

<h1>{$_('docs.studio.s9')}</h1>
<p class="docs-lead">
  {$_('docs.studio.s10')}
</p>

<h2 id="brand-kit">{$_('docs.studio.s11')}</h2>
<p>{$_('docs.studio.s12')}</p>
<p>{$_('docs.studio.s13')}</p>

<h2 id="products">{$_('docs.studio.s14')}</h2>
<p>{$_('docs.studio.s15')}</p>
<ul>
  <li><strong>{$_('docs.studio.s16')}</strong> {$_('docs.studio.s17')}</li>
  <li><strong>{$_('docs.studio.s18')}</strong> {$_('docs.studio.s19')}</li>
</ul>
