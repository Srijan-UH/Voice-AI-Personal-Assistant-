import dotenv from 'dotenv';
import { getAIClient } from '../lib/engine.js';

dotenv.config();

async function testApis() {
  console.log('--- DIAGNOSTIC API KEYS TEST ---');
  const key = process.env.GEMINI_API_KEY || process.env.OPENAI_API_KEY;
  console.log('GEMINI_API_KEY:', key ? `${key.slice(0, 15)}...` : 'MISSING');

  const { openai, isConfigured, modelName } = getAIClient();
  if (isConfigured && openai) {
    try {
      const res = await openai.chat.completions.create({
        model: modelName,
        messages: [{ role: 'user', content: 'Say hello in 5 words.' }],
      });
      console.log(`✅ AI Engine (${modelName}) SUCCESS:`, res.choices[0]?.message?.content);
    } catch (err: any) {
      console.error(`❌ AI Engine (${modelName}) FAILED:`, err.message);
    }
  } else {
    console.log('⚠️ AI Client not configured, will use local AI engine fallback.');
  }
}

testApis();
