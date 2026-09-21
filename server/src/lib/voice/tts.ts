import dotenv from 'dotenv';
import { synthesize as sarvamSynthesize, SarvamTtsResult } from '../sarvam.js';
import { normalizeForSpeech } from '../speechNormalizer.js';

dotenv.config();

export interface TtsResult {
  audioBuffer: Buffer;
  mimeType: string;
  provider: string;
  latencyMs: number;
}

/**
 * Sarvam AI TTS (Bulbul v3)
 */
export async function synthesizeWithSarvam(text: string): Promise<TtsResult> {
  const model = process.env.SARVAM_TTS_MODEL || 'bulbul:v3';
  const speaker = process.env.SARVAM_TTS_VOICE || 'ritu';

  const res: SarvamTtsResult = await sarvamSynthesize(text, {
    model,
    speaker,
    languageCode: 'en-IN',
  });

  console.log(`[TTS] Sarvam ${model} (${speaker}) → ${res.audioBuffer.length} bytes WAV | ${res.latencyMs}ms`);

  return {
    audioBuffer: res.audioBuffer,
    mimeType: res.mimeType,
    provider: 'sarvam',
    latencyMs: res.latencyMs,
  };
}

/**
 * Universal TTS synthesizer.
 * Exclusively uses Sarvam AI (Bulbul v3).
 *
 * Returns null if Sarvam fails (client falls back to browser speechSynthesis as safety net).
 */
export async function synthesizeSpeechUniversal(
  text: string
): Promise<{ audioBuffer: Buffer; mimeType: string } | null> {
  if (!text || text.trim().length === 0) return null;

  try {
    const normalized = normalizeForSpeech(text);
    const result = await synthesizeWithSarvam(normalized);
    return { audioBuffer: result.audioBuffer, mimeType: result.mimeType };
  } catch (err: any) {
    console.error(`[TTS] Sarvam synthesis failed: ${err.message}`);
    return null;
  }
}
