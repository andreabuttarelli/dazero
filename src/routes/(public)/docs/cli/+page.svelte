<script lang="ts">
  import { _, locale } from 'svelte-i18n';
  import { toc } from '$lib/stores/toc';

  toc.set([]);
</script>

<svelte:head>
  <title>{$_('docs.cli.s0')}</title>
  <meta name="description" content={$_('docs.cli.s1')} />
</svelte:head>

<div class="docs-breadcrumb"><a href={'/docs'}>{$_('docs.cli.s2')}</a> {$_('docs.cli.s3')}</div>

<h1>{$_('docs.cli.s4')}</h1>
<p class="docs-lead">
  {$_('docs.cli.s5')}
</p>

<h2>{$_('docs.cli.s6')}</h2>
<pre><code>curl -sSL https://dazero.co/install.sh | bash</code></pre>

<p>
  {@html $_('docs.cli.s7')}
</p>

<h2>{$_('docs.cli.s8')}</h2>
<p>
  {@html $_('docs.cli.s9')}
</p>

<h2>{$_('docs.cli.s10')}</h2>
<pre><code>dazero brands                          # List brands
dazero dashboard &lt;slug&gt;                # Brand overview
dazero content &lt;slug&gt; --status pending_user  # Pending posts
dazero approve &lt;slug&gt; --all            # Approve all pending
dazero post &lt;slug&gt; &lt;id&gt; edit --caption "..." # Edit post
dazero plan &lt;slug&gt;                     # View editorial plan
dazero ai &lt;slug&gt; --message "..."       # AI chat</code></pre>

<h2>{$_('docs.cli.s11')}</h2>
<pre><code>dazero update</code></pre>

<h2>{$_('docs.cli.s12')}</h2>
<p>
  {$_('docs.cli.s13')}
</p>
<ul>
  <li>{$_('docs.cli.s14')}</li>
  <li>{$_('docs.cli.s15')}</li>
  <li>{$_('docs.cli.s16')}</li>
</ul>

<hr />

<h2>{$_('docs.cli.s17')}</h2>
<ul>
  <li><a href={'/docs/mcp'}>{$_('docs.cli.s21')}</a> — {$_('docs.cli.s22')}</li>
  <li><a href={'/docs/agents'}>{$_('docs.cli.s23')}</a> — {$_('docs.cli.s24')}</li>
  <li>
    {$_('docs.cli.s18')} <a href={'/docs/api'}>{$_('docs.cli.s19')}</a> {$_('docs.cli.s20')}
  </li>
</ul>
