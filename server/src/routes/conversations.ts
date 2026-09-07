import { Router, Request, Response } from 'express';
import { db } from '../lib/firebase.js';
import { getOrCreateSession, processConversationTurn } from '../lib/engine.js';
import { Business, Workflow } from '../types/db.js';

const router = Router();

/**
 * POST /api/conversations/:workflowId/message
 * Drives one turn of the text-based AI conversation engine.
 */
router.post('/conversations/:workflowId/message', async (req: Request, res: Response) => {
  try {
    const { workflowId } = req.params;
    const { sessionId, message } = req.body;

    if (!workflowId) {
      return res.status(400).json({ success: false, message: 'Workflow ID is required in URL parameter.' });
    }

    if (!message && !sessionId) {
      // Initialize brand new session
      const session = await getOrCreateSession(workflowId);
      const openingMessage = session.clientMessages[0]?.content || session.workflow.greetingMessage;
      return res.status(200).json({
        success: true,
        sessionId: session.sessionId,
        reply: openingMessage,
        messages: session.clientMessages,
        extractedFields: session.extractedFields,
        isCompleted: session.isCompleted,
        closingMessage: session.workflow.closingMessage,
      });
    }

    if (!message || typeof message !== 'string') {
      return res.status(400).json({ success: false, message: 'User message string is required.' });
    }

    const result = await processConversationTurn(workflowId, message, sessionId);

    return res.status(200).json({
      success: true,
      sessionId: result.session.sessionId,
      reply: result.reply,
      toolCallExecuted: result.toolCallExecuted,
      messages: result.session.clientMessages,
      extractedFields: result.session.extractedFields,
      isCompleted: result.session.isCompleted,
      closingMessage: result.session.workflow.closingMessage,
      savedCallId: result.savedCallId,
    });
  } catch (error: any) {
    console.error('[POST /api/conversations/:workflowId/message] Error:', error);
    return res.status(500).json({
      success: false,
      message: 'Failed to process conversation turn.',
      error: error.message || String(error),
    });
  }
});

/**
 * GET /api/conversations/:workflowId/session/:sessionId
 * Fetch current state of a conversation session.
 */
router.get('/conversations/:workflowId/session/:sessionId', async (req: Request, res: Response) => {
  try {
    const { workflowId, sessionId } = req.params;
    const session = await getOrCreateSession(workflowId, sessionId);

    return res.status(200).json({
      success: true,
      data: {
        sessionId: session.sessionId,
        workflow: session.workflow,
        messages: session.clientMessages,
        extractedFields: session.extractedFields,
        isCompleted: session.isCompleted,
        savedCallId: session.savedCallId,
      },
    });
  } catch (error: any) {
    return res.status(500).json({
      success: false,
      message: 'Failed to fetch conversation session.',
      error: error.message || String(error),
    });
  }
});

/**
 * POST /api/seed-demo
 * Seed a demo Dental Clinic Business & Workflow in Firestore for 1-click testing.
 */
