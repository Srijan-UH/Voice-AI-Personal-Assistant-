/**
 * sarvam.ts — Centralized Sarvam AI client module.
 *
 * Provides:
 *   - chat(messages, options): OpenAI-compatible chat completions with backoff retry
 *   - transcribe(audioBuffer, mimeType, languageHint): Speech-to-text via Saaras v3
 *   - synthesize(text, options): Text-to-speech via Bulbul v3
 */
import dotenv from 'dotenv';

dotenv.config();

const SARVAM_BASE_URL = 'https://api.sarvam.ai';

export interface SarvamChatMessage {
  role: 'system' | 'user' | 'assistant';
  content: string;
}

export interface SarvamChatOptions {
  model?: string;
  temperature?: number;
  max_tokens?: number;
  timeoutMs?: number;
  maxRetries?: number;
}

export interface SarvamChatResult {
  content: string;
  model: string;
  latencyMs: number;
}

export interface SarvamSttResult {
  text: string;
  languageCode: string;
  latencyMs: number;
  confidence?: number;
}

export interface SarvamTtsResult {
  audioBuffer: Buffer;
  mimeType: string;
  latencyMs: number;
}

function getApiKey(): string {
  const key = process.env.SARVAM_API_KEY?.trim();
  if (!key || key.length < 5 || key.includes('your_sarvam_api_key')) {
    throw new Error('SARVAM_API_KEY is not configured or invalid');
  }
  return key;
}

/**
 * Helper: sleep with exponential backoff + jitter
 */
function wait(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Execute HTTP call with retry on 429 (Rate Limit) and 5xx (Server Error)
 */
async function fetchWithRetry(
  url: string,
  options: RequestInit,
  maxRetries: number = 3,
  timeoutMs: number = 15000
): Promise<Response> {
  let attempt = 0;
  let delay = 500;

  while (attempt < maxRetries) {
    attempt++;
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);

    try {
      const res = await fetch(url, {
        ...options,
        signal: controller.signal,
      });
      clearTimeout(timer);

      if (res.ok) {
        return res;
      }

      const status = res.status;
      const errText = await res.text().catch(() => '');

      // Retry on rate limit (429) or server errors (500, 502, 503, 504)
      if (status === 429 || (status >= 500 && status <= 504)) {
        console.warn(
          `[Sarvam] Attempt ${attempt}/${maxRetries} got HTTP ${status}: ${errText}. Retrying in ${delay}ms...`
        );
        if (attempt < maxRetries) {
          await wait(delay);
          delay = Math.min(delay * 2, 4000);
          continue;
        }
      }

      throw new Error(`Sarvam HTTP ${status}: ${errText}`);
    } catch (err: any) {
      clearTimeout(timer);
      if (err.name === 'AbortError') {
        console.warn(`[Sarvam] Request timed out after ${timeoutMs}ms (attempt ${attempt}/${maxRetries})`);
      }
      if (attempt >= maxRetries) {
        throw err;
      }
      await wait(delay);
      delay = Math.min(delay * 2, 4000);
    }
  }

  throw new Error(`Sarvam request failed after ${maxRetries} attempts`);
}

// ---------------------------------------------------------------------------
// 1. Chat Completion
// ---------------------------------------------------------------------------

export async function chat(
  messages: SarvamChatMessage[],
  options: SarvamChatOptions = {}
): Promise<SarvamChatResult> {
  const apiKey = getApiKey();
  const model =
    options.model || process.env.SARVAM_CHAT_MODEL || process.env.SARVAM_MODEL || 'sarvam-105b-conversations';
  const temperature = options.temperature ?? 0.1;
  const max_tokens = options.max_tokens ?? 100;
  const timeoutMs = options.timeoutMs ?? 15000;
  const maxRetries = options.maxRetries ?? 3;

  const t0 = Date.now();
  const res = await fetchWithRetry(
    `${SARVAM_BASE_URL}/v1/chat/completions`,
    {
      method: 'POST',
      headers: {
        'api-subscription-key': apiKey,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model,
        messages,
        temperature,
        max_tokens,
      }),
    },
    maxRetries,
    timeoutMs
  );

  const latencyMs = Date.now() - t0;
  const data = (await res.json()) as any;
  const content =
    data.choices?.[0]?.message?.content?.trim() ||
    data.choices?.[0]?.message?.reasoning_content?.trim() ||
    '';

  return {
    content,
    model,
    latencyMs,
  };
}

