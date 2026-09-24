/**
 * clinicQA.ts — Apex Dental Care Clinic Knowledge Base & Question Answering
 *
 * Handles answering patient inquiries during voice calls (e.g. location,
 * hours, doctors, pricing, services, parking, insurance) and seamlessly
 * transitions back to appointment booking.
 */
import { chat as sarvamChat } from './sarvam.js';

export interface ClinicInfo {
  name: string;
  doctor: string;
  specialization: string;
  address: string;
  landmarks: string;
  hours: string;
  emergencyHours: string;
  phone: string;
  consultationFee: string;
  services: { name: string; price: string }[];
  paymentMethods: string[];
  insuranceAccepted: boolean;
  parkingAvailable: boolean;
  cancellationPolicy: string;
}

export const CLINIC_INFO: ClinicInfo = {
  name: 'Apex Dental Care Clinic',
  doctor: 'Dr. Sarah Jenkins',
  specialization: 'Senior Dental Surgeon & Orthodontist (BDS, MDS, 12+ years experience)',
  address: '123 Healthcare Boulevard, Suite 400',
  landmarks: 'Opposite City Hospital, near Metro Station Gate 2',
  hours: 'Monday to Saturday, 9:00 AM to 7:00 PM',
  emergencyHours: 'Sunday 10:00 AM to 2:00 PM for emergencies',
  phone: '+91 98765 43210',
  consultationFee: '₹500',
  services: [
    { name: 'Comprehensive Dental Consultation & Checkup', price: '₹500' },
    { name: 'Ultrasonic Teeth Cleaning & Polishing', price: '₹1,500' },
    { name: 'Root Canal Treatment (RCT)', price: 'Starting at ₹4,000' },
    { name: 'Tooth Extraction', price: 'Starting at ₹1,000' },
    { name: 'Professional Teeth Whitening', price: '₹6,000' },
    { name: 'Dental Implants', price: 'Starting at ₹25,000' },
    { name: 'Braces & Clear Aligners', price: 'Starting at ₹35,000' },
    { name: 'Pediatric Dental Care', price: 'Starting at ₹800' },
  ],
  paymentMethods: ['Cash', 'UPI', 'Debit/Credit Cards', 'Net Banking'],
  insuranceAccepted: true,
  parkingAvailable: true,
  cancellationPolicy: 'Free rescheduling or cancellation up to 2 hours before your appointment.',
};

/**
 * Common question patterns and their instant, high-speed spoken responses
 */
const FAQ_PATTERNS: { pattern: RegExp; answer: string }[] = [
  // Location & Address
  {
    pattern: /\b(?:where|location|address|situated|located|reach|kaha|metro|directions)\b/i,
    answer: `Apex Dental Care Clinic is located at 123 Healthcare Boulevard, Suite 400, right opposite City Hospital near Metro Station Gate 2.`,
  },
  // Timings & Clinic Hours
  {
    pattern: /\b(?:timing|timings|hours|open|close|closing|schedule|weekend|sunday|samay|kab)\b/i,
    answer: `We are open Monday through Saturday from 9:00 AM to 7:00 PM, and on Sundays from 10:00 AM to 2:00 PM for emergency cases.`,
  },
  // Doctor & Dentist
  {
    pattern: /\b(?:doctor|dentist|dr|jenkins|specialist|surgeon|experience|who)\b/i,
    answer: `Our chief dental surgeon is Dr. Sarah Jenkins, who has over 12 years of experience in restorative dentistry and orthodontics.`,
  },
  // Pricing, Cost & Fees
  {
    pattern: /\b(?:cost|price|fees|fee|charge|charges|how much|rate|kitna|expensive|free)\b/i,
    answer: `Our dental consultation is ₹500, routine teeth cleaning is ₹1,500, and root canal treatments start at ₹4,000.`,
  },
  // Cleaning & Hygiene
  {
    pattern: /\b(?:cleaning|hygiene|scaling|polish|polishing)\b/i,
    answer: `Yes! We provide ultrasonic teeth cleaning and stain removal for ₹1,500. It is gentle and takes about 30 to 45 minutes.`,
  },
  // Root Canal & Tooth Pain
  {
    pattern: /\b(?:root canal|rct|pain|hurts|hurt|toothache|ache|infection)\b/i,
    answer: `We specialize in single-sitting, pain-free root canal treatments starting at ₹4,000 using advanced computerized anesthesia.`,
  },
  // Whitening & Cosmetic
  {
    pattern: /\b(?:whitening|white|bleach|smile|aligner|aligners|braces)\b/i,
    answer: `Yes, we offer laser teeth whitening as well as invisible clear aligners and modern braces for smile correction.`,
  },
  // Insurance & Payment Options
  {
    pattern: /\b(?:insurance|tpa|policy|claim|card|upi|cash|emi|payment|pay)\b/i,
    answer: `Yes, we accept all major dental insurances, UPI, cards, and cash, and we also offer zero-percent EMI on major procedures.`,
  },
  // Parking & Accessibility
  {
    pattern: /\b(?:parking|car|park|wheelchair|vehicle|drive)\b/i,
    answer: `Yes, we offer free visitor valet parking on premises, and our clinic is completely wheelchair accessible with an elevator.`,
  },
  // Reschedule & Cancellation
  {
    pattern: /\b(?:cancel|cancellation|reschedule|change date|change time|postpone)\b/i,
    answer: `You can freely reschedule or cancel your appointment anytime up to 2 hours before the scheduled time with no cancellation charges.`,
  },
];

