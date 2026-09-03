import { initializeApp, cert, getApps, getApp } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';
import { getAuth } from 'firebase-admin/auth';
import dotenv from 'dotenv';

dotenv.config();

export function getFirebaseCredentialsStatus() {
  const projectId = process.env.FIREBASE_PROJECT_ID?.trim();
  const clientEmail = process.env.FIREBASE_CLIENT_EMAIL?.trim();
  
  let privateKey = process.env.FIREBASE_PRIVATE_KEY?.trim();
  if (privateKey) {
    privateKey = privateKey.replace(/^["']|["']$/g, '').replace(/\\n/g, '\n');
  }

  const missing: string[] = [];
  if (!projectId) missing.push('FIREBASE_PROJECT_ID');
  if (!clientEmail) missing.push('FIREBASE_CLIENT_EMAIL');
  if (!privateKey) missing.push('FIREBASE_PRIVATE_KEY');

  return {
    isConfigured: missing.length === 0,
    missing,
    credentials: missing.length === 0 ? { projectId, clientEmail, privateKey } : null,
  };
}

/**
 * Initializes and exports the Firebase Admin SDK instances.
 * Handles unescaping newlines and stripping wrapping quotes from environment variables.
 */
function initFirebaseAdmin() {
  if (getApps().length === 0) {
    const status = getFirebaseCredentialsStatus();

    if (status.isConfigured && status.credentials) {
      initializeApp({
        credential: cert(status.credentials),
      });
      console.log('[Firebase Admin] Initialized with service account credentials.');
    } else {
      console.warn(
        `[Firebase Admin WARNING] Missing environment variable(s): ${status.missing.join(', ')} in /server/.env.`
      );
      initializeApp();
    }
  }

  return getApp();
}

export const app = initFirebaseAdmin();
export const db = getFirestore(app);
db.settings({ ignoreUndefinedProperties: true });
export const auth = getAuth(app);
