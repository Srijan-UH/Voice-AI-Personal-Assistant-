/**
 * test-slots.ts — Unit tests for rule-based deterministic slot extraction & validation
 *
 * Run: npm run test:slots
 * or:  npx tsx src/scripts/test-slots.ts
 *
 * Runs 100% offline with zero paid API calls.
 */
import {
  extractNameDeterministic,
  extractPhoneDeterministic,
  extractDateDeterministic,
  extractTimeDeterministic,
  extractAllSlots,
} from '../lib/slotExtractor.js';
import { validateName, validatePhone, validateDate, validateTime } from '../lib/validators.js';

let passed = 0;
let failed = 0;

function assert(condition: boolean, name: string, detail?: string) {
  if (condition) {
    console.log(`  ✅ ${name}`);
    passed++;
  } else {
    console.error(`  ❌ FAIL: ${name} ${detail ? `(${detail})` : ''}`);
    failed++;
  }
}

console.log('========================================');
console.log(' Deterministic Slot Extraction Unit Tests');
console.log('========================================\n');

// ---------------------------------------------------------------------------
// 1. Name Extraction Tests
// ---------------------------------------------------------------------------
console.log('[1] Name Extraction & Validation');

const singleName = extractNameDeterministic('Ramesh');
assert(singleName === 'Ramesh', 'Single Indian name "Ramesh"', `got: ${singleName}`);

const introName = extractNameDeterministic('My name is Ramesh');
assert(introName === 'Ramesh', '"My name is Ramesh"', `got: ${introName}`);

const fullName = extractNameDeterministic('I am Ramesh Kumar');
assert(fullName === 'Ramesh Kumar', '"I am Ramesh Kumar"', `got: ${fullName}`);

const thisIsName = extractNameDeterministic('Hello, this is Priya Sharma');
assert(thisIsName === 'Priya Sharma', '"Hello, this is Priya Sharma"', `got: ${thisIsName}`);

const drName = extractNameDeterministic('Dr. Rajesh Verma here');
assert(drName === 'Dr Rajesh Verma', '"Dr. Rajesh Verma here"', `got: ${drName}`);

const myselfName = extractNameDeterministic('Myself Amit');
assert(myselfName === 'Amit', '"Myself Amit"', `got: ${myselfName}`);

const callMeName = extractNameDeterministic('You can call me Sneha');
assert(callMeName === 'Sneha', '"You can call me Sneha"', `got: ${callMeName}`);

const fillerRamesh = extractNameDeterministic('uh Ramesh');
assert(fillerRamesh === 'Ramesh', 'Filler with name "uh Ramesh"', `got: ${fillerRamesh}`);

const devanagariRamesh = extractNameDeterministic('रमेश');
assert(devanagariRamesh === 'रमेश', 'Devanagari script "रमेश"', `got: ${devanagariRamesh}`);

const compoundRamesh = extractNameDeterministic('Ramesh and my number is 9876543210');
assert(compoundRamesh === 'Ramesh', 'Compound phrase "Ramesh and my number is..."', `got: ${compoundRamesh}`);

// Verify garbage is rejected as name
const garbageAsName = extractNameDeterministic('uh yes okay');
assert(garbageAsName === undefined, 'Noise words "uh yes okay" rejected as name', `got: ${garbageAsName}`);

const phoneAsName = extractNameDeterministic('8762442297');
assert(phoneAsName === undefined, 'Raw phone digits "8762442297" rejected as name', `got: ${phoneAsName}`);

const dateAsName = extractNameDeterministic('Next Monday');
assert(dateAsName === undefined, 'Date phrase "Next Monday" rejected as name', `got: ${dateAsName}`);

const dateValidatedAsName = validateName('Next Monday');
assert(dateValidatedAsName.valid === false, 'validateName("Next Monday") returns valid: false', `got: ${dateValidatedAsName.valid}`);

// ---------------------------------------------------------------------------
// 2. Phone Extraction Tests
// ---------------------------------------------------------------------------
console.log('\n[2] Phone Extraction & Validation');

const rawDigits = extractPhoneDeterministic('8762442297');
assert(rawDigits === '8762442297', 'Raw 10-digit number "8762442297"', `got: ${rawDigits}`);

const phoneWithPrefix = extractPhoneDeterministic('+91 98765 43210');
assert(phoneWithPrefix === '9876543210', '+91 formatted "9876543210"', `got: ${phoneWithPrefix}`);

const spokenDigits = extractPhoneDeterministic('nine eight seven six five four three two one zero');
assert(spokenDigits === '9876543210', 'Spoken digit words converted to digits', `got: ${spokenDigits}`);

// ---------------------------------------------------------------------------
// 3. Date Extraction Tests
// ---------------------------------------------------------------------------
console.log('\n[3] Date Extraction & Validation');

