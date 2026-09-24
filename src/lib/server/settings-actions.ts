import { swallow } from '$lib/server/swallow';
import { hasManyTenants } from '$lib/server/tenancy';
import { fail, redirect } from '@sveltejs/kit';
import { env } from '$env/dynamic/private';
import { syncBrandAccounts, disconnectAccount } from '$lib/server/zernio';
import { canAffordSeat } from '$lib/server/social-connections';
import { CREDIT_LADDER } from '$lib/server/credit-ladder';
import { generateApiKey } from '$lib/server/cli-auth';
import { sendEmail, brandInviteEmailSubject, brandInviteEmailHtml, brandInviteEmailText } from '$lib/server/email';
import { emailLocale } from '$lib/server/email-i18n';
import type { SupabaseClient } from '@supabase/supabase-js';
import type { RequestEvent } from '@sveltejs/kit';
import { isChatTier, isGatewayModelTier } from '$lib/chat-tiers';
import { invalidateBrandNav } from '$lib/server/nav-cache';
import { readUploadImage } from '$lib/server/raster-image';
import { createAdminClient } from '$lib/server/supabase-admin';
import { orgBillingForBrand } from '$lib/server/org-billing';
import { billingLink } from '$lib/server/billing-links';
import { billingGrantsReady } from '$lib/server/billing-readiness';

const stripeApi = () => import('$lib/server/stripe');

/** Shared brands: members reach settings too; billing/team stay owner-only. */
export async function isBrandOwner(supabase: SupabaseClient, slug: string): Promise<boolean> {
  const {
    data: { user }
  } = await supabase.auth.getUser();
  if (!user) return false;

  const { data: brand } = await supabase.from('brands').select('org_id').eq('slug', slug).maybeSingle();
  if (!brand) return false;

  const { data: membership } = await supabase
    .from('orgs_members')
    .select('role')
    .eq('org_id', brand.org_id)
    .eq('user_id', user.id)
    .maybeSingle();
  return membership?.role === 'owner';
}

const FEEDBACK: Record<string, string> = {
  too_expensive: 'too_expensive',
  unused: 'unused',
  missing_features: 'missing_features',
  switched_service: 'switched_service',
  other: 'other'
};

type Ev = RequestEvent;

export async function billingPortal({ request, params, url, locals: { supabase } }: Ev) {
  if (!(await isBrandOwner(supabase, params.brand!))) return fail(403, { billingError: 'Owner only' });
  const data = await request.formData();
  const flowRaw = String(data.get('flow') ?? 'invoices');
  const flow = flowRaw === 'payment_method' || flowRaw === 'upgrade' ? flowRaw : undefined;

  const link = await billingLink(supabase, {
    slug: params.brand!,
    returnUrl: `${url.origin}/app/${params.brand}/settings/billing`,
    flow
  });
  if (link.refusal === 'no_org_billing') return fail(404, { billingError: 'Brand not found' });
  if (link.refusal === 'no_customer' || link.refusal === 'no_subscription') {
    throw redirect(303, '/app/billing');
  }
  if (link.refusal) return fail(500, { billingError: link.message || 'Could not open billing' });

  throw redirect(303, link.url);
}

const PURCHASES_NOT_READY = 'Purchases open soon.';

