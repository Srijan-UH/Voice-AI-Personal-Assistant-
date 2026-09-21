/**
 * providerInfo.ts — Centralises "which provider is active?" logic.
 *
 * Exclusively uses Sarvam AI for all modalities (STT, LLM, TTS).
 * Read by:
 *   - server startup summary log
 *   - GET /health endpoint (when DEBUG_PROVIDERS=true)
 *   - per-turn logging helpers
 */
import dotenv from 'dotenv';
dotenv.config();

export interface ProviderInfo {
  stt: { provider: string; model: string; keySet: boolean };
  llm: { provider: string; model: string; keySet: boolean };
  tts: { provider: string; model: string; voice: string; keySet: boolean };
}

/** Returns the active provider selection based on env vars. Never exposes key values. */
export function getActiveProviders(): ProviderInfo {
  const sarvamKeySet = Boolean(
    process.env.SARVAM_API_KEY &&
    process.env.SARVAM_API_KEY.length > 5 &&
    !process.env.SARVAM_API_KEY.includes('your_sarvam_api_key')
  );

  // ── STT ──────────────────────────────────────────────────────────────────
  const sttModel = process.env.SARVAM_STT_MODEL || 'saaras:v3';

  // ── LLM ──────────────────────────────────────────────────────────────────
  const llmProvider = sarvamKeySet ? 'sarvam' : 'local-deterministic';
  const llmModel = sarvamKeySet ? (process.env.SARVAM_MODEL || 'sarvam-105b') : 'regex-rules';
  const llmKeySet = sarvamKeySet;

  // ── TTS ──────────────────────────────────────────────────────────────────
  const ttsModel = process.env.SARVAM_TTS_MODEL || 'bulbul:v3';
  const ttsVoice = process.env.SARVAM_TTS_VOICE || 'ritu';

  return {
    stt: { provider: 'sarvam', model: sttModel, keySet: sarvamKeySet },
    llm: { provider: llmProvider, model: llmModel, keySet: llmKeySet },
    tts: { provider: 'sarvam', model: ttsModel, voice: ttsVoice, keySet: sarvamKeySet },
  };
}

/** Logs the provider summary to console on startup. */
export function logProviderSummary(): void {
  const p = getActiveProviders();
  console.log(
    `[Providers] Sarvam AI Pipeline: ` +
    `STT=${p.stt.provider}(${p.stt.model}) key=${p.stt.keySet ? 'SET' : 'MISSING'} | ` +
    `LLM=${p.llm.provider}(${p.llm.model}) key=${p.llm.keySet ? 'SET' : 'MISSING'} | ` +
    `TTS=${p.tts.provider}(${p.tts.model}) voice=${p.tts.voice} key=${p.tts.keySet ? 'SET' : 'MISSING'}`
  );
  if (!p.llm.keySet) {
    console.warn('[Providers] ⚠️  SARVAM_API_KEY is not set. Engine running in deterministic fallback mode.');
  }
}

/** Per-turn log line (one per turn, covers STT/LLM/TTS durations). */
export function logTurnPerf(opts: {
  sttProvider: string; sttModel: string; sttMs: number; sttFallback?: boolean;
  llmProvider: string; llmModel: string; llmMs: number; llmFallback?: boolean;
  ttsProvider: string; ttsModel: string; ttsMs: number; ttsFallback?: boolean; ttsCached?: boolean;
  totalMs: number;
}): void {
  const sttFb = opts.sttFallback ? ' [FALLBACK]' : '';
  const llmFb = opts.llmFallback ? ' [FALLBACK]' : '';
  const ttsFb = opts.ttsFallback ? ' [FALLBACK]' : opts.ttsCached ? ' [CACHED]' : '';
  console.log(
    `[Turn] STT=${opts.sttProvider}/${opts.sttModel} ${opts.sttMs}ms${sttFb} | ` +
    `LLM=${opts.llmProvider}/${opts.llmModel} ${opts.llmMs}ms${llmFb} | ` +
    `TTS=${opts.ttsProvider}/${opts.ttsModel} ${opts.ttsMs}ms${ttsFb} | ` +
    `total=${opts.totalMs}ms`
  );
}
