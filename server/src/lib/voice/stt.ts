import dotenv from 'dotenv';
import { transcribe as sarvamTranscribe, detectSarvamLanguage, SarvamSttResult } from '../sarvam.js';

dotenv.config();

/**
 * Raw STT result including optional confidence score.
 */
export interface SttResult {
  text: string;
  confidence?: number;
  provider: string;
  latencyMs: number;
}

export { detectSarvamLanguage };

/**
 * Sarvam AI STT (Saaras v3)
 */
export async function transcribeWithSarvam(
  audioBuffer: Buffer,
  mimeType: string = 'audio/webm',
  languageHint?: string
): Promise<SttResult> {
  const model = process.env.SARVAM_STT_MODEL || 'saaras:v3';
  const res: SarvamSttResult = await sarvamTranscribe(audioBuffer, mimeType, languageHint);

  console.log(
    `[STT] Sarvam ${model} (${res.languageCode}) → "${res.text}" | conf=${res.confidence !== undefined ? res.confidence.toFixed(2) : 'n/a'} | ${res.latencyMs}ms`
  );

  return {
    text: res.text,
    confidence: res.confidence,
    provider: 'sarvam',
    latencyMs: res.latencyMs,
  };
}

/**
 * Universal Speech-to-Text transcriber.
 * Exclusively uses Sarvam AI (Saaras v3).
 */
export async function transcribeAudioUniversal(
  audioBuffer: Buffer,
  mimeType: string = 'audio/webm',
  languageHint?: string
): Promise<string> {
  try {
    const result = await transcribeWithSarvam(audioBuffer, mimeType, languageHint);
    return result.text;
  } catch (err: any) {
    console.error(`[STT] Sarvam transcription failed: ${err.message}`);
    throw new Error(
      'Could not transcribe audio via Sarvam AI. Please tap the mic to retry or type in chat below.'
    );
  }
}