export async function upgrade({ request, params, url, locals: { supabase } }: Ev) {
  if (!(await isBrandOwner(supabase, params.brand!))) return fail(403, { billingError: 'Owner only' });
  if (!(await billingGrantsReady(supabase))) return fail(409, { billingError: PURCHASES_NOT_READY });
  const data = await request.formData();
  const usd = Number(data.get('usd') ?? '');

  // The rungs the subscription checkout offers — the portal names no price of its own (see
  // billing-links.ts), so the choice made here has to be one of ours.
  const rung = CREDIT_LADDER.find((r) => r.price === usd);
  if (!rung) return fail(400, { billingError: 'Unknown subscription tier' });

  const billing = await orgBillingForBrand(supabase, { slug: params.brand! });
  if (!billing) return fail(404, { billingError: 'Brand not found' });

  const returnUrl = `${url.origin}/app/billing`;

  // No subscription yet: the hosted portal can only CHANGE one, never create the first — so this
  // mints a real Checkout Session on the rung's Stripe Price instead of routing through it.
  if (!billing.subscriptionId) {
    const { subscriptionPriceIdFor, ensureOrgCustomer, createSubscriptionCheckout } = await stripeApi();
    const priceId = subscriptionPriceIdFor(rung.price);
    if (!priceId) {
      return fail(400, { billingError: 'Subscriptions are not configured yet for this rung.' });
    }

    let checkoutUrl: string;
    try {
      const customerId = await ensureOrgCustomer({
        id: billing.orgId,
        name: billing.orgName,
        stripe_customer_id: billing.customerId
      });
      checkoutUrl = await createSubscriptionCheckout({
        customerId,
        orgId: billing.orgId,
        priceId,
        credits: rung.creditsSubscription,
        successUrl: returnUrl,
        cancelUrl: returnUrl
      });
    } catch (e) {
      return fail(500, { billingError: e instanceof Error ? e.message : 'Could not start the upgrade' });
    }
    throw redirect(303, checkoutUrl);
  }

  const link = await billingLink(supabase, { slug: params.brand!, returnUrl, flow: 'upgrade' });
  if (link.refusal === 'no_customer' || link.refusal === 'no_subscription') {
    throw redirect(303, '/app/billing');
  }
  if (link.refusal) return fail(500, { billingError: link.message || 'Could not start the upgrade' });

  throw redirect(303, link.url);
}

export async function applyRetention({ params, locals: { supabase } }: Ev) {
  if (!(await isBrandOwner(supabase, params.brand!))) return fail(403, { billingError: 'Owner only' });
  const coupon = env.STRIPE_RETENTION_COUPON;
  if (!coupon) return fail(400, { billingError: 'Retention offer is not configured.' });

  const billing = await orgBillingForBrand(supabase, { slug: params.brand! });
  if (!billing?.subscriptionId) return fail(400, { billingError: 'No active subscription.' });

  try {
    const { applyRetentionCoupon } = await stripeApi();
    await applyRetentionCoupon(billing.subscriptionId, coupon);
  } catch (e) {
    return fail(500, { billingError: e instanceof Error ? e.message : 'Could not apply the offer' });
  }
  return { retentionApplied: true };
}

export async function cancelPlan({ request, params, locals: { supabase } }: Ev) {
  if (!(await isBrandOwner(supabase, params.brand!))) return fail(403, { billingError: 'Owner only' });
  const data = await request.formData();
  const reason = String(data.get('reason') ?? '');
  const comment = String(data.get('explanation') ?? '').trim();

  const billing = await orgBillingForBrand(supabase, { slug: params.brand! });
  if (!billing?.subscriptionId) return fail(400, { billingError: 'No active subscription.' });

  let endsAt: string | null = null;
  try {
    const { cancelSubscriptionAtPeriodEnd } = await stripeApi();
    ({ endsAt } = await cancelSubscriptionAtPeriodEnd(billing.subscriptionId, {
      feedback: FEEDBACK[reason],
      comment
    }));
  } catch (e) {
    return fail(500, { billingError: e instanceof Error ? e.message : 'Could not cancel the plan' });
  }
  return { canceled: true, endsAt };
}

