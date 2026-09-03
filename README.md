# Voice AI Personal Assistant — Full-Stack Web App

A production-grade, multi-lingual, voice-enabled AI Personal Assistant web application built with **React**, **Node.js / Express**, **OpenAI Function Calling**, **Google Calendar API**, **Deepgram Speech-to-Text**, **ElevenLabs Text-to-Speech**, and **Firebase Firestore**.

Designed for small business owners (e.g., dental clinics, artisan bakeries, service intake) to automatically handle caller inquiries, collect structured intake data, execute calendar bookings, look up CRM order statuses, and persist call records in Firestore.

---

## 🌟 Key Features

- **Guided Step-by-Step Workflow Builder**: Create custom business profiles, configure intake fields, greetings, closing messages, and conditional rules (`/workflows/new`).
- **Generic AI Conversation Engine**: Data-driven, dynamic system prompt generation — drives multiple use cases with zero hardcoded business logic.
- **OpenAI Function Calling & Agent Tools**:
  - **Google Calendar Tools**: `check_calendar_availability`, `create_calendar_event`, `update_calendar_event`, `cancel_calendar_event`.
  - **CRM & Order Tracking Tool**: `lookup_order_status`, `lookup_crm_customer_history`.
- **Voice Pipeline**:
  - **Deepgram STT (Nova-2)**: Ultra-fast speech-to-text transcription.
  - **ElevenLabs TTS (Rachel)**: Natural, human-like voice synthesis.
  - **React Voice Assistant Page (`/voice/:workflowId`)**: Microphone recording visualizer & automatic audio playback.
- **Hindi (`hi-IN`) & English (`en-US`) Multi-lingual Engine**:
  - Devanagari script and Hinglish keyword automatic language detection.
- **Call Management Dashboard (`/dashboard`)**:
  - Filterable call logs by business and follow-up status (`pending`, `contacted`, `completed`, `closed`).
  - Extracted fields pills, urgency badges, AI summaries, and turn-by-turn transcript drawer.

---

## 🛠 Tech Stack

- **Frontend**: React (TypeScript), Vite, React Router DOM, TailwindCSS, Lucide Icons, HTML5 MediaRecorder.
- **Backend**: Node.js, Express (TypeScript), Firebase Admin SDK, OpenAI API, Google APIs (OAuth2 & Calendar v3), Deepgram SDK / REST, ElevenLabs API, Multer.
- **Database**: Firebase Firestore (Native mode).

---

## 🚀 Environment Variables

### Client (`client/.env`)

Create a `.env` file in the `/client` directory:

```env
VITE_API_BASE_URL=http://localhost:5000
```

### Server (`server/.env`)

Create a `.env` file in the `/server` directory:

```env
PORT=5000
CLIENT_ORIGIN=http://localhost:5173

# Firebase Service Account Credentials (from Firebase Console -> Project Settings -> Service Accounts)
FIREBASE_PROJECT_ID=voice-ai-assistant-477e0
FIREBASE_CLIENT_EMAIL=firebase-adminsdk-xxxxx@voice-ai-assistant-477e0.iam.gserviceaccount.com
FIREBASE_PRIVATE_KEY="-----BEGIN PRIVATE KEY-----\nMIIEvgIBADANBgkqhkiG9w0BAQEFAASCBKgwggSkAgEAAoIBAQC...\n-----END PRIVATE KEY-----\n"

# OpenAI API Key (for GPT-4o function calling engine)
OPENAI_API_KEY=sk-proj-xxxxxxxxxxxxxxxxxxxxxxxx

# Google Calendar OAuth2 Credentials (optional, fallback dev mode built-in)
GOOGLE_CLIENT_ID=your_google_client_id.apps.googleusercontent.com
GOOGLE_CLIENT_SECRET=your_google_client_secret
GOOGLE_REDIRECT_URI=http://localhost:5000/api/auth/google/callback

# Voice Stack Credentials
DEEPGRAM_API_KEY=your_deepgram_api_key_here
ELEVENLABS_API_KEY=your_elevenlabs_api_key_here
```

---

## 🔥 Firebase Setup Instructions

