import { swallow } from '$lib/server/swallow';
import { fail, redirect } from '@sveltejs/kit';
import { createAdminClient } from '$lib/server/supabase-admin';
import { sendEmail, passwordResetEmailSubject, passwordResetEmailHtml, passwordResetEmailText } from '$lib/server/email';
import { emailLocale } from '$lib/server/email-i18n';
import { sanitizeWebsiteParam } from '$lib/website-param';
import { appOrigin } from '$lib/server/app-url';
import { takeOAuthReturn } from '$lib/server/oauth';
import type { Cookies, RequestEvent } from '@sveltejs/kit';
import type { Actions, PageServerLoad } from './$types';

const EMAIL_RE = /^[^@\s]+@[^@\s]+\.[^@\s]+$/;
const MIN_PASSWORD = 6;

/** Homepage/ads URL CTA, pricing plan CTA → open create-account, not sign-in. */
function preferSignup(url: URL): boolean {
  if (url.searchParams.get('next') === 'onboarding') return true;
  if (url.searchParams.get('mode') === 'signup') return true;
  if (sanitizeWebsiteParam(url.searchParams.get('website'))) return true;
  return false;
}

// Già dentro? Si va all'app, che ora fa da sé il poco che serve prima di aprire una tela.
export const load: PageServerLoad = async ({ url, cookies, locals: { safeGetSession } }) => {
  const cliPort = url.searchParams.get('cli_port') ?? '';
  const cliState = url.searchParams.get('cli_state') ?? '';
  const { session, user } = await safeGetSession();
  if (session && user) {
    const oauthReturn = takeOAuthReturn(cookies);
    if (oauthReturn) throw redirect(303, oauthReturn);
    if (cliPort) throw redirect(303, `/cli/callback?cli_port=${cliPort}&cli_state=${cliState}`);
    throw redirect(303, '/app');
  }
  return { cliPort, cliState, preferSignup: preferSignup(url) };
};

// Public origin for absolute email / OAuth links. Prefer the live request host (www vs apex)
// so Supabase redirect allow-lists match; see appOrigin().
function appBase(url: URL): string {
  return appOrigin(url);
}

// Dopo un accesso riuscito (stessa logica della callback OAuth): il CLI alla sua callback,
// tutti gli altri all'app. Lancia sempre.
async function routeAfterAuth(
  data: FormData,
  cliPort: string,
  cliState: string,
  cookies: Cookies
): Promise<never> {
  // An interrupted /oauth/authorize resumes here (MCP client connect → login → consent).
  const oauthReturn = takeOAuthReturn(cookies);
  if (oauthReturn) throw redirect(303, oauthReturn);

  if (cliPort) {
    throw redirect(303, `/cli/callback?cli_port=${encodeURIComponent(cliPort)}&cli_state=${encodeURIComponent(cliState)}`);
  }

  throw redirect(303, '/app');
}

