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
  greeting: 'Hello! Thank you for calling Apex Dental Care Clinic. May I have your name, please?',
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
    return sessions.get(sessionId)!;
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
    intakeState: 'collecting_name',
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
    return { success: true, eventId: result.eventId, message: result.message };
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

  // ------------------------------------------------------------------
  // State machine
  // ------------------------------------------------------------------

  const state = session.intakeState;

  if (state === 'completed') {
    reply = PHRASES.yes_confirm;
    replyPhraseKey = 'yes_confirm';
  }

  else if (state === 'awaiting_confirmation') {
    if (isConfirmationYes(userMessage)) {
      // Book the appointment (blocking — must complete before confirming)
      const booking = await bookAppointment(session);
      toolCallExecuted = 'create_calendar_event';
      session.intakeState = 'completed';
      session.isCompleted = true;
      reply = PHRASES.yes_confirm;
      replyPhraseKey = 'yes_confirm';
      console.log(`[Engine] Appointment booked: ${booking.message}`);
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
    // Collecting a slot value sequentially:
    // 1. Name -> 2. Phone -> 3. Date -> 4. Time -> Closing / Confirmation
    const slot = INTAKE_SLOTS.find((s) => s.state === state);
    if (!slot) {
      session.intakeState = 'collecting_name';
      reply = PHRASES.ask_name;
      replyPhraseKey = 'ask_name';
    } else {
      let extractedValue: string | undefined;

      // Extract specifically for the current step
      if (slot.key === 'caller_name') {
        extractedValue = extractNameDeterministic(userMessage);
        if (!extractedValue && isConfigured) {
          const candidate = await extractSlotValueWithLLM(userMessage, slot, openai, modelName);
          const v = validateName(candidate);
          if (v.valid && v.value) extractedValue = v.value;
        }
      } else if (slot.key === 'phone_number') {
        extractedValue = extractPhoneDeterministic(userMessage);
      } else if (slot.key === 'appt_date') {
        extractedValue = extractDateDeterministic(userMessage);
        if (!extractedValue && isConfigured) {
          const candidate = await extractSlotValueWithLLM(userMessage, slot, openai, modelName);
          const v = validateDate(candidate);
          if (v.valid && v.value) extractedValue = v.value;
        }
      } else if (slot.key === 'appt_time') {
        extractedValue = extractTimeDeterministic(userMessage);
        if (!extractedValue && isConfigured) {
          const candidate = await extractSlotValueWithLLM(userMessage, slot, openai, modelName);
          const v = validateTime(candidate);
          if (v.valid && v.value) extractedValue = v.value;
        }
      }

      if (extractedValue) {
        // Successfully got slot for this step! Save and proceed to next step
        session.extractedFields[slot.key] = extractedValue;
        session.failCounts[slot.key] = 0;

        // Also check if any other slots were provided in the same utterance
        const all = extractAllSlots(userMessage);
        for (const [k, v] of Object.entries(all)) {
          if (v && !session.extractedFields[k]) {
            session.extractedFields[k] = v;
            session.failCounts[k] = 0;
          }
        }

        // Determine next unfilled slot in sequence: caller_name -> phone_number -> appt_date -> appt_time
        const nextSlot = INTAKE_SLOTS.find((s) => !session.extractedFields[s.key]);

        if (!nextSlot) {
          // All slots filled! Proceed to confirmation
          session.intakeState = 'awaiting_confirmation';
          reply = buildReadback(session.extractedFields);
          replyPhraseKey = undefined;
        } else {
          session.intakeState = nextSlot.state;
          let ack = '';
          if (slot.key === 'caller_name') {
            ack = `Nice to meet you, ${extractedValue}.`;
          } else if (slot.key === 'phone_number') {
            ack = `Got it.`;
          } else if (slot.key === 'appt_date') {
            ack = `Got it for ${extractedValue}.`;
          } else {
            ack = `Got it.`;
          }
          reply = `${ack} ${slotPhrase(nextSlot, false)}`.trim();
          replyPhraseKey = nextSlot.question;
        }
      } else {
        // Did not get slot for this step — ask again here itself!
        session.failCounts[slot.key] = (session.failCounts[slot.key] ?? 0) + 1;
        const failures = session.failCounts[slot.key];
        console.log(`[Engine] Step "${slot.key}" failed validation (attempt ${failures}). Input: "${userMessage}"`);

        if (slot.key === 'caller_name') {
          const phoneCheck = validatePhone(userMessage);
          if (phoneCheck.digitCount || /\d/.test(userMessage)) {
            reply = "I didn't catch your name. May I have your full name, please?";
          } else {
            reply = failures === 1 ? PHRASES.sorry_invalid_name : slotPhrase(slot, true);
          }
          replyPhraseKey = slot.reask;
        } else if (slot.key === 'phone_number') {
          const phoneCheck = validatePhone(userMessage);
          if (phoneCheck.digitCount && phoneCheck.digitCount >= 6 && phoneCheck.digitCount <= 9) {
            reply = `I only caught ${phoneCheck.digitCount} digits. An Indian mobile number requires 10 digits. Could you please repeat your 10-digit phone number?`;
          } else {
            reply = failures === 1 ? PHRASES.sorry_invalid_phone : slotPhrase(slot, true);
          }
          replyPhraseKey = slot.reask;
        } else if (slot.key === 'appt_date') {
          reply = failures === 1 ? PHRASES.sorry_invalid_date : slotPhrase(slot, true);
          replyPhraseKey = slot.reask;
        } else if (slot.key === 'appt_time') {
          reply = failures === 1 ? PHRASES.sorry_invalid_time : slotPhrase(slot, true);
          replyPhraseKey = slot.reask;
        }

        if (failures >= MAX_FAILURES_PER_SLOT) {
          session.failCounts[slot.key] = 0;
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
  let savedCallId = session.savedCallId;
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
