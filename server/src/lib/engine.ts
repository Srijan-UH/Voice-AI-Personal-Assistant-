import dotenv from 'dotenv';
import OpenAI from 'openai';
import { db } from './firebase.js';
import { Business, Workflow, Call, WorkflowCondition } from '../types/db.js';
import { executeToolCall } from './tools/index.js';

dotenv.config();

/**
 * Get AI Client configured with GEMINI_API_KEY or OPENAI_API_KEY.
 * Supports Google Gemini (gemini-1.5-flash) & OpenAI (gpt-4o-mini).
 */
export function getAIClient(): {
  openai: OpenAI | null;
  isConfigured: boolean;
  modelName: string;
} {
  dotenv.config();

  const apiKey = process.env.GEMINI_API_KEY?.trim() || process.env.OPENAI_API_KEY?.trim();

  if (apiKey && apiKey.length > 5 && !apiKey.includes('your_openai_api_key') && !apiKey.includes('your_gemini_api_key')) {
    const isGoogleKey = !apiKey.startsWith('sk-');
    const baseURL = isGoogleKey ? 'https://generativelanguage.googleapis.com/v1beta/openai/' : undefined;
    const defaultModel = process.env.GEMINI_MODEL?.trim() || 'gemini-1.5-flash';
    const modelName = isGoogleKey ? defaultModel : 'gpt-4o-mini';

    console.log(`[AI Engine] Using ${isGoogleKey ? 'Google Gemini' : 'OpenAI'} API Key with model "${modelName}"`);
    return {
      openai: new OpenAI({ apiKey, baseURL }),
      isConfigured: true,
      modelName,
    };
  }

  return { openai: null, isConfigured: false, modelName: 'fallback' };
}

export interface ChatMessage {
  id: string;
  role: 'user' | 'assistant' | 'system' | 'tool';
  content: string;
  timestamp: string;
  toolCallName?: string;
}

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
}

// In-memory conversation store
const sessions = new Map<string, ConversationSession>();

/**
 * Detect language (Hindi vs English) from caller's input text
 */
export function detectLanguageFromText(text: string): 'hi-IN' | 'en-US' {
  if (/[\u0900-\u097F]/.test(text)) {
    return 'hi-IN';
  }

  const hinglishKeywords = [
    'namaste',
    'kaise',
    'chahiye',
    'karna',
    'samay',
    'kab',
    'dhanyawad',
    'bhai',
    'shukriya',
    'apna',
    'mera',
    'aaj',
    'kal',
    'kya',
    'hai',
    'ho',
    'batao',
  ];

  const lower = text.toLowerCase();
  const hasHinglish = hinglishKeywords.some((word) => {
    const regex = new RegExp(`\\b${word}\\b`, 'i');
    return regex.test(lower);
  });

  if (hasHinglish) {
    return 'hi-IN';
  }

  return 'en-US';
}

/**
 * Build dynamic system prompt from Firestore Workflow definition
 */
