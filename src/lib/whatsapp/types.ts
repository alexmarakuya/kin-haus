// WhatsApp Cloud API webhook payload types (v21.0)

export interface WhatsAppWebhookPayload {
  object: string;
  entry: Array<{
    id: string;
    changes: Array<{
      value: {
        messaging_product: string;
        metadata: { display_phone_number: string; phone_number_id: string };
        contacts?: Array<{ profile: { name: string }; wa_id: string }>;
        messages?: Array<WhatsAppMessage>;
        statuses?: Array<WhatsAppStatus>;
      };
      field: string;
    }>;
  }>;
}

export interface WhatsAppMessage {
  from: string;
  id: string;
  timestamp: string;
  type: 'text' | 'image' | 'document' | 'audio' | 'video' | 'location' | 'interactive' | 'button';
  text?: { body: string };
}

export interface WhatsAppStatus {
  id: string;
  status: 'sent' | 'delivered' | 'read' | 'failed';
  timestamp: string;
  recipient_id: string;
}

// Conversation state for AI context

export interface ConversationEntry {
  role: 'user' | 'assistant';
  content: string;
  timestamp: number;
}

export interface ConversationState {
  history: ConversationEntry[];
  lastActivity: number;
  userName: string;
}
