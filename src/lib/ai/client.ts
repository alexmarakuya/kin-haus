import OpenAI from 'openai';

let _client: OpenAI | null = null;

/**
 * Shared OpenAI client singleton.
 * Lazy-initialises on first call, reuses across all AI features.
 */
export function getOpenAIClient(): OpenAI {
  if (!_client) {
    const apiKey = import.meta.env.OPENAI_API_KEY || process.env.OPENAI_API_KEY;
    if (!apiKey) throw new Error('OPENAI_API_KEY not configured');
    _client = new OpenAI({ apiKey });
  }
  return _client;
}