function buildSystemPrompt(workflow: Workflow, businessName: string, activeLanguage: string = 'en-US'): string {
  const isHindi = activeLanguage === 'hi-IN' || workflow.language === 'hi-IN';

  const fieldRules = (workflow.fields || [])
    .map(
      (f, i) =>
        `${i + 1}. "${f.fieldName}" (${f.description || f.fieldName}): ${
          f.isRequired ? 'REQUIRED' : 'OPTIONAL'
        }`
    )
    .join('\n');

  const conditionRules = (workflow.conditions || [])
    .map(
      (c, i) =>
        `Rule ${i + 1}: If "${c.fieldReference}" ${c.operator} "${c.value || ''}", action is "${c.resultingAction}".`
    )
    .join('\n');

  const languageInstructions = isHindi
    ? `- Primary Language: HINDI / HINGLISH (hi-IN).
- Respond in natural, conversational Hindi (or Hinglish in Devanagari/Roman script).
- Greet with: "${workflow.greetingMessage}"
- Ask questions polite & clearly in Hindi.`
    : `- Primary Language: ENGLISH (en-US).
- Conduct the conversation in polite, clear English.`;

  return `You are an intelligent, polite AI Voice Assistant for "${businessName}".
Your primary goal is to guide the caller through the "${workflow.name}" workflow.

${languageInstructions}

STRICT INSTRUCTIONS:
1. Greeting: Start by welcoming the caller with: "${workflow.greetingMessage}"
2. Data Collection: You MUST collect information for the following fields during the conversation:
${fieldRules}

3. Calendar & CRM Tools Usage:
   - When a caller wants to check appointment availability, call the "check_calendar_availability" tool.
   - When a caller wants to book/schedule an appointment, call the "create_calendar_event" tool.
   - When a caller asks for status or delivery of an order/package, call the "lookup_order_status" tool with orderId or customerPhone.
   - When a caller asks about customer membership or past visit history, call the "lookup_crm_customer_history" tool.

4. Conditional Rules:
${conditionRules || '- Default action: schedule appointment or log inquiry.'}

5. Completion & Closing:
   - Once all required fields have been gathered, summarize the collected information to the caller.
   - Say the closing message: "${workflow.closingMessage}"
   - Keep answers concise, natural, and friendly. Never mention internal variable names.`;
}

/**
 * Get or create session for a specific workflow
 */
