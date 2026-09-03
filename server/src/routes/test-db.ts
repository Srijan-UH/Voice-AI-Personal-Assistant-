import { Router, Request, Response } from 'express';
import { db, getFirebaseCredentialsStatus } from '../lib/firebase.js';
import { Business } from '../types/db.js';

const router = Router();

router.get('/test-db', async (_req: Request, res: Response) => {
  const credStatus = getFirebaseCredentialsStatus();

  if (!credStatus.isConfigured) {
    return res.status(500).json({
      success: false,
      message: 'Firestore configuration error: Missing environment variables in /server/.env',
      missingVariables: credStatus.missing,
      instruction: 'Set FIREBASE_PROJECT_ID, FIREBASE_CLIENT_EMAIL, and FIREBASE_PRIVATE_KEY in /server/.env',
    });
  }

  const testDocId = `test_biz_${Date.now()}`;
  const docRef = db.collection('businesses').doc(testDocId);

  try {
    const dummyBusiness: Omit<Business, 'id'> = {
      name: 'Firestore Verification Business',
      industryType: 'technology',
      ownerInfo: {
        name: 'Connection Tester',
        email: 'test@voiceassistant.local',
      },
      languageSettings: {
        primaryLanguage: 'en-US',
      },
      createdAt: new Date().toISOString(),
    };

    // 1. Add document to businesses collection
    await docRef.set(dummyBusiness);

    // 2. Read document back
    const docSnapshot = await docRef.get();
    if (!docSnapshot.exists) {
      throw new Error('Document was written but could not be read back.');
    }
    const retrievedData = docSnapshot.data();

    // 3. Delete document
    await docRef.delete();

    // Verify deletion
    const verifySnapshot = await docRef.get();
    const isDeleted = !verifySnapshot.exists;

    return res.status(200).json({
      success: true,
      message: 'Firestore connection test passed successfully!',
      details: {
        testDocId,
        retrievedData,
        cleanedUp: isDeleted,
      },
    });
  } catch (error: any) {
    console.error('[test-db] Firestore connection test failed:', error);
    try {
      await docRef.delete();
    } catch {}

    return res.status(500).json({
      success: false,
      message: 'Firestore connection test failed.',
      error: error.message || String(error),
      code: error.code,
    });
  }
});

export default router;