/**
 * Checks whether the user's utterance represents an inquiry or question
 */
export function isUserInquiry(text: string): boolean {
  const trimmed = text.trim();
  if (trimmed.endsWith('?')) return true;

  const inquiryWords = [
    'where',
    'what',
    'when',
    'who',
    'which',
    'why',
    'how',
    'is there',
    'are there',
    'do you',
    'can i',
    'can you',
    'can we',
    'will you',
    'could you',
    'tell me',
    'i want to know',
    'how much',
    'how many',
    'location',
    'address',
    'timing',
    'timings',
    'price',
    'cost',
    'fee',
    'fees',
    'doctor',
    'dentist',
    'insurance',
    'parking',
    'service',
    'services',
    'kaha',
    'kitna',
    'kab',
    'kya',
    'kaise',
  ];

  const lower = trimmed.toLowerCase();
  for (const word of inquiryWords) {
    if (new RegExp(`(^|\\b)${word}(\\b|$)`, 'i').test(lower)) {
      return true;
    }
  }

  return false;
}

/**
 * Matches an inquiry against pre-configured FAQ responses for zero-latency answers
 */
export function matchDeterministicFAQ(text: string): string | null {
  for (const item of FAQ_PATTERNS) {
    if (item.pattern.test(text)) {
      return item.answer;
    }
  }
  return null;
}

/**
 * Answers a user's question using instant FAQ or Sarvam AI LLM fallback.
 * Always produces a short, concise, speech-friendly answer (1-2 sentences).
 */
export async function answerClinicQuestion(
  userQuestion: string,
  modelName: string = 'sarvam-105b-conversations'
): Promise<string> {
  // 1. Try instant deterministic FAQ match first (0ms latency!)
  const instantAnswer = matchDeterministicFAQ(userQuestion);
  if (instantAnswer) {
    console.log(`[ClinicQA] Instant FAQ match for: "${userQuestion}"`);
    return instantAnswer;
  }

  // 2. Use Sarvam AI LLM for free-form or specific questions
  try {
    const prompt = `You are the AI Voice Receptionist for Apex Dental Care Clinic.
A caller has asked: "${userQuestion}"

Clinic Information:
- Name: Apex Dental Care Clinic
- Location: 123 Healthcare Boulevard, Suite 400 (opposite City Hospital, Metro Gate 2)
- Timings: Monday to Saturday 9:00 AM to 7:00 PM; Sunday 10:00 AM to 2:00 PM (emergencies)
- Chief Dentist: Dr. Sarah Jenkins (Senior Dental Surgeon & Orthodontist, 12+ years experience)
- Services: Dental checkup (₹500), Teeth cleaning (₹1,500), Root Canal (from ₹4,000), Implants, Braces, Whitening
- Amenities: Free valet parking, wheelchair accessible, all cards/UPI/insurance accepted.

Answer the caller's question concisely in 1 to 2 SHORT, spoken, conversational sentences. Speak naturally and warmly. Do NOT use markdown, bullet points, asterisks, or robotic greetings.
Answer:`;

    const res = await sarvamChat(
      [{ role: 'user', content: prompt }],
      { model: modelName, max_tokens: 65, temperature: 0.2 }
    );

    let answer = res.content.trim();
    // Clean any prefix like "Answer:" or quotation marks
    answer = answer.replace(/^(?:Answer|Response):\s*/i, '').replace(/^["']|["']$/g, '').trim();
    if (answer) {
      console.log(`[ClinicQA] LLM generated answer in ${res.latencyMs}ms: "${answer}"`);
      return answer;
    }
  } catch (err: any) {
    console.warn('[ClinicQA] LLM fallback failed:', err.message);
  }

  // 3. Fallback general friendly response
  return `Apex Dental Care Clinic is located at 123 Healthcare Boulevard, Suite 400. We are open Monday to Saturday from 9 AM to 7 PM.`;
}
