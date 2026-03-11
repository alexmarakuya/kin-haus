/** DRY helpers for JSON API responses. */

const JSON_HEADERS = { 'Content-Type': 'application/json' };

export function json(data: unknown, status = 200, extraHeaders?: Record<string, string>): Response {
  const headers = extraHeaders ? { ...JSON_HEADERS, ...extraHeaders } : JSON_HEADERS;
  return new Response(JSON.stringify(data), { status, headers });
}

export function jsonError(error: string, status = 400, detail?: string): Response {
  const body: Record<string, string> = { error };
  if (detail) body.detail = detail;
  return new Response(JSON.stringify(body), { status, headers: JSON_HEADERS });
}
