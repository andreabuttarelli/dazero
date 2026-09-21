import { env } from '$env/dynamic/private';

export function opsEmail(): string {
  return env.OPS_EMAIL || 'andrea@dazero.co';
}

export function supportEmail(): string {
  return env.SUPPORT_EMAIL || 'hello@dazero.co';
}

export function senderEmailDomain(): string {
  return env.SUPPORT_EMAIL_DOMAIN || 'dazero.co';
}
