/**
 * Deterministic Slot Extractor — server/src/lib/slotExtractor.ts
 *
 * Provides high-speed, zero-cost, offline rule-based extraction for:
 *   - Caller Names (handles "My name is...", "I am...", single Indian names like "Ramesh", titles like "Dr. Verma")
 *   - Indian Phone Numbers (10-digit mobile numbers starting with 6-9, +91 prefixes, spoken digits)
 *   - Appointment Dates (relative dates like "tomorrow", "day after tomorrow", day names, explicit dates)
 *   - Appointment Times (12h/24h formats, "4:30 pm", "11 am", "in the morning at 10")
 *
 * Allows multi-slot and out-of-order recognition (e.g. user provides phone number during name step).
 */

import { validateName, validatePhone, validateDate, validateTime } from './validators.js';

export interface ExtractedSlots {
  caller_name?: string;
  phone_number?: string;
  appt_date?: string;
  appt_time?: string;
}

// Common conversational preambles to strip before analyzing names
const GREETING_FILLERS = [
  /^(?:hello|hi|hey|good\s+(?:morning|afternoon|evening))\s*,?\s*/i,
  /^(?:yes|yeah|sure|okay|ok|actually|yep|uh|um|ah|er|hmm)\s*,?\s*/i,
  /^(?:please\s+note\s+that|i\s+would\s+like\s+to\s+say\s+that)\s*,?\s*/i,
];

// Name introduction patterns (supports Unicode letters \p{L} and marks \p{M})
const NAME_PATTERNS = [
  /(?:my\s+name\s+is|my\s+name's|i\s+am|i'm|this\s+is|myself|call\s+me|you\s+can\s+call\s+me|name\s+is)\s+([\p{L}\p{M}'\-\.\s]{2,40})/iu,
  /(?:speaking\s+here\s+is|it\s+is|it's)\s+([\p{L}\p{M}'\-\.\s]{2,40})/iu,
];

// Words that indicate the user is talking about something other than their name
const NON_NAME_WORDS = new Set([
  'appointment', 'book', 'booking', 'dentist', 'clinic', 'tooth', 'teeth',
  'pain', 'checkup', 'cleaning', 'tomorrow', 'today', 'yesterday', 'next', 'week', 'month', 'year',
  'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday',
  'january', 'february', 'march', 'april', 'may', 'june', 'july', 'august', 'september', 'october', 'november', 'december',
  'morning', 'afternoon', 'evening', 'night', 'pm', 'am', 'call', 'number', 'phone', 'mobile',
  'zero', 'one', 'two', 'three', 'four', 'five', 'six', 'seven', 'eight', 'nine', 'ten', 'double', 'triple',
  'cancel', 'reschedule', 'change', 'doctor', 'help', 'question'
]);

/**
 * Clean title abbreviations (e.g., "Dr." -> "Dr", "Mr." -> "Mr")
 */
function cleanTitles(text: string): string {
  return text.replace(/\b(dr|mr|mrs|ms|prof|shri|smt)\.\s*/gi, '$1 ');
}

/**
 * Extract caller name using deterministic rules
 */
export function extractNameDeterministic(text: string): string | undefined {
  if (!text || !text.trim()) return undefined;

  let cleaned = text.trim();

  // Strip phone numbers from text first if present to avoid confusing name checks
  cleaned = cleaned.replace(/(?:\+91|0)?[6-9]\d{9}/g, '').trim();

  // Strip leading greetings and fillers
  for (const filler of GREETING_FILLERS) {
    cleaned = cleaned.replace(filler, '').trim();
  }

  cleaned = cleanTitles(cleaned);
  cleaned = cleaned.replace(/\s+(?:here|please|speaking)$/i, '').trim();

  // 1. Try explicit intro patterns ("My name is Ramesh Kumar", "I am Priya")
  for (const pattern of NAME_PATTERNS) {
    const match = cleaned.match(pattern);
    if (match && match[1]) {
      // Cut off trailing conversational clauses (e.g., "Ramesh and my phone number is...")
      let candidate = match[1].split(/\b(?:and|my|phone|number|mobile|at|on|for|with)\b/i)[0].trim();
      candidate = candidate.replace(/[.,!?;:]/g, '').trim();
      const validated = validateName(candidate);
      if (validated.valid && validated.value) {
        return validated.value;
      }
    }
  }

  // 2. Direct name input or compound clause prefix (e.g. "Ramesh and my number is..." or "Ramesh, tomorrow")
  // First, if user provided a compound sentence without explicit "my name is":
  const clauseCandidate = cleaned.split(/\b(?:and|my|phone|number|mobile|for|want|need|at|on)\b/i)[0].trim().replace(/[.,!?;:]/g, '');
  if (clauseCandidate && clauseCandidate !== cleaned) {
    const validated = validateName(clauseCandidate);
    if (validated.valid && validated.value) {
      return validated.value;
    }
  }

  // 3. Direct name input: 1 to 4 words with no digits or special punctuation
  // e.g. "Ramesh", "Ramesh Kumar", "Dr Ramesh Verma", "Priya S"
  const candidateDirect = cleaned.replace(/[.,!?;:]/g, '').trim();
  const words = candidateDirect.split(/\s+/).filter(Boolean);

  if (words.length >= 1 && words.length <= 4) {
    const lowerWords = words.map(w => w.toLowerCase());
    const containsNonName = lowerWords.some(w => NON_NAME_WORDS.has(w));
    if (!containsNonName) {
      const validated = validateName(candidateDirect);
      if (validated.valid && validated.value) {
        return validated.value;
      }
    }
  }

  return undefined;
}

/**
 * Extract phone number using deterministic rules
 */
export function extractPhoneDeterministic(text: string): string | undefined {
  if (!text || !text.trim()) return undefined;
  const result = validatePhone(text);
  return result.valid ? result.value : undefined;
}

/**
 * Extract appointment date using deterministic rules
 */
export function extractDateDeterministic(text: string): string | undefined {
  if (!text || !text.trim()) return undefined;
  const result = validateDate(text);
  return result.valid ? result.value : undefined;
}

/**
 * Extract appointment time using deterministic rules
 */
export function extractTimeDeterministic(text: string): string | undefined {
  if (!text || !text.trim()) return undefined;
  const result = validateTime(text);
  return result.valid ? result.value : undefined;
}

/**
 * Simultaneously scans user input for all recognizable slots.
 * Enables multi-slot intake and graceful out-of-order handling.
 */
export function extractAllSlots(text: string): ExtractedSlots {
  const result: ExtractedSlots = {};

  const phone = extractPhoneDeterministic(text);
  if (phone) result.phone_number = phone;

  const date = extractDateDeterministic(text);
  if (date) result.appt_date = date;

  const time = extractTimeDeterministic(text);
  if (time) result.appt_time = time;

  const name = extractNameDeterministic(text);
  if (name) result.caller_name = name;

  return result;
}
