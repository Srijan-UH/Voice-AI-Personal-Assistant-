import { Router, Request, Response } from 'express';
import { db } from '../lib/firebase.js';
import { Business } from '../types/db.js';

const router = Router();

/**
 * GET /api/businesses
 * Fetch all registered business profiles.
 */
router.get('/businesses', async (_req: Request, res: Response) => {
  try {
    const snapshot = await db.collection('businesses').orderBy('createdAt', 'desc').get();
    const businesses: Business[] = snapshot.docs.map((doc) => ({
      id: doc.id,
      ...(doc.data() as Omit<Business, 'id'>),
    }));

    return res.status(200).json({
      success: true,
      data: businesses,
    });
  } catch (error: any) {
    console.error('[GET /api/businesses] Error fetching businesses:', error);
    return res.status(500).json({
      success: false,
      message: 'Failed to fetch businesses',
      error: error.message || String(error),
    });
  }
});

/**
 * POST /api/businesses
 * Create a new business profile document.
 */
router.post('/businesses', async (req: Request, res: Response) => {
  try {
    const { name, industryType, ownerInfo, languageSettings } = req.body;

    if (!name || !industryType) {
      return res.status(400).json({
        success: false,
        message: 'Missing required fields: name and industryType are required.',
      });
    }

    const newBusiness: Omit<Business, 'id'> = {
      name: name.trim(),
      industryType: industryType.trim(),
      ownerInfo: {
        name: ownerInfo?.name?.trim() || 'Business Owner',
        email: ownerInfo?.email?.trim() || '',
        phone: ownerInfo?.phone?.trim() || '',
      },
      languageSettings: {
        primaryLanguage: languageSettings?.primaryLanguage?.trim() || 'en-US',
        supportedLanguages: languageSettings?.supportedLanguages || ['en-US'],
        accent: languageSettings?.accent || 'Standard',
      },
      createdAt: new Date().toISOString(),
    };

    const docRef = await db.collection('businesses').add(newBusiness);

    const createdBusiness: Business = {
      id: docRef.id,
      ...newBusiness,
    };

    return res.status(201).json({
      success: true,
      message: 'Business profile created successfully',
      data: createdBusiness,
    });
  } catch (error: any) {
    console.error('[POST /api/businesses] Error creating business:', error);
    return res.status(500).json({
      success: false,
      message: 'Failed to create business profile',
      error: error.message || String(error),
    });
  }
});

export default router;
