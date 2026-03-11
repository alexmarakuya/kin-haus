const WHATSAPP_API = 'https://graph.facebook.com/v21.0';

function getConfig() {
  const phoneNumberId = import.meta.env.WHATSAPP_PHONE_NUMBER_ID || process.env.WHATSAPP_PHONE_NUMBER_ID;
  const accessToken = import.meta.env.WHATSAPP_ACCESS_TOKEN || process.env.WHATSAPP_ACCESS_TOKEN;
  return { phoneNumberId, accessToken };
}

/**
 * Send a text message via WhatsApp Cloud API.
 * Splits messages longer than 4096 chars automatically.
 */
export async function sendTextMessage(to: string, text: string): Promise<void> {
  const { phoneNumberId, accessToken } = getConfig();
  if (!phoneNumberId || !accessToken) {
    console.error('[whatsapp] missing WHATSAPP_PHONE_NUMBER_ID or WHATSAPP_ACCESS_TOKEN');
    return;
  }

  const chunks = splitMessage(text, 4096);

  for (const chunk of chunks) {
    try {
      const res = await fetch(`${WHATSAPP_API}/${phoneNumberId}/messages`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${accessToken}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          messaging_product: 'whatsapp',
          to,
          type: 'text',
          text: { body: chunk },
        }),
      });

      if (!res.ok) {
        const err = await res.text();
        console.error('[whatsapp] send error:', res.status, err);
      }
    } catch (err: any) {
      console.error('[whatsapp] send failed:', err.message);
    }
  }
}

/**
 * Mark an incoming message as read (shows blue checkmarks).
 */
export async function markAsRead(messageId: string): Promise<void> {
  const { phoneNumberId, accessToken } = getConfig();
  if (!phoneNumberId || !accessToken) return;

  try {
    await fetch(`${WHATSAPP_API}/${phoneNumberId}/messages`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        messaging_product: 'whatsapp',
        status: 'read',
        message_id: messageId,
      }),
    });
  } catch (err: any) {
    console.error('[whatsapp] markAsRead failed:', err.message);
  }
}

function splitMessage(text: string, maxLength: number): string[] {
  if (text.length <= maxLength) return [text];

  const chunks: string[] = [];
  let remaining = text;

  while (remaining.length > 0) {
    if (remaining.length <= maxLength) {
      chunks.push(remaining);
      break;
    }

    // Try to split at the last newline before the limit
    let splitAt = remaining.lastIndexOf('\n', maxLength);
    if (splitAt < maxLength * 0.5) {
      // Newline too far back; split at last space
      splitAt = remaining.lastIndexOf(' ', maxLength);
    }
    if (splitAt < maxLength * 0.5) {
      // No good break point; hard split
      splitAt = maxLength;
    }

    chunks.push(remaining.slice(0, splitAt));
    remaining = remaining.slice(splitAt).trimStart();
  }

  return chunks;
}
