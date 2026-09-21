/**
 * test-apis.ts — Diagnostic script for Sarvam AI pipeline.
 *
 * Run: npx tsx src/scripts/test-apis.ts
 * Or via the package.json script: npm run test:apis
 *
 * Tests:
 *   1. Sarvam LLM (sarvam-105b) — chat completion with latency
 *   2. Sarvam STT (saaras:v3)   — audio transcription with latency
 *   3. Sarvam TTS (bulbul:v3)   — speech synthesis with latency + audio byte count
 *   4. TTS Cache                — pre-caches fixed dental clinic intake lines
 */
import dotenv from 'dotenv';
import { chat as sarvamChat, transcribe as sarvamTranscribe, synthesize as sarvamSynthesize } from '../lib/sarvam.js';
import { ttsCache, INTAKE_PHRASES } from '../lib/voice/ttsCache.js';

dotenv.config();

// Safety guard: Prevent accidental paid API calls unless explicitly requested
if (!process.argv.includes('--live')) {
  console.log('====================================================');
  console.log(' [SAFETY GUARD] Live API tests blocked by default.');
  console.log(' Running this script makes live calls to Sarvam AI');
  console.log(' (LLM, STT, and TTS) which incur paid API costs (~₹0.05).');
  console.log('');
  console.log(' To run live tests intentionally, execute:');
  console.log('   npm run test:apis -- --live');
  console.log(' or:');
  console.log('   npx tsx src/scripts/test-apis.ts --live');
  console.log('====================================================');
  process.exit(0);
}

// ---------------------------------------------------------------------------
// Minimal 16kHz mono WAV helper (440Hz sine wave, ~0.5s)
// Valid WAV structure that STT can decode.
// ---------------------------------------------------------------------------
function generateTestWav(durationMs = 500): Buffer {
  const sampleRate = 16000;
  const numSamples = Math.floor((sampleRate * durationMs) / 1000);
  const dataSize = numSamples * 2; // 16-bit PCM
  const headerSize = 44;
  const totalSize = headerSize + dataSize;

  const buf = Buffer.alloc(totalSize);
  // RIFF header
  buf.write('RIFF', 0);
  buf.writeUInt32LE(totalSize - 8, 4);
  buf.write('WAVE', 8);
  buf.write('fmt ', 12);
  buf.writeUInt32LE(16, 16);       // PCM chunk size
  buf.writeUInt16LE(1, 20);        // PCM format
  buf.writeUInt16LE(1, 22);        // mono
  buf.writeUInt32LE(sampleRate, 24);
  buf.writeUInt32LE(sampleRate * 2, 28); // byte rate
  buf.writeUInt16LE(2, 32);        // block align
  buf.writeUInt16LE(16, 34);       // bits/sample
  buf.write('data', 36);
  buf.writeUInt32LE(dataSize, 40);

  // 440 Hz sine wave samples
  for (let i = 0; i < numSamples; i++) {
    const sample = Math.round(8000 * Math.sin((2 * Math.PI * 440 * i) / sampleRate));
    buf.writeInt16LE(sample, headerSize + i * 2);
  }

  return buf;
}

function pass(msg: string) { console.log(`  ✅ ${msg}`); }
function fail(msg: string) { console.error(`  ❌ ${msg}`); }
function info(msg: string) { console.log(`  ℹ️  ${msg}`); }

async function testLLM() {
  const model = process.env.SARVAM_MODEL || 'sarvam-105b';
  console.log(`\n[1] Sarvam LLM Test (${model})`);

  try {
    const res = await sarvamChat(
      [{ role: 'user', content: 'Say hello in 5 words.' }],
      { model, max_tokens: 20 }
    );
    pass(`${res.model} → "${res.content}" | ${res.latencyMs}ms`);
  } catch (err: any) {
    fail(`Sarvam LLM failed: ${err.message}`);
    throw err;
  }
}