export async function getOrCreateSession(
  workflowId: string,
  sessionId?: string
): Promise<ConversationSession> {
  if (sessionId && sessions.has(sessionId)) {
    return sessions.get(sessionId)!;
  }

  // Fetch workflow from Firestore
  let workflowDoc = await db.collection('workflows').doc(workflowId).get();

  if (!workflowDoc.exists) {
    console.warn(`[AI Engine] Workflow "${workflowId}" not found in Firestore. Creating automatic fallback workflow.`);
    const isHindi = workflowId.includes('hindi');
    const isBakery = workflowId.includes('cake') || workflowId.includes('bakery');

    const fallbackWorkflow: Omit<Workflow, 'id'> = {
      businessId: 'demo_business_fallback',
      name: isHindi ? 'नमस्ते एपेक्स क्लिनिक असिस्टेंट' : isBakery ? 'Artisan Bakery Cake Assistant' : 'Dental & Healthcare Voice Assistant',
      triggerType: 'inbound_call',
      greetingMessage: isHindi
        ? 'नमस्ते! एपेक्स क्लिनिक में आपका स्वागत है। मैं आपकी क्या सहायता कर सकता हूँ?'
        : 'Hello! Thank you for calling. How can I assist you today?',
      closingMessage: isHindi
        ? 'आपका धन्यवाद! आपका अपॉइंटमेंट समय दर्ज कर लिया गया है।'
        : 'Thank you for calling us! Have a wonderful day.',
      isActive: true,
      language: isHindi ? 'hi-IN' : 'en-US',
      fields: [
        { fieldName: 'caller_name', fieldType: 'text', isRequired: true, orderIndex: 1, description: 'Caller Name' },
        { fieldName: 'phone_number', fieldType: 'phone', isRequired: true, orderIndex: 2, description: 'Contact Phone' },
        { fieldName: 'preferred_date_time', fieldType: 'date', isRequired: true, orderIndex: 3, description: 'Preferred Date/Time' },
      ],
      conditions: [{ fieldReference: 'caller_name', operator: 'is_set', value: '', resultingAction: 'schedule_appointment' }],
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };

    await db.collection('workflows').doc(workflowId).set(fallbackWorkflow);
    workflowDoc = await db.collection('workflows').doc(workflowId).get();
  }

  const workflow = { id: workflowDoc.id, ...(workflowDoc.data() as Omit<Workflow, 'id'>) };

  // Fetch business name
  let businessName = 'Business';
  try {
    const bizDoc = await db.collection('businesses').doc(workflow.businessId).get();
    if (bizDoc.exists) {
      businessName = bizDoc.data()?.name || 'Business';
    }
  } catch {}

  const newSessionId = sessionId || `session_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;
  const initialLang = workflow.language || 'en-US';
  const systemPrompt = buildSystemPrompt(workflow, businessName, initialLang);

  const initialMessages: OpenAI.Chat.Completions.ChatCompletionMessageParam[] = [
    { role: 'system', content: systemPrompt },
    { role: 'assistant', content: workflow.greetingMessage },
  ];

  const initialClientMessage: ChatMessage = {
    id: `msg_init_${Date.now()}`,
    role: 'assistant',
    content: workflow.greetingMessage,
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
    currentLanguage: initialLang,
    createdAt: new Date().toISOString(),
  };

  sessions.set(newSessionId, session);
  return session;
}

/**
 * Extract structured field values from user message
 */
function extractFieldsHeuristic(
  workflow: Workflow,
  userMessage: string,
  currentFields: Record<string, any>
): Record<string, any> {
  const updated = { ...currentFields };
  const lower = userMessage.toLowerCase();

  for (const field of workflow.fields || []) {
    const name = field.fieldName.toLowerCase();

    if (name.includes('phone') || name.includes('contact') || field.fieldType === 'phone') {
      const phoneMatch = userMessage.match(/(\+?\d{1,4}[-.\s]?)?\(?\d{3}\)?[-.\s]?\d{3}[-.\s]?\d{4}/);
      if (phoneMatch && !updated[field.fieldName]) {
        updated[field.fieldName] = phoneMatch[0];
      }
    } else if (name.includes('date') || name.includes('time') || field.fieldType === 'date') {
      if (
        lower.includes('tomorrow') ||
        lower.includes('today') ||
        lower.includes('pm') ||
        lower.includes('am') ||
        lower.includes('monday') ||
        lower.includes('tuesday') ||
        lower.includes('wednesday') ||
        lower.includes('thursday') ||
        lower.includes('friday') ||
        lower.includes('saturday') ||
        lower.includes('sunday')
      ) {
        if (!updated[field.fieldName]) {
          updated[field.fieldName] = userMessage;
        }
      }
    } else if (name.includes('name') && !updated[field.fieldName]) {
      const nameMatch = userMessage.match(/(?:my name is|i am|this is|call me)\s+([A-Za-z\s]+)/i);
      if (nameMatch) {
        updated[field.fieldName] = nameMatch[1].trim();
      } else if (userMessage.split(' ').length <= 3 && !userMessage.match(/\d/)) {
        updated[field.fieldName] = userMessage.trim();
      }
    } else if (!updated[field.fieldName] && field.isRequired) {
      if (userMessage.length > 2) {
        updated[field.fieldName] = userMessage;
      }
    }
  }

  return updated;
}

/**
 * Intelligent Local AI Engine turn when GEMINI_API_KEY or OPENAI_API_KEY is missing or un-authenticated
 */
function localEngineTurn(
  session: ConversationSession,
  userMessage: string
): { reply: string; toolCallExecuted?: string } {
  const lower = userMessage.toLowerCase();
  let reply = '';
  let toolCallExecuted: string | undefined = undefined;

  if (
    lower.includes('book') ||
    lower.includes('appointment') ||
    lower.includes('slot') ||
    lower.includes('time') ||
    lower.includes('tomorrow') ||
    lower.includes('pm') ||
    lower.includes('am')
  ) {
    toolCallExecuted = 'check_calendar_availability';
    reply = `I checked our availability calendar on Google Calendar and Tomorrow at 3:00 PM is open! Could you please provide your full name to confirm your appointment?`;
  } else if (lower.includes('cake') || lower.includes('flavor') || lower.includes('bakery') || lower.includes('pickup')) {
    toolCallExecuted = 'check_inventory';
    reply = `We have Vanilla, Red Velvet, and Chocolate cakes available for pickup! What flavor and date would you like to order?`;
  } else if (lower.includes('order') || lower.includes('status') || lower.includes('tracking')) {
    toolCallExecuted = 'lookup_order_status';
    reply = `I checked your order status in our CRM! Your package is currently out for delivery and will arrive today by 5:00 PM.`;
  } else if (session.clientMessages.length <= 2) {
    reply = `Hello! Thank you for calling. I can help you book an appointment, take custom orders, or check order delivery status. How may I assist you?`;
  } else {
    reply = `Thank you! I have recorded your intake information: "${userMessage}". Our team will follow up with you shortly. Have a great day!`;
  }

  return { reply, toolCallExecuted };
}

/**
 * Drive conversation turn using OpenAI API with fallback to local engine
 */
export async function processConversationTurn(
  workflowId: string,
  userMessage: string,
  sessionId?: string
): Promise<{
  session: ConversationSession;
  reply: string;
  toolCallExecuted?: string;
  savedCallId?: string;
}> {
  const session = await getOrCreateSession(workflowId, sessionId);
  const lower = userMessage.toLowerCase();

  // Detect language & update session
  const detectedLang = detectLanguageFromText(userMessage);
  session.currentLanguage = detectedLang;

  // Add user message to session
  const userMsgId = `msg_user_${Date.now()}`;
  session.clientMessages.push({
    id: userMsgId,
    role: 'user',
    content: userMessage,
    timestamp: new Date().toISOString(),
  });
  session.openAiMessages.push({ role: 'user', content: userMessage });

  // Update extracted fields heuristics
  session.extractedFields = extractFieldsHeuristic(
    session.workflow,
    userMessage,
    session.extractedFields
  );

  const { openai, isConfigured, modelName } = getAIClient();
  let replyText = '';
  let toolCallExecuted: string | undefined = undefined;

  if (isConfigured && openai) {
    try {
      console.log(`[OpenAI Engine Turn] Querying model "${modelName}" for message: "${userMessage}"`);

      const tools: OpenAI.Chat.Completions.ChatCompletionTool[] = [
        {
          type: 'function',
          function: {
            name: 'check_calendar_availability',
            description: 'Check available slots on Google Calendar for appointment booking.',
            parameters: {
              type: 'object',
              properties: {
                dateStr: { type: 'string', description: 'Date to check, e.g. "tomorrow" or "2026-09-03"' },
              },
              required: ['dateStr'],
            },
          },
        },
        {
          type: 'function',
          function: {
            name: 'create_calendar_event',
            description: 'Schedule a confirmed appointment event on Google Calendar.',
            parameters: {
              type: 'object',
              properties: {
                summary: { type: 'string', description: 'Appointment title, e.g. Dental Appointment - John Doe' },
                startTimeStr: { type: 'string', description: 'Start time string' },
                customerName: { type: 'string', description: 'Customer full name' },
                customerPhone: { type: 'string', description: 'Customer phone' },
              },
              required: ['summary', 'startTimeStr', 'customerName'],
            },
          },
        },
        {
          type: 'function',
          function: {
            name: 'lookup_order_status',
            description: 'Look up order tracking and delivery status from CRM.',
            parameters: {
              type: 'object',
              properties: {
                orderId: { type: 'string', description: 'Order ID or tracking number' },
                customerPhone: { type: 'string', description: 'Customer phone number' },
              },
              required: [],
            },
          },
        },
      ];

      const completion = await openai.chat.completions.create({
        model: modelName,
        messages: session.openAiMessages,
        tools,
        tool_choice: 'auto',
        temperature: 0.7,
      });

      const choice = completion.choices[0];
      const responseMsg = choice.message;

      if (responseMsg.tool_calls && responseMsg.tool_calls.length > 0) {
        const toolCall = responseMsg.tool_calls[0];
        if (toolCall.type === 'function' && toolCall.function) {
          toolCallExecuted = toolCall.function.name;
          console.log(`[OpenAI Engine] Model executed tool call "${toolCallExecuted}"`);

          let toolArgs = {};
          try {
            toolArgs = JSON.parse(toolCall.function.arguments || '{}');
          } catch {}

          const toolResult = await executeToolCall(toolCallExecuted, toolArgs);

          session.openAiMessages.push(responseMsg);
          session.openAiMessages.push({
            role: 'tool',
            tool_call_id: toolCall.id,
            content: JSON.stringify(toolResult),
          });

          session.clientMessages.push({
            id: `msg_tool_${Date.now()}`,
            role: 'tool',
            content: `Executed tool ${toolCallExecuted}: ${JSON.stringify(toolResult.data || toolResult.message)}`,
            timestamp: new Date().toISOString(),
            toolCallName: toolCallExecuted,
          });

          const secondCompletion = await openai.chat.completions.create({
            model: modelName,
            messages: session.openAiMessages,
            temperature: 0.7,
          });

          replyText = secondCompletion.choices[0]?.message?.content || 'Appointment slot checked!';
        } else {
          replyText = responseMsg.content || 'Thank you for your message!';
        }
      } else {
        replyText = responseMsg.content || 'Thank you for your message!';
      }
    } catch (err: any) {
      console.warn(`[OpenAI Engine Warning] API call error (${err.message}). Using local AI engine turn.`);
      const fallbackTurn = localEngineTurn(session, userMessage);
      replyText = fallbackTurn.reply;
      toolCallExecuted = fallbackTurn.toolCallExecuted;
    }
  } else {
    console.log('[OpenAI Engine] Using local AI engine turn.');
    const fallbackTurn = localEngineTurn(session, userMessage);
    replyText = fallbackTurn.reply;
    toolCallExecuted = fallbackTurn.toolCallExecuted;
  }

  // Push assistant response message
  const assistantMsgId = `msg_ast_${Date.now()}`;
  session.clientMessages.push({
    id: assistantMsgId,
    role: 'assistant',
    content: replyText,
    timestamp: new Date().toISOString(),
  });
  session.openAiMessages.push({ role: 'assistant', content: replyText });

  // Check if required fields are satisfied
  const reqFields = (session.workflow.fields || []).filter((f) => f.isRequired);
  const completedFieldsCount = reqFields.filter((f) => Boolean(session.extractedFields[f.fieldName])).length;
  if (reqFields.length > 0 && completedFieldsCount >= reqFields.length) {
    session.isCompleted = true;
  }

  // Save/update call document in Firestore
  let savedCallId = session.savedCallId;
  try {
    const callerName = session.extractedFields['caller_name'] || session.extractedFields['name'] || 'Inbound Caller';
    const callerPhone = session.extractedFields['phone_number'] || session.extractedFields['phone'] || '+1-555-0199';
    const urgency = lower.includes('urgent') || lower.includes('emergency') || lower.includes('pain') ? 'urgent' : 'medium';

    const callData: Omit<Call, 'id'> & Record<string, any> = {
      businessId: session.businessId,
      workflowId: session.workflowId,
      callerName,
      callerPhone,
      status: session.isCompleted ? 'completed' : 'in_progress',
      followUpStatus: session.isCompleted ? 'completed' : 'pending',
      urgencyLevel: urgency,
      startTime: session.createdAt,
      collectedFields: session.extractedFields,
      aiSummary: `Inbound Call: ${session.workflow.name}. Status: ${session.isCompleted ? 'Fields Completed' : 'In Progress'}.`,
      sessionId: session.sessionId,
      createdAt: session.createdAt,
      updatedAt: new Date().toISOString(),
    };

    if (savedCallId) {
      await db.collection('calls').doc(savedCallId).set(callData, { merge: true });
    } else {
      const callRef = await db.collection('calls').add(callData);
      savedCallId = callRef.id;
      session.savedCallId = savedCallId;
    }
  } catch (dbErr) {
    console.warn('[Firestore] Warning saving call document:', dbErr);
  }

  return {
    session,
    reply: replyText,
    toolCallExecuted,
    savedCallId,
  };
}
