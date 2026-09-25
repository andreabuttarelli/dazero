<script lang="ts">
  import { _, locale } from 'svelte-i18n';
  import { toc } from '$lib/stores/toc';

  $effect(() => {
    toc.set([
      { title: $_('docs.mcp.s0'), href: '#quick-start' },
      { title: $_('docs.mcp.s1'), href: '#stdio' },
      { title: $_('docs.mcp.s2'), href: '#remote' },
      { title: $_('docs.mcp.s3'), href: '#local-http' },
      { title: $_('docs.mcp.s4'), href: '#auth' },
      { title: $_('docs.mcp.s5'), href: '#first-calls' },
      { title: $_('docs.mcp.s6'), href: '#tools' },
      { title: $_('docs.mcp.s7'), href: '#troubleshooting' },
      { title: $_('docs.mcp.s8'), href: '#next' }
    ]);
  });
</script>

<svelte:head>
  <title>{$_('docs.mcp.s9')}</title>
  <meta name="description" content={$_('docs.mcp.s10')} />
</svelte:head>

<div class="docs-breadcrumb"><a href={'/docs'}>{$_('docs.mcp.s11')}</a><span>/</span>{$_('docs.mcp.s12')}</div>

<h1>{$_('docs.mcp.s13')}</h1>
<p class="docs-lead">
  {$_('docs.mcp.s14')}
</p>

<pre><code>Your agent
   │  stdio (local)     →  bun run mcp  /  feega-mcp
   │  HTTPS (remote)    →  https://mcp.feega.app/mcp  + Bearer
   ▼