router.post('/seed-demo', async (_req: Request, res: Response) => {
  try {
    const now = new Date().toISOString();

    // 1. Check or Create Demo Business
    const bizRef = db.collection('businesses').doc('demo_dental_clinic');
    let bizDoc = await bizRef.get();

    if (!bizDoc.exists) {
      const demoBiz: Omit<Business, 'id'> = {
        name: 'Apex Dental Care Clinic',
        industryType: 'dental',
        ownerInfo: {
          name: 'Dr. Sarah Jenkins',
          email: 'dr.jenkins@apexdental.com',
          phone: '+1-555-0144',
        },
        languageSettings: {
          primaryLanguage: 'en-US',
          accent: 'Standard',
        },
        createdAt: now,
      };
      await bizRef.set(demoBiz);
    }

    // 2. Check or Create Demo Workflow
    const wfRef = db.collection('workflows').doc('demo_dental_workflow');
    let wfDoc = await wfRef.get();

    if (!wfDoc.exists) {
      const demoWorkflow: Omit<Workflow, 'id'> = {
        businessId: 'demo_dental_clinic',
        name: 'Dental Intake & Appointment Booking',
        triggerType: 'inbound_call',
        greetingMessage:
          'Hello! Thank you for calling Apex Dental Care Clinic. How can I help you book or manage your appointment today?',
        closingMessage:
          'Thank you for calling Apex Dental Care Clinic. We look forward to seeing you soon! Have a great day.',
        isActive: true,
        fields: [
          {
            fieldName: 'caller_name',
            fieldType: 'text',
            isRequired: true,
            orderIndex: 1,
            description: 'full name',
          },
          {
            fieldName: 'caller_phone',
            fieldType: 'phone',
            isRequired: true,
            orderIndex: 2,
            description: 'phone number',
          },
          {
            fieldName: 'service_requested',
            fieldType: 'select',
            isRequired: true,
            orderIndex: 3,
            options: ['General Checkup', 'Teeth Cleaning', 'Emergency Pain', 'Orthodontics'],
            description: 'dental service needed',
          },
          {
            fieldName: 'appointment_date',
            fieldType: 'date',
            isRequired: true,
            orderIndex: 4,
            description: 'preferred appointment date and time',
          },
        ],
        conditions: [
          {
            fieldReference: 'service_requested',
            operator: 'equals',
            value: 'Emergency Pain',
            resultingAction: 'escalate',
          },
        ],
        createdAt: now,
        updatedAt: now,
      };
      await wfRef.set(demoWorkflow);
    }

    return res.status(200).json({
      success: true,
      message: 'Demo Dental Clinic Business & Workflow seeded in Firestore!',
      data: {
        businessId: 'demo_dental_clinic',
        workflowId: 'demo_dental_workflow',
      },
    });
  } catch (error: any) {
    console.error('[POST /api/seed-demo] Error:', error);
    return res.status(500).json({
      success: false,
      message: 'Failed to seed demo data',
      error: error.message || String(error),
    });
  }
});

/**
 * POST /api/seed-cake-shop
 * Seed Use Case 2: Sweet Delights Artisan Cake Shop Business & Workflow in Firestore.
 */
router.post('/seed-cake-shop', async (_req: Request, res: Response) => {
  try {
    const now = new Date().toISOString();

    // 1. Check or Create Cake Shop Business
    const bizRef = db.collection('businesses').doc('demo_cake_shop');
    let bizDoc = await bizRef.get();

    if (!bizDoc.exists) {
      const cakeBiz: Omit<Business, 'id'> = {
        name: 'Sweet Delights Artisan Bakery',
        industryType: 'hospitality',
        ownerInfo: {
          name: 'Chef Marco Rossi',
          email: 'marco@sweetdelightsbakery.com',
          phone: '+1-555-0899',
        },
        languageSettings: {
          primaryLanguage: 'en-US',
          accent: 'Standard',
        },
        createdAt: now,
      };
      await bizRef.set(cakeBiz);
    }

    // 2. Check or Create Cake Shop Workflow
    const wfRef = db.collection('workflows').doc('demo_cake_shop_workflow');
    let wfDoc = await wfRef.get();

    if (!wfDoc.exists) {
      const cakeWorkflow: Omit<Workflow, 'id'> = {
        businessId: 'demo_cake_shop',
        name: 'Custom Cake Order & Tasting Intake',
        triggerType: 'inbound_call',
        greetingMessage:
          'Hello! Welcome to Sweet Delights Bakery. I can help you place a custom cake order or schedule a tasting appointment today!',
        closingMessage:
          'Thank you for choosing Sweet Delights Bakery! Your custom cake order details have been saved. Have a sweet day!',
        isActive: true,
        fields: [
          {
            fieldName: 'customer_name',
            fieldType: 'text',
            isRequired: true,
            orderIndex: 1,
            description: 'Ask for customer full name',
          },
          {
            fieldName: 'contact_phone',
            fieldType: 'phone',
            isRequired: true,
            orderIndex: 2,
            description: 'Ask for contact phone number for order updates',
          },
          {
            fieldName: 'cake_flavor',
            fieldType: 'select',
            isRequired: true,
            orderIndex: 3,
            options: ['Vanilla Bean', 'Red Velvet', 'Chocolate Fudge', 'Strawberry Shortcake'],
            description: 'Determine desired cake flavor or theme',
          },
          {
            fieldName: 'event_date',
            fieldType: 'date',
            isRequired: true,
            orderIndex: 4,
            description: 'Date and time required for pickup or delivery',
          },
        ],
        conditions: [
          {
            fieldReference: 'cake_flavor',
            operator: 'equals',
            value: 'Red Velvet',
            resultingAction: 'send_sms',
          },
        ],
        createdAt: now,
        updatedAt: now,
      };
      await wfRef.set(cakeWorkflow);
    }

    return res.status(200).json({
      success: true,
      message: 'Demo Artisan Cake Shop Business & Workflow seeded in Firestore!',
      data: {
        businessId: 'demo_cake_shop',
        workflowId: 'demo_cake_shop_workflow',
      },
    });
  } catch (error: any) {
    console.error('[POST /api/seed-cake-shop] Error:', error);
    return res.status(500).json({
      success: false,
      message: 'Failed to seed cake shop demo data',
      error: error.message || String(error),
    });
  }
});

