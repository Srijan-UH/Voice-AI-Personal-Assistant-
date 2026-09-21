/**
 * test-normalizer.ts — Unit tests for speechNormalizer.ts
 *
 * Tests:
 *  1. "9876543210" -> digit-by-digit spaced pauses
 *  2. "+91 98765 43210" -> "plus 9 1, 9 8 7 6, 5 4 3, 2 1 0"
 *  3. "4:30 pm" -> "4 30 P M"
 *  4. "2026-10-21" -> "Wednesday, the 21st of October, 2026"
 *  5. "Ramesh Kumar S" -> preserved cleanly
 *  6. Markdown + emoji -> clean speech text without symbols
 *  7. chunkTextForSpeech -> verifies long utterance split
 */
import { normalizeForSpeech, chunkTextForSpeech } from '../lib/speechNormalizer.js';

function assert(condition: boolean, message: string) {
  if (!condition) {
    console.error(`❌ Assertion Failed: ${message}`);
    process.exit(1);
  }
  console.log(`✅ Passed: ${message}`);
}

function testNormalizer() {
  console.log('========================================');
  console.log(' Speech Normalizer Unit Tests');
  console.log('========================================\n');

  // Test 1: 10-digit Indian phone number
  const phoneRes = normalizeForSpeech('Call me at 9876543210 please');
  console.log('[Phone 1] Input: "Call me at 9876543210 please" -> Output:', JSON.stringify(phoneRes));
  assert(phoneRes.includes('9 8 7 6, 5 4 3, 2 1 0'), 'Phone digits separated with commas');

  // Test 2: +91 formatted phone number
  const plus91Res = normalizeForSpeech('My number is +91 98765 43210');
  console.log('[Phone 2] Input: "My number is +91 98765 43210" -> Output:', JSON.stringify(plus91Res));
  assert(plus91Res.includes('plus 9 1, 9 8 7 6, 5 4 3, 2 1 0'), '+91 formatted with "plus 9 1" and pauses');

  // Test 3: Time format
  const timeRes = normalizeForSpeech('Appointment at 4:30 pm');
  console.log('[Time 1] Input: "Appointment at 4:30 pm" -> Output:', JSON.stringify(timeRes));
  assert(timeRes.includes('4 30 P M'), '4:30 pm formatted as 4 30 P M');

  const timeRes2 = normalizeForSpeech('See you at 4 pm');
  console.log('[Time 2] Input: "See you at 4 pm" -> Output:', JSON.stringify(timeRes2));
  assert(timeRes2.includes('4 P M'), '4 pm formatted as 4 P M');

  // Test 4: Date format
  const dateRes = normalizeForSpeech('Date is 2026-10-21');
  console.log('[Date 1] Input: "Date is 2026-10-21" -> Output:', JSON.stringify(dateRes));
  assert(dateRes.includes('Wednesday, the 21st of October, 2026'), '2026-10-21 converted to full spoken date');

  // Test 5: Name format
  const nameRes = normalizeForSpeech('Your name is Ramesh Kumar S');
  console.log('[Name] Input: "Your name is Ramesh Kumar S" -> Output:', JSON.stringify(nameRes));
  assert(nameRes.includes('Ramesh Kumar S'), 'Name preserved cleanly without distortion');

  // Test 6: Markdown + emoji
  const mdRes = normalizeForSpeech('*Hello!* Welcome to **Apex Dental** 😊 #1 Care / Service');
  console.log('[Markdown/Emoji] Input: "*Hello!* Welcome to **Apex Dental** 😊 #1 Care / Service" -> Output:', JSON.stringify(mdRes));
  assert(!mdRes.includes('*'), 'Asterisks removed');
  assert(!mdRes.includes('#'), 'Hash removed');
  assert(!mdRes.includes('/'), 'Slash removed');
  assert(!mdRes.includes('😊'), 'Emoji removed');
  assert(mdRes.includes('Hello! Welcome to Apex Dental') && mdRes.includes('1 Care Service'), 'Clean text content preserved');

  // Test 7: Full Read-Back Line Test
  const readbackRaw = 'Let me confirm: Your name is Ramesh Kumar S, phone number 9876543210, appointment on 2026-10-21 at 4:30 pm. Shall I go ahead and book this appointment for you?';
  const readbackSpoken = normalizeForSpeech(readbackRaw);
  console.log('\n[Full Read-back Input]:\n ', readbackRaw);
  console.log('[Full Read-back Spoken]:\n ', readbackSpoken);
  assert(readbackSpoken.includes('9 8 7 6, 5 4 3, 2 1 0'), 'Readback has digit pauses');
  assert(readbackSpoken.includes('4 30 P M'), 'Readback has time pauses');
  assert(readbackSpoken.includes('the 21st of October, 2026'), 'Readback has natural date');

  // Test 8: Chunking
  const chunks = chunkTextForSpeech(readbackSpoken, 120);
  console.log('\n[Chunking Test (max 120 chars)] -> Chunks count:', chunks.length);
  chunks.forEach((c, i) => console.log(`  Chunk ${i + 1} (${c.length} chars): "${c}"`));
  assert(chunks.length >= 2, 'Long sentence chunked into 2+ clauses');
  assert(chunks.every(c => c.length <= 150), 'All chunks under safe limit');

  console.log('\n========================================');
  console.log(' All Normalizer Tests Passed! ✅');
  console.log('========================================\n');
}

testNormalizer();
