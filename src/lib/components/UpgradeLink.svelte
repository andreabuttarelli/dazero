<script lang="ts">
  import { _ } from 'svelte-i18n';

  // Un messaggio "crediti finiti" senza uscita è peggio del silenzio: l'utente resta fermo e
  // non sa cosa fare. /app/billing è l'unica pagina che mostra i piani — billing è dell'org, non
  // del brand, quindi nessuno slug serve a raggiungerla.
</script>

<a class="upgrade-link" href="/app/billing">{$_('app.nav.upgrade')} →</a>

<style>
  .upgrade-link {
    font-weight: 600;
    text-decoration: underline;
    text-underline-offset: 2px;
    white-space: nowrap;
    color: inherit;
  }
</style>