export async function deleteBrand({ request, params, locals: { supabase } }: Ev) {
  if (!(await isBrandOwner(supabase, params.brand!))) return fail(403, { deleteError: 'failed' });
  const data = await request.formData();
  const confirm = String(data.get('confirm') ?? '').trim();

  const { data: brand } = await supabase
    .from('brands')
    .select('id, name, slug')
    .eq('slug', params.brand!)
    .maybeSingle();
  if (!brand) return fail(404, { deleteError: 'failed' });
  if (confirm !== brand.name) return fail(400, { deleteError: 'nameMismatch' });

  // The subscription belongs to the org and covers every brand under it, so deleting one of
  // several leaves the others paid for: only the last brand out takes the subscription with it.
  const billing = await orgBillingForBrand(supabase, { slug: params.brand! });
  if (billing?.subscriptionId && billing.brandCount <= 1) {
    try {
      const { ensureSubscriptionCanceled } = await stripeApi();
      await ensureSubscriptionCanceled(billing.subscriptionId);
    } catch (e) {
      return fail(400, {
        deleteError: e instanceof Error && e.message === 'active_plan' ? 'activePlan' : 'failed'
      });
    }
  }

  const { data: accounts } = await supabase
    .from('social_accounts')
    .select('zernio_account_id')
    .eq('brand_id', brand.id);
  for (const a of accounts ?? []) {
    if (a.zernio_account_id) await disconnectAccount(a.zernio_account_id).catch(swallow('disconnect zernio account'));
  }

  // La stessa guardia della pagina, ma qui serve DAVVERO: in SvelteKit l'azione POST gira anche
  // quando il `load` della sua route risponde 404, quindi nascondere lo schermo non basta.
  if (!hasManyTenants()) return fail(404, { deleteError: 'not_found' });

  const { error } = await supabase.from('brands').delete().eq('id', brand.id);
  if (error) return fail(500, { deleteError: 'failed' });
  invalidateBrandNav(params.brand!);
  throw redirect(303, '/app');
}

/**
 * Il modello su cui partono le chat nuove di questo brand. Vuoto = nessuna scelta: il brand
 * segue il default globale del catalogo, e continuera` a seguirlo quando cambia.
 */
export async function setChatDefaultTier({ request, params, locals: { supabase } }: Ev) {
  const data = await request.formData();
  const tier = String(data.get('tier') ?? '').trim();
  if (!tier) {
    const { error } = await supabase
      .from('brands')
      .update({ chat_default_tier: null })
      .eq('slug', params.brand!);
    if (error) return { error: error.message };
    invalidateBrandNav(params.brand!);
    return { chatTierSaved: true };
  }
  if (!isChatTier(tier)) return { error: 'Pick a model' };
  // Un id che ha la forma giusta ma che il gateway non serve sarebbe un default rotto per ogni
  // chat nuova del brand: qui si controlla che sia una scelta davvero offerta.
  if (isGatewayModelTier(tier)) {
    const { isOfferedChatModel } = await import('$lib/server/chat-models');
    if (!(await isOfferedChatModel(tier))) return { error: 'That model is not available' };
  }
  const { error } = await supabase
    .from('brands')
    .update({ chat_default_tier: tier })
    .eq('slug', params.brand!);
  if (error) return { error: error.message };
  invalidateBrandNav(params.brand!);
  return { chatTierSaved: true };
}

/** Main brand website — drives Content Library crawl + SEO/GEO. Also mirrors onto brand_kit.source_url. */
export async function setWebsite({ request, params, locals: { supabase } }: Ev) {
  const data = await request.formData();
  const raw = String(data.get('website') ?? '').trim();
  let website: string | null = null;
  if (raw) {
    website = /^https?:\/\//i.test(raw) ? raw : `https://${raw}`;
    try {
      new URL(website);
    } catch {
      return { websiteError: 'Invalid URL' };
    }
  }
  const { data: brand } = await supabase
    .from('brands')
    .select('id')
    .eq('slug', params.brand!)
    .maybeSingle();
  if (!brand) return { websiteError: 'Brand not found' };
  const { error } = await supabase.from('brands').update({ website }).eq('id', brand.id);
  if (error) return { websiteError: error.message };
  await supabase.from('brand_kit').update({ source_url: website }).eq('brand_id', brand.id);
  invalidateBrandNav(params.brand!);
  return { websiteSaved: true };
}

export async function sync({ params, locals: { supabase } }: Ev) {
  const { data: brand } = await supabase
    .from('brands')
    .select('id, org_id, zernio_profile_id')
    .eq('slug', params.brand!)
    .maybeSingle();
  if (!brand) return { error: 'Brand not found' };
  if (!(await canAffordSeat(supabase, brand.org_id))) {
    return { error: 'Not enough credits for this month\'s account fee' };
  }
  try {
    await syncBrandAccounts(supabase, brand);
  } catch (e) {
    return { error: e instanceof Error ? e.message : 'Sync failed' };
  }
  return { synced: true };
}

