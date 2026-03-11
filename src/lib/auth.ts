import { createHmac } from 'crypto';

/** Generate an HMAC-SHA256 session token from the dashboard password. */
export function getSessionToken(): string {
  const password = import.meta.env.DASHBOARD_PASSWORD || process.env.DASHBOARD_PASSWORD || '';
  return createHmac('sha256', password).update(password).digest('hex');
}
