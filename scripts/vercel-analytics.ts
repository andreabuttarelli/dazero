const VERCEL_BUILD = '1';

export function vercelAnalyticsDefine(env: Record<string, string | undefined>): Record<string, string> {
  return { 'import.meta.env.VITE_VERCEL_ANALYTICS': JSON.stringify(env.VERCEL === VERCEL_BUILD) };
}