const nextMondayDate = extractDateDeterministic('I want to come in next Monday');
assert(Boolean(nextMondayDate && nextMondayDate.includes('Monday')), 'Relative date "next Monday"', `got: ${nextMondayDate}`);

const explicitDate = extractDateDeterministic('21st October');
assert(Boolean(explicitDate && explicitDate.includes('October')), 'Explicit date "21st October"', `got: ${explicitDate}`);

// ---------------------------------------------------------------------------
// 4. Time Extraction Tests
// ---------------------------------------------------------------------------
console.log('\n[4] Time Extraction & Validation');

const time1 = extractTimeDeterministic('around 4:30 pm');
assert(time1 === '4:30 PM', 'Time "around 4:30 pm" -> 4:30 PM', `got: ${time1}`);

const time2 = extractTimeDeterministic('at 11 am');
assert(time2 === '11:00 AM', 'Time "at 11 am" -> 11:00 AM', `got: ${time2}`);

const time3 = extractTimeDeterministic('at two');
assert(time3 === '2:00 PM', 'Time "at two" -> 2:00 PM', `got: ${time3}`);

const time4 = extractTimeDeterministic('four pm');
assert(time4 === '4:00 PM', 'Time "four pm" -> 4:00 PM', `got: ${time4}`);

// CRITICAL: Spoken digits must NEVER be falsely parsed as a time!
const timeFalse = extractTimeDeterministic('Eight Seven Six Two Double Four Double Two Nine');
assert(timeFalse === undefined, 'Spoken digits sequence rejected as time', `got: ${timeFalse}`);

const timePhoneFalse = extractTimeDeterministic('8762442297');
assert(timePhoneFalse === undefined, 'Raw 10-digit number rejected as time', `got: ${timePhoneFalse}`);

// ---------------------------------------------------------------------------
// 5. Multi-Slot & Out-of-Order Recognition Tests
// ---------------------------------------------------------------------------
console.log('\n[5] Multi-Slot & Out-of-Order Recognition');

// User scenario: Name with initials "Srija U H"
const srijaName = extractNameDeterministic('Srija U H');
assert(srijaName === 'Srija U H', 'Name with initials "Srija U H"', `got: ${srijaName}`);

// Spoken 9 digits (incomplete phone number)
const spoken9Phone = validatePhone('Eight Seven Six Two Double Four Double Two Nine');
assert(spoken9Phone.valid === false && spoken9Phone.digitCount === 9, 'Spoken 9 digits detected as incomplete with digitCount=9', `got: ${JSON.stringify(spoken9Phone)}`);

const spoken9Name = extractNameDeterministic('Eight Seven Six Two Double Four Double Two Nine');
assert(spoken9Name === undefined, 'Spoken digit words rejected as caller name', `got: ${spoken9Name}`);

// Spoken 10 digits (complete phone number)
const spoken10Phone = extractPhoneDeterministic('Eight Seven Six Two Double Four Double Two Nine Seven');
assert(spoken10Phone === '8762442297', 'Spoken 10 digits extracts phone "8762442297"', `got: ${spoken10Phone}`);

// The exact scenario reported by the user!
const outOfOrderPhone = extractAllSlots('8762442297');
assert(outOfOrderPhone.phone_number === '8762442297', 'Phone extracted from "8762442297"', `got: ${outOfOrderPhone.phone_number}`);
assert(outOfOrderPhone.caller_name === undefined, 'No name falsely extracted from "8762442297"');

// Combined Name + Phone in single turn
const nameAndPhone = extractAllSlots('My name is Ramesh and my number is 8762442297');
assert(nameAndPhone.caller_name === 'Ramesh', 'Combined utterance extracts name "Ramesh"', `got: ${nameAndPhone.caller_name}`);
assert(nameAndPhone.phone_number === '8762442297', 'Combined utterance extracts phone "8762442297"', `got: ${nameAndPhone.phone_number}`);

// Combined Name + Date + Time
const multiAll = extractAllSlots('I am Ramesh, 9876543210, next Monday at 4 pm');
assert(multiAll.caller_name === 'Ramesh', 'Multi extracts name "Ramesh"', `got: ${multiAll.caller_name}`);
assert(multiAll.phone_number === '9876543210', 'Multi extracts phone "9876543210"', `got: ${multiAll.phone_number}`);
assert(Boolean(multiAll.appt_date && multiAll.appt_date.includes('Monday')), 'Multi extracts date', `got: ${multiAll.appt_date}`);
assert(multiAll.appt_time === '4:00 PM', 'Multi extracts time 4:00 PM', `got: ${multiAll.appt_time}`);

console.log('\n========================================');
console.log(` Results: ${passed} passed, ${failed} failed`);
console.log('========================================\n');

if (failed > 0) {
  process.exit(1);
} else {
  process.exit(0);
}
