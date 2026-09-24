/**
 * test-qa-interruption.ts
 *
 * Tests:
 * 1. Default greeting is conversational ("How can I help you today?") and DOES NOT ask for appointment details by default
 * 2. Answering patient questions when asked first (e.g. location, timings, fees, doctor) without prematurely forcing slot intake
 * 3. Booking appointment when requested, extracting slots smoothly
 * 4. Answering questions in the middle of intake without marking as failures
 * 5. Full cycle through to confirmation
 */
import dotenv from 'dotenv';
dotenv.config({ path: '.env', override: true });
import { processConversationTurn, getOrCreateSession } from '../lib/engine.js';
import { isUserInquiry } from '../lib/clinicQA.js';

async function runTests() {
  console.log('========================================');
  console.log(' Conversational Flow & QA Tests');
  console.log('========================================\n');

  // Test isUserInquiry helper
  const inquiries = [
    'Where is your clinic located?',
    'What are your timings?',
    'Who is the dentist?',
    'How much does teeth cleaning cost?',
    'Do you take insurance?',
    'Is parking available?',
    'Can I reschedule later?',
  ];
  for (const q of inquiries) {
    if (!isUserInquiry(q)) {
      console.error(`FAIL: isUserInquiry returned false for "${q}"`);
      process.exit(1);
    }
  }
  console.log('✅ isUserInquiry correctly identified all sample questions.\n');

  // Verify Initial Session Greeting
  const session1 = await getOrCreateSession('demo_dental_workflow');
  const initialGreeting = session1.clientMessages[0]?.content;
  console.log('Initial Assistant Greeting:', initialGreeting);

  if (initialGreeting.includes('May I have your name')) {
    console.error('FAIL: Greeting is still aggressively asking for name by default!');
    process.exit(1);
  }
  if (!initialGreeting.includes('How can I help you today?')) {
    console.error('FAIL: Greeting is not asking how to help!');
    process.exit(1);
  }
  if (session1.intakeState !== 'greeting') {
    console.error(`FAIL: Initial state should be 'greeting', got '${session1.intakeState}'`);
    process.exit(1);
  }
  console.log('✅ Greeting PASSED: Conversational greeting ("How can I help you today?") without forcing appointment details.\n');

  // Turn 1: User asks a location question first
  const t1 = await processConversationTurn(
    'demo_dental_workflow',
    'Where is your clinic located?',
    session1.sessionId
  );
  console.log('Turn 1 (User asks location):');
  console.log('Reply:', t1.reply);
  console.log('State:', t1.session.intakeState);

  if (!t1.reply.includes('123 Healthcare Boulevard')) {
    console.error('FAIL: Location was not in reply!');
    process.exit(1);
  }
  if (t1.reply.includes('May I have your full name')) {
    console.error('FAIL: Should not demand name before user expressed interest in booking!');
    process.exit(1);
  }
  console.log('✅ Turn 1 PASSED: Location answered, offered booking without demanding name.\n');

  // Turn 2: User says they want to book an appointment and introduces their name
  const t2 = await processConversationTurn(
    'demo_dental_workflow',
    'Yes, I want to book an appointment. My name is Ramesh Kumar',
    session1.sessionId
  );
  console.log('Turn 2 (User wants appointment + gives name):');
  console.log('Reply:', t2.reply);
  console.log('Fields:', t2.session.extractedFields);
  console.log('State:', t2.session.intakeState);

  if (t2.session.extractedFields['caller_name'] !== 'Ramesh Kumar') {
    console.error('FAIL: caller_name was not extracted!');
    process.exit(1);
  }
  if (!t2.reply.toLowerCase().includes('phone number')) {
    console.error('FAIL: Phone number was not requested!');
    process.exit(1);
  }
  console.log('✅ Turn 2 PASSED: Booking accepted, name saved, phone number requested.\n');

  // Turn 3: User interrupts when asked for phone, asking about teeth cleaning cost
  const t3 = await processConversationTurn(
    'demo_dental_workflow',
    'How much does teeth cleaning cost?',
    session1.sessionId
  );
  console.log('Turn 3 (User interrupts with teeth cleaning cost):');
  console.log('Reply:', t3.reply);
  console.log('Fields:', t3.session.extractedFields);
  console.log('State:', t3.session.intakeState);

  if (!t3.reply.includes('1,500') && !t3.reply.includes('cleaning')) {
    console.error('FAIL: Cleaning fee was not in reply!');
    process.exit(1);
  }
  if (t3.session.extractedFields['phone_number']) {
    console.error('FAIL: Phone number was falsely filled!');
    process.exit(1);
  }
  if (!t3.reply.toLowerCase().includes('phone number')) {
    console.error('FAIL: Phone number was not requested again!');
    process.exit(1);
  }
  console.log('✅ Turn 3 PASSED: Pricing answered, phone number requested again without validation failure.\n');

  // Turn 4: User gives phone number
  const t4 = await processConversationTurn(
    'demo_dental_workflow',
    '9876543210',
    session1.sessionId
  );
  console.log('Turn 4 (User gives phone):');
  console.log('Reply:', t4.reply);
  console.log('Fields:', t4.session.extractedFields);
  console.log('State:', t4.session.intakeState);

  if (t4.session.extractedFields['phone_number'] !== '9876543210') {
    console.error('FAIL: Phone number not saved!');
    process.exit(1);
  }
  console.log('✅ Turn 4 PASSED: Phone number saved, date requested.\n');

  // Turn 5: User gives date & time
  const t5 = await processConversationTurn(
    'demo_dental_workflow',
    'Tomorrow at 4 PM',
    session1.sessionId
  );
  console.log('Turn 5 (User gives date and time):');
  console.log('Reply:', t5.reply);
  console.log('Fields:', t5.session.extractedFields);
  console.log('State:', t5.session.intakeState);

  if (!t5.session.extractedFields['appt_date'] || !t5.session.extractedFields['appt_time']) {
    console.error('FAIL: Date/time not saved!');
    process.exit(1);
  }
  if (t5.session.intakeState !== 'awaiting_confirmation') {
    console.error('FAIL: Should be awaiting confirmation!');
    process.exit(1);
  }
  console.log('✅ Turn 5 PASSED: Date & time saved, reached confirmation.\n');

  // Turn 6: At confirmation, user asks doctor
  const t6 = await processConversationTurn(
    'demo_dental_workflow',
    'Who is the dentist?',
    session1.sessionId
  );
  console.log('Turn 6 (User asks doctor at confirmation):');
  console.log('Reply:', t6.reply);
  console.log('State:', t6.session.intakeState);

  if (!t6.reply.includes('Sarah Jenkins')) {
    console.error('FAIL: Doctor name was not in reply!');
    process.exit(1);
  }
  if (!t6.reply.includes('Shall I go ahead and book')) {
    console.error('FAIL: Confirmation prompt was not maintained!');
    process.exit(1);
  }
  console.log('✅ Turn 6 PASSED: Doctor answered, confirmation prompt maintained.\n');

  // Turn 7: User confirms
  const t7 = await processConversationTurn(
    'demo_dental_workflow',
    'yes please',
    session1.sessionId
  );
  console.log('Turn 7 (Confirmation):');
  console.log('Reply:', t7.reply);
  console.log('Completed:', t7.session.isCompleted);

  if (!t7.session.isCompleted) {
    console.error('FAIL: Session should be marked completed!');
    process.exit(1);
  }
  console.log('✅ Turn 7 PASSED: Completed successfully without errors!\n');

  console.log('========================================');
  console.log(' ALL CONVERSATIONAL & QA TESTS PASSED!');
  console.log('========================================');
}

runTests().catch(err => {
  console.error('Test error:', err);
  process.exit(1);
});
