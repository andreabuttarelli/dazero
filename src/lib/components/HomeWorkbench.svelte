<script lang="ts">
  import { _ } from 'svelte-i18n';
  import type { HomeOverview } from '$lib/server/hub-overview';
  import AnimatedNum from '$lib/components/AnimatedNum.svelte';
  import { fmtCompactNum } from '$lib/fmt-num';
  import { homeTodos } from '$lib/home-todos';
  import { upcomingFeed } from '$lib/home-upcoming';

  let {
    base,
    overview,
    launchedAt = null,
  }: {
    base: string;
    overview: HomeOverview;
    launchedAt?: string | null;
  } = $props();

  const socialAccounts = $derived(overview.setup.socialAccounts);

  function captionPreview(text: string | null, n = 80) {
    if (!text) return '';
    const t = text.trim();
    return t.length > n ? `${t.slice(0, n)}…` : t;
  }

  const upcoming = $derived(upcomingFeed(overview.queue.upcoming ?? [], overview.blog.upcoming ?? []));
  // Le cose da fare in cima: la SELEZIONE e l'ORDINE stanno in `$lib/home-todos`, puro e sotto
  // test; qui si aggiunge solo ciò che quel modulo non può sapere — l'href col brand e la
  // traduzione. Ha preso il posto di tre gauge (setup, SEO, GEO) e di una coda paginata dei
  // singoli post: i primi erano ornamento, la seconda diceva la stessa cosa della riga
  // «N da approvare» con un clic in più e una paginazione da mantenere.
  const todos = $derived(
    homeTodos({
      setup: { socialAccounts }
    })
  );

  const viewsByDay = $derived(
    overview.analysis.viewsByDay?.length === 7
      ? overview.analysis.viewsByDay
      : [0, 0, 0, 0, 0, 0, 0]
  );
  const likesByDay = $derived(
    overview.analysis.likesByDay?.length === 7
      ? overview.analysis.likesByDay
      : [0, 0, 0, 0, 0, 0, 0]
  );
  const maxLikesDay = $derived(Math.max(1, ...likesByDay));
  const maxViewsDay = $derived(Math.max(1, ...viewsByDay));

  const sparkPath = $derived.by(() => {
    const w = 280;
    const h = 64;
    const pad = 4;
    const vals = viewsByDay;
    const max = Math.max(1, ...vals);
    const step = (w - pad * 2) / Math.max(1, vals.length - 1);
    return vals
      .map((v, i) => {
        const x = pad + i * step;
        const y = h - pad - (v / max) * (h - pad * 2);
        return `${i === 0 ? 'M' : 'L'}${x.toFixed(1)},${y.toFixed(1)}`;
      })
      .join(' ');
  });

  const sparkArea = $derived.by(() => {
    const w = 280;
    const h = 64;
    const pad = 4;
    const vals = viewsByDay;
    const max = Math.max(1, ...vals);
    const step = (w - pad * 2) / Math.max(1, vals.length - 1);
    const line = vals
      .map((v, i) => {
        const x = pad + i * step;
        const y = h - pad - (v / max) * (h - pad * 2);
        return `${i === 0 ? 'M' : 'L'}${x.toFixed(1)},${y.toFixed(1)}`;
      })
      .join(' ');
    return `${line} L${(w - pad).toFixed(1)},${(h - pad).toFixed(1)} L${pad},${(h - pad).toFixed(1)} Z`;
  });

  function formatWhen(iso: string) {
    try {
      return new Date(iso).toLocaleString(undefined, {
        weekday: 'short',
        month: 'short',
        day: 'numeric',
        hour: '2-digit',
        minute: '2-digit'
      });
    } catch {
      return iso;
    }
  }
</script>