export async function disconnect({ request, params, locals: { supabase } }: Ev) {
  const data = await request.formData();
  const id = String(data.get('id') ?? '');
  if (!id) return { error: 'Missing account' };

  const { data: brand } = await supabase
    .from('brands')
    .select('id')
    .eq('slug', params.brand!)
    .maybeSingle();
  if (!brand) return { error: 'Brand not found' };

  const { data: acc } = await supabase
    .from('social_accounts')
    .select('id, zernio_account_id')
    .eq('id', id)
    .eq('brand_id', brand.id)
    .maybeSingle();
  if (!acc) return { error: 'Account not found' };

  try {
    await disconnectAccount(acc.zernio_account_id);
  } catch (error) { swallow('disconnect zernio account', error); }
  await supabase.from('social_accounts').delete().eq('id', acc.id).eq('brand_id', brand.id);
  invalidateBrandNav(params.brand!);
  return { disconnected: true };
}

export async function invite({ request, params, url, cookies, locals: { supabase } }: Ev) {
  const fd = await request.formData();
  const email = String(fd.get('email') ?? '').trim().toLowerCase();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return fail(400, { teamError: 'Invalid email' });

  const { data: brand } = await supabase
    .from('brands')
    .select('id, name, org_id')
    .eq('slug', params.brand!)
    .maybeSingle();
  if (!brand) return fail(404, { teamError: 'Brand not found' });

  const {
    data: { user }
  } = await supabase.auth.getUser();
  if (!user) return fail(401, { teamError: 'Not authenticated' });
  if (email === user.email?.toLowerCase()) return fail(400, { teamError: 'That’s you' });

  // orgs_invites è a livello di organizzazione (nessun brand_id): invitare da una pagina di
  // settings di UN brand invita comunque nell'org intera — è per questo che ogni brand la vede.
  const { createInvite } = await import('$lib/server/repos/invites');
  let token: string;
  try {
    ({ token } = await createInvite(supabase, {
      orgId: brand.org_id,
      email,
      role: 'member',
      invitedBy: user.id
    }));
  } catch (e) {
    const code = (e as { code?: string } | null)?.code;
    const message = e instanceof Error ? e.message : 'Could not create the invite';
    return fail(400, { teamError: code === '23505' ? 'Already invited' : message });
  }

  let emailSent = true;
  try {
    const locale = emailLocale(cookies.get('locale'));
    const inviter = user.email ?? 'A teammate';
    const acceptUrl = `${url.origin}/app?view=invites&invite_token=${encodeURIComponent(token)}`;
    await sendEmail({
      to: email,
      subject: brandInviteEmailSubject(locale, brand.name, inviter),
      html: brandInviteEmailHtml(locale, brand.name, inviter, email, acceptUrl, url.origin),
      text: brandInviteEmailText(locale, brand.name, inviter, email, acceptUrl)
    });
  } catch {
    emailSent = false;
  }
  return { teamInvited: true, emailSent };
}

export async function revokeInvite({ request, params, locals: { supabase } }: Ev) {
  const fd = await request.formData();
  const id = String(fd.get('invite_id') ?? '');
  if (!id) return fail(400, { teamError: 'Missing invite' });

  const { data: brand } = await supabase
    .from('brands')
    .select('org_id')
    .eq('slug', params.brand!)
    .maybeSingle();
  if (!brand) return fail(404, { teamError: 'Brand not found' });

  const { revokeInvite: revokeInviteRepo } = await import('$lib/server/repos/invites');
  try {
    await revokeInviteRepo(supabase, { orgId: brand.org_id, inviteId: id });
  } catch (e) {
    return fail(500, { teamError: e instanceof Error ? e.message : 'Could not revoke the invite' });
  }
  return { teamRevoked: true };
}

