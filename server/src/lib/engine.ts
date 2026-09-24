/**
 * engine.ts — Dental Clinic Voice AI Conversation Engine
 *
 * Architecture:
 *  1. Deterministic slot-filling state machine drives the conversation.
 *     The CODE decides which question to ask next — not the LLM.
 *  2. LLM (Sarvam AI) is used ONLY to extract
 *     a candidate value from free-form user speech.
 *  3. Per-slot validators (validators.ts) decide if the value is acceptable.
 *  4. Up to 3 failures on a slot → offer text fallback.
 *  5. After all slots filled → read back → wait for yes/no → book calendar.
 *
 * Intake slots (in order):
 *   caller_name → phone_number → appt_date → appt_time
 */
import dotenv from 'dotenv';
import OpenAI from 'openai';
import { chat as sarvamChat } from './sarvam.js';
import { db } from './firebase.js';
import { Business, Workflow, Call } from '../types/db.js';
import { executeToolCall, createCalendarEvent } from './tools/index.js';
import {
  validateName,
  validatePhone,
  validateDate,
  validateTime,
  isConfirmationYes,
  isConfirmationNo,
  detectCorrectionTarget,
} from './validators.js';
import {
  extractAllSlots,
  extractNameDeterministic,
  extractPhoneDeterministic,
  extractDateDeterministic,
  extractTimeDeterministic,
} from './slotExtractor.js';
import { isUserInquiry, answerClinicQuestion } from './clinicQA.js';

dotenv.config();

// ---------------------------------------------------------------------------
// AI Client
// ---------------------------------------------------------------------------

export function getAIClient(): {
  openai: OpenAI | null;
  isConfigured: boolean;
  modelName: string;
} {
  dotenv.config();

  const sarvamKey = process.env.SARVAM_API_KEY?.trim();
  if (sarvamKey && sarvamKey.length > 5 && !sarvamKey.includes('your_sarvam_api_key')) {
    const modelName = process.env.SARVAM_MODEL?.trim() || 'sarvam-105b';
    console.log(`[AI Engine] Using Sarvam AI Key with model "${modelName}"`);
    return {
      openai: new OpenAI({
        apiKey: sarvamKey,
        baseURL: 'https://api.sarvam.ai/v1',
        defaultHeaders: { 'api-subscription-key': sarvamKey },
      }),
      isConfigured: true,
      modelName,
    };
  }

  return { openai: null, isConfigured: false, modelName: 'fallback' };
}

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface ChatMessage {
  id: string;
  role: 'user' | 'assistant' | 'system' | 'tool';
  content: string;
  timestamp: string;
  toolCallName?: string;
  interrupted?: boolean;
}

/** Conversation states for the intake state machine. */
export type IntakeState =
  | 'greeting'
  | 'collecting_name'
  | 'collecting_phone'
  | 'collecting_date'
  | 'collecting_time'
  | 'awaiting_confirmation'    // reading back details, waiting for yes/no
  | 'correcting'               // user said no, asking which detail to fix
  | 'completed';

export interface ConversationSession {
  sessionId: string;
  workflowId: string;
  businessId: string;
  workflow: Workflow;
  openAiMessages: OpenAI.Chat.Completions.ChatCompletionMessageParam[];
  clientMessages: ChatMessage[];
  extractedFields: Record<string, any>;
  isCompleted: boolean;
  savedCallId?: string;
  currentLanguage: string;
  createdAt: string;
  // State machine fields
  intakeState: IntakeState;
  failCounts: Record<string, number>;   // slot key → consecutive failure count
}

// In-memory session store
const sessions = new Map<string, ConversationSession>();

// ---------------------------------------------------------------------------
// Slot configuration
// ---------------------------------------------------------------------------

interface SlotConfig {
  key: string;
  state: IntakeState;
  question: string;   // phrase key in INTAKE_PHRASES / ttsCache
  reask: string;      // phrase key for re-ask
  validate: (raw: string) => { valid: boolean; value?: string };
}

