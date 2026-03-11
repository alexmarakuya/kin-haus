import { createHmac } from 'crypto';

/**
 * Verify Meta webhook signature (X-Hub-Signature-256 header).
 * Meta signs every POST with HMAC-SHA256 using the App Secret.
 */
export function verifyWebhookSignature(rawBody: string, signature: string | null): boolean {
  if (!signature) return false;

  const appSecret = import.meta.env.WHATSAPP_APP_SECRET || process.env.WHATSAPP_APP_SECRET;
  if (!appSecret) {
    console.error('[whatsapp] WHATSAPP_APP_SECRET not configured');
    return false;
  }

  const expected = 'sha256=' + createHmac('sha256', appSecret).update(rawBody).digest('hex');
  return signature === expected;
}

// Simple in-memory rate limiter: 10 messages per minute per phone number
const rateLimits = new Map<string, { count: number; resetAt: number }>();
const MAX_MESSAGES_PER_MINUTE = 10;

export function isRateLimited(phoneNumber: string): boolean {
  const now = Date.now();
  const entry = rateLimits.get(phoneNumber);

  if (!entry || now > entry.resetAt) {
    rateLimits.set(phoneNumber, { count: 1, resetAt: now + 60_000 });
    return false;
  }

  entry.count++;
  return entry.count > MAX_MESSAGES_PER_MINUTE;
}