export async function createApiKey({ request, params, locals: { supabase } }: Ev) {
  const data = await request.formData();
  const name = String(data.get('key_name') ?? '').trim() || 'API Key';
  const writeAccess = String(data.get('write') ?? '') === 'true';

  // api_keys.org_id è NOT NULL e non c'è una colonna per limitare la chiave a un sottoinsieme dei
  // brand dell'org (vedi ApiKeyInfo in cli-auth.ts): ogni chiave vale già per ogni brand dell'org.
  const { data: brand } = await supabase
    .from('brands')
    .select('org_id')
    .eq('slug', params.brand!)
    .maybeSingle();
  if (!brand) return fail(404, { apiKeyError: 'Brand not found' });

  const { raw, hash, prefix } = await generateApiKey();
  const scopes = writeAccess ? ['read', 'write'] : ['read'];

  const {
    data: { user }
  } = await supabase.auth.getUser();
  if (!user) return fail(401, { apiKeyError: 'Not authenticated' });

  const { error } = await supabase
    .from('api_keys')
    .insert({ org_id: brand.org_id, user_id: user.id, name, key_hash: hash, key_prefix: prefix, scopes });

  if (error) return fail(500, { apiKeyError: error.message });

  return { apiKeyCreated: true, apiKeyRaw: raw, apiKeyName: name };
}

export async function revokeApiKey({ request, params, locals: { supabase } }: Ev) {
  const data = await request.formData();
  const id = String(data.get('key_id') ?? '');
  if (!id) return fail(400, { apiKeyError: 'Missing key ID' });

  const { data: brand } = await supabase
    .from('brands')
    .select('org_id')
    .eq('slug', params.brand!)
    .maybeSingle();
  if (!brand) return fail(404, { apiKeyError: 'Brand not found' });

  const { error } = await supabase.from('api_keys').delete().eq('id', id).eq('org_id', brand.org_id);
  if (error) return fail(500, { apiKeyError: error.message });

  return { apiKeyRevoked: true };
}

/** Update the signed-in user's display name (first + last → profiles.full_name). */
export async function updateProfile({
  request,
  locals: { supabase, safeGetSession }
}: Ev) {
  const { user } = await safeGetSession();
  if (!user) return fail(401, { error: 'unauthorized' });
  const fd = await request.formData();
  const firstName = String(fd.get('firstName') ?? '')
    .trim()
    .slice(0, 80);
  const lastName = String(fd.get('lastName') ?? '')
    .trim()
    .slice(0, 80);
  const fullName = [firstName, lastName].filter(Boolean).join(' ').slice(0, 160);
  const { error } = await supabase
    .from('profiles')
    .update({ full_name: fullName || null })
    .eq('id', user.id);
  if (error) return fail(500, { error: error.message });
  return { profileSaved: true };
}

/** Upload / replace the signed-in user's profile photo → profiles.avatar_url. */
export async function uploadProfileAvatar({
  request,
  locals: { supabase, safeGetSession }
}: Ev) {
  const { user } = await safeGetSession();
  if (!user) return fail(401, { error: 'unauthorized' });
  const fd = await request.formData();
  const file = fd.get('avatar');
  if (!(file instanceof File) || file.size === 0) return fail(400, { error: 'no_file' });
  const img = await readUploadImage(file, { maxOutBytes: 2_000_000 });
  if (!img.ok) return fail(400, { error: img.error === 'too_large' ? 'too_large' : 'not_image' });

  const ext = img.mime.includes('png') ? 'png' : 'jpg';
  const path = `${user.id}/profile/avatar-${crypto.randomUUID()}.${ext}`;
  const up = await supabase.storage
    .from('media')
    .upload(path, img.bytes, { contentType: img.mime, upsert: false });
  if (up.error) return fail(500, { error: up.error.message });

  const avatarUrl = supabase.storage.from('media').getPublicUrl(path).data.publicUrl;
  const { error } = await supabase
    .from('profiles')
    .update({ avatar_url: avatarUrl })
    .eq('id', user.id);
  if (error) return fail(500, { error: error.message });
  return { avatarUploaded: true };
}

/** Clear profiles.avatar_url (falls back to OAuth picture if any). */
export async function removeProfileAvatar({ locals: { supabase, safeGetSession } }: Ev) {
  const { user } = await safeGetSession();
  if (!user) return fail(401, { error: 'unauthorized' });
  const { error } = await supabase
    .from('profiles')
    .update({ avatar_url: null })
    .eq('id', user.id);
  if (error) return fail(500, { error: error.message });
  return { avatarRemoved: true };
}
