import dotenv from 'dotenv';

dotenv.config();

/**
 * Universal Speech-to-Text Transcriber.
 * Reads whatever key is set in GEMINI_API_KEY or OPENAI_API_KEY in server/.env.
 * Automatically tries Google Gemini 1.5 Flash Multimodal STT and OpenAI Whisper STT.
 */
export async function transcribeAudioUniversal(
  audioBuffer: Buffer,
  mimeType: string = 'audio/webm'
): Promise<string> {
  dotenv.config();

  const apiKey = process.env.GEMINI_API_KEY?.trim() || process.env.OPENAI_API_KEY?.trim();
  if (!apiKey || apiKey.length < 5) {
    console.warn('[STT] No API key configured in server/.env.');
    throw new Error('No API key configured in server/.env');
  }

  const cleanMime = (mimeType || 'audio/webm').split(';')[0].trim();
  const base64Audio = audioBuffer.toString('base64');

  // 1. Try Google Gemini Multimodal STT (gemini-1.5-flash / gemini-2.0-flash / gemini-flash-latest)
  const geminiModels = [process.env.GEMINI_MODEL?.trim() || 'gemini-1.5-flash', 'gemini-2.0-flash', 'gemini-flash-latest'];
  for (const model of geminiModels) {
    try {
      console.log(`[STT] Trying Google Gemini (${model}) for ${audioBuffer.length} bytes audio (${cleanMime})...`);
      const geminiRes = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            contents: [
              {
                parts: [
                  {
                    text: 'Listen to this audio recording of a customer speaking to a business voice assistant. Transcribe their spoken words accurately into plain text. Output ONLY the exact transcribed text without quotes, formatting, or commentary.',
                  },
                  {
                    inlineData: {
                      mimeType: cleanMime === 'audio/webm' ? 'audio/webm' : cleanMime,
                      data: base64Audio,
                    },
                  },
                ],
              },
            ],
          }),
        }
      );

      if (geminiRes.ok) {
        const gData = await geminiRes.json();
        const gText = gData?.candidates?.[0]?.content?.parts?.[0]?.text?.trim();
        if (gText && gText.length > 0) {
          console.log(`[STT] Gemini STT (${model}) Success: "${gText}"`);
          return gText;
        }
      } else {
        const gErr = await geminiRes.text();
        console.warn(`[STT Warning] Gemini STT (${model}) HTTP ${geminiRes.status}: ${gErr}`);
      }
    } catch (err: any) {
      console.warn(`[STT Exception] Gemini STT (${model}):`, err.message || err);
    }
  }

  // 2. Try OpenAI Whisper STT (whisper-1) if API key is OpenAI format
  if (apiKey.startsWith('sk-')) {
    try {
      console.log(`[STT] Trying OpenAI Whisper-1 for ${audioBuffer.length} bytes audio (${cleanMime})...`);
      const extension = cleanMime.includes('wav') ? 'wav' : cleanMime.includes('mp3') ? 'mp3' : 'webm';
      const file = new File([new Uint8Array(audioBuffer)], `audio.${extension}`, { type: cleanMime });
      const formData = new FormData();
      formData.append('file', file);
      formData.append('model', 'whisper-1');

      const whisperRes = await fetch('https://api.openai.com/v1/audio/transcriptions', {
        method: 'POST',
        headers: { Authorization: `Bearer ${apiKey}` },
        body: formData,
      });

      if (whisperRes.ok) {
        const wData = await whisperRes.json();
        const wText = wData?.text?.trim();
        if (wText && wText.length > 0) {
          console.log(`[STT] OpenAI Whisper STT Success: "${wText}"`);
          return wText;
        }
      } else {
        const wErr = await whisperRes.text();
        console.warn(`[STT Warning] OpenAI Whisper HTTP ${whisperRes.status}: ${wErr}`);
      }
    } catch (err: any) {
      console.warn('[STT Exception] OpenAI Whisper STT:', err.message || err);
    }
  }

  throw new Error('Sorry for the inconvenience. We could not hear your audio clearly. You can tap the mic to retry or continue in chat below.');
}

// Export aliases
export const transcribeAudioWithOpenAI = transcribeAudioUniversal;
export const transcribeAudioWithDeepgram = transcribeAudioUniversal;
export const transcribeAudioWithGemini = transcribeAudioUniversal;
