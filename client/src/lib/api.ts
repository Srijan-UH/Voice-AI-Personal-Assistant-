import { Business, Workflow, Call, FollowUpStatus } from '../types/db';

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || 'http://localhost:5000';

export interface HealthResponse {
  status: string;
  service: string;
  timestamp: string;
}

export interface ChatMessageItem {
  id: string;
  role: 'user' | 'assistant' | 'system' | 'tool';
  content: string;
  timestamp: string;
  toolCallName?: string;
}

export interface ChatTurnResponse {
  success: boolean;
  sessionId: string;
  reply: string;
  userText?: string;
  audioBase64?: string | null;
  toolCallExecuted?: string;
  messages: ChatMessageItem[];
  extractedFields: Record<string, any>;
  isCompleted: boolean;
  savedCallId?: string;
}

export interface CallWithDetails extends Call {
  businessName?: string;
  workflowName?: string;
}

export interface CallTranscriptResponse {
  call: CallWithDetails;
  transcript: ChatMessageItem[];
  responses: Array<{ id: string; fieldName: string; value: any; extractedAt?: string }>;
}

export async function checkServerHealth(): Promise<HealthResponse> {
  const response = await fetch(`${API_BASE_URL}/api/health`);
  if (!response.ok) {
    throw new Error(`Server health check failed: HTTP ${response.status}`);
  }
  return response.json();
}

/**
 * Fetch all businesses from backend.
 */
export async function getBusinesses(): Promise<Business[]> {
  const response = await fetch(`${API_BASE_URL}/api/businesses`);
  if (!response.ok) {
    throw new Error(`Failed to fetch businesses: HTTP ${response.status}`);
  }
  const result = await response.json();
  return result.data || [];
}

/**
 * Create a new business profile document via backend Express API.
 */
export async function createBusiness(
  businessData: Omit<Business, 'id' | 'createdAt'>
): Promise<Business> {
  const response = await fetch(`${API_BASE_URL}/api/businesses`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(businessData),
  });

  const result = await response.json();
  if (!response.ok || !result.success) {
    throw new Error(result.message || 'Failed to create business profile');
  }

  return result.data;
}

/**
 * Fetch all workflows, optionally by businessId
 */
export async function getWorkflows(businessId?: string): Promise<Workflow[]> {
  const url = businessId
    ? `${API_BASE_URL}/api/workflows?businessId=${encodeURIComponent(businessId)}`
    : `${API_BASE_URL}/api/workflows`;
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`Failed to fetch workflows: HTTP ${response.status}`);
  }
  const result = await response.json();
  return result.data || [];
}

/**
 * Create a new workflow document via backend Express API.
 */
export async function createWorkflow(
  workflowData: Omit<Workflow, 'id' | 'createdAt' | 'updatedAt'>
): Promise<Workflow> {
  const response = await fetch(`${API_BASE_URL}/api/workflows`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(workflowData),
  });

  const result = await response.json();
  if (!response.ok || !result.success) {
    throw new Error(result.message || 'Failed to save workflow to Firestore');
  }

  return result.data;
}

/**
 * Send text message to AI Conversation Engine
 */
export async function sendChatMessage(
  workflowId: string,
  message: string,
  sessionId?: string
): Promise<ChatTurnResponse> {
  const response = await fetch(`${API_BASE_URL}/api/conversations/${workflowId}/message`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      sessionId,
      message,
    }),
  });

  const result = await response.json();
  if (!response.ok || !result.success) {
    throw new Error(result.message || 'Failed to send message to AI engine');
  }

  return result;
}

/**
 * Send recorded microphone audio to Voice Engine (Deepgram STT -> AI Engine -> ElevenLabs TTS)
 */
export async function sendVoiceMessage(
  workflowId: string,
  audioBlob: Blob,
  sessionId?: string
): Promise<ChatTurnResponse> {
  const formData = new FormData();
  formData.append('audio', audioBlob, 'microphone_recording.webm');
  if (sessionId) {
    formData.append('sessionId', sessionId);
  }

  const response = await fetch(`${API_BASE_URL}/api/conversations/${workflowId}/voice`, {
    method: 'POST',
    body: formData,
  });

  const result = await response.json();
  if (!response.ok || !result.success) {
    throw new Error(result.message || 'Voice processing failed');
  }

  return result;
}

/**
 * Fetch calls list with optional businessId and status filters (GET /api/calls)
 */
export async function getCalls(businessId?: string, status?: string): Promise<CallWithDetails[]> {
  const params = new URLSearchParams();
  if (businessId && businessId !== 'all') params.append('businessId', businessId);
  if (status && status !== 'all') params.append('status', status);

  const queryString = params.toString();
  const url = `${API_BASE_URL}/api/calls${queryString ? `?${queryString}` : ''}`;

  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`Failed to fetch calls: HTTP ${response.status}`);
  }
  const result = await response.json();
  return result.data || [];
}

/**
 * Fetch transcript & subcollection responses for a call document (GET /api/calls/:id/transcript)
 */
export async function getCallTranscript(callId: string): Promise<CallTranscriptResponse> {
  const response = await fetch(`${API_BASE_URL}/api/calls/${callId}/transcript`);
  if (!response.ok) {
    throw new Error(`Failed to fetch call transcript: HTTP ${response.status}`);
  }
  const result = await response.json();
  return result.data;
}

/**
 * Update follow-up status of a call document (PATCH /api/calls/:id/status)
 */
export async function updateCallStatus(
  callId: string,
  status: FollowUpStatus
): Promise<CallWithDetails> {
  const response = await fetch(`${API_BASE_URL}/api/calls/${callId}/status`, {
    method: 'PATCH',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ status }),
  });

  const result = await response.json();
  if (!response.ok || !result.success) {
    throw new Error(result.message || 'Failed to update call status');
  }
  return result.data;
}

/**
 * Seed Use Case 1: Demo Dental Clinic Business & Workflow in Firestore
 */
export async function seedDemoWorkflow(): Promise<{ businessId: string; workflowId: string }> {
  const response = await fetch(`${API_BASE_URL}/api/seed-demo`, {
    method: 'POST',
  });
  const result = await response.json();
  if (!response.ok || !result.success) {
    throw new Error(result.message || 'Failed to seed demo workflow');
  }
  return result.data;
}

/**
 * Seed Use Case 2: Demo Artisan Cake Shop Business & Workflow in Firestore
 */
export async function seedCakeShopWorkflow(): Promise<{ businessId: string; workflowId: string }> {
  const response = await fetch(`${API_BASE_URL}/api/seed-cake-shop`, {
    method: 'POST',
  });
  const result = await response.json();
  if (!response.ok || !result.success) {
    throw new Error(result.message || 'Failed to seed cake shop demo workflow');
  }
  return result.data;
}

/**
 * Seed Use Case 3: Demo Hindi Dental Clinic Business & Workflow (hi-IN) in Firestore
 */
export async function seedHindiWorkflow(): Promise<{ businessId: string; workflowId: string }> {
  const response = await fetch(`${API_BASE_URL}/api/seed-hindi-demo`, {
    method: 'POST',
  });
  const result = await response.json();
  if (!response.ok || !result.success) {
    throw new Error(result.message || 'Failed to seed Hindi demo workflow');
  }
  return result.data;
}
