/**
 * Firestore Database Data Models & TypeScript Interfaces
 * Client-side mirror of `/server/src/types/db.ts`.
 */

// ==========================================
// 1. BUSINESSES COLLECTION
// Collection path: `businesses/{businessId}`
// ==========================================

export interface OwnerInfo {
  name: string;
  email: string;
  phone?: string;
}

export interface LanguageSettings {
  primaryLanguage: string; // e.g. "en-US", "es-ES"
  supportedLanguages?: string[];
  accent?: string;
}

export interface Business {
  id: string;
  name: string;
  industryType: string; // Generic classification, e.g. "dental", "legal", "real_estate", "general"
  ownerInfo: OwnerInfo;
  languageSettings: LanguageSettings;
  createdAt: string; // ISO 8601 string
}

// ==========================================
// 2. WORKFLOWS COLLECTION
// Collection path: `workflows/{workflowId}`
// ==========================================

export type FieldType =
  | 'text'
  | 'number'
  | 'date'
  | 'time'
  | 'boolean'
  | 'select'
  | 'email'
  | 'phone';

export interface WorkflowField {
  fieldName: string;
  fieldType: FieldType;
  isRequired: boolean;
  orderIndex: number;
  options?: string[]; // Used when fieldType === 'select'
  description?: string; // Optional guidance prompt for AI assistant
}

export type ConditionOperator =
  | 'equals'
  | 'not_equals'
  | 'contains'
  | 'greater_than'
  | 'less_than'
  | 'is_set';

export type ResultingAction =
  | 'transfer_call'
  | 'send_sms'
  | 'schedule_appointment'
  | 'end_call'
  | 'escalate';

export interface WorkflowCondition {
  fieldReference: string; // Refers to a fieldName or system variable (e.g. "urgency")
  operator: ConditionOperator;
  value: string | number | boolean;
  resultingAction: ResultingAction;
}

export type TriggerType = 'inbound_call' | 'missed_call' | 'after_hours' | 'manual';

export interface Workflow {
  id: string;
  businessId: string;
  name: string;
  triggerType: TriggerType;
  greetingMessage: string;
  closingMessage: string;
  isActive: boolean;
  language?: string; // 'en-US' | 'hi-IN' | 'auto'
  fields: WorkflowField[]; // Embedded array: small, always fetched together with workflow
  conditions: WorkflowCondition[]; // Embedded array: small, dynamic execution rules
  createdAt?: string;
  updatedAt?: string;
}

// ==========================================
// 3. CALLS COLLECTION & SUBCOLLECTIONS
// Collection path: `calls/{callId}`
// ==========================================

export type CallStatus = 'in_progress' | 'completed' | 'failed' | 'missed' | 'transferred';
export type CallUrgency = 'low' | 'medium' | 'high' | 'urgent';
export type FollowUpStatus = 'pending' | 'contacted' | 'completed' | 'closed';

export interface Call {
  id: string;
  businessId: string;
  workflowId: string;
  callerName?: string;
  callerPhone?: string;
  status?: string;
  startTime: string;
  endTime?: string;
  durationSeconds?: number;
  aiSummary?: string;
  actionTaken?: string;
  followUpStatus: FollowUpStatus;
  urgencyLevel?: CallUrgency;
  intentDetected?: string;
  collectedFields?: Record<string, any>;
  createdAt?: string;
}

/**
 * Subcollection: `calls/{callId}/responses/{responseId}`
 * Extracted data points populated during or after the voice call based on workflow fields.
 */
export interface CallResponse {
  id: string;
  callId: string;
  fieldName: string;
  value: string | number | boolean | string[];
  extractedAt?: string;
}

/**
 * Subcollection: `calls/{callId}/transcript/{messageId}`
 * Turn-by-turn speech/text transcript logs for a specific call.
 */
export type TranscriptRole = 'user' | 'assistant' | 'system';

export interface CallTranscriptEntry {
  id: string;
  callId: string;
  role: TranscriptRole;
  message: string;
  timestamp: string;
}

// ==========================================
// 4. CALL SUMMARY (Folded onto Call doc)
// Interface definition provided for convenience / dedicated API responses
// ==========================================

export interface CallSummary {
  callId: string;
  aiSummary: string;
  actionTaken: string;
  followUpStatus: FollowUpStatus;
}
