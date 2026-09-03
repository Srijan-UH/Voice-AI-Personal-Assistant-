import { Router, Request, Response } from 'express';
import multer from 'multer';
import { transcribeAudioWithDeepgram } from '../lib/voice/stt.js';
import { synthesizeSpeechWithElevenLabs } from '../lib/voice/tts.js';
import { processConversationTurn } from '../lib/engine.js';

const upload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: 10 * 1024 * 1024, // 10MB limit
  },
});

const router = Router();

/**
 * POST /api/conversations/:workflowId/voice
 * Full voice conversation endpoint:
 * 1. Transcribes incoming microphone audio via STT
 * 2. Drives conversation turn using AI engine & tools
 * 3. Synthesizes AI assistant reply into speech audio via TTS
 */
router.post(
  '/conversations/:workflowId/voice',
  upload.single('audio'),
  async (req: Request, res: Response) => {
    try {
      const { workflowId } = req.params;
      const sessionId = req.body.sessionId;

      if (!req.file || !req.file.buffer) {
        return res.status(400).json({
          success: false,
          inaudible: true,
          message: 'Sorry for the inconvenience. We could not hear your audio clearly. You can tap the mic to retry or continue in chat below.',
        });
      }

      console.log(
        `[Voice Endpoint] Received ${req.file.size} bytes audio (${req.file.mimetype}) for workflow "${workflowId}"`
      );

      // Step 1: Transcribe incoming user speech via STT
      let userText = '';
      try {
        userText = await transcribeAudioWithDeepgram(
          req.file.buffer,
          req.file.mimetype || 'audio/webm'
        );
      } catch (sttError: any) {
        console.warn('[Voice Endpoint] Inaudible audio or STT error:', sttError.message);
        return res.status(400).json({
          success: false,
          inaudible: true,
          message: 'Sorry for the inconvenience. We could not hear your audio clearly. You can tap the mic to retry or continue in chat below.',
        });
      }

      if (!userText || userText.trim().length === 0) {
        return res.status(400).json({
          success: false,
          inaudible: true,
          message: 'Sorry for the inconvenience. We could not hear your audio clearly. You can tap the mic to retry or continue in chat below.',
        });
      }

      // Step 2: Drive conversation turn using core AI engine
      const turnResult = await processConversationTurn(workflowId, userText, sessionId);

      // Step 3: Convert AI assistant response to speech via ElevenLabs TTS
      let audioBase64: string | null = null;
      try {
        const ttsResult = await synthesizeSpeechWithElevenLabs(turnResult.reply);
        if (ttsResult && ttsResult.audioBuffer) {
          audioBase64 = `data:${ttsResult.mimeType};base64,${ttsResult.audioBuffer.toString('base64')}`;
        }
      } catch (ttsErr: any) {
        console.warn('[Voice Endpoint] TTS fallback to browser synthesis:', ttsErr.message);
      }

      return res.status(200).json({
        success: true,
        sessionId: turnResult.session.sessionId,
        userText,
        replyText: turnResult.reply,
        audioBase64,
        toolCallExecuted: turnResult.toolCallExecuted,
        messages: turnResult.session.clientMessages,
        extractedFields: turnResult.session.extractedFields,
        isCompleted: turnResult.session.isCompleted,
        savedCallId: turnResult.savedCallId,
      });
    } catch (error: any) {
      console.error('[POST /api/conversations/:workflowId/voice] Error:', error);
      return res.status(500).json({
        success: false,
        inaudible: true,
        message: 'Sorry for the inconvenience. We could not hear your audio clearly. You can tap the mic to retry or continue in chat below.',
      });
    }
  }
);

export default router;
