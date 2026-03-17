import type { APIRoute } from 'astro';
import { readPasses, writePasses } from '../../../lib/coworking.ts';
import { json, jsonError } from '../../../lib/api-response.ts';

export const PATCH: APIRoute = async ({ params, request }) => {
  try {
    const { id } = params;
    const body = await request.json();
    const passes = readPasses();
    const pass = passes.find(p => p.id === id);
    if (!pass) return jsonError('Pass not found', 404);

    if (body.notes !== undefined) pass.notes = body.notes;
    if (body.contact !== undefined) pass.contact = body.contact;
    if (body.status && ['active', 'expired', 'cancelled'].includes(body.status)) pass.status = body.status;
    if (body.name) pass.name = body.name;
    pass.updatedAt = new Date().toISOString();

    writePasses(passes);
    return json({ pass });
  } catch (err: any) {
    console.error('[api] /api/coworking PATCH error:', err);
    return jsonError('Failed to update pass', 500, err.message);
  }
};

export const DELETE: APIRoute = async ({ params }) => {
  try {
    const { id } = params;
    const passes = readPasses();
    const idx = passes.findIndex(p => p.id === id);
    if (idx === -1) return jsonError('Pass not found', 404);
    passes.splice(idx, 1);
    writePasses(passes);
    return json({ ok: true });
  } catch (err: any) {
    console.error('[api] /api/coworking DELETE error:', err);
    return jsonError('Failed to delete pass', 500, err.message);
  }
};