/**
 * POST /api/seed-hindi-demo
 * Seed Use Case 3: Hindi Dental Clinic Business & Workflow (hi-IN) in Firestore.
 */
router.post('/seed-hindi-demo', async (_req: Request, res: Response) => {
  try {
    const now = new Date().toISOString();

    // 1. Check or Create Hindi Dental Business
    const bizRef = db.collection('businesses').doc('demo_hindi_dental_clinic');
    let bizDoc = await bizRef.get();

    if (!bizDoc.exists) {
      const hindiBiz: Omit<Business, 'id'> = {
        name: 'नमस्ते एपेक्स डेंटल क्लिनिक',
        industryType: 'dental',
        ownerInfo: {
          name: 'डॉ. राजेश शर्मा',
          email: 'dr.sharma@apexdental.in',
          phone: '+91-9876543210',
        },
        languageSettings: {
          primaryLanguage: 'hi-IN',
          accent: 'Hindi-Indian',
        },
        createdAt: now,
      };
      await bizRef.set(hindiBiz);
    }

    // 2. Check or Create Hindi Dental Workflow
    const wfRef = db.collection('workflows').doc('demo_hindi_workflow');
    let wfDoc = await wfRef.get();

    if (!wfDoc.exists) {
      const hindiWorkflow: Omit<Workflow, 'id'> = {
        businessId: 'demo_hindi_dental_clinic',
        name: 'हिंदी डेंटल अपॉइंटमेंट बुकिंग एवं पूछताछ',
        triggerType: 'inbound_call',
        language: 'hi-IN',
        greetingMessage:
          'नमस्ते! एपेक्स डेंटल केयर क्लिनिक में आपका स्वागत है। आज मैं आपकी अपॉइंटमेंट बुक करने या जानकारी देने में कैसे मदद कर सकता हूँ?',
        closingMessage:
          'एपेक्स डेंटल केयर क्लिनिक से संपर्क करने के लिए धन्यवाद! आपकी अपॉइंटमेंट जानकारी सुरक्षित कर ली गई है। आपका दिन शुभ हो!',
        isActive: true,
        fields: [
          {
            fieldName: 'caller_name',
            fieldType: 'text',
            isRequired: true,
            orderIndex: 1,
            description: 'Ask for caller full name in Hindi (नाम पूछें)',
          },
          {
            fieldName: 'caller_phone',
            fieldType: 'phone',
            isRequired: true,
            orderIndex: 2,
            description: 'Ask for caller phone number in Hindi (फोन नंबर पूछें)',
          },
          {
            fieldName: 'service_requested',
            fieldType: 'select',
            isRequired: true,
            orderIndex: 3,
            options: ['दांत की सफाई (Teeth Cleaning)', 'दांत दर्द (Emergency Pain)', 'चेकअप (General Checkup)'],
            description: 'Determine service needed in Hindi (समस्या पूछें)',
          },
          {
            fieldName: 'appointment_date',
            fieldType: 'date',
            isRequired: true,
            orderIndex: 4,
            description: 'Ask for desired date and time in Hindi (समय और तारीख पूछें)',
          },
        ],
        conditions: [
          {
            fieldReference: 'service_requested',
            operator: 'contains',
            value: 'Emergency Pain',
            resultingAction: 'escalate',
          },
        ],
        createdAt: now,
        updatedAt: now,
      };
      await wfRef.set(hindiWorkflow);
    }

    return res.status(200).json({
      success: true,
      message: 'Hindi Dental Clinic Business & Workflow (hi-IN) seeded in Firestore!',
      data: {
        businessId: 'demo_hindi_dental_clinic',
        workflowId: 'demo_hindi_workflow',
      },
    });
  } catch (error: any) {
    console.error('[POST /api/seed-hindi-demo] Error:', error);
    return res.status(500).json({
      success: false,
      message: 'Failed to seed Hindi demo data',
      error: error.message || String(error),
    });
  }
});

export default router;