async function testSarvamSTT() {
  const model = process.env.SARVAM_STT_MODEL || 'saaras:v3';
  console.log(`\n[2] Sarvam STT Test (${model})`);

  const wav = generateTestWav(500);
  info(`Sending ${wav.length} byte WAV (440Hz tone, 0.5s) to Sarvam STT...`);

  try {
    const result = await sarvamTranscribe(wav, 'audio/wav', 'en-IN');
    pass(`Sarvam STT returned: "${result.text}" | conf=${result.confidence ?? 'n/a'} | ${result.latencyMs}ms`);
    if (result.text.trim().length === 0) {
      info('Note: Empty transcript is expected for a pure tone (no speech). HTTP 200 = provider works.');
    }
  } catch (err: any) {
    fail(`Sarvam STT error: ${err.message}`);
    throw err;
  }
}

async function testSarvamTTS() {
  const model = process.env.SARVAM_TTS_MODEL || 'bulbul:v3';
  const speaker = process.env.SARVAM_TTS_VOICE || 'ritu';
  console.log(`\n[3] Sarvam TTS Test (${model} - speaker: ${speaker})`);

  const testText = 'Hello! Thank you for calling Apex Dental Care Clinic.';
  info(`Synthesizing: "${testText}"`);

  try {
    const result = await sarvamSynthesize(testText, { model, speaker });
    pass(`Sarvam TTS → ${result.audioBuffer.length} bytes ${result.mimeType} | ${result.latencyMs}ms`);
    if (result.audioBuffer.length < 100) {
      fail('Audio buffer suspiciously small — may be empty');
      throw new Error('Audio buffer too small');
    }
  } catch (err: any) {
    fail(`Sarvam TTS error: ${err.message}`);
    throw err;
  }
}

async function testTtsCache() {
  console.log('\n[4] TTS Pre-cache Warmup Test');
  info(`Warming up ${Object.keys(INTAKE_PHRASES).length} phrases with Sarvam TTS...`);
  const t0 = Date.now();
  await ttsCache.warmup();
  const elapsed = Date.now() - t0;
  info(`Warmup took ${elapsed}ms for ${ttsCache.size} phrases`);

  let ready = 0;
  for (const key of Object.keys(INTAKE_PHRASES)) {
    if (ttsCache.isReady(key)) {
      ready++;
      const b64 = ttsCache.getBase64(key);
      info(`  ✓ "${key}" cached (${b64 ? Math.round(b64.length * 3/4) : 0} bytes)`);
    } else {
      fail(`  "${key}" not cached`);
    }
  }
  if (ready === Object.keys(INTAKE_PHRASES).length) {
    pass(`All ${ready} phrases pre-cached successfully`);
  } else {
    fail(`Only ${ready}/${Object.keys(INTAKE_PHRASES).length} phrases cached`);
  }
}

async function main() {
  console.log('========================================');
  console.log(' Voice AI — Sarvam AI Pipeline Diagnostic');
  console.log('========================================');
  console.log(`  SARVAM_MODEL: ${process.env.SARVAM_MODEL || 'sarvam-105b'}`);
  console.log(`  SARVAM_STT_MODEL: ${process.env.SARVAM_STT_MODEL || 'saaras:v3'}`);
  console.log(`  SARVAM_TTS_MODEL: ${process.env.SARVAM_TTS_MODEL || 'bulbul:v3'}`);
  console.log(`  SARVAM_TTS_VOICE: ${process.env.SARVAM_TTS_VOICE || 'ritu'}`);

  let exitCode = 0;

  await testLLM().catch(() => { exitCode = 1; });
  await testSarvamSTT().catch(() => { exitCode = 1; });
  await testSarvamTTS().catch(() => { exitCode = 1; });
  await testTtsCache().catch(() => { exitCode = 1; });

  console.log('\n========================================');
  console.log(exitCode === 0 ? ' All Sarvam tests passed! ✅' : ' Some tests failed ❌');
  console.log('========================================\n');
  process.exit(exitCode);
}

main();
