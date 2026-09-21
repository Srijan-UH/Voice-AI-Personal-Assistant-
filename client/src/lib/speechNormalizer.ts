/**
 * speechNormalizer.ts — Normalizes text for natural Text-To-Speech pronunciation.
 *
 * Requirements:
 *  - Strips markdown, emojis, and symbols (* # _ ` / \ and similar)
 *  - Formats phone numbers digit by digit with short pauses (e.g. "9 8 7 6, 5 4 3, 2 1 0")
 *  - Formats times naturally ("4 P M", "4:30 P M")
 *  - Formats dates naturally ("Wednesday, the 21st of October, 2026")
 *  - Preserves names and spoken words cleanly
 *  - Adds commas or periods where conversational pauses are needed
 */

const MONTH_NAMES = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December'
];

const DAY_NAMES = [
  'Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'
];

function getOrdinal(n: number): string {
  const s = ['th', 'st', 'nd', 'rd'];
  const v = n % 100;
  return n + (s[(v - 20) % 10] || s[v] || s[0]);
}

/**
 * Format ISO date string YYYY-MM-DD into "Day, the Nth of Month, Year"
 */
function normalizeIsoDate(dateStr: string): string {
  const parts = dateStr.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!parts) return dateStr;
  const year = parseInt(parts[1], 10);
  const month = parseInt(parts[2], 10) - 1;
  const day = parseInt(parts[3], 10);

  const d = new Date(year, month, day);
  if (isNaN(d.getTime())) return dateStr;

  const dayName = DAY_NAMES[d.getDay()];
  const monthName = MONTH_NAMES[month];
  const ordinalDay = getOrdinal(day);

  return `${dayName}, the ${ordinalDay} of ${monthName}, ${year}`;
}

/**
 * Format standard 10-digit Indian phone numbers into spaced cadence with pauses.
 * E.g. "9876543210" -> "9 8 7 6, 5 4 3, 2 1 0"
 * E.g. "+91 98765 43210" -> "plus 9 1, 9 8 7 6, 5 4 3, 2 1 0"
 */
function normalizePhoneNumbers(text: string): string {
  // Handle "+91 XXXXXXXXXX" or "+91 XXXXX XXXXX"
  text = text.replace(/(?:\+91[\s\-]?)(\d{5})[\s\-]?(\d{5})\b/g, (_match, p1, p2) => {
    const d = (p1 + p2).split('');
    return `plus 9 1, ${d.slice(0, 4).join(' ')}, ${d.slice(4, 7).join(' ')}, ${d.slice(7).join(' ')}`;
  });

  // Handle "+91" prefix followed by 10 digits
  text = text.replace(/(?:\+91[\s\-]?)(\d{10})\b/g, (_match, p1) => {
    const d = p1.split('');
    return `plus 9 1, ${d.slice(0, 4).join(' ')}, ${d.slice(4, 7).join(' ')}, ${d.slice(7).join(' ')}`;
  });

  // Handle standalone 10 digit numbers (phone numbers)
  text = text.replace(/\b(\d{10})\b/g, (_match, p1) => {
    const d = p1.split('');
    return `${d.slice(0, 4).join(' ')}, ${d.slice(4, 7).join(' ')}, ${d.slice(7).join(' ')}`;
  });

  return text;
}

/**
 * Format times like "4:30 pm", "4 pm", "11:00 am" for clear pronunciation
 */
function normalizeTimes(text: string): string {
  // "4:00 PM" or "4:00 pm" -> "4 P M"
  text = text.replace(/\b(\d{1,2}):00\s*(am|pm|AM|PM)\b/g, (_match, h, ap) => {
    return `${h} ${ap.toUpperCase().split('').join(' ')}`;
  });

  // "4:30 pm" or "4:30 PM" -> "4 30 P M"
  text = text.replace(/\b(\d{1,2}):(\d{2})\s*(am|pm|AM|PM)\b/g, (_match, h, m, ap) => {
    return `${h} ${m} ${ap.toUpperCase().split('').join(' ')}`;
  });

  // "4 pm" or "4 PM" -> "4 P M"
  text = text.replace(/\b(\d{1,2})\s*(am|pm|AM|PM)\b/g, (_match, h, ap) => {
    return `${h} ${ap.toUpperCase().split('').join(' ')}`;
  });

  return text;
}

/**
 * Format ISO dates like "2026-10-21" or natural dates like "19 September 2026"
 */
