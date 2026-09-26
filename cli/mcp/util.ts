import { loadSession, type StoredSession } from '../lib/auth.ts';
import { getRequestAuth } from './context.ts';

export type ToolResult = {
  content: { type: 'text'; text: string }[];
  isError?: boolean;
  structuredContent?: Record<string, unknown>;
};

export function ok(data: unknown): ToolResult {
  const text = typeof data === 'string' ? data : JSON.stringify(data, null, 2);
  const structured =
    data !== null && typeof data === 'object' && !Array.isArray(data)
      ? (data as Record<string, unknown>)
      : { result: data };
  return {
    content: [{ type: 'text', text }],
    structuredContent: structured,
  };
}

export function fail(message: string): ToolResult {
  return {
    content: [{ type: 'text', text: message }],
    isError: true,
  };
}

function sessionFromRequestAuth(): StoredSession | null {
  const ctx = getRequestAuth();
  if (!ctx) return null;
  return {
    access_token: ctx.access_token,
    refresh_token: '',
    expires_at: ctx.expires_at ?? Math.floor(Date.now() / 1000) + 3600,
    user: ctx.user,
  };
}

/** Active OAuth session (HTTP Bearer or local CLI session file). */
export async function requireAuth(): Promise<
  { ok: true; session: StoredSession } | { ok: false; result: ToolResult }
> {
  const fromHttp = sessionFromRequestAuth();
  if (fromHttp) return { ok: true, session: fromHttp };

  const session = await loadSession();
  if (!session) {
    return {
      ok: false,
      result: fail(
        'Not authenticated. Locally: run `feega login` in a terminal — the CLI and this server share one session file. ' +
          'For remote HTTP (mcp.feega.app): send Authorization: Bearer <access_token> from your feega OAuth session. ' +
          'No static API tokens are supported.',
      ),
    };
  }
  return { ok: true, session };
}

export async function withAuth(
  fn: (token: string, session: StoredSession) => Promise<unknown>,
): Promise<ToolResult> {
  const auth = await requireAuth();
  if (!auth.ok) return auth.result;
  try {
    const data = await fn(auth.session.access_token, auth.session);
    return ok(data);
  } catch (e) {
    return fail(e instanceof Error ? e.message : String(e));
  }
}