export const actions: Actions = {
  // Email + password sign-in. Wrong creds come back as a generic code (no account enumeration).
  login: async ({ request, cookies, locals: { supabase } }) => {
    const data = await request.formData();
    const email = String(data.get('email') ?? '').trim().toLowerCase();
    const password = String(data.get('password') ?? '');
    const cliPort = String(data.get('cli_port') ?? '');
    const cliState = String(data.get('cli_state') ?? '');

    if (!EMAIL_RE.test(email)) return fail(400, { errorCode: 'invalidEmail', email });
    if (!password) return fail(400, { errorCode: 'invalidCredentials', email });

    const { error } = await supabase.auth.signInWithPassword({ email, password });
    if (error) {
      // "Invalid login credentials" / "Email not confirmed" → one generic message.
      const code = /invalid login|not confirmed/i.test(error.message) ? 'invalidCredentials' : null;
      return code ? fail(400, { errorCode: code, email }) : fail(400, { error: error.message, email });
    }

    return routeAfterAuth(data, cliPort, cliState, cookies);
  },

  // Sign-up. We create an already-confirmed user via the admin API (no confirmation email — the
  // product decision is instant login) and then sign in on the SSR client to set the session
  // cookies. This is robust to the dashboard "Confirm email" toggle either way.
  signup: async ({ request, cookies, locals: { supabase } }) => {
    const data = await request.formData();
    const email = String(data.get('email') ?? '').trim().toLowerCase();
    const password = String(data.get('password') ?? '');
    const cliPort = String(data.get('cli_port') ?? '');
    const cliState = String(data.get('cli_state') ?? '');

    if (!EMAIL_RE.test(email)) return fail(400, { errorCode: 'invalidEmail', email });
    if (password.length < MIN_PASSWORD) return fail(400, { errorCode: 'weakPassword', email });

    const admin = createAdminClient();
    const { error: createErr } = await admin.auth.admin.createUser({
      email,
      password,
      email_confirm: true
    });
    if (createErr) {
      if (/already|registered|exists|duplicate/i.test(createErr.message)) {
        return fail(400, { errorCode: 'emailExists', email });
      }
      return fail(400, { error: createErr.message, email });
    }

    const { error: signErr } = await supabase.auth.signInWithPassword({ email, password });
    if (signErr) return fail(400, { error: signErr.message, email });

    return routeAfterAuth(data, cliPort, cliState, cookies);
  },

  // Forgot-password. Generate a recovery link server-side (service role) and email it ourselves via
  // Resend — we never use Supabase's built-in mailer. We verify the token at /auth/confirm, so the
  // link points straight there (no redirect-allow-list config needed). Always returns the same
  // "sent" state, even for unknown emails, to avoid account enumeration.
  reset: async ({ request, url }) => {
    const data = await request.formData();
    const email = String(data.get('email') ?? '').trim().toLowerCase();
    if (!EMAIL_RE.test(email)) return fail(400, { errorCode: 'invalidEmail', email });

    const locale = emailLocale(String(data.get('locale') ?? ''));
    try {
      const admin = createAdminClient();
      const { data: link, error } = await admin.auth.admin.generateLink({ type: 'recovery', email });
      const hashed = link?.properties?.hashed_token;
      if (!error && hashed) {
        const base = appBase(url);
        const confirmUrl = `${base}/auth/confirm?token_hash=${encodeURIComponent(hashed)}&type=recovery&next=${encodeURIComponent('/auth/reset-password')}`;
        await sendEmail({
          to: email,
          subject: passwordResetEmailSubject(locale),
          html: passwordResetEmailHtml(locale, confirmUrl, base),
          text: passwordResetEmailText(locale, confirmUrl)
        });
      }
    } catch (error) { swallow('deliver password reset', error); }

    return { reset: true, email };
  },

  // GitHub / Google OAuth. Returns a provider URL to bounce through; the PKCE verifier is stashed in
  // cookies by the SSR client, and /auth/callback exchanges the code on return.
  github: (event) => oauthSignIn(event, 'github'),
  google: (event) => oauthSignIn(event, 'google')
};

// L'unica intenzione che deve sopravvivere al giro OAuth: quella del CLI, che aspetta su una
// porta locale. Tutto il resto atterra su /app, che decide da sé cosa aprire.
function buildRedirectTo(url: URL, cliPort: string, cliState: string): string {
  const cb = new URLSearchParams();
  if (cliPort) {
    cb.set('cli_port', cliPort);
    cb.set('cli_state', cliState);
  }
  return `${appBase(url)}/auth/callback${cb.toString() ? `?${cb}` : ''}`;
}

// Shared OAuth kickoff: ask Supabase for the provider URL and bounce the browser there.
async function oauthSignIn({ request, locals: { supabase }, url }: RequestEvent, provider: 'github' | 'google') {
  const data = await request.formData();
  const cliPort = String(data.get('cli_port') ?? '');
  const cliState = String(data.get('cli_state') ?? '');
  const redirectTo = buildRedirectTo(url, cliPort, cliState);
  const { data: oauth, error } = await supabase.auth.signInWithOAuth({ provider, options: { redirectTo } });

  if (error || !oauth?.url) return fail(400, { error: error?.message ?? `Could not start ${provider} sign-in` });
  throw redirect(303, oauth.url);
}
