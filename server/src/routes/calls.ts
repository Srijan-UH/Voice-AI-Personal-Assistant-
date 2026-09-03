import { Router, Request, Response } from 'express';
import { db } from '../lib/firebase.js';
import { Call, FollowUpStatus } from '../types/db.js';

const router = Router();

export interface CallWithDetails extends Call {
  businessName?: string;
  workflowName?: string;
}

/**
 * GET /api/calls
 * Query parameters:
 *  - businessId (optional): filter calls by specific business
 *  - status (optional): filter calls by followUpStatus (pending, contacted, completed, closed)
 */
router.get('/calls', async (req: Request, res: Response) => {
  try {
    const { businessId, status } = req.query;

    let query: FirebaseFirestore.Query = db.collection('calls');

    if (businessId && typeof businessId === 'string' && businessId.trim() !== '') {
      query = query.where('businessId', '==', businessId.trim());
    }

    if (status && typeof status === 'string' && status.trim() !== '') {
      query = query.where('followUpStatus', '==', status.trim());
    }

    const snapshot = await query.get();

    // Fetch all business and workflow names for lookup
    const [bizSnap, wfSnap] = await Promise.all([
      db.collection('businesses').get(),
      db.collection('workflows').get(),
    ]);

    const bizMap = new Map<string, string>();
    bizSnap.forEach((doc) => {
      bizMap.set(doc.id, doc.data().name || 'Unknown Business');
    });

    const wfMap = new Map<string, string>();
    wfSnap.forEach((doc) => {
      wfMap.set(doc.id, doc.data().name || 'Unknown Workflow');
    });

    const calls: CallWithDetails[] = [];
    snapshot.forEach((doc) => {
      const data = doc.data() as Omit<Call, 'id'>;
      calls.push({
        id: doc.id,
        ...data,
        businessName: bizMap.get(data.businessId) || 'Business Profile',
        workflowName: wfMap.get(data.workflowId) || 'Intake Workflow',
      });
    });

    // Sort calls descending by startTime
    calls.sort((a, b) => new Date(b.startTime).getTime() - new Date(a.startTime).getTime());

    return res.status(200).json({
      success: true,
      count: calls.length,
      data: calls,
    });
  } catch (error: any) {
    console.error('[GET /api/calls] Error:', error);
    return res.status(500).json({
      success: false,
      message: 'Failed to fetch calls from Firestore',
      error: error.message || String(error),
    });
  }
});

/**
 * GET /api/calls/:id/transcript
 * Fetch full turn-by-turn transcript & extracted responses subcollections for a call document
 */
router.get('/calls/:id/transcript', async (req: Request, res: Response) => {
  try {
    const { id } = req.params;

    const callRef = db.collection('calls').doc(id);
    const callDoc = await callRef.get();

    if (!callDoc.exists) {
      return res.status(404).json({
        success: false,
        message: `Call with ID "${id}" not found in Firestore.`,
      });
    }

    const [transcriptSnap, responsesSnap] = await Promise.all([
      callRef.collection('transcript').orderBy('timestamp', 'asc').get(),
      callRef.collection('responses').get(),
    ]);

    const transcript: any[] = [];
    transcriptSnap.forEach((doc) => {
      transcript.push({ id: doc.id, ...doc.data() });
    });

    const responses: any[] = [];
    responsesSnap.forEach((doc) => {
      responses.push({ id: doc.id, ...doc.data() });
    });

    return res.status(200).json({
      success: true,
      data: {
        call: { id: callDoc.id, ...callDoc.data() },
        transcript,
        responses,
      },
    });
  } catch (error: any) {
    console.error('[GET /api/calls/:id/transcript] Error:', error);
    return res.status(500).json({
      success: false,
      message: 'Failed to fetch call transcript from Firestore',
      error: error.message || String(error),
    });
  }
});

/**
 * PATCH /api/calls/:id/status
 * Update follow-up status (pending, contacted, completed, closed)
 */
router.patch('/calls/:id/status', async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const { status } = req.body;

    const validStatuses: FollowUpStatus[] = ['pending', 'contacted', 'completed', 'closed'];

    if (!status || !validStatuses.includes(status as FollowUpStatus)) {
      return res.status(400).json({
        success: false,
        message: `Invalid status "${status}". Allowed values: ${validStatuses.join(', ')}`,
      });
    }

    const callRef = db.collection('calls').doc(id);
    const callDoc = await callRef.get();

    if (!callDoc.exists) {
      return res.status(404).json({
        success: false,
        message: `Call document "${id}" not found in Firestore.`,
      });
    }

    await callRef.update({
      followUpStatus: status,
      updatedAt: new Date().toISOString(),
    });

    const updatedDoc = await callRef.get();

    return res.status(200).json({
      success: true,
      message: `Call status updated to "${status}" successfully.`,
      data: { id: updatedDoc.id, ...updatedDoc.data() },
    });
  } catch (error: any) {
    console.error('[PATCH /api/calls/:id/status] Error:', error);
    return res.status(500).json({
      success: false,
      message: 'Failed to update call status in Firestore',
      error: error.message || String(error),
    });
  }
});

export default router;
