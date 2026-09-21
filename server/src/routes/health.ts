import { Router, Request, Response } from 'express';
import { getActiveProviders } from '../lib/providerInfo.js';

const router = Router();

router.get('/health', (_req: Request, res: Response) => {
  const rawVoiceMode = (process.env.VOICE_MODE || 'browser').trim().toLowerCase();
  const voiceMode = ['browser', 'sarvam-static', 'sarvam'].includes(rawVoiceMode)
    ? rawVoiceMode
    : 'browser';

  const response: Record<string, any> = {
    status: 'ok',
    service: 'Voice AI Personal Assistant API',
    voiceMode,
    timestamp: new Date().toISOString(),
  };

  // Include provider details only when DEBUG_PROVIDERS=true
  if (process.env.DEBUG_PROVIDERS === 'true') {
    const p = getActiveProviders();
    response.providers = {
      stt: { provider: p.stt.provider, model: p.stt.model, keySet: p.stt.keySet },
      llm: { provider: p.llm.provider, model: p.llm.model, keySet: p.llm.keySet },
      tts: { provider: p.tts.provider, model: p.tts.model, voice: p.tts.voice, keySet: p.tts.keySet },
      env: {
        STT_PROVIDER: process.env.STT_PROVIDER || 'sarvam (default)',
        TTS_PROVIDER: process.env.TTS_PROVIDER || 'sarvam (default)',
        SARVAM_MODEL: process.env.SARVAM_MODEL || 'sarvam-105b (default)',
        SARVAM_STT_MODEL: process.env.SARVAM_STT_MODEL || 'saaras:v3 (default)',
        SARVAM_TTS_MODEL: process.env.SARVAM_TTS_MODEL || 'bulbul:v3 (default)',
        SARVAM_TTS_VOICE: process.env.SARVAM_TTS_VOICE || 'ritu (default)',
        CLINIC_OPEN_HOUR: process.env.CLINIC_OPEN_HOUR || '9 (default)',
        CLINIC_CLOSE_HOUR: process.env.CLINIC_CLOSE_HOUR || '19 (default)',
        SARVAM_API_KEY: process.env.SARVAM_API_KEY ? 'SET' : 'MISSING',
      },
    };
  }

  res.json(response);
});

export default router;
