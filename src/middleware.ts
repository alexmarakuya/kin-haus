import { defineMiddleware } from 'astro:middleware';
import { getSessionToken } from './lib/auth.ts';

export const onRequest = defineMiddleware(async ({ request, cookies, redirect }, next) => {
  const url = new URL(request.url);
  const path = url.pathname;

  // Public routes -- no auth needed
  // Allow POST to /api/inquiries from the marketing site (public booking form)
  // Allow GET to /api/availability/* (public availability calendar)
  const isPublicInquiry = path === '/api/inquiries' && request.method === 'POST';
  const isPublicAvailability = path.startsWith('/api/availability') && request.method === 'GET';
  const isWhatsAppWebhook = path === '/api/whatsapp/webhook';
  const isHousekeepingIcal = path === '/api/housekeeping/ical' && request.method === 'GET';
  const isProtected = path.startsWith('/dashboard') || (path.startsWith('/api/') && !path.startsWith('/api/auth') && !isPublicInquiry && !isPublicAvailability && !isWhatsAppWebhook && !isHousekeepingIcal);

  if (!isProtected) {
    return next();
  }

  // Check session cookie
  const session = cookies.get('kin_session')?.value;
  const validToken = getSessionToken();

  if (session === validToken) {
    return next();
  }

  // Not authenticated
  if (path.startsWith('/api/')) {
    return new Response(JSON.stringify({ error: 'Unauthorized' }), {
      status: 401,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  return redirect('/login', 302);
});
