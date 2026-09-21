/**
 * test-conversation-flow.ts — Tests out-of-order date provided during name inquiry
 */
import { extractAllSlots } from '../lib/slotExtractor.js';
import { INTAKE_SLOTS } from '../lib/engine.js';

console.log('========================================');
console.log(' Out-of-Order Date Simulation Test');
console.log('========================================\n');

const extractedFields: Record<string, string> = {};
let intakeState = 'collecting_name';

function simulateTurn(userMessage: string): { reply: string; nextState: string } {
  const currentSlot = INTAKE_SLOTS.find(s => s.state === intakeState);
  if (!currentSlot) throw new Error('Invalid state');

  // Multi-slot extraction
  const multi = extractAllSlots(userMessage);
  let capturedAny = false;
  for (const [k, v] of Object.entries(multi)) {
    if (v && !extractedFields[k]) {
      extractedFields[k] = v;
      capturedAny = true;
    }
  }

  const targetFilled = Boolean(extractedFields[currentSlot.key]);
  const nextUnfilled = INTAKE_SLOTS.find(s => !extractedFields[s.key]);

  if (!nextUnfilled) {
    intakeState = 'completed';
    return { reply: "Perfect! Your appointment has been booked. We'll see you then. Thank you for calling Apex Dental Care Clinic!", nextState: intakeState };
  }

  intakeState = nextUnfilled.state;
  let reply = '';
  if (currentSlot.key === 'caller_name' && !targetFilled && extractedFields['appt_date']) {
    reply = "Thank you, I've noted your preferred date. May I have your full name, please?";
  } else if (currentSlot.key === 'caller_name' && targetFilled && extractedFields['appt_date']) {
    reply = `Nice to meet you, ${extractedFields['caller_name']}. Thank you. What is your phone number?`;
  } else {
    reply = `Next slot.`;
  }

  return { reply, nextState: intakeState };
}

// Turn 1: User says "Next Monday" when asked for name
console.log('Turn 1: AI asked "May I have your name, please?"');
console.log('User input: "Next Monday"');
const turn1 = simulateTurn('Next Monday');
console.log(`AI reply: "${turn1.reply}"`);
console.log(`Next state: ${turn1.nextState}`);
console.log(`Collected fields:`, extractedFields);

if (extractedFields.caller_name === undefined && extractedFields.appt_date && turn1.nextState === 'collecting_name') {
  console.log('✅ Turn 1 PASSED: "Next Monday" was NOT accepted as name! Date saved, name requested politely.\n');
} else {
  console.error('❌ Turn 1 FAILED\n');
  process.exit(1);
}

// Turn 2: User says name
console.log('Turn 2: AI asked "May I have your full name, please?"');
console.log('User input: "Srija U H"');
const turn2 = simulateTurn('Srija U H');
console.log(`AI reply: "${turn2.reply}"`);
console.log(`Next state: ${turn2.nextState}`);
console.log(`Collected fields:`, extractedFields);

if (extractedFields.caller_name === 'Srija U H' && turn2.nextState === 'collecting_phone') {
  console.log('✅ Turn 2 PASSED: Name captured cleanly, phone requested\n');
} else {
  console.error('❌ Turn 2 FAILED\n');
  process.exit(1);
}

console.log('========================================');
console.log(' Out-of-Order Date Simulation: SUCCESS! ✅');
console.log('========================================');
