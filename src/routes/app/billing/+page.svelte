<script lang="ts">
  import { _ } from 'svelte-i18n';
  import '$lib/styles/settings-shell.css';

  let { data, form } = $props();
</script>

<section class="panel">
  <div class="panel-head"><div class="t">{$_('app.settings.billing.title')}</div></div>

  <div class="field">
    <div class="ftxt">
      <div class="fh">{$_('app.account.billing.poolTitle')}</div>
      <div class="fs">{$_('app.account.billing.poolDesc')}</div>
    </div>
  </div>

  {#if !data.isOwner}
    <div class="field"><div class="bill-notice">{$_('app.settings.billing.membersNotice')}</div></div>
  {:else if !data.billingBrandSlug}
    <div class="field"><div class="fs">{$_('app.account.billing.noBrands')}</div></div>
  {:else}
    {#if form?.retentionApplied}
      <div class="field"><div class="fs" style="color:var(--accent);">{$_('app.settings.billing.retentionApplied')}</div></div>
    {:else if form?.canceled}
      <div class="field"><div class="fs" style="color:#b25000;">{#if form.endsAt}{$_('app.settings.billing.canceledOn', { values: { date: new Date(form.endsAt).toLocaleDateString() } })}{:else}{$_('app.settings.billing.canceledNoDate')}{/if}</div></div>
    {:else if form?.billingError}
      <div class="field"><div class="fs" style="color:#c0392b;">{form.billingError}</div></div>
    {/if}

    <div class="field">
      <div class="ftxt">
        <div class="fh">{$_('app.settings.usage.creditsUsed')}</div>
        <div class="fs">{data.credits.balance}</div>
      </div>
    </div>

    {#if data.hasBilling}
      <div class="field">
        <div class="ftxt">
          <div class="fh">{$_('app.settings.billing.upgradeTitle')}</div>
          <div class="fs">{$_('app.settings.billing.upgradeDesc')}</div>
        </div>
        <div class="bill-actions">
          {#each data.credits.ladder as rung (rung.price)}
            <form method="POST" action={`?/upgrade`}>
              <input type="hidden" name="usd" value={rung.price} />
              <button class="bbtn primary" type="submit">${rung.price}/mo — {rung.creditsSubscription} credits</button>
            </form>
          {/each}
        </div>
      </div>
      <div class="field">
        <div class="ftxt">
          <div class="fh">{$_('app.settings.billing.manage')}</div>
          <div class="fs">{$_('app.settings.billing.manageInvoicesDesc')}</div>
        </div>
        <div class="bill-actions">
          <form method="POST" action={`?/billingPortal`}><input type="hidden" name="flow" value="invoices" /><button class="bbtn" type="submit">{$_('app.settings.billing.invoices')}</button></form>
          <form method="POST" action={`?/billingPortal`}><input type="hidden" name="flow" value="payment_method" /><button class="bbtn" type="submit">{$_('app.settings.billing.changePayment')}</button></form>
        </div>
      </div>
    {:else}
      <div class="field">
        <div class="ftxt">
          <div class="fh">{$_('app.settings.billing.upgradeTitle')}</div>
          <div class="fs">{$_('app.settings.billing.upgradeDesc')}</div>
        </div>
        <div class="bill-actions">
          {#each data.credits.ladder as rung (rung.price)}
            <form method="POST" action={`?/upgrade`}>
              <input type="hidden" name="usd" value={rung.price} />
              <button class="bbtn primary" type="submit">${rung.price}/mo — {rung.creditsSubscription} credits</button>
            </form>
          {/each}
        </div>
      </div>
    {/if}
  {/if}
</section>

{#if data.brands.length}
  <section class="panel">
    <div class="panel-head"><div class="t">{$_('app.account.billing.breakdownTitle')}</div></div>
    <table class="brand-usage">
      <thead>
        <tr><th>{$_('app.account.billing.brandCol')}</th><th>{$_('app.account.billing.creditsCol')}</th></tr>
      </thead>
      <tbody>
        {#each data.brands as b (b.id)}
          <tr>
            <td>{b.name}</td>
            <td class="num">{b.credits}</td>
          </tr>
        {/each}
      </tbody>
    </table>
  </section>
{/if}

<style>
  .brand-usage {
    width: 100%;
    border-collapse: collapse;
    font-size: 0.875rem;
  }
  .brand-usage th,
  .brand-usage td {
    padding: 0.6rem 1rem;
    text-align: left;
    border-top: 1px solid var(--line, #e5e5e5);
  }
  .brand-usage th {
    font-weight: 500;
    opacity: 0.7;
  }
  .brand-usage .num {
    text-align: right;
    font-variant-numeric: tabular-nums;
  }
</style>
