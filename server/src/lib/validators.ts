/**
 * Per-slot validation helpers for the dental clinic intake state machine.
 *
 * Each validator returns:
 *   { valid: true, value: <normalized> }  — slot is filled
 *   { valid: false }                       — ask again
 */

// Clinic operating hours (configurable via env)
const CLINIC_OPEN_HOUR = parseInt(process.env.CLINIC_OPEN_HOUR || '9', 10);   // 09:00
const CLINIC_CLOSE_HOUR = parseInt(process.env.CLINIC_CLOSE_HOUR || '19', 10); // 19:00
// Mon (1) – Sat (6) open; Sun (0) closed
const CLINIC_OPEN_DAYS = [1, 2, 3, 4, 5, 6];

export interface ValidationResult {
  valid: boolean;
  value?: string;
}

// ---------------------------------------------------------------------------
// Name
// ---------------------------------------------------------------------------

/**
 * Validates a caller name.
 * Accepts 1–4 words, letters and spaces only (allows hyphens and apostrophes).
 * Rejects obviously garbage transcripts like "how to miss", "uh", "okay", numbers.
 */
export function validateName(raw: string): ValidationResult {
  let cleaned = raw.trim();

  // Strip conversational intro phrases if present
  cleaned = cleaned.replace(/^(?:my\s+name\s+is|my\s+name's|i\s+am|i'm|this\s+is|myself|call\s+me|it's|it\s+is)\s+/i, '');
  // Strip common conversational filler words at the beginning
  cleaned = cleaned.replace(/^(?:uh|um|ah|er|hmm|actually|yeah|sure|okay|ok|hi|hello|hey)\s*,?\s*/i, '');
  // Strip conversational suffixes like "here", "please", "speaking"
  cleaned = cleaned.replace(/\s+(?:here|please|speaking)$/i, '');
  // Clean titles "Dr." -> "Dr"
  cleaned = cleaned.replace(/\b(dr|mr|mrs|ms|prof|shri|smt)\.\s*/gi, '$1 ');

  // Allow Unicode letters (\p{L}) and marks/matras (\p{M}) alongside English letters, apostrophes, hyphens, spaces
  cleaned = cleaned.replace(/[^\p{L}\p{M}\s'\-]/gu, '').trim();

  // Must be at least 2 characters
  if (cleaned.length < 2) return { valid: false };

  // Filter out pure noise tokens
  const noise = new Set(['uh', 'um', 'ah', 'er', 'hmm', 'yes', 'no', 'okay', 'ok', 'hi', 'hello', 'hey', 'actually', 'yep']);

  // Extract candidate words
  let words = cleaned.split(/\s+/).filter(Boolean);
  // Remove filler words if more than one word present
  if (words.length > 1) {
    const filtered = words.filter((w) => !noise.has(w.toLowerCase()));
    if (filtered.length > 0) words = filtered;
  }

  if (words.length === 0 || words.length > 4) return { valid: false };

  // Every word must be only letters/marks/hyphen/apostrophe (supporting Unicode \p{L}\p{M})
  const validWord = /^[\p{L}\p{M}'\-]{1,}$/u;
  if (!words.every((w) => validWord.test(w))) return { valid: false };

  if (words.every((w) => noise.has(w.toLowerCase()))) return { valid: false };

  const invalidTokens = new Set([
    'sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday',
    'january', 'february', 'march', 'april', 'may', 'june', 'july', 'august', 'september', 'october', 'november', 'december',
    'today', 'tomorrow', 'yesterday', 'next', 'week', 'month', 'year', 'day',
    'morning', 'afternoon', 'evening', 'night', 'am', 'pm', 'clock', 'hour', 'minute',
    'zero', 'one', 'two', 'three', 'four', 'five', 'six', 'seven', 'eight', 'nine', 'ten', 'double', 'triple',
    'appointment', 'book', 'booking', 'dentist', 'clinic', 'checkup', 'cleaning',
    'doctor', 'none', 'null', 'undefined', 'na', 'unknown'
  ]);
  if (words.some((w) => invalidTokens.has(w.toLowerCase()))) return { valid: false };

  // Capitalize Latin words, keep other Unicode scripts as is
  const normalized = words
    .map((w) => {
      if (/^[a-zA-Z]/.test(w)) {
        return w.charAt(0).toUpperCase() + w.slice(1).toLowerCase();
      }
      return w;
    })
    .join(' ');

  return { valid: true, value: normalized };
}

// ---------------------------------------------------------------------------
// Phone number
// ---------------------------------------------------------------------------

const SPOKEN_DIGIT_MAP: Record<string, string> = {
  zero: '0', one: '1', two: '2', three: '3', four: '4',
  five: '5', six: '6', seven: '7', eight: '8', nine: '9',
  oh: '0',
};

/** Expand spoken words like "double three" or "triple five" into repeated digits. */
export function expandSpokenDigits(input: string): string {
  // "double X" → "XX", "triple X" → "XXX"
  let s = input.toLowerCase();
  s = s.replace(/double\s+([a-z\d]+)/gi, (_, d) => (SPOKEN_DIGIT_MAP[d.toLowerCase()] ?? d).repeat(2));
  s = s.replace(/triple\s+([a-z\d]+)/gi, (_, d) => (SPOKEN_DIGIT_MAP[d.toLowerCase()] ?? d).repeat(3));

  // Replace individual spoken digits
  for (const [word, digit] of Object.entries(SPOKEN_DIGIT_MAP)) {
    s = s.replace(new RegExp(`\\b${word}\\b`, 'g'), digit);
  }
  return s;
}

export interface PhoneValidationResult extends ValidationResult {
  partialDigits?: string;
  digitCount?: number;
}

/**
 * Validates a 10-digit Indian mobile number.
 * Accepts digit strings, spoken digits ("nine eight seven..."), separators, +91 prefix.
 * Valid Indian mobile: starts with 6–9, exactly 10 digits after stripping country code.
 */
export function validatePhone(raw: string): PhoneValidationResult {
  let s = expandSpokenDigits(raw);

  // Strip common separators, spaces, +91 / 0 prefix
  s = s.replace(/[\s\-().+]/g, '');
  s = s.replace(/^91(?=\d{10})/, ''); // strip country code only if followed by 10 digits
  s = s.replace(/^0(?=\d{10})/, '');  // strip leading 0 only if followed by 10 digits

  // Extract first 10-digit sequence that starts with 6-9
  const match = s.match(/([6-9]\d{9})/);
  if (match) {
    return { valid: true, value: match[1] };
  }

  // Check if caller attempted to provide a phone number with 6 to 11 digits
  const allDigits = s.replace(/\D/g, '');
  if (allDigits.length >= 6 && allDigits.length <= 11) {
    return {
      valid: false,
      partialDigits: allDigits,
      digitCount: allDigits.length,
    };
  }

  return { valid: false };
}

// ---------------------------------------------------------------------------
// Date
// ---------------------------------------------------------------------------

const DAY_NAMES: Record<string, number> = {
  sunday: 0, sun: 0,
  monday: 1, mon: 1,
  tuesday: 2, tue: 2,
  wednesday: 3, wed: 3,
  thursday: 4, thu: 4,
  friday: 5, fri: 5,
  saturday: 6, sat: 6,
};

const MONTH_NAMES: Record<string, number> = {
  january: 0, jan: 0, february: 1, feb: 1, march: 2, mar: 2,
  april: 3, apr: 3, may: 4, june: 5, jun: 5, july: 6, jul: 6,
  august: 7, aug: 7, september: 8, sep: 8, sept: 8,
  october: 9, oct: 9, november: 10, nov: 10, december: 11, dec: 11,
};

function startOfDay(d: Date): Date {
  const copy = new Date(d);
  copy.setHours(0, 0, 0, 0);
  return copy;
}

function formatDate(d: Date): string {
  // Returns "Monday, 22 September 2026"
  return d.toLocaleDateString('en-IN', {
    weekday: 'long', day: 'numeric', month: 'long', year: 'numeric',
  });
}

/**
 * Parse natural-language date phrases.
 * Returns a Date set to midnight of the target date, or null if unparseable.
 */
export function parseNaturalDate(raw: string): Date | null {
  const s = raw.trim().toLowerCase();
  const today = startOfDay(new Date());

  if (s.includes('today')) return today;

  if (s.includes('tomorrow')) {
    const d = new Date(today);
    d.setDate(d.getDate() + 1);
    return d;
  }

  // "day after tomorrow"
  if (s.includes('day after tomorrow')) {
    const d = new Date(today);
    d.setDate(d.getDate() + 2);
    return d;
  }

  // "next <weekday>" or just "<weekday>"
  for (const [name, dow] of Object.entries(DAY_NAMES)) {
    if (new RegExp(`\\b${name}\\b`).test(s)) {
      const d = new Date(today);
      const diff = ((dow - today.getDay() + 7) % 7) || 7; // always forward
      d.setDate(d.getDate() + diff);
      return d;
    }
  }

  // "in N days" / "after N days"
  const inDays = s.match(/\bin\s+(\d+)\s+days?\b/) || s.match(/\bafter\s+(\d+)\s+days?\b/);
  if (inDays) {
    const d = new Date(today);
    d.setDate(d.getDate() + parseInt(inDays[1], 10));
    return d;
  }

  // "<day> <month>" e.g. "22 September", "25th October", "September 22"
  for (const [mName, mIndex] of Object.entries(MONTH_NAMES)) {
    const patterns = [
      new RegExp(`(\\d{1,2})(?:st|nd|rd|th)?\\s+${mName}`),
      new RegExp(`${mName}\\s+(\\d{1,2})(?:st|nd|rd|th)?`),
    ];
    for (const pat of patterns) {
      const m = s.match(pat);
      if (m) {
        const d = new Date(today.getFullYear(), mIndex, parseInt(m[1], 10));
        // If date is in the past, try next year
        if (d < today) d.setFullYear(d.getFullYear() + 1);
        return d;
      }
    }
  }

  // ISO / numeric: YYYY-MM-DD, DD/MM/YYYY, DD-MM-YYYY
  const iso = s.match(/(\d{4})-(\d{1,2})-(\d{1,2})/);
  if (iso) return new Date(parseInt(iso[1]), parseInt(iso[2]) - 1, parseInt(iso[3]));

  const dmy = s.match(/(\d{1,2})[\/\-](\d{1,2})(?:[\/\-](\d{2,4}))?/);
  if (dmy) {
    const year = dmy[3] ? parseInt(dmy[3]) + (dmy[3].length === 2 ? 2000 : 0) : today.getFullYear();
    const d = new Date(year, parseInt(dmy[2]) - 1, parseInt(dmy[1]));
    if (d < today) d.setFullYear(d.getFullYear() + 1);
    return d;
  }

  return null;
}

/**
 * Validates an appointment date.
 * Rejects past dates. Returns human-readable date string.
 */
export function validateDate(raw: string): ValidationResult {
  const d = parseNaturalDate(raw);
  if (!d || isNaN(d.getTime())) return { valid: false };

  const today = startOfDay(new Date());
  if (d < today) return { valid: false }; // past date

  // Check if clinic is open (Mon–Sat)
  if (!CLINIC_OPEN_DAYS.includes(d.getDay())) {
    // Sundays — nudge to next valid day
    return { valid: false };
  }

  return { valid: true, value: formatDate(d) };
}

// ---------------------------------------------------------------------------
// Time
// ---------------------------------------------------------------------------

const TIME_WORDS: Record<string, number> = {
  twelve: 12, one: 1, two: 2, three: 3, four: 4, five: 5, six: 6,
  seven: 7, eight: 8, nine: 9, ten: 10, eleven: 11,
};

const SPOKEN_DIGIT_WORDS = new Set([
  'zero', 'one', 'two', 'three', 'four', 'five', 'six', 'seven', 'eight', 'nine', 'oh',
]);

/**
 * Parse natural-language time phrases.
 * Returns { hour, minute } in 24h format or null.
 */
function parseNaturalTime(raw: string): { hour: number; minute: number } | null {
  let s = raw.trim().toLowerCase();

  // Strip phone numbers / long digit sequences (6+ digits) first so they don't interfere with time parsing
  s = s.replace(/(?:\+91|0)?[6-9]\d{9}/g, ' ').replace(/\b\d{6,}\b/g, ' ').trim();
  if (!s) return null;

  // Count spoken digit words. If 2 or more digit words are present without time indicators,
  // it's a digit sequence (e.g. spoken phone number), NOT an appointment time!
  const words = s.split(/\s+/).filter(Boolean);
  const digitWordsCount = words.filter((w) => SPOKEN_DIGIT_WORDS.has(w)).length;
  const hasTimeIndicator = /\b(?:am|pm|o'?clock|morning|afternoon|evening|night|past|to|half|quarter|thirty|fifteen|forty|at|around|by)\b/i.test(s);

  if (digitWordsCount >= 2 && !hasTimeIndicator) {
    return null;
  }

  // 1. "4:30 pm", "16:30", "4:30"
  const colonMatch = s.match(/\b(\d{1,2})[:\s](\d{2})\s*(am|pm)?\b/);
  if (colonMatch) {
    let h = parseInt(colonMatch[1], 10);
    const m = parseInt(colonMatch[2], 10);
    const ampm = colonMatch[3];
    if (ampm === 'pm' && h < 12) h += 12;
    if (ampm === 'am' && h === 12) h = 0;
    if (!ampm && h >= 1 && h <= 6) h += 12;
    return { hour: h, minute: m };
  }

  // 2. Numeric hour with am/pm or o'clock: "4 pm", "4pm", "11 am", "4 o'clock"
  const simpleMatch = s.match(/\b(\d{1,2})\s*(am|pm|o'?clock)\b/);
  if (simpleMatch) {
    let h = parseInt(simpleMatch[1], 10);
    const marker = simpleMatch[2];
    if (marker === 'pm' && h < 12) h += 12;
    if (marker === 'am' && h === 12) h = 0;
    if (marker.startsWith('o') && h >= 1 && h <= 6) h += 12;
    return { hour: h, minute: 0 };
  }

  // 3. "at 4", "around 11", "by 2"
  const atMatch = s.match(/\b(?:at|around|by)\s+(\d{1,2})\b(?!\d)/);
  if (atMatch) {
    let h = parseInt(atMatch[1], 10);
    if (h >= 1 && h <= 6) h += 12;
    return { hour: h, minute: 0 };
  }

  // 4. Military / 24h: "1600", "0930"
  const military = s.match(/\b([01]\d|2[0-3])([0-5]\d)\b/);
  if (military) {
    return { hour: parseInt(military[1], 10), minute: parseInt(military[2], 10) };
  }

  // 5. Spoken word hours with context:
  // Must match with word boundary and appropriate context:
  // e.g. "four pm", "at two", "eleven thirty", "half past three", "two o'clock", or standalone single word
  for (const [word, val] of Object.entries(TIME_WORDS)) {
    const wordPattern = new RegExp(`\\b${word}\\b`);
    if (!wordPattern.test(s)) continue;

    const isAtWord = new RegExp(`\\b(?:at|around|by)\\s+${word}\\b`).test(s);
    const isWordMarker = new RegExp(`\\b${word}\\s*(?:am|pm|o'?clock)\\b`).test(s);
    const isWordMinute = new RegExp(`\\b${word}\\s+(?:thirty|fifteen|forty-five)\\b`).test(s);
    const isPastTo = new RegExp(`\\b(?:half|quarter)\\s+(?:past|to)\\s+${word}\\b`).test(s);
    const isWordContext = new RegExp(`\\b${word}\\s+in\\s+the\\s+(?:morning|afternoon|evening)\\b`).test(s);
    const isExactWord = words.length === 1 && words[0] === word;

    if (isAtWord || isWordMarker || isWordMinute || isPastTo || isWordContext || isExactWord) {
      let h = val;
      let m = 0;

      if (/\bthirty\b/.test(s)) m = 30;
      if (/\bfifteen\b/.test(s)) m = 15;
      if (/\bquarter\s+past\b/.test(s)) m = 15;
      if (/\bquarter\s+to\b/.test(s)) {
        m = 45;
        h = h - 1;
        if (h < 0) h = 23;
      }
      if (/\bhalf\s+past\b/.test(s)) m = 30;

      const isPm = /\b(?:pm|afternoon|evening|night)\b/.test(s);
      const isAm = /\b(?:am|morning)\b/.test(s);

      if (isPm && h < 12) h += 12;
      if (isAm && h === 12) h = 0;
      if (!isAm && !isPm && h >= 1 && h <= 6) h += 12;

      return { hour: h, minute: m };
    }
  }

  return null;
}

function formatTime(hour: number, minute: number): string {
  const period = hour < 12 ? 'AM' : 'PM';
  const h12 = hour % 12 || 12;
  const mm = minute.toString().padStart(2, '0');
  return `${h12}:${mm} ${period}`;
}

/**
 * Validates an appointment time.
 * Rejects times outside clinic hours (CLINIC_OPEN_HOUR – CLINIC_CLOSE_HOUR).
 * Returns "4:00 PM" style string.
 */
export function validateTime(raw: string): ValidationResult {
  const parsed = parseNaturalTime(raw);
  if (!parsed) return { valid: false };

  const { hour, minute } = parsed;
  if (hour < CLINIC_OPEN_HOUR || hour >= CLINIC_CLOSE_HOUR) return { valid: false };
  if (minute < 0 || minute > 59) return { valid: false };

  return { valid: true, value: formatTime(hour, minute) };
}

/**
 * Check if a user message is a "yes" confirmation.
 */
export function isConfirmationYes(text: string): boolean {
  const lower = text.trim().toLowerCase();
  return (
    /^(yes|yeah|yep|yup|sure|correct|confirm|go ahead|please|ok|okay|that'?s? right|absolutely|perfect|sounds good|book it|book the appointment|please book|done|all good|fine)/i.test(lower) ||
    /\b(?:book|confirm|go ahead)\b/i.test(lower)
  );
}

/**
 * Check if a user message is a "no" / wants to correct.
 */
export function isConfirmationNo(text: string): boolean {
  const lower = text.trim().toLowerCase();
  return /^(no|nope|wrong|incorrect|wait|change|correct it|that'?s? wrong|not right|hold on|cancel|stop)/i.test(lower);
}

/**
 * From a "which detail to correct" reply, return the slot key or null.
 */
export function detectCorrectionTarget(text: string): 'caller_name' | 'phone_number' | 'appt_date' | 'appt_time' | null {
  const lower = text.toLowerCase();
  if (/\bname\b/.test(lower)) return 'caller_name';
  if (/\bphone|number|contact\b/.test(lower)) return 'phone_number';
  if (/\bdate|day\b/.test(lower)) return 'appt_date';
  if (/\btime|hour\b/.test(lower)) return 'appt_time';
  return null;
}
