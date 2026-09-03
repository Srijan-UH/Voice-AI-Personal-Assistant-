import { Router, Request, Response } from 'express';
import { db } from '../lib/firebase.js';
import { Workflow, WorkflowField, WorkflowCondition } from '../types/db.js';

const router = Router();

/**
 * GET /api/workflows
 * Fetch workflows, optionally filtered by businessId.
 */
router.get('/workflows', async (req: Request, res: Response) => {
  try {
    const { businessId } = req.query;
    let query: FirebaseFirestore.Query = db.collection('workflows');

    if (businessId && typeof businessId === 'string') {
      query = query.where('businessId', '==', businessId);
    }

    const snapshot = await query.get();
    const workflows: Workflow[] = snapshot.docs.map((doc) => ({
      id: doc.id,
      ...(doc.data() as Omit<Workflow, 'id'>),
    }));

    return res.status(200).json({
      success: true,
      data: workflows,
    });
  } catch (error: any) {
    console.error('[GET /api/workflows] Error fetching workflows:', error);
    return res.status(500).json({
      success: false,
      message: 'Failed to fetch workflows',
      error: error.message || String(error),
    });
  }
});

/**
 * POST /api/workflows
 * Create a new voice assistant workflow document in Firestore.
 */
router.post('/workflows', async (req: Request, res: Response) => {
  try {
    const {
      businessId,
      name,
      triggerType,
      greetingMessage,
      closingMessage,
      isActive = true,
      language = 'en-US',
      fields = [],
      conditions = [],
    } = req.body;

    // Validation
    if (!businessId || !name || !greetingMessage || !closingMessage) {
      return res.status(400).json({
        success: false,
        message:
          'Missing required fields: businessId, name, greetingMessage, and closingMessage are required.',
      });
    }

    // Normalize and sanitize embedded fields array without undefined keys
    const sanitizedFields: WorkflowField[] = Array.isArray(fields)
      ? fields.map((field: any, index: number) => {
          const f: WorkflowField = {
            fieldName: String(field.fieldName || `field_${index + 1}`).trim(),
            fieldType: field.fieldType || 'text',
            isRequired: Boolean(field.isRequired),
            orderIndex: typeof field.orderIndex === 'number' ? field.orderIndex : index + 1,
          };
          if (Array.isArray(field.options) && field.options.length > 0) {
            f.options = field.options.map((opt: any) => String(opt).trim()).filter(Boolean);
          }
          if (field.description && String(field.description).trim()) {
            f.description = String(field.description).trim();
          }
          return f;
        })
      : [];

    // Normalize and sanitize embedded conditions array
    const sanitizedConditions: WorkflowCondition[] = Array.isArray(conditions)
      ? conditions.map((cond: any) => ({
          fieldReference: String(cond.fieldReference || 'caller_name').trim(),
          operator: cond.operator || 'equals',
          value: cond.value !== undefined ? cond.value : '',
          resultingAction: cond.resultingAction || 'escalate',
        }))
      : [];

    const now = new Date().toISOString();

    const newWorkflowData: Omit<Workflow, 'id'> = {
      businessId: String(businessId).trim(),
      name: String(name).trim(),
      triggerType: triggerType || 'inbound_call',
      greetingMessage: String(greetingMessage).trim(),
      closingMessage: String(closingMessage).trim(),
      isActive: Boolean(isActive),
      language: String(language || 'en-US').trim(),
      fields: sanitizedFields,
      conditions: sanitizedConditions,
      createdAt: now,
      updatedAt: now,
    };

    const docRef = await db.collection('workflows').add(newWorkflowData);

    const createdWorkflow: Workflow = {
      id: docRef.id,
      ...newWorkflowData,
    };

    return res.status(201).json({
      success: true,
      message: 'Workflow saved successfully to Firestore',
      data: createdWorkflow,
    });
  } catch (error: any) {
    console.error('[POST /api/workflows] Error creating workflow:', error);
    return res.status(500).json({
      success: false,
      message: 'Failed to save workflow',
      error: error.message || String(error),
    });
  }
});

export default router;