export const INTAKE_SLOTS: SlotConfig[] = [
  {
    key: 'caller_name',
    state: 'collecting_name',
    question: 'ask_name',
    reask: 'reask_name',
    validate: validateName,
  },
  {
    key: 'phone_number',
    state: 'collecting_phone',
    question: 'ask_phone',
    reask: 'reask_phone',
    validate: validatePhone,
  },
  {
    key: 'appt_date',
    state: 'collecting_date',
    question: 'ask_date',
    reask: 'reask_date',
    validate: validateDate,
  },
  {
    key: 'appt_time',
    state: 'collecting_time',
    question: 'ask_time',
    reask: 'reask_time',
    validate: validateTime,
  },
];

const MAX_FAILURES_PER_SLOT = 3;

// Fixed text phrases (keep in sync with ttsCache.ts INTAKE_PHRASES)
const PHRASES = {
  greeting: 'Hello! Thank you for calling Apex Dental Care Clinic. How can I help you today?',
  ask_name: 'May I have your full name, please?',
  ask_phone: 'Thank you. What is your phone number?',
  ask_date: 'Which date would you like to come in?',
  ask_time: 'And what time works for you?',
  reask_name: "Sorry, I didn't catch that. Could you repeat your name, please?",
  reask_phone: "Sorry, I didn't catch that. Could you repeat your phone number, please?",
  reask_date: "Sorry, I didn't catch that. Could you repeat the date you'd like, please?",
  reask_time: "Sorry, I didn't catch that. Could you repeat the time you'd prefer, please?",
  offer_text: "I'm having trouble understanding. Could you please type your response in the chat box below?",
  confirm_prompt: 'Shall I go ahead and book this appointment for you?',
  yes_confirm: "Perfect! Your appointment has been booked. We'll see you then. Thank you for calling Apex Dental Care Clinic!",
  no_prompt: 'No problem. Which detail would you like to change — your name, phone number, date, or time?',
  sorry_invalid_name: "I'm sorry, that doesn't sound like a valid name. Could you please say your full name?",
  sorry_invalid_phone: "I'm sorry, that doesn't look like a valid 10-digit Indian mobile number. Please try again.",
  sorry_invalid_date: "I'm sorry, I couldn't understand that date, or it might be in the past. Could you say the date again?",
  sorry_invalid_time: `I'm sorry, I couldn't understand that time, or it falls outside our clinic hours of 9 AM to 7 PM. Could you say the time again?`,
};

function slotPhrase(slot: SlotConfig, isReask: boolean): string {
  const key = isReask ? slot.reask : slot.question;
  return PHRASES[key as keyof typeof PHRASES] || slot.question;
}

// ---------------------------------------------------------------------------
// Language detection
// ---------------------------------------------------------------------------

export function detectLanguageFromText(text: string): 'hi-IN' | 'en-US' {
  if (/[\u0900-\u097F]/.test(text)) return 'hi-IN';
  const hinglish = ['namaste', 'kaise', 'chahiye', 'karna', 'dhanyawad', 'shukriya', 'aaj', 'kal', 'kya', 'hai', 'ho', 'batao'];
  const lower = text.toLowerCase();
  if (hinglish.some((w) => new RegExp(`\\b${w}\\b`, 'i').test(lower))) return 'hi-IN';
  return 'en-US';
}

// ---------------------------------------------------------------------------
// LLM extraction helper
// ---------------------------------------------------------------------------

/**
 * Ask the LLM to extract a structured value for the current slot from the
 * user's free-form utterance. Falls back to the raw text if LLM unavailable.
 *
 * Returns the extracted string (for validation) or the raw input as fallback.
 */
