import { Router, Request, Response } from 'express';
import multer from 'multer';
import { transcribeAudioUniversal } from '../lib/voice/stt.js';
import { synthesizeSpeechUniversal } from '../lib/voice/tts.js';
import { ttsCache } from '../lib/voice/ttsCache.js';
import { processConversationTurn } from '../lib/engine.js';
import { getActiveProviders, logTurnPerf } from '../lib/providerInfo.js';

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 10 * 1024 * 1024 }, // 10 MB
});

const router = Router();

/**
 * Helper: Get audio base64 for a reply, using pre-cache when possible.
 * Falls back to live TTS synthesis.
 */
async function getAudioForReply(
  replyText: string,
  replyPhraseKey?: string
): Promise<{ audioBase64: string | null; fromCache: boolean; ttsMs: number }> {
  // In browser voice mode, return null so browser Web Speech API performs speech synthesis
  const isBrowserVoice = (process.env.VOICE_MODE || 'browser').trim().toLowerCase() === 'browser';
  if (isBrowserVoice) {
    return { audioBase64: null, fromCache: false, ttsMs: 0 };
  }

  const t0 = Date.now();

  // 1. Check pre-cache by phrase key ONLY if text matches
  if (replyPhraseKey) {
    const cachedPhrase = ttsCache.get(replyPhraseKey);
    if (cachedPhrase && cachedPhrase.text.trim().toLowerCase() === replyText.trim().toLowerCase()) {
      const cached = ttsCache.getBase64(replyPhraseKey);
      if (cached) {
        console.log(`[TTS] Cache HIT for key "${replyPhraseKey}" (instant)`);
        return { audioBase64: cached, fromCache: true, ttsMs: Date.now() - t0 };
      }
    }
  }

  // 2. Check pre-cache by exact text
  const cachedByText = ttsCache.getBase64ByText(replyText);
  if (cachedByText) {
    console.log(`[TTS] Cache HIT by text (instant)`);
    return { audioBase64: cachedByText, fromCache: true, ttsMs: Date.now() - t0 };
  }

  // 3. Live TTS synthesis
  try {
    const result = await synthesizeSpeechUniversal(replyText);
    const ttsMs = Date.now() - t0;
    if (result?.audioBuffer) {
      ttsCache.save(replyText, result.audioBuffer, result.mimeType, replyPhraseKey);
      const audioBase64 = `data:${result.mimeType};base64,${result.audioBuffer.toString('base64')}`;
      return { audioBase64, fromCache: false, ttsMs };
    }
  } catch (err: any) {
    console.warn('[Voice] TTS synthesis error:', err.message);
  }

  return { audioBase64: null, fromCache: false, ttsMs: Date.now() - t0 };
}

/**
 * POST /api/conversations/:workflowId/voice
 *
 * Full voice turn:
 *   1. Receive audio blob (multipart)
 *   2. STT → transcript
 *   3. State machine turn
 *   4. TTS (cache or live)
 *   5. Return base64 audio + text
 *
 * Timing log: [PERF] STT=Xms | LLM/Engine=Xms | TTS=Xms | total=Xms
 */
router.post(
  '/conversations/:workflowId/voice',
  upload.single('audio'),
  async (req: Request, res: Response) => {
    const tTotal = Date.now();

    try {
      const { workflowId } = req.params;
      const sessionId = req.body.sessionId;

      if (!req.file?.buffer) {
        return res.status(400).json({
          success: false,
          inaudible: true,
          message: 'No audio received. Please speak clearly and try again.',
        });
      }

      console.log(
        `[Voice] Received ${req.file.size} bytes (${req.file.mimetype}) for workflow "${workflowId}"`
      );

      // ── Stage 1: STT ──────────────────────────────────────────────────────
      const tStt = Date.now();
      let userText = '';
      try {
        userText = await transcribeAudioUniversal(
          req.file.buffer,
          req.file.mimetype || 'audio/webm'
        );
      } catch (sttErr: any) {
        // Log 429 / quota errors explicitly regardless of DEBUG_PROVIDERS flag
        const msg: string = sttErr.message || '';
        if (msg.includes('429') || msg.toLowerCase().includes('rate limit') || msg.toLowerCase().includes('quota')) {
          console.error(`[STT] ⚠️  RATE LIMIT / QUOTA ERROR from STT provider: ${msg}`);
        }
        console.warn('[Voice] STT failed:', msg);
        return res.status(400).json({
          success: false,
          inaudible: true,
          message: 'Could not understand audio. Please tap the mic to try again or use the chat box.',
        });
      }
      const sttMs = Date.now() - tStt;

      if (!userText.trim()) {
        return res.status(400).json({
          success: false,
          inaudible: true,
          message: 'Could not hear anything. Please try speaking again.',
        });
      }

      // ── Stage 2: State Machine Turn (LLM extraction inside) ──────────────
      const tEngine = Date.now();
      const turnResult = await processConversationTurn(workflowId, userText, sessionId);
      const engineMs = Date.now() - tEngine;

      // ── Stage 3: TTS (cache-first, then live) ────────────────────────────
      const { audioBase64, fromCache, ttsMs } = await getAudioForReply(
        turnResult.reply,
        turnResult.replyPhraseKey
      );

      const totalMs = Date.now() - tTotal;
      console.log(
        `[PERF] STT=${sttMs}ms | Engine=${engineMs}ms | TTS=${ttsMs}ms (${fromCache ? 'cached' : 'live'}) | total=${totalMs}ms`
      );

      // Per-turn provider log (STT model + ms, LLM model + ms, TTS model + ms)
      const p = getActiveProviders();
      logTurnPerf({
        sttProvider: p.stt.provider, sttModel: p.stt.model, sttMs,
        llmProvider: p.llm.provider, llmModel: p.llm.model, llmMs: engineMs,
        ttsProvider: p.tts.provider, ttsModel: p.tts.model, ttsMs, ttsCached: fromCache,
        totalMs,
      });

      return res.status(200).json({
        success: true,
        sessionId: turnResult.session.sessionId,
        userText,
        replyText: turnResult.reply,
        audioBase64,
        fromCache,
        toolCallExecuted: turnResult.toolCallExecuted,
        messages: turnResult.session.clientMessages,
        extractedFields: turnResult.session.extractedFields,
        isCompleted: turnResult.session.isCompleted,
        closingMessage: turnResult.session.workflow.closingMessage,
        savedCallId: turnResult.savedCallId,
        perf: { sttMs, engineMs, ttsMs, totalMs },
      });
    } catch (error: any) {
      console.error('[Voice] Unexpected error:', error);
      return res.status(500).json({
        success: false,
        inaudible: true,
        message: 'An unexpected error occurred. Please try again.',
      });
    }
  }
);

export default router;
