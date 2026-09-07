# Voice AI Personal Assistant — Submission & Documentation File

## 1. README & Setup Instructions

### Overview
A production-grade, multi-lingual, voice-enabled AI Personal Assistant web application built with **React (Vite)**, **Node.js / Express**, **Google Gemini / OpenAI Engine**, **Google Calendar API**, **Deepgram Speech-to-Text**, **ElevenLabs Text-to-Speech**, and **Firebase Firestore**.

Designed for small business owners (e.g., dental clinics, artisan bakeries, service intake) to automatically handle caller inquiries, collect structured intake data, execute calendar bookings, look up CRM order statuses, and persist call records in Firestore.

---

### Setup & How to Run

```bash
# 1. Clone repository
git clone https://github.com/Srijan-UH/Voice-AI-Personal-Assistant-.git
cd Voice-AI-Personal-Assistant-

# 2. Setup & run Backend
cd server
npm install
npm run dev     # Starts backend on http://localhost:5000

# 3. Setup & run Frontend (in a new terminal)
cd client
npm install
npm run dev     # Starts frontend on http://localhost:5173
```

---

## 2. Architecture Diagram

```
+-----------------------------------------------------------------------------------+
|                                 REACT CLIENT                                      |
|    - Workflow Builder (/workflows/new)                                            |
|    - Chat Assistant (/chat/:workflowId)                                           |
|    - Voice Assistant (/voice/:workflowId) [Microphone WebMediaRecorder]           |
|    - Calls Dashboard (/dashboard)                                                 |
+-----------------------------------------+-----------------------------------------+
                                          |
                                          | HTTP REST / Multipart Form Data
                                          v
+-----------------------------------------------------------------------------------+
|                                EXPRESS BACKEND SERVER                             |
|                                                                                   |
|  +-----------------------+   +------------------------+   +--------------------+  |
|  |  Deepgram STT (Nova-2)|   | ElevenLabs TTS (Rachel)|   | AI Session Manager |  |
|  +-----------+-----------+   +-----------^------------+   +---------+----------+  |
|              |                       |                              |             |
+--------------|-----------------------|------------------------------|-------------+
               | User Text             | Audio MP3 Base64             |
               v                       |                              v
+--------------------------------------+--------------------------------------------+
|                             AI ENGINE (GEMINI / OPENAI)                           |
|    - System Prompt Generator with Function Calling Tools Array                    |
+--------------------------------------+--------------------------------------------+
                                       |
                   +-------------------+-------------------+
                   | Tool Execution                        | Tool Execution
                   v                                       v
+------------------------------------+   +------------------------------------------+
|       GOOGLE CALENDAR API          |   |          CRM & ORDER TRACKING API        |
| - check_calendar_availability      |   | - lookup_order_status                    |
| - create_calendar_event            |   | - lookup_crm_customer_history            |
+------------------+-----------------+   +--------------------+---------------------+
                                       |                                          |
                                       +-------------------+----------------------+
                                                           |
                                                           v
+-----------------------------------------------------------------------------------+
|                                FIREBASE FIRESTORE                                 |
|  - businesses/                                                                    |
|  - workflows/                                                                     |
|  - calls/{callId}                                                                 |
|    |-- responses/ (subcollection)                                                 |
|    |-- transcript/ (subcollection)                                                |
+-----------------------------------------------------------------------------------+
```

---

## 3. Database Schema & Workflow Data Model

### Collection: `businesses`
```typescript
interface Business {
  id: string;                    // Firestore Document ID
  name: string;                  // e.g. "Smile Care Dental Clinic"
  industry: string;              // e.g. "Healthcare", "Bakery"
  phone: string;                 // e.g. "+1-555-0192"
  timezone: string;              // e.g. "America/New_York" or "Asia/Kolkata"
  createdAt: string;             // ISO Date String
}
```

### Collection: `workflows`
```typescript
interface Workflow {
  id: string;                    // Firestore Document ID
  businessId: string;            // Foreign key -> businesses.id
  title: string;                 // e.g. "Dental Patient Appointment Intake"
  language: 'en-US' | 'hi-IN';   // Language code
  greetingMessage: string;       // Opening line for assistant
  closingMessage: string;        // Final thank you line
  intakeFields: Array<{
    name: string;                // e.g. "patientName", "appointmentTime"
    label: string;               // e.g. "Patient Full Name"
    type: 'text' | 'date' | 'time' | 'phone' | 'choice';
    required: boolean;
    options?: string[];
  }>;
  conditionalRules: Array<{
    conditionField: string;      // e.g. "urgency"
    operator: 'equals' | 'contains';
    value: string;               // e.g. "Emergency"
    action: 'flag_urgent' | 'send_sms' | 'escalate_human';
  }>;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
}
```

