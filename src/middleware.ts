import { defineMiddleware } from 'astro:middleware';
import { createHmac } from 'crypto';

function getSessionToken(): string {
  const password = import.meta.env.DASHBOARD_PASSWORD || process.env.DASHBOARD_PASSWORD || '';
  return createHmac('sha256', password).update(password).digest('hex');
}

export const onRequest = defineMiddleware(async ({ request, cookies, redirect }, next) => {
  const url = new URL(request.url);
  const path = url.pathname;

  // Public routes -- no auth needed
  const isProtected = path.startsWith('/dashboard') || (path.startsWith('/api/') && !path.startsWith('/api/auth'));

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