async function extractSlotValueWithLLM(
  userText: string,
  slot: SlotConfig,
  _openai: OpenAI | null,
  modelName: string
): Promise<string> {
  const prompts: Record<string, string> = {
    caller_name: `You are extracting a patient's name for a dental clinic.
Extract ONLY the caller's personal name from this utterance.
Examples:
- "My name is Ramesh" -> "Ramesh"
- "I am Ramesh Kumar" -> "Ramesh Kumar"
- "Call me Priya" -> "Priya"
- "Dr. Rajesh Sharma speaking" -> "Dr. Rajesh Sharma"
- "I want an appointment" -> "NONE"
If no personal name is present, output "NONE". Output ONLY the name, nothing else.
Input: "${userText}"
Name:`,
    phone_number: `Extract a 10-digit Indian mobile number from the following sentence. Output ONLY the 10 digits, nothing else. If none, output "NONE".\nInput: "${userText}"\nPhone:`,
    appt_date: `Extract the appointment date from the following sentence. Output ONLY the date phrase (e.g. "tomorrow", "next Monday", "22 October"). If none, output "NONE".\nInput: "${userText}"\nDate:`,
    appt_time: `Extract the appointment time from the following sentence. Output ONLY the time phrase (e.g. "4 pm", "11:30 am"). If none, output "NONE".\nInput: "${userText}"\nTime:`,
  };

  const prompt = prompts[slot.key] || `Extract the value from: "${userText}". Output ONLY the value.`;

  try {
    const result = await sarvamChat(
      [{ role: 'user', content: prompt }],
      { model: modelName, max_tokens: 30, temperature: 0 }
    );
    let extracted = result.content.trim();
    // Clean common LLM formatting prefixes or quotation marks
    extracted = extracted
      .replace(/^(?:name|phone|date|time)\s*:\s*/i, '')
      .replace(/^(?:the caller(?:'s)? name is|it is|value is)\s+/i, '')
      .replace(/^["']|["']$/g, '')
      .replace(/[.,!?;:]/g, '')
      .trim();

    console.log(`[LLM Extract] slot=${slot.key} | raw="${userText}" | extracted="${extracted}" | ${result.latencyMs}ms`);
    if (!extracted || extracted === 'NONE') return userText;
    return extracted;
  } catch (err: any) {
    const msg: string = err.message || '';
    if (msg.includes('429') || msg.toLowerCase().includes('rate limit') || msg.toLowerCase().includes('quota')) {
      console.error(`[LLM] ⚠️  RATE LIMIT / QUOTA ERROR from Sarvam AI (${modelName}): ${msg}`);
    } else {
      console.warn(`[LLM Extract] Failed: ${msg}. Using raw input as fallback.`);
    }
    return userText;
  }
}

// ---------------------------------------------------------------------------
// Greeting / session init
// ---------------------------------------------------------------------------

export function buildDynamicOpeningMessage(_workflow: Workflow): string {
  return PHRASES.greeting;
}

// Legacy compat
export function buildSystemPrompt(_workflow: Workflow, _businessName: string): string {
  return `You are a dental clinic voice assistant. Extract values from user speech as instructed.`;
}

// ---------------------------------------------------------------------------
// Session management
// ---------------------------------------------------------------------------

export async function getOrCreateSession(
  workflowId: string,
  sessionId?: string
): Promise<ConversationSession> {
  if (sessionId && sessions.has(sessionId)) {
    const existing = sessions.get(sessionId)!;
    if (existing.isCompleted) {
      sessions.delete(sessionId);
    } else {
      return existing;
    }
  }

  // Fetch or create workflow
  let workflowDoc = await db.collection('workflows').doc(workflowId).get();

  if (!workflowDoc.exists) {
    console.warn(`[AI Engine] Workflow "${workflowId}" not found. Creating fallback.`);
    const fallback: Omit<Workflow, 'id'> = {
      businessId: 'apex_dental',
      name: 'Apex Dental Care Clinic — Appointment Booking',
      triggerType: 'inbound_call',
      greetingMessage: PHRASES.greeting,
      closingMessage: PHRASES.yes_confirm,
      isActive: true,
      language: 'en-IN',
      fields: [
        { fieldName: 'caller_name', fieldType: 'text', isRequired: true, orderIndex: 1, description: 'full name' },
        { fieldName: 'phone_number', fieldType: 'phone', isRequired: true, orderIndex: 2, description: 'phone number' },
        { fieldName: 'appt_date', fieldType: 'date', isRequired: true, orderIndex: 3, description: 'preferred appointment date' },
        { fieldName: 'appt_time', fieldType: 'text', isRequired: true, orderIndex: 4, description: 'preferred appointment time' },
      ],
      conditions: [],
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };
    await db.collection('workflows').doc(workflowId).set(fallback);
    workflowDoc = await db.collection('workflows').doc(workflowId).get();
  }

  const workflow = { id: workflowDoc.id, ...(workflowDoc.data() as Omit<Workflow, 'id'>) };

  let businessName = 'Apex Dental Care Clinic';
  try {
    const bizDoc = await db.collection('businesses').doc(workflow.businessId).get();
    if (bizDoc.exists) businessName = bizDoc.data()?.name || businessName;
  } catch {}

  const newSessionId = sessionId || `session_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
  const openingMessage = PHRASES.greeting;

  const initialMessages: OpenAI.Chat.Completions.ChatCompletionMessageParam[] = [
    { role: 'assistant', content: openingMessage },
  ];

  const initialClientMessage: ChatMessage = {
    id: `msg_init_${Date.now()}`,
    role: 'assistant',
    content: openingMessage,
    timestamp: new Date().toISOString(),
  };

  const session: ConversationSession = {
    sessionId: newSessionId,
    workflowId,
    businessId: workflow.businessId,
    workflow,
    openAiMessages: initialMessages,
    clientMessages: [initialClientMessage],
    extractedFields: {},
    isCompleted: false,
    currentLanguage: 'en-IN',
    createdAt: new Date().toISOString(),
    intakeState: 'greeting',
    failCounts: {},
  };

  sessions.set(newSessionId, session);
  return session;
}

// ---------------------------------------------------------------------------
// Readback helper
// ---------------------------------------------------------------------------

function buildReadback(fields: Record<string, any>): string {
  const name = fields['caller_name'] || '(name)';
  const phone = fields['phone_number'] || '(phone)';
  const date = fields['appt_date'] || '(date)';
  const time = fields['appt_time'] || '(time)';
  return (
    `Let me confirm: Your name is ${name}, phone number ${phone}, ` +
    `appointment on ${date} at ${time}. ${PHRASES.confirm_prompt}`
  );
}

// ---------------------------------------------------------------------------
// Calendar booking
// ---------------------------------------------------------------------------

async function bookAppointment(
  session: ConversationSession
): Promise<{ success: boolean; eventId?: string; message: string }> {
  const { caller_name, phone_number, appt_date, appt_time } = session.extractedFields;

  // Build an ISO start time — best-effort since we have natural-language strings
  const now = new Date();
  // Default to tomorrow at the slot time if parsing fails completely
  let startIso = new Date(now.getTime() + 24 * 60 * 60 * 1000).toISOString();

  // Try to construct a proper ISO from appt_date + appt_time
  try {
    const d = new Date(`${appt_date}, ${now.getFullYear()}`);
    if (!isNaN(d.getTime())) {
      // parse time "4:00 PM"
      const timeMatch = appt_time?.match(/(\d{1,2}):(\d{2})\s*(AM|PM)/i);
      if (timeMatch) {
        let h = parseInt(timeMatch[1], 10);
        const m = parseInt(timeMatch[2], 10);
        const ap = timeMatch[3].toUpperCase();
        if (ap === 'PM' && h < 12) h += 12;
        if (ap === 'AM' && h === 12) h = 0;
        d.setHours(h, m, 0, 0);
      }
      startIso = d.toISOString();
    }
  } catch {}

  const endIso = new Date(new Date(startIso).getTime() + 60 * 60 * 1000).toISOString();

  try {
    const result = await createCalendarEvent({
      summary: `Dental Appointment — ${caller_name}`,
      startIso,
      endIso,
      description: `Patient: ${caller_name}\nPhone: ${phone_number}\nBooked via Voice AI`,
    });
    if (result.success) {
      return { success: true, eventId: result.eventId, message: result.message };
    }
    return { success: false, message: result.message };
  } catch (err: any) {
    console.warn('[Engine] Calendar booking failed:', err.message);
    return { success: false, message: err.message };
  }
}

// ---------------------------------------------------------------------------
// Main turn processor
// ---------------------------------------------------------------------------

export async function processConversationTurn(
  workflowId: string,
  userMessage: string,
  sessionId?: string
): Promise<{
  session: ConversationSession;
  reply: string;
  replyPhraseKey?: string;   // cache key if this is a fixed phrase
  toolCallExecuted?: string;
  savedCallId?: string;
}> {
  const t0 = Date.now();
  const session = await getOrCreateSession(workflowId, sessionId);

  // Detect language
  session.currentLanguage = detectLanguageFromText(userMessage);

  // Record user message
  const userMsgId = `msg_user_${Date.now()}`;
  session.clientMessages.push({ id: userMsgId, role: 'user', content: userMessage, timestamp: new Date().toISOString() });
  session.openAiMessages.push({ role: 'user', content: userMessage });

  const { openai, isConfigured, modelName } = getAIClient();

  let reply = '';
  let replyPhraseKey: string | undefined;
  let toolCallExecuted: string | undefined;
  let savedCallId = session.savedCallId;

  // ------------------------------------------------------------------
  // State machine
  // ------------------------------------------------------------------

  const state = session.intakeState;

  if (state === 'completed') {
    reply = PHRASES.yes_confirm;
    replyPhraseKey = 'yes_confirm';
  }

  else if (state === 'greeting') {
    // Caller is responding to the initial greeting ("How can I help you today?")
    const hasInquiry = isUserInquiry(userMessage);

    // 1. Extract any slots if caller already started providing them
    const allExtracted = extractAllSlots(userMessage);
    if (!allExtracted.caller_name && isConfigured) {
      if (/\b(?:name is|i am|call me|myself|this is)\b/i.test(userMessage) || (!hasInquiry && userMessage.trim().split(/\s+/).length <= 3)) {
        const candidate = await extractSlotValueWithLLM(userMessage, INTAKE_SLOTS[0], openai, modelName);
        const v = validateName(candidate);
        if (v.valid && v.value) allExtracted.caller_name = v.value;
      }
    }

    let newlyFoundCount = 0;
    for (const [key, val] of Object.entries(allExtracted)) {
      if (val && !session.extractedFields[key]) {
        session.extractedFields[key] = val;
        session.failCounts[key] = 0;
        newlyFoundCount++;
      }
    }

    const bookingIntent = /\b(?:appointment|book|booking|schedule|visit|checkup|consultation|doctor|see the doctor|tooth|pain|cleaning|root canal|yes|yeah|sure|ok|okay)\b/i.test(userMessage);
    const isGreetingOnly = /^(?:hi|hello|hey|good morning|good afternoon|good evening|namaste)[\s!.]*$/i.test(userMessage.trim());

    if (hasInquiry) {
      // User asked a question (e.g. location, timings, fees, doctor, services)
      const qaAnswer = await answerClinicQuestion(userMessage, modelName);
      if (bookingIntent || newlyFoundCount > 0) {
        // User asked a question AND wants an appointment / gave details
        const missingSlots = INTAKE_SLOTS.filter((s) => !session.extractedFields[s.key]);
        if (missingSlots.length > 0) {
          const nextMissing = missingSlots[0];
          session.intakeState = nextMissing.state;
          let prompt = '';
          if (nextMissing.key === 'caller_name') {
            prompt = 'To help you book an appointment, may I have your full name, please?';
          } else if (nextMissing.key === 'phone_number') {
            const name = session.extractedFields['caller_name'];
            prompt = name ? `What is your phone number, ${name}?` : 'What is your phone number?';
          } else if (nextMissing.key === 'appt_date') {
            prompt = 'Which date would you like to come in?';
          } else {
            prompt = 'And what time works for you?';
          }
          reply = `${qaAnswer} ${prompt}`;
        } else {
          session.intakeState = 'awaiting_confirmation';
          reply = `${qaAnswer} ${buildReadback(session.extractedFields)}`;
        }
      } else {
        // Just answer the question warmly, and politely ask if they want to book
        reply = `${qaAnswer} Would you like me to book an appointment with Dr. Jenkins for you?`;
      }
    } else if (isGreetingOnly) {
      reply = 'Hello! I can help you schedule an appointment with Dr. Jenkins or answer any questions about our clinic services, timings, and fees. How can I assist you today?';
    } else if (bookingIntent || newlyFoundCount > 0) {
      // User wants an appointment or gave some details!
      const missingSlots = INTAKE_SLOTS.filter((s) => !session.extractedFields[s.key]);
      if (missingSlots.length > 0) {
        const nextMissing = missingSlots[0];
        session.intakeState = nextMissing.state;
        if (nextMissing.key === 'caller_name') {
          reply = "I'd be glad to help you book an appointment! May I have your full name, please?";
        } else if (nextMissing.key === 'phone_number') {
          const name = session.extractedFields['caller_name'];
          reply = name
            ? `Nice to meet you, ${name}! What is your phone number?`
            : "I'd be glad to help you with that! What is your phone number?";
        } else if (nextMissing.key === 'appt_date') {
          reply = 'Which date would you like to come in?';
        } else {
          reply = 'And what time works for you?';
        }
      } else {
        session.intakeState = 'awaiting_confirmation';
        reply = buildReadback(session.extractedFields);
      }
    } else {
      // General free-form query or inquiry
      const qaAnswer = await answerClinicQuestion(userMessage, modelName);
      reply = `${qaAnswer} Would you like to schedule an appointment with Dr. Jenkins?`;
    }
  }

  else if (state === 'awaiting_confirmation') {
    // Safety check: ensure all required slots are genuinely present before confirming!
    const missing = INTAKE_SLOTS.filter((s) => !session.extractedFields[s.key]);
    if (missing.length > 0) {
      const nextSlot = missing[0];
      session.intakeState = nextSlot.state;
      reply = slotPhrase(nextSlot, false);
      replyPhraseKey = nextSlot.question;
      const astMsgId = `msg_ast_${Date.now()}`;
      session.clientMessages.push({ id: astMsgId, role: 'assistant', content: reply, timestamp: new Date().toISOString() });
      session.openAiMessages.push({ role: 'assistant', content: reply });
      return { session, reply, replyPhraseKey, toolCallExecuted, savedCallId };
    }

    if (isUserInquiry(userMessage)) {
      const qaAnswer = await answerClinicQuestion(userMessage, modelName);
      reply = `${qaAnswer} ${PHRASES.confirm_prompt}`;
    } else if (isConfirmationYes(userMessage)) {
      // Trigger background calendar event creation without blocking audio playback
      bookAppointment(session).catch((err) => console.warn('[Engine] Background calendar booking:', err));
      toolCallExecuted = 'create_calendar_event';
      session.intakeState = 'completed';
      session.isCompleted = true;
      // Confirm cleanly and warmly — never mention Google Calendar not connected
      reply = PHRASES.yes_confirm;
      replyPhraseKey = 'yes_confirm';
      console.log(`[Engine] Appointment booked and confirmed for ${session.extractedFields['caller_name']}`);
    } else if (isConfirmationNo(userMessage)) {
      session.intakeState = 'correcting';
      reply = PHRASES.no_prompt;
      replyPhraseKey = 'no_prompt';
    } else {
      // Didn't understand yes/no — re-ask confirmation
      reply = buildReadback(session.extractedFields);
    }
  }

  else if (state === 'correcting') {
    const target = detectCorrectionTarget(userMessage);
    if (target) {
      // Clear that slot and go back to collecting it
      delete session.extractedFields[target];
      session.failCounts[target] = 0;
      const slot = INTAKE_SLOTS.find((s) => s.key === target)!;
      session.intakeState = slot.state;
      reply = slotPhrase(slot, false);
      replyPhraseKey = slot.question;
    } else {
      // Couldn't figure out which slot to correct
      reply = PHRASES.no_prompt;
      replyPhraseKey = 'no_prompt';
    }
  }

  else {
    // ── Unified Slot Extraction & Out-of-Order / Interruption Handler ──
    // 1. Check if user asked a clinic inquiry / question
    const hasInquiry = isUserInquiry(userMessage);

    // 2. Simultaneously extract all recognizable slots from the utterance
    const allExtracted = extractAllSlots(userMessage);

    // If caller_name is not yet known and wasn't extracted deterministically, try LLM fallback
    // (Only if not asking an inquiry without a name intro)
    if (!allExtracted.caller_name && !session.extractedFields['caller_name'] && isConfigured) {
      if (!hasInquiry || /\b(?:name is|i am|call me|myself|this is)\b/i.test(userMessage)) {
        const candidate = await extractSlotValueWithLLM(userMessage, INTAKE_SLOTS[0], openai, modelName);
        const v = validateName(candidate);
        if (v.valid && v.value) allExtracted.caller_name = v.value;
      }
    }

    // 3. Save any newly discovered slots into session.extractedFields
    let newlyFoundCount = 0;
    for (const [key, val] of Object.entries(allExtracted)) {
      if (val && !session.extractedFields[key]) {
        session.extractedFields[key] = val;
        session.failCounts[key] = 0;
        newlyFoundCount++;
      }
    }

    // 4. Find slots that are STILL missing in strict sequence: caller_name -> phone_number -> appt_date -> appt_time
    const missingSlots = INTAKE_SLOTS.filter((s) => !session.extractedFields[s.key]);

    if (missingSlots.length === 0) {
      // All 4 slots are filled! Proceed to confirmation readback
      session.intakeState = 'awaiting_confirmation';
      if (hasInquiry) {
        const qaAnswer = await answerClinicQuestion(userMessage, modelName);
        reply = `${qaAnswer} ${buildReadback(session.extractedFields)}`;
      } else {
        reply = buildReadback(session.extractedFields);
      }
      replyPhraseKey = undefined;
    } else {
      // There are still missing slots — ask for the next missing slot in sequence
      const nextMissing = missingSlots[0];
      session.intakeState = nextMissing.state;

      if (hasInquiry) {
        // User asked a question! Answer it and transition politely back to the missing slot without counting as failure
        session.failCounts[nextMissing.key] = 0;
        const qaAnswer = await answerClinicQuestion(userMessage, modelName);

        // Build polite transition back to intake question
        let transitionPrompt = '';
        if (nextMissing.key === 'caller_name') {
          transitionPrompt = 'To help you book an appointment, may I have your full name, please?';
        } else if (nextMissing.key === 'phone_number') {
          const name = session.extractedFields['caller_name'];
          transitionPrompt = name
            ? `Could you please provide your phone number, ${name}?`
            : 'What is your phone number?';
        } else if (nextMissing.key === 'appt_date') {
          transitionPrompt = 'Which date would you like to come in?';
        } else if (nextMissing.key === 'appt_time') {
          transitionPrompt = 'And what time works for you?';
        }

        reply = `${qaAnswer} ${transitionPrompt}`;
        replyPhraseKey = undefined;
      } else if (newlyFoundCount > 0) {
        // User provided one or more details (even if they interrupted or answered out of order)
        session.failCounts[nextMissing.key] = 0;

        // Use standard pre-cached phrases for instant 0ms TTS playback!
        if (nextMissing.key === 'phone_number') {
          reply = PHRASES.ask_phone;
          replyPhraseKey = 'ask_phone';
        } else if (nextMissing.key === 'appt_date') {
          reply = PHRASES.ask_date;
          replyPhraseKey = 'ask_date';
        } else if (nextMissing.key === 'appt_time') {
          reply = PHRASES.ask_time;
          replyPhraseKey = 'ask_time';
        } else {
          reply = PHRASES.ask_name;
          replyPhraseKey = 'ask_name';
        }
      } else {
        // User input did not contain any valid slot value — re-ask for the current missing slot
        session.failCounts[nextMissing.key] = (session.failCounts[nextMissing.key] ?? 0) + 1;
        const failures = session.failCounts[nextMissing.key];
        console.log(`[Engine] Step "${nextMissing.key}" failed validation (attempt ${failures}). Input: "${userMessage}"`);

        if (nextMissing.key === 'caller_name') {
          reply = failures === 1 ? PHRASES.sorry_invalid_name : slotPhrase(nextMissing, true);
          replyPhraseKey = nextMissing.reask;
        } else if (nextMissing.key === 'phone_number') {
          const phoneCheck = validatePhone(userMessage);
          if (phoneCheck.digitCount && phoneCheck.digitCount >= 6 && phoneCheck.digitCount <= 9) {
            reply = `I only caught ${phoneCheck.digitCount} digits. An Indian mobile number requires 10 digits. Could you please repeat your 10-digit phone number?`;
          } else {
            reply = failures === 1 ? PHRASES.sorry_invalid_phone : slotPhrase(nextMissing, true);
          }
          replyPhraseKey = nextMissing.reask;
        } else if (nextMissing.key === 'appt_date') {
          reply = failures === 1 ? PHRASES.sorry_invalid_date : slotPhrase(nextMissing, true);
          replyPhraseKey = nextMissing.reask;
        } else if (nextMissing.key === 'appt_time') {
          reply = failures === 1 ? PHRASES.sorry_invalid_time : slotPhrase(nextMissing, true);
          replyPhraseKey = nextMissing.reask;
        }

        if (failures >= MAX_FAILURES_PER_SLOT) {
          session.failCounts[nextMissing.key] = 0;
          reply = PHRASES.offer_text;
          replyPhraseKey = 'offer_text';
        }
      }
    }
  }

  // ------------------------------------------------------------------
  // Record assistant reply
  // ------------------------------------------------------------------
  const astMsgId = `msg_ast_${Date.now()}`;
  session.clientMessages.push({ id: astMsgId, role: 'assistant', content: reply, timestamp: new Date().toISOString() });
  session.openAiMessages.push({ role: 'assistant', content: reply });

  // ------------------------------------------------------------------
  // Persist call log to Firestore only once at completion (or finalization)
  // to avoid wasting Firestore document writes on every intermediate turn.
  // ------------------------------------------------------------------
  savedCallId = session.savedCallId;
  if (session.isCompleted) {
    finalizeCallRecord(session, 'completed').then(id => {
      if (id) session.savedCallId = id;
    }).catch(err => {
      console.warn('[Firestore] Async save warning:', err);
    });
  }

  console.log(`[Engine] Turn complete: state=${session.intakeState} | fields=${JSON.stringify(session.extractedFields)} | ${Date.now() - t0}ms`);

  return { session, reply, replyPhraseKey, toolCallExecuted, savedCallId };
}

/**
 * Persists a finalized call record to Firestore (once per conversation).
 */
export async function finalizeCallRecord(
  session: ConversationSession,
  status: 'completed' | 'abandoned' = 'completed'
): Promise<string | undefined> {
  const callerName = session.extractedFields['caller_name'] || 'Inbound Caller';
  const callerPhone = session.extractedFields['phone_number'] || '';

  const callData: Record<string, any> = {
    businessId: session.businessId,
    workflowId: session.workflowId,
    callerName,
    callerPhone,
    status,
    followUpStatus: status === 'completed' ? 'completed' : 'pending',
    urgencyLevel: 'medium',
    startTime: session.createdAt,
    collectedFields: session.extractedFields,
    intakeState: session.intakeState,
    aiSummary: `Inbound: ${session.workflow.name}. Status: ${status}.`,
    sessionId: session.sessionId,
    createdAt: session.createdAt,
    updatedAt: new Date().toISOString(),
  };

  try {
    if (session.savedCallId) {
      await db.collection('calls').doc(session.savedCallId).set(callData, { merge: true });
      return session.savedCallId;
    } else {
      const ref = await db.collection('calls').add(callData);
      session.savedCallId = ref.id;
      return ref.id;
    }
  } catch (dbErr) {
    console.warn('[Firestore] Warning saving finalized call record:', dbErr);
    return undefined;
  }
}

// ---------------------------------------------------------------------------
// Acknowledgement builder
// ---------------------------------------------------------------------------

function buildAcknowledgement(slotKey: string, value: string): string {
  switch (slotKey) {
    case 'caller_name':
      return `Thank you, ${value}.`;
    case 'phone_number':
      return `Got it.`;
    case 'appt_date':
      return `Perfect.`;
    case 'appt_time':
      return `Great.`;
    default:
      return `Thank you.`;
  }
}
