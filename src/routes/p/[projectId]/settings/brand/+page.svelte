<script lang="ts">
  import { enhance } from '$app/forms';
  import { RASTER_IMAGE_ACCEPT } from '$lib/raster-image';

  let { data, form } = $props();

  let busy = $state(false);
  const withBusy = () => {
    busy = true;
    return async ({ update }: { update: () => Promise<void> }) => {
      await update();
      busy = false;
    };
  };
</script>

{#if !data.brand}
  <section class="panel">
    <h2 class="panel-title">No brand yet</h2>
    <p class="panel-desc">
      This project has no brand attached. Pick one of your org's brands, or create a new one.
    </p>

    {#if data.orgBrands.length}
      <form method="POST" action="?/selectBrand" use:enhance={withBusy} class="pick-form">
        <select name="brandId" class="pick-select">
          {#each data.orgBrands as brand (brand.id)}
            <option value={brand.id}>{brand.name}</option>
          {/each}
        </select>
        <button class="btn primary" type="submit" disabled={busy}>Use this brand</button>
      </form>
    {/if}

    <form method="POST" action="?/createBrand" use:enhance={withBusy} class="create-form">
      <label class="field">
        <span>New brand name</span>
        <input name="name" type="text" placeholder="Acme Coffee" required />
      </label>
      <button class="btn ghost" type="submit" disabled={busy}>Create brand</button>
    </form>

    {#if form?.error}<p class="msg warn">{form.error}</p>{/if}
  </section>
{:else}
  <section class="panel">
    <h2 class="panel-title">Brand</h2>

    <div class="logo-row">
      <span class="logo-slot" class:empty={!data.brand.logoUrl}>
        {#if data.brand.logoUrl}<img src={data.brand.logoUrl} alt="" />{:else}—{/if}
      </span>
      <form method="POST" action="?/uploadLogo" enctype="multipart/form-data" use:enhance={withBusy}>
        <label class="logo-upload">
          <input
            type="file"
            name="file"
            accept={RASTER_IMAGE_ACCEPT}
            onchange={(e) => e.currentTarget.form?.requestSubmit()}
          />
          {busy ? 'Saving…' : 'Upload logo'}
        </label>
      </form>
      {#if data.brand.logoUrl}
        <form method="POST" action="?/removeLogo" use:enhance={withBusy}>
          <button class="logo-remove" type="submit" disabled={busy}>Remove</button>
        </form>
      {/if}
    </div>

    <form method="POST" action="?/update" use:enhance={withBusy} class="edit-form">
      <label class="field">
        <span>Name</span>
        <input name="name" type="text" value={data.brand.name} required />
      </label>
      <label class="field">
        <span>Slug</span>
        <input type="text" value={data.brand.slug} disabled />
      </label>
      <label class="field">
        <span>Website</span>
        <input name="website" type="url" inputmode="url" value={data.brand.website ?? ''} placeholder="https://example.com" />
      </label>
      <label class="field">
        <span>Short description</span>
        <input name="short_description" type="text" value={data.brand.shortDescription ?? ''} placeholder="One line about the brand" />
      </label>
      <label class="field">
        <span>Content</span>
        <textarea name="content" rows="8" placeholder="Anything else worth knowing about the brand">{data.brand.content ?? ''}</textarea>
      </label>
      <div class="form-actions">
        <button class="btn primary" type="submit" disabled={busy}>{busy ? 'Saving…' : 'Save'}</button>
      </div>
    </form>

    {#if form?.saved}<p class="msg ok">Saved.</p>{/if}
    {#if form?.error}<p class="msg warn">{form.error}</p>{/if}
  </section>
{/if}

<style>
  .panel { display: flex; flex-direction: column; gap: 20px; max-width: 640px; }
  .panel-title { font-size: 20px; font-weight: 600; margin: 0; color: var(--ink); }
  .panel-desc { margin: 0; font-size: 14px; color: var(--ink-soft); line-height: 1.5; }

  .pick-form { display: flex; gap: 8px; align-items: center; }
  .pick-select {
    flex: 1; font-size: 14px; color: var(--ink); background: var(--paper);
    border: 1px solid var(--line); padding: 9px 10px; font-family: inherit;
  }
  .create-form { display: flex; gap: 8px; align-items: flex-end; }

  .logo-row { display: flex; align-items: center; gap: 14px; flex-wrap: wrap; }
  .logo-slot {
    width: 64px; height: 64px; border: 1px solid var(--line); background: var(--paper-2);
    display: flex; align-items: center; justify-content: center; overflow: hidden; flex: none;
  }
  .logo-slot.empty { color: var(--ink-faint); }
  .logo-slot img { max-width: 80%; max-height: 80%; object-fit: contain; }
  .logo-upload { position: relative; font-size: 13px; font-weight: 600; color: var(--accent); cursor: pointer; }
  .logo-upload:hover { text-decoration: underline; }
  .logo-upload input[type='file'] { position: absolute; inset: 0; width: 100%; height: 100%; opacity: 0; cursor: pointer; }
  .logo-remove { background: none; border: none; padding: 0; font-size: 13px; color: var(--ink-faint); cursor: pointer; }
  .logo-remove:hover { color: #c0392b; }

  .edit-form, .field { display: flex; flex-direction: column; gap: 6px; }
  .edit-form { gap: 14px; }
  .field > span { font-size: 12px; font-weight: 600; color: var(--ink-faint); text-transform: uppercase; letter-spacing: 0.04em; }
  .field input, .field textarea {
    width: 100%; font-size: 14px; color: var(--ink); background: var(--paper);
    border: 1px solid var(--line); padding: 9px 10px; font-family: inherit; box-sizing: border-box;
  }
  .field input:disabled { color: var(--ink-faint); background: var(--paper-2); }
  .field textarea { resize: vertical; line-height: 1.5; }

  .form-actions { display: flex; justify-content: flex-end; }

  .btn { font-size: 13px; font-weight: 600; padding: 9px 16px; cursor: pointer; border: 1px solid transparent; line-height: 1; }
  .btn:disabled { opacity: 0.55; cursor: default; }
  .btn.primary { background: var(--accent, #7c5cff); color: #fff; }
  .btn.ghost { background: transparent; color: var(--ink-soft); border-color: var(--line); }

  .msg { font-size: 13px; margin: 0; }
  .msg.ok { color: var(--accent, #7c5cff); font-weight: 600; }
  .msg.warn { color: #b25000; }
</style>
