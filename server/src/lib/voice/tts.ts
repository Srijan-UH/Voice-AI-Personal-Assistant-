import dotenv from 'dotenv';

dotenv.config();

/**
 * Convert AI assistant reply text to speech audio using official OpenAI Text-to-Speech API (tts-1).
 * Uses GEMINI_API_KEY or OPENAI_API_KEY from server/.env.
 */
export async function synthesizeSpeechWithOpenAI(
  text: string,
  voice: 'alloy' | 'echo' | 'fable' | 'onyx' | 'nova' | 'shimmer' = 'alloy'
): Promise<{ audioBuffer: Buffer; mimeType: string } | null> {
  dotenv.config();

  const openAiKey = process.env.GEMINI_API_KEY?.trim() || process.env.OPENAI_API_KEY?.trim();

  if (openAiKey && openAiKey.startsWith('sk-') && !openAiKey.includes('your_openai_api_key')) {
    try {
      console.log(`[OpenAI TTS] Synthesizing speech with model "tts-1" for: "${text.slice(0, 60)}..."`);

      const response = await fetch('https://api.openai.com/v1/audio/speech', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${openAiKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          model: 'tts-1',
          input: text,
          voice,
          response_format: 'mp3',
        }),
      });

      if (response.ok) {
        const arrayBuffer = await response.arrayBuffer();
        const audioBuffer = Buffer.from(arrayBuffer);
        console.log(`[OpenAI TTS] Speech synthesized successfully (${audioBuffer.length} bytes MP3).`);
        return {
          audioBuffer,
          mimeType: 'audio/mp3',
        };
      } else {
        const errText = await response.text();
        console.warn(`[OpenAI TTS Warning] HTTP ${response.status}: ${errText}`);
      }
    } catch (err: any) {
      console.warn('[OpenAI TTS Exception]:', err.message || err);
    }
  }

  console.log('[OpenAI TTS] OpenAI API key not configured or API call failed.');
  return null;
}

// Keep export alias for backwards compatibility
export const synthesizeSpeechWithElevenLabs = synthesizeSpeechWithOpenAI;
