import { env } from '$env/dynamic/private';

export function opsEmail(): string {
  return env.OPS_EMAIL || 'andrea@feega.app';
}

export function supportEmail(): string {
  return env.SUPPORT_EMAIL || 'hello@feega.app';
}

export function senderEmailDomain(): string {
  return env.SUPPORT_EMAIL_DOMAIN || 'feega.app';
}
