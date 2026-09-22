<script lang="ts">
  /**
   * LA DASHBOARD DEI PROGETTI.
   *
   * Un progetto è un insieme di tele con le sue pagine. Qui si sceglie con cosa lavorare:
   * la lista, un nome, quante tele ci sono dentro. Il clic entra nel progetto.
   */
  import { enhance } from '$app/forms';
  import { goto } from '$app/navigation';
  import { _ } from 'svelte-i18n';

  let { data, form } = $props();

  if (form?.href) {
    goto(form.href);
  }
</script>

<div class="dash">
  <header class="dash-head">
    <div>
      <h1>Progetti</h1>
      <p class="sub">{data.org.name} · {data.profile.email}</p>
    </div>
    <form method="POST" action="?/create" use:enhance>
      <button type="submit" class="cta">Nuovo progetto</button>
    </form>
  </header>

  {#if data.projects.length === 0}
    <p class="empty">Nessun progetto. Creane uno per cominciare: nasce già con una tela.</p>
  {:else}
    <ul class="grid">
      {#each data.projects as p (p.id)}
        <li>
          <a class="card" href={p.href}>
            <span class="name">{p.name}</span>
            <span class="meta">{p.canvasCount} {p.canvasCount === 1 ? 'tela' : 'tele'}</span>
          </a>
        </li>
      {/each}
    </ul>
  {/if}
</div>

<style>
  .dash {
    max-width: 960px;
    margin: 0 auto;
    padding: 48px 24px 80px;
  }
  .dash-head {
    display: flex;
    align-items: flex-end;
    justify-content: space-between;
    gap: 16px;
    margin-bottom: 28px;
  }
  h1 {
    margin: 0;
    font-size: 1.75rem;
    letter-spacing: -0.02em;
  }
  .sub {
    margin: 4px 0 0;
    color: var(--ink-soft);
    font-size: 0.875rem;
  }
  .cta {
    border: 0;
    border-radius: 980px;
    padding: 10px 18px;
    background: var(--ink);
    color: var(--paper);
    font-weight: 600;
    font-size: 0.875rem;
    cursor: pointer;
  }
  .empty {
    color: var(--ink-soft);
    font-size: 0.9375rem;
  }
  .grid {
    list-style: none;
    margin: 0;
    padding: 0;
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(240px, 1fr));
    gap: 14px;
  }
  .card {
    display: flex;
    flex-direction: column;
    gap: 6px;
    padding: 18px 18px 16px;
    border: 1px solid var(--line-2, #d2d2d7);
    border-radius: 14px;
    background: var(--paper);
    text-decoration: none;
    color: inherit;
    transition: border-color 0.15s ease;
  }
  .card:hover {
    border-color: var(--ink);
  }
  .name {
    font-weight: 600;
  }
  .meta {
    color: var(--ink-soft);
    font-size: 0.8125rem;
  }
</style>
