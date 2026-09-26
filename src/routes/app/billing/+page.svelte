<script lang="ts">
  import { _ } from 'svelte-i18n';
  import '$lib/styles/settings-shell.css';
  import CreditAmount from '$lib/components/CreditAmount.svelte';

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
        <div class="fs"><CreditAmount amount={data.credits.balance} /></div>
        {#if data.credits.atRisk.length}
          <div class="fs">
            {#each data.credits.atRisk as risk (risk.expiresAt)}
              <CreditAmount amount={risk.amount} /> expire {new Date(risk.expiresAt).toLocaleDateString()}
            {/each}
          </div>
        {/if}
      </div>
    </div>

    <div class="field">
      <div class="ftxt">
        <div class="fh">{$_('app.account.billing.ladderTitle')}</div>
        <div class="fs">{$_('app.account.billing.ladderDesc')}</div>
      </div>
      {#if !data.purchasesReady}
        <div class="fs">{$_('app.account.billing.purchasesNotReady')}</div>
      {:else}
        <table class="ladder">
          <thead>
            <tr>
              <th>{$_('app.account.billing.priceCol')}</th>
              <th>{$_('app.account.billing.subscriptionCol')}</th>
              <th>{$_('app.account.billing.oneTimeCol')}</th>
            </tr>
          </thead>
          <tbody>
            {#each data.credits.ladder as rung (rung.price)}
              <tr>
                <td>${rung.price}</td>
                <td>
                  <form method="POST" action={`?/upgrade`}>
                    <input type="hidden" name="usd" value={rung.price} />
                    <button class="bbtn primary" type="submit"><CreditAmount amount={rung.creditsSubscription} /> — /mo</button>
                  </form>
                </td>
                <td>
                  <form method="POST" action={`?/buyOneTime`}>
                    <input type="hidden" name="usd" value={rung.price} />
                    <button class="bbtn" type="submit"><CreditAmount amount={rung.creditsOneTime} /> — {$_('app.account.billing.neverExpires')}</button>
                  </form>
                </td>
              </tr>
            {/each}
          </tbody>
        </table>
      {/if}
    </div>

    {#if data.hasBilling}
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
            <td class="num"><CreditAmount amount={b.credits} /></td>
          </tr>
        {/each}
      </tbody>
    </table>
  </section>
{/if}

<style>
  .ladder {
    width: 100%;
    border-collapse: collapse;
    font-size: 0.875rem;
    margin-top: 0.5rem;
  }
  .ladder th,
  .ladder td {
    padding: 0.6rem 1rem;
    text-align: left;
    border-top: 1px solid var(--line, #e5e5e5);
  }
  .ladder th {
    font-weight: 500;
    opacity: 0.7;
  }

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
