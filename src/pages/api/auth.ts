import type { APIRoute } from 'astro';
import { getSessionToken } from '../../lib/auth.ts';

export const POST: APIRoute = async ({ request, cookies, redirect }) => {
  const form = await request.formData();
  const password = form.get('password')?.toString() || '';
  const expected = import.meta.env.DASHBOARD_PASSWORD || process.env.DASHBOARD_PASSWORD || '';

  if (!expected || password !== expected) {
    return redirect('/login?error=1', 302);
  }

  const token = getSessionToken();

  cookies.set('kin_session', token, {
    httpOnly: true,
    sameSite: 'lax',
    secure: import.meta.env.PROD,
    path: '/',
    maxAge: 60 * 60 * 24 * 30, // 30 days
  });

  return redirect('/dashboard', 302);
};