feega API  (/api/v1/*)</code></pre>

<div class="docs-note">
  <strong>{$_('docs.mcp.s15')}</strong> {$_('docs.mcp.s16')}
</div>

<h2 id="quick-start">{$_('docs.mcp.s17')}</h2>
<p>{$_('docs.mcp.s18')}</p>

<h2 id="stdio">{$_('docs.mcp.s19')}</h2>
<p>{$_('docs.mcp.s20')}</p>
<ol>
  <li>{$_('docs.mcp.s21')}</li>
  <li>
    {$_('docs.mcp.s22')}
    <pre><code>feega login
# once, in a terminal — the CLI and the local MCP server share one session</code></pre>
  </li>
  <li>
    {$_('docs.mcp.s23')}
    <pre><code>&#123;
  "mcpServers": &#123;
    "feega": &#123;
      "command": "bun",
      "args": ["run", "/ABS/PATH/to/feega/cli/mcp/stdio.ts"]
    &#125;
  &#125;
&#125;</code></pre>
    <p>{$_('docs.mcp.s24')}</p>
    <pre><code>&#123;
  "mcpServers": &#123;
    "feega": &#123; "command": "feega-mcp" &#125;
  &#125;
&#125;</code></pre>
  </li>
  <li>{$_('docs.mcp.s25')}</li>
</ol>
<p>{@html $_('docs.mcp.s26')}</p>

<h2 id="remote">{$_('docs.mcp.s27')}</h2>
<ol>
  <li>
    {$_('docs.mcp.s28')}
    <pre><code>curl -sS https://mcp.feega.app/health</code></pre>
    <p>{$_('docs.mcp.s29')}</p>
  </li>
  <li>
    {$_('docs.mcp.s30')}
    <pre><code>&#123;
  "mcpServers": &#123;
    "feega": &#123;
      "url": "https://mcp.feega.app/mcp"
    &#125;
  &#125;
&#125;</code></pre>
  </li>
  <li>{@html $_('docs.mcp.s31')}</li>
</ol>
<p>{@html $_('docs.mcp.s32')}</p>

<h2 id="local-http">{$_('docs.mcp.s33')}</h2>
<pre><code>cd cli
bun install
bun run mcp:http
# → http://localhost:8787/mcp
#    http://localhost:8787/health</code></pre>
<p>{$_('docs.mcp.s34')}</p>

<h2 id="auth">{$_('docs.mcp.s35')}</h2>
<table>
  <thead>
    <tr>
      <th>{$_('docs.mcp.s36')}</th>
      <th>{$_('docs.mcp.s37')}</th>
    </tr>
  </thead>
  <tbody>
    <tr>
      <td>{$_('docs.mcp.s38')}</td>
      <td>{$_('docs.mcp.s39')}</td>
    </tr>
    <tr>
      <td>{$_('docs.mcp.s40')}</td>
      <td>OAuth 2.1 + PKCE, or <code>Authorization: Bearer &lt;access_token&gt;</code></td>
    </tr>
    <tr>
      <td>{$_('docs.mcp.s41')}</td>
      <td><strong>{$_('docs.mcp.s42')}</strong></td>
    </tr>
  </tbody>
</table>
<p>{@html $_('docs.mcp.s43')}</p>

<h2 id="first-calls">{$_('docs.mcp.s44')}</h2>
<ol>
  <li><code>query({'{'} table: "brands", columns: ["id","slug","name"] {'}'})</code> — {$_('docs.mcp.s45')}</li>
  <li><code>query({'{'} table: "posts", columns: ["id","status","caption"], where: [...] {'}'})</code> {$_('docs.mcp.s46')}</li>
  <li>{$_('docs.mcp.s47')}</li>
</ol>
<p>{$_('docs.mcp.s49')}</p>

<h2 id="tools">{$_('docs.mcp.s50')}</h2>
<p>{$_('docs.mcp.s79')}</p>
<table>
  <thead>
    <tr>
      <th>{$_('docs.mcp.s51')}</th>
      <th>{$_('docs.mcp.s52')}</th>
    </tr>
  </thead>
  <tbody>
    <tr>
      <td>{$_('docs.mcp.s53')}</td>
      <td><code>query</code>, <code>insert_row</code>, <code>update_row</code>, <code>delete_row</code>, <code>describe_node_types</code></td>
    </tr>
    <tr>
      <td>{$_('docs.mcp.s80')}</td>
      <td><code>run_node_generation</code></td>
    </tr>
    <tr>
      <td>{$_('docs.mcp.s54')}</td>
      <td><code>list_posts</code>, <code>create_post</code>, <code>set_post_status</code></td>
    </tr>
    <tr>
      <td>{$_('docs.mcp.s55')}</td>
      <td><code>list_ad_campaigns</code>, <code>create_ad_campaign</code>, <code>approve_ad_campaign</code></td>
    </tr>
  </tbody>
</table>
<p>{@html $_('docs.mcp.s81')}</p>

<h2 id="troubleshooting">{$_('docs.mcp.s58')}</h2>
<table>
  <thead>
    <tr>
      <th>{$_('docs.mcp.s59')}</th>
      <th>{$_('docs.mcp.s60')}</th>
      <th>{$_('docs.mcp.s61')}</th>
    </tr>
  </thead>
  <tbody>
    <tr>
      <td>{$_('docs.mcp.s62')}</td>
      <td>{$_('docs.mcp.s63')}</td>
      <td>{$_('docs.mcp.s64')}</td>
    </tr>
    <tr>
      <td>{$_('docs.mcp.s65')}</td>
      <td>{$_('docs.mcp.s66')}</td>
      <td>{$_('docs.mcp.s67')}</td>
    </tr>
    <tr>
      <td>{$_('docs.mcp.s68')}</td>
      <td>{$_('docs.mcp.s69')}</td>
      <td>{$_('docs.mcp.s70')}</td>
    </tr>
    <tr>
      <td>{$_('docs.mcp.s82')}</td>
      <td>{$_('docs.mcp.s83')}</td>
      <td>{$_('docs.mcp.s84')}</td>
    </tr>
  </tbody>
</table>

<hr />

<h2 id="next">{$_('docs.mcp.s71')}</h2>
<ul>
  <li><a href={'/docs/agents'}>{$_('docs.mcp.s72')}</a> — {$_('docs.mcp.s73')}</li>
  <li><a href={'/docs/cli'}>{$_('docs.mcp.s74')}</a> — {$_('docs.mcp.s75')}</li>
  <li><a href={'/docs/api'}>{$_('docs.mcp.s76')}</a> — {$_('docs.mcp.s77')}</li>
  <li>
    <a href="https://github.com/andreabuttarelli/feega" target="_blank" rel="noopener noreferrer"
      >feega</a
    >
    — {$_('docs.mcp.s78')}
  </li>
</ul>