<div class="home-wb">

  <!-- Il setup a scalini, i tredici controlli della crescita e la pipeline a tre numeri non stanno
       piu' qui: la testa della pagina (`HomeHead`) dice la stessa cosa in quattro numeri e una
       pastiglia, e i tredici controlli hanno gia' una casa propria in /plan, dove si agisce su di
       loro. Tenerne due copie voleva dire due posti che dicono la stessa cosa e divergono al primo
       cambiamento — e la prima cosa che vedeva chi entrava era quanto gli mancava. -->


  {#if !overview.paid}
    <div class="upgrade-banner">
      <p>{$_('app.home.upgrade.banner')}</p>
      <a href="/app/billing">{$_('app.home.upgrade.cta')}</a>
    </div>
  {/if}

  <!-- IL BLOCCO DEL MOCKUP: ciò che richiede attenzione sta in cima, con quante sono. Il resto
       della pagina scende sotto, invariato. -->
  <section class="todo" aria-labelledby="todo-title">
    <div class="todo-head">
      <h2 id="todo-title">{$_('app.home.todo.title')}</h2>
      {#if todos.length > 0}
        <p class="todo-count">{$_('app.home.todo.count', { values: { n: todos.length } })}</p>
      {/if}
    </div>

    {#if todos.length === 0}
      <!-- Uno stato vuoto che dice PERCHÉ è vuoto e cosa lo riempirà, invece di una riga muta. -->
      <p class="todo-empty">{$_('app.home.todo.empty')}</p>
    {:else}
      <ul class="todo-list">
        {#each todos as todo (todo.key)}
          <li>
            <a href={`${base}${todo.path}`}>
              <span class="todo-body">
                <span class="todo-what">{$_(todo.labelKey, { values: { n: todo.count } })}</span>
                <span class="todo-where">{$_(todo.hintKey)}</span>
              </span>
              <span class="todo-cta">{$_('app.home.overview.review')}</span>
            </a>
          </li>
        {/each}
      </ul>
    {/if}
  </section>


  <!-- Cosa esce, in ordine di orologio. La SELEZIONE e l'ORDINE stanno in `$lib/home-upcoming`,
       sotto test; qui si disegna e si traduce. -->
  <section class="ov-section">
    <div class="ov-section-head">
      <h3>{$_('app.home.overview.comingUp')}</h3>
      <a class="ov-link" href={`${base}/calendar`}>{$_('app.home.overview.openCalendar')} →</a>
    </div>

    {#if upcoming.length === 0}
      <p class="ov-empty quiet">{$_('app.home.overview.nothingScheduled')}</p>
    {:else}
      <ul class="upcoming-list">
        {#each upcoming as item (item.kind + item.id)}
          <li>
            <a href={`${base}${item.path}`}>
              <span class="up-thumb">
                {#if item.thumb}
                  <img src={item.thumb} alt="" loading="lazy" />
                {:else}
                  <span class="up-ph">{item.fallback}</span>
                {/if}
              </span>
              <span class="up-body">
                <span class="up-meta">{formatWhen(item.when)}</span>
                <span class="up-title">{item.title ?? '—'}</span>
              </span>
              <span class="up-kind">{$_(`app.home.overview.kind${item.kind === 'blog' ? 'Blog' : 'Social'}`)}</span>
            </a>
          </li>
        {/each}
      </ul>
    {/if}
  </section>

  <!-- Performance -->
  <section class="ov-section">
    <div class="ov-section-head">
      <div class="ov-section-copy">
        <h3>{$_('app.home.overview.analysisTitle')}</h3>
        {#if overview.analysis.statsUpdatedAt}
          <p class="ov-stats-updated">
            {$_('app.home.overview.statsUpdated', {
              values: { date: formatWhen(overview.analysis.statsUpdatedAt) }
            })}
          </p>
        {/if}
      </div>
    </div>

    <div class="perf-layout">
      <div class="perf-spark">
        <div class="perf-spark-head">
          <span class="metric-l">{$_('app.home.overview.viewsSpark')}</span>
          <span class="metric-n"
            ><AnimatedNum value={overview.analysis.views7d} format={fmtCompactNum} /></span
          >
        </div>
        <svg class="spark-svg" viewBox="0 0 280 64" preserveAspectRatio="none" aria-hidden="true">
          <path class="spark-area" d={sparkArea} />
          <path class="spark-line" d={sparkPath} />
        </svg>
        <div class="spark-days" aria-hidden="true">
          {#each viewsByDay as v, i (i)}
            <span class:hot={v === maxViewsDay && v > 0}></span>
          {/each}
        </div>
      </div>

      <div class="perf-bars">
        <div class="perf-spark-head">
          <span class="metric-l">{$_('app.home.overview.likesBars')}</span>
          <span class="metric-n"
            ><AnimatedNum value={overview.analysis.likes7d} format={fmtCompactNum} /></span
          >
        </div>
        <div class="likes-bars" aria-hidden="true">
          {#each likesByDay as v, i (i)}
            <span style={`height:${Math.max(6, (v / maxLikesDay) * 100)}%`} class:hot={v === maxLikesDay && v > 0}></span>
          {/each}
        </div>
      </div>
    </div>

  </section>
</div>

<style>
  /* IL BLOCCO DELLE COSE DA FARE. Niente cornici, niente riempimenti: la gerarchia la fanno
     spaziatura, dimensione e peso — che è la regola del mockup, dove l'unico bordo è quello
     della riga che chiede qualcosa. */
  .todo {
    display: flex;
    flex-direction: column;
    gap: 10px;
    margin-bottom: 28px;
  }
  .todo-head h2 {
    margin: 0;
    font-size: 22px;
    font-weight: 700;
    letter-spacing: -0.02em;
    color: var(--ink);
  }
  .todo-count {
    margin: 2px 0 0;
    font-size: 13px;
    color: var(--ink-soft);
  }
  .todo-empty {
    margin: 0;
    font-size: 13.5px;
    line-height: 1.6;
    color: var(--ink-soft);
    max-width: 62ch;
  }
  .todo-list {
    list-style: none;
    margin: 0;
    padding: 0;
    display: flex;
    flex-direction: column;
    gap: 8px;
  }
  .todo-list a {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 12px;
    padding: 13px 16px;
    border: 1px solid var(--line);
    border-radius: 14px;
    background: var(--paper);
    text-decoration: none;
    transition: border-color 140ms ease;
  }
  .todo-list a:hover {
    border-color: color-mix(in srgb, var(--accent) 45%, var(--line));
  }
  .todo-body {
    display: flex;
    flex-direction: column;
    gap: 2px;
    min-width: 0;
  }
  .todo-what {
    font-size: 14.5px;
    font-weight: 600;
    color: var(--ink);
  }
  .todo-where {
    font-size: 12.5px;
    color: var(--ink-soft);
  }
  .todo-cta {
    flex: none;
    border: 1px solid var(--line);
    border-radius: 999px;
    padding: 5px 14px;
    font-size: 13px;
    font-weight: 600;
    color: var(--ink);
  }

  /* Registering the angle is what makes the rotating border possible at all: an unregistered
     custom property has no type, so CSS jumps it 0deg→360deg instead of interpolating and the
     gradient never moves. Where @property is unsupported the border simply sits still — the
     accent colour and the glow still read, so nothing is lost. */
  @property --ob-angle {
    syntax: '<angle>';
    initial-value: 0deg;
    inherits: false;
  }
  @property --cta-angle {
    syntax: '<angle>';
    initial-value: 0deg;
    inherits: false;
  }

  .home-wb {
    padding: 0;
    max-width: var(--content-max, 960px);
    min-width: 0;
    width: 100%;
    overflow-x: clip;
  }

  .upgrade-banner {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 12px;
    margin: 0 0 20px;
    padding: 12px 14px;
    border-radius: 14px;
    border: 1px solid var(--line);
    background: var(--paper-2);
  }
  .upgrade-banner p {
    margin: 0;
    font-size: 13px;
    color: var(--ink-soft);
  }
  .upgrade-banner a {
    flex: none;
    font-size: 13px;
    font-weight: 650;
    color: var(--accent);
    text-decoration: none;
  }

  /* ── Pipeline ─────────────────────────────────────────────── */
  .ov-section {
    margin: 0 0 64px;
  }
  .ov-section-head {
    display: flex;
    align-items: flex-start;
    justify-content: space-between;
    gap: 12px;
    margin-bottom: 12px;
  }
  .ov-section-head h3,
  .ov-section-copy h3 {
    margin: 0;
    font-size: 1.05rem;
    font-weight: 650;
    letter-spacing: -0.02em;
  }
  .ov-stats-updated {
    margin: 6px 0 0;
    font-size: 11px;
    color: var(--ink-faint, var(--ink-soft));
    opacity: 0.85;
  }
  .ov-link {
    font-size: 13px;
    font-weight: 600;
    color: var(--accent);
    text-decoration: none;
    white-space: nowrap;
  }
  .ov-empty {
    margin: 0;
    padding: 16px;
    border-radius: 14px;
    border: 1px dashed var(--line);
    font-size: 13.5px;
    color: var(--ink-soft);
    text-align: center;
  }
  .ov-empty.quiet {
    border-style: solid;
    background: var(--paper);
  }

  .upcoming-list {
    list-style: none;
    margin: 0;
    padding: 0;
  }
  .upcoming-list li + li {
    border-top: 1px solid var(--line);
  }
  .upcoming-list a {
    display: flex;
    align-items: center;
    gap: 10px;
    padding: 8px 0;
    text-decoration: none;
    color: inherit;
  }
  .up-thumb {
    width: 40px;
    height: 40px;
    border-radius: 9px;
    overflow: hidden;
    flex: none;
    background: color-mix(in srgb, var(--ink) 6%, var(--paper));
  }
  .up-thumb img {
    width: 100%;
    height: 100%;
    object-fit: cover;
    display: block;
  }
  .up-ph {
    width: 100%;
    height: 100%;
    display: grid;
    place-items: center;
    font-size: 11px;
    font-weight: 700;
    color: var(--ink-faint);
  }
  .up-body {
    flex: 1 1 0;
    min-width: 0;
    max-width: 100%;
    display: flex;
    flex-direction: column;
    gap: 1px;
    overflow: hidden;
  }
  .up-kind {
    flex: none;
    font-size: 10.5px;
    font-weight: 650;
    letter-spacing: 0.04em;
    text-transform: uppercase;
    color: var(--ink-faint);
  }
  .up-meta {
    font-size: 11.5px;
    color: var(--ink-faint);
    min-width: 0;
    max-width: 100%;
  }
  .up-title {
    font-size: 13px;
    font-weight: 550;
    min-width: 0;
    max-width: 100%;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .metric-n {
    font-size: 22px;
    font-weight: 700;
    letter-spacing: -0.03em;
    line-height: 1.1;
    font-variant-numeric: tabular-nums;
  }
  .metric-l {
    font-size: 12.5px;
    font-weight: 600;
    color: var(--ink-soft);
  }
  /* ── Performance ──────────────────────────────────────────── */
  .perf-layout {
    display: grid;
    grid-template-columns: 1.4fr 1fr;
    gap: 10px;
  }
  .perf-spark,
  .perf-bars {
    display: flex;
    flex-direction: column;
    gap: 8px;
    padding: 14px;
    border-radius: 14px;
    border: 1px solid var(--line);
    background: var(--paper);
    text-decoration: none;
    color: inherit;
    min-width: 0;
  }
  .perf-spark:hover,
  .perf-bars:hover {
    border-color: color-mix(in srgb, var(--accent) 28%, var(--line));
    background: var(--paper-2);
  }
  .perf-spark-head {
    display: flex;
    align-items: baseline;
    justify-content: space-between;
    gap: 8px;
  }
  .perf-spark-head .metric-n {
    font-size: 18px;
  }
  .spark-svg {
    width: 100%;
    height: 64px;
    display: block;
  }
  .spark-area {
    fill: color-mix(in srgb, var(--accent) 14%, transparent);
  }
  .spark-line {
    fill: none;
    stroke: var(--accent);
    stroke-width: 2.2;
    stroke-linecap: round;
    stroke-linejoin: round;
    stroke-dasharray: 400;
    stroke-dashoffset: 0;
    animation: spark-draw 0.9s ease both;
  }
  @keyframes spark-draw {
    from {
      stroke-dashoffset: 400;
    }
    to {
      stroke-dashoffset: 0;
    }
  }
  .spark-days {
    display: grid;
    grid-template-columns: repeat(7, 1fr);
    gap: 4px;
  }
  .spark-days span {
    height: 3px;
    border-radius: 999px;
    background: color-mix(in srgb, var(--ink) 8%, transparent);
  }
  .spark-days span.hot {
    background: var(--accent);
  }
  .likes-bars {
    display: flex;
    align-items: flex-end;
    gap: 6px;
    height: 72px;
    padding-top: 4px;
  }
  .likes-bars span {
    flex: 1;
    border-radius: 6px 6px 3px 3px;
    background: color-mix(in srgb, var(--accent) 55%, var(--ink));
    min-height: 6px;
    transition: height 0.55s ease;
    opacity: 0.75;
  }
  .likes-bars span.hot {
    opacity: 1;
    background: var(--accent);
  }
  @media (prefers-reduced-motion: reduce) {
    .spark-line {
      animation: none;
    }
    .likes-bars span {
      transition: none;
    }
  }

  @container workbench (max-width: 640px) {
    .perf-layout {
      grid-template-columns: 1fr;
    }
    .up-title {
      white-space: normal;
      display: -webkit-box;
      -webkit-line-clamp: 2;
      -webkit-box-orient: vertical;
      text-overflow: ellipsis;
    }
  }

  @container workbench (max-width: 420px) {
  }
</style>
