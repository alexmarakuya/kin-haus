import { createHmac } from 'node:crypto';

/**
 * HTTP client for the Kin Haus REST API.
 * Computes the session token directly (same HMAC-SHA256 algorithm as the server)
 * and sends it as a cookie on every request.
 */

const DEFAULT_BASE_URL = 'http://localhost:3001';

function getBaseUrl(): string {
  return process.env.KIN_HAUS_URL || DEFAULT_BASE_URL;
}

function getSessionToken(): string {
  const password = process.env.KIN_HAUS_PASSWORD;
  if (!password) {
    throw new Error(
      'KIN_HAUS_PASSWORD env var is required. Set it to the dashboard password.'
    );
  }
  return createHmac('sha256', password).update(password).digest('hex');
}

interface ApiResponse<T = unknown> {
  ok: boolean;
  status: number;
  data: T;
}

/**
 * Make an authenticated request to the Kin Haus API.
 */
export async function apiRequest<T = unknown>(
  method: string,
  path: string,
  body?: unknown
): Promise<ApiResponse<T>> {
  const baseUrl = getBaseUrl();
  const token = getSessionToken();
  const url = `${baseUrl}${path}`;

  const headers: Record<string, string> = {
    Cookie: `kin_session=${token}`,
    Accept: 'application/json',
  };

  if (body !== undefined) {
    headers['Content-Type'] = 'application/json';
  }

  const response = await fetch(url, {
    method,
    headers,
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });

  let data: T;
  const contentType = response.headers.get('content-type') || '';
  if (contentType.includes('application/json')) {
    data = (await response.json()) as T;
  } else {
    data = (await response.text()) as unknown as T;
  }

  return {
    ok: response.ok,
    status: response.status,
    data,
  };
}

/** GET helper */
export async function apiGet<T = unknown>(path: string): Promise<ApiResponse<T>> {
  return apiRequest<T>('GET', path);
}

/** POST helper */
export async function apiPost<T = unknown>(path: string, body?: unknown): Promise<ApiResponse<T>> {
  return apiRequest<T>('POST', path, body);
}

/** PATCH helper */
export async function apiPatch<T = unknown>(path: string, body?: unknown): Promise<ApiResponse<T>> {
  return apiRequest<T>('PATCH', path, body);
}

/** DELETE helper */
export async function apiDelete<T = unknown>(path: string): Promise<ApiResponse<T>> {
  return apiRequest<T>('DELETE', path);
}