1. Go to [Firebase Console](https://console.firebase.google.com/) and create a new project (e.g. `voice-ai-assistant`).
2. Enable **Firestore Database** in **Native mode**.
3. Go to **Project Settings** $\rightarrow$ **Service Accounts** $\rightarrow$ Click **Generate new private key**.
4. Open the downloaded JSON file and copy:
   - `project_id` $\rightarrow$ set `FIREBASE_PROJECT_ID` in `server/.env`
   - `client_email` $\rightarrow$ set `FIREBASE_CLIENT_EMAIL` in `server/.env`
   - `private_key` $\rightarrow$ set `FIREBASE_PRIVATE_KEY` in `server/.env` (ensure `\n` line breaks are preserved inside double quotes).

---

## 💻 How to Run Locally

### 1. Start the Backend Express Server

```bash
cd server
npm install
npm run dev
```

The Express server will start on `http://localhost:5000`. You can test connection at `http://localhost:5000/api/health`.

### 2. Start the Frontend React Client

In a second terminal window:

```bash
cd client
npm install
npm run dev
```

Open your browser to `http://localhost:5173`.

---

## 🚢 Deployment Guide

### Deploy Client to Vercel

1. Push your repository to GitHub.
2. Go to [Vercel Dashboard](https://vercel.com/) $\rightarrow$ **New Project** $\rightarrow$ Select your repository.
3. Set **Root Directory** to `client`.
4. Add Environment Variable:
   - `VITE_API_BASE_URL`: `https://your-express-backend.onrender.com`
5. Click **Deploy**.

### Deploy Server to Render or Railway

#### On Render:
1. Create a **New Web Service** connected to your repository.
2. Set **Root Directory** to `server`.
3. Build Command: `npm install && npm run build`
4. Start Command: `npm start`
5. Add all Environment Variables (`FIREBASE_PROJECT_ID`, `FIREBASE_CLIENT_EMAIL`, `FIREBASE_PRIVATE_KEY`, `OPENAI_API_KEY`, etc.).
6. Set `CLIENT_ORIGIN` to your Vercel client URL.

---

## 🏛 Architecture Diagram & Data Flow

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
|                                OPENAI API                                         |
|    - gpt-4o-mini with Function Calling (Tools Schema Array)                       |
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

## 📑 Project Status & Production Roadmap

### ✅ What is Fully Working

1. **Firestore Connection & Admin SDK**: Live write, read, and delete operations against Native mode Firestore.
2. **Workflow Builder Wizard**: 5-step form at `/workflows/new` saving business profiles, custom intake fields, and conditional rule logic to Firestore.
3. **Generic AI Conversation Engine**: Data-driven system prompt builder driving Dental Clinic, Artisan Cake Shop, and Hindi Clinic workflows on identical backend engine.
4. **OpenAI Function Calling**: Modular agent tools in `/server/src/lib/tools/`.
5. **Google Calendar Integration**: Backend OAuth2 client executing `check_calendar_availability` and `create_calendar_event`.
6. **CRM & Order Tracking Tool**: `lookup_order_status` and `lookup_crm_customer_history` tools callable mid-conversation.
7. **Voice Input/Output Layer**: Deepgram Speech-to-Text (Nova-2) and ElevenLabs Text-to-Speech (Rachel) with React voice assistant page (`/voice/:workflowId`).
8. **Hindi & English Support**: Devanagari script and Hinglish automatic language detection.
9. **Call Management Dashboard**: Calls list at `/dashboard` with business/status filtering, follow-up status updating, AI summaries, urgency badges, and transcript drawer.

### 🎭 What is Simulated / Mocked

1. **Google Calendar OAuth Authorization Flow**: Built-in dev fallback returns clean calendar availability slots when OAuth tokens are not active in environment.
2. **CRM Order Database**: Contains simulated mock orders (`ORD-9842`, `ORD-7710`) with dynamic order generation fallback for testing.
3. **Deepgram / ElevenLabs API Key Fallbacks**: Graceful fallback text transcript & audio indicators when voice API keys are not provided.

### 🔮 What to Build Next for Production

1. **Twilio / Telephony Gateway Integration**: Connect inbound SIP / PSTN phone calls directly to Express voice endpoint via WebSocket streaming.
2. **Real-time WebSockets (Pipecat / WebRTC)**: Transition from REST audio blob upload to bidirectional streaming WebSockets for sub-second latency.
3. **SMS Notification Triggers**: Integrate Twilio SMS API to execute conditional rule actions (`send_sms`).