// ---------------------------------------------------------------------------
// 2. Speech to Text (Saaras v3)
// ---------------------------------------------------------------------------

export function detectSarvamLanguage(hint?: string): string {
  if (!hint) return 'en-IN';
  if (/[\u0900-\u097F]/.test(hint)) return 'hi-IN';
  const hinglish = ['namaste', 'kaise', 'chahiye', 'karna', 'dhanyawad', 'shukriya', 'aaj', 'kal', 'kya', 'hai'];
  const lower = hint.toLowerCase();
  if (hinglish.some((w) => new RegExp(`\\b${w}\\b`, 'i').test(lower))) return 'hi-IN';
  return 'en-IN';
}

export async function transcribe(
  audioBuffer: Buffer,
  mimeType: string = 'audio/webm',
  languageHint?: string
): Promise<SarvamSttResult> {
  const apiKey = getApiKey();
  const model = process.env.SARVAM_STT_MODEL || 'saaras:v3';
  const cleanMime = mimeType.split(';')[0].trim();
  const ext = cleanMime.includes('wav')
    ? 'wav'
    : cleanMime.includes('mp3')
      ? 'mp3'
      : cleanMime.includes('ogg')
        ? 'ogg'
        : cleanMime.includes('flac')
          ? 'flac'
          : cleanMime.includes('m4a')
            ? 'm4a'
            : cleanMime.includes('aac')
              ? 'aac'
              : 'webm';

  const languageCode = detectSarvamLanguage(languageHint);
  const file = new File([new Uint8Array(audioBuffer)], `audio.${ext}`, { type: cleanMime });

  const formData = new FormData();
  formData.append('file', file);
  formData.append('model', model);
  formData.append('mode', 'transcribe');
  formData.append('language_code', languageCode);
  formData.append('with_timestamps', 'false');

  const t0 = Date.now();
  const res = await fetchWithRetry(
    `${SARVAM_BASE_URL}/speech-to-text`,
    {
      method: 'POST',
      headers: {
        'api-subscription-key': apiKey,
      },
      body: formData,
    },
    2,
    15000
  );

  const latencyMs = Date.now() - t0;
  const data = (await res.json()) as any;
  const text = (data.transcript || data.text || '').trim();

  return {
    text,
    languageCode: data.language_code || languageCode,
    confidence: data.confidence,
    latencyMs,
  };
}

// ---------------------------------------------------------------------------
// 3. Text to Speech (Bulbul v3)
// ---------------------------------------------------------------------------

export interface SarvamTtsOptions {
  model?: string;
  speaker?: string;
  languageCode?: string;
  pace?: number;
}

export async function synthesize(
  text: string,
  options: SarvamTtsOptions = {}
): Promise<SarvamTtsResult> {
  const apiKey = getApiKey();
  const model = options.model || process.env.SARVAM_TTS_MODEL || 'bulbul:v3';
  const speaker = options.speaker || process.env.SARVAM_TTS_VOICE || 'ritu';
  const languageCode = options.languageCode || 'en-IN';
  const pace = options.pace ?? 1.0;

  const t0 = Date.now();
  const res = await fetchWithRetry(
    `${SARVAM_BASE_URL}/text-to-speech`,
    {
      method: 'POST',
      headers: {
        'api-subscription-key': apiKey,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        text,
        model,
        speaker,
        language_code: languageCode,
        pace,
      }),
    },
    2,
    15000
  );

  const latencyMs = Date.now() - t0;
  const data = (await res.json()) as any;

  if (!data.audios || !Array.isArray(data.audios) || data.audios.length === 0) {
    throw new Error('Sarvam TTS response missing audios array');
  }

  const base64Combined = data.audios.join('');
  const audioBuffer = Buffer.from(base64Combined, 'base64');

  return {
    audioBuffer,
    mimeType: 'audio/wav',
    latencyMs,
  };
}
