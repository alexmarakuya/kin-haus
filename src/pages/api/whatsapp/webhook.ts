import type { APIRoute } from 'astro';
import { handleMessage } from '../../../lib/whatsapp/chatbot.ts';
import { sendTextMessage, markAsRead } from '../../../lib/whatsapp/client.ts';
import { verifyWebhookSignature, isRateLimited } from '../../../lib/whatsapp/security.ts';
import type { WhatsAppWebhookPayload } from '../../../lib/whatsapp/types.ts';

/**
 * GET: Meta webhook verification handshake.
 * Meta sends this once when you configure the webhook URL.
 */
export const GET: APIRoute = async ({ request }) => {
  const url = new URL(request.url);
  const mode = url.searchParams.get('hub.mode');
  const token = url.searchParams.get('hub.verify_token');
  const challenge = url.searchParams.get('hub.challenge');

  const verifyToken = import.meta.env.WHATSAPP_VERIFY_TOKEN || process.env.WHATSAPP_VERIFY_TOKEN;

  if (mode === 'subscribe' && token === verifyToken) {
    console.log('[whatsapp] webhook verified');
    return new Response(challenge, { status: 200 });
  }

  console.warn('[whatsapp] webhook verification failed');
  return new Response('Forbidden', { status: 403 });
};

/**
 * POST: Incoming WhatsApp messages.
 * Returns 200 immediately, processes the message asynchronously.
 */
export const POST: APIRoute = async ({ request }) => {
  const rawBody = await request.text();
  const signature = request.headers.get('x-hub-signature-256');

  if (!verifyWebhookSignature(rawBody, signature)) {
    console.warn('[whatsapp] invalid webhook signature');
    return new Response('Invalid signature', { status: 401 });
  }

  const payload: WhatsAppWebhookPayload = JSON.parse(rawBody);

  // Fire-and-forget: process async, return 200 to Meta immediately
  processWebhook(payload).catch((err) => {
    console.error('[whatsapp] processing error:', err);
  });

  return new Response('OK', { status: 200 });
};

async function processWebhook(payload: WhatsAppWebhookPayload): Promise<void> {
  for (const entry of payload.entry) {
    for (const change of entry.changes) {
      const messages = change.value.messages;
      const contacts = change.value.contacts;
      if (!messages || !contacts) continue;

      for (const msg of messages) {
        // Only handle text messages for now
        if (msg.type !== 'text' || !msg.text?.body) continue;

        const from = msg.from;
        const userName = contacts[0]?.profile?.name || 'Guest';
        const text = msg.text.body;

        console.log(`[whatsapp] message from ${from} (${userName}): ${text.substring(0, 100)}`);

        // Mark as read
        await markAsRead(msg.id);

        // Rate limit check
        if (isRateLimited(from)) {
          await sendTextMessage(from, 'Please wait a moment before sending more messages.');
          continue;
        }

        // Get AI response and send it back
        const reply = await handleMessage(from, text, userName);
        await sendTextMessage(from, reply);
      }
    }
  }
}