### Collection: `calls`
```typescript
interface Call {
  id: string;                    // Firestore Document ID
  workflowId: string;            // Foreign key -> workflows.id
  businessId: string;            // Foreign key -> businesses.id
  callerPhone: string;
  durationSeconds: number;
  status: 'pending' | 'contacted' | 'completed' | 'closed';
  summary: string;               // AI-generated call summary
  urgency: 'low' | 'medium' | 'high' | 'emergency';
  createdAt: string;
}
```

---

## 4. Environment Variable Templates (Without Secrets)

### Client Template (`client/.env.example`)
```env
VITE_API_BASE_URL=http://localhost:5000
```

### Server Template (`server/.env.example`)
```env
PORT=5000
CLIENT_ORIGIN=http://localhost:5173

# AI Engine Credentials
GEMINI_API_KEY=your_gemini_api_key_here
GEMINI_MODEL=gemini-3.6-flash

# Firebase Admin SDK Credentials
FIREBASE_PROJECT_ID=your_firebase_project_id_here
FIREBASE_CLIENT_EMAIL=your_firebase_client_email_here
FIREBASE_PRIVATE_KEY="-----BEGIN PRIVATE KEY-----\nyour_private_key_here\n-----END PRIVATE KEY-----\n"

# Voice Processing APIs
DEEPGRAM_API_KEY=your_deepgram_api_key_here
ELEVENLABS_API_KEY=your_elevenlabs_api_key_here

# Google Calendar OAuth Credentials (Optional)
GOOGLE_CLIENT_ID=your_google_client_id_here
GOOGLE_CLIENT_SECRET=your_google_client_secret_here
GOOGLE_REDIRECT_URI=http://localhost:5000/api/auth/google/callback
```

---

## 5. Project Status & Production Notes

### ✅ What is Fully Working
1. **Firestore DB Integration**: Live read, write, update, and subcollection persistence using Firebase Admin SDK.
2. **Workflow Builder Wizard**: 5-step React wizard at `/workflows/new` saving business profiles, custom intake fields, and conditional rule logic to Firestore.
3. **Generic AI Engine**: Data-driven prompt builder executing multiple use cases (Dental Clinic, Artisan Bakery, Hindi Clinic) on identical backend logic.
4. **AI Agent Tool Calling**: Modular function calling for Google Calendar availability checking/booking and CRM order status lookup.
5. **Speech-to-Text & Text-to-Speech**: Deepgram STT (Nova-2) and ElevenLabs TTS (Rachel) audio synthesis.
6. **Continuous Hands-Free Voice Conversation**: Turn-by-turn hands-free testing at `/voice/:workflowId`. Session stays active, auto-reopens mic after AI response playback with silence detection (~1.5s auto-submit).
7. **Multi-lingual Engine**: English (`en-US`) and Hindi (`hi-IN`) auto-detection and natural speech response.
8. **Call Management Dashboard**: Filterable logs, status badges, extracted fields summary, and transcript drawer at `/dashboard`.

### 🎭 What is Simulated / Mocked
1. **Google Calendar OAuth Authorization Flow**: Built-in dev fallback returns clean calendar availability slots when OAuth tokens are not active in environment.
2. **CRM Order Database**: Contains simulated mock orders (`ORD-9842`, `ORD-7710`) with dynamic order generation fallback for testing.
3. **Voice Key Fallback**: Graceful text/audio fallback when Deepgram/ElevenLabs API keys are not provided.

### 🔮 What to Build Next for Production
1. **Twilio Telephony Gateway**: Connect real PSTN/SIP inbound phone calls directly to Express voice WebSockets.
2. **Bidirectional WebSockets (Pipecat / WebRTC)**: Replace REST audio uploads with streaming WebSockets for sub-500ms voice response latency.
3. **Automated SMS & Email Triggers**: Trigger Twilio SMS / SendGrid emails based on conditional rules (`send_sms`, `flag_urgent`).