function normalizeDates(text: string): string {
  // YYYY-MM-DD
  text = text.replace(/\b(\d{4}-\d{2}-\d{2})\b/g, (_match, d) => normalizeIsoDate(d));

  // "19 September 2026" -> "the 19th of September, 2026"
  text = text.replace(/\b(\d{1,2})(?:st|nd|rd|th)?\s+(January|February|March|April|May|June|July|August|September|October|November|December),?\s+(\d{4})\b/gi, (_match, day, month, year) => {
    return `the ${getOrdinal(parseInt(day, 10))} of ${month}, ${year}`;
  });

  return text;
}

/**
 * Strips markdown formatting, links, emojis, and unnecessary symbols
 */
function stripMarkdownAndSymbols(text: string): string {
  // Markdown links: [text](url) -> text
  text = text.replace(/\[([^\]]+)\]\([^)]+\)/g, '$1');

  // Strip headers: # Header
  text = text.replace(/^#{1,6}\s+/gm, '');

  // Strip bold/italic/strike: **bold**, *italic*, __bold__, _italic_, ~~strike~~
  text = text.replace(/(\*\*|__|\*|_|~~)/g, '');

  // Strip inline code: `code`
  text = text.replace(/`([^`]+)`/g, '$1');

  // Strip blockquote markers and list markers: > quote, - list, * list
  text = text.replace(/^\s*[>\-*+]\s+/gm, '');

  // Strip emojis (Unicode Extended_Pictographic property)
  try {
    text = text.replace(/\p{Extended_Pictographic}/gu, '');
  } catch {
    // Fallback for older regex engines
    text = text.replace(/[\u{1F300}-\u{1F9FF}\u{2600}-\u{26FF}\u{2700}-\u{27BF}]/gu, '');
  }

  // Strip remaining unwanted symbols like #, \, /, ~, |, ^
  text = text.replace(/[#\\/~|^]/g, ' ');

  // Replace colons following words (e.g. "Note:", "confirm:") with comma for natural pause
  text = text.replace(/([a-zA-Z0-9]):\s+/g, '$1, ');

  return text;
}

/**
 * Main normalization function for speech synthesis
 */
export function normalizeForSpeech(text: string): string {
  if (!text) return '';

  let speech = text.trim();

  // 1. Strip markdown, emojis and symbols
  speech = stripMarkdownAndSymbols(speech);

  // 2. Format phone numbers with natural pauses
  speech = normalizePhoneNumbers(speech);

  // 3. Format times
  speech = normalizeTimes(speech);

  // 4. Format dates
  speech = normalizeDates(speech);

  // 5. Clean up duplicate punctuation and excess whitespace
  speech = speech
    .replace(/\s+/g, ' ')
    .replace(/,\s*,+/g, ',')
    .replace(/\.\s*\.+/g, '.')
    .replace(/,\s*\./g, '.')
    .trim();

  return speech;
}

/**
 * Splits text into natural speech clauses (~350 characters max)
 * to prevent browser SpeechSynthesis buffer cutoffs without fragmenting sentences or breaking on commas.
 */
export function chunkTextForSpeech(text: string, maxChunkLength: number = 350): string[] {
  if (!text) return [];
  if (text.length <= maxChunkLength) return [text];

  const chunks: string[] = [];
  // Split on sentence boundaries first (. ! ?)
  const sentences = text.match(/[^.!?]+[.!?]+|[^.!?]+$/g) || [text];

  let currentChunk = '';

  for (const sentence of sentences) {
    const trimmed = sentence.trim();
    if (!trimmed) continue;

    if ((currentChunk + ' ' + trimmed).trim().length <= maxChunkLength) {
      currentChunk = (currentChunk + ' ' + trimmed).trim();
    } else {
      if (currentChunk) {
        chunks.push(currentChunk);
        currentChunk = '';
      }

      // If a single sentence exceeds maxChunkLength, split on semicolons or dashes, NOT commas (preserves phone numbers and dates)
      if (trimmed.length > maxChunkLength) {
        const clauses = trimmed.split(/;\s+|—\s+/);
        let subChunk = '';
        for (const clause of clauses) {
          if ((subChunk + ' ' + clause).trim().length <= maxChunkLength) {
            subChunk = subChunk ? `${subChunk} ${clause}` : clause;
          } else {
            if (subChunk) chunks.push(subChunk);
            subChunk = clause;
          }
        }
        if (subChunk) currentChunk = subChunk;
      } else {
        currentChunk = trimmed;
      }
    }
  }

  if (currentChunk) {
    chunks.push(currentChunk);
  }

  return chunks.filter(c => c.length > 0);
}
