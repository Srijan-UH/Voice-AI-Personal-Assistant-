import { db, getFirebaseCredentialsStatus } from '../lib/firebase.js';
import { Business } from '../types/db.js';

async function runTest() {
  console.log('\n=====================================================');
  console.log('  Firestore Firebase Admin SDK End-to-End Connection Test');
  console.log('=====================================================\n');

  const status = getFirebaseCredentialsStatus();

  if (!status.isConfigured) {
    console.error('❌ [CONFIG ERROR] Cannot connect to Firestore. Missing required environment variables in /server/.env:\n');
    status.missing.forEach((varName) => console.error(`   - ${varName}`));
    console.error('\nPlease populate /server/.env with your Firebase Service Account key details:');
    console.error(`
FIREBASE_PROJECT_ID=your-firebase-project-id
FIREBASE_CLIENT_EMAIL=your-service-account@your-project.iam.gserviceaccount.com
FIREBASE_PRIVATE_KEY="-----BEGIN PRIVATE KEY-----\\nYOUR_KEY_HERE\\n-----END PRIVATE KEY-----\\n"
`);
    process.exit(1);
  }

  const testDocId = `test_biz_${Date.now()}`;
  const docRef = db.collection('businesses').doc(testDocId);

  try {
    const dummyBusiness: Omit<Business, 'id'> = {
      name: 'Firestore Connection Verification Biz',
      industryType: 'technology',
      ownerInfo: {
        name: 'CLI Connection Tester',
        email: 'test@voiceassistant.local',
      },
      languageSettings: {
        primaryLanguage: 'en-US',
      },
      createdAt: new Date().toISOString(),
    };

    // Step 1: Write dummy document
    console.log(`[Step 1/3] Writing dummy document to 'businesses/${testDocId}'...`);
    await docRef.set(dummyBusiness);
    console.log('  ✓ Write successful.');

    // Step 2: Read document back
    console.log(`[Step 2/3] Reading document back from Firestore...`);
    const docSnapshot = await docRef.get();
    if (!docSnapshot.exists) {
      throw new Error('Document was written but could not be read back.');
    }
    const retrievedData = docSnapshot.data();
    console.log('  ✓ Read successful. Document content:');
    console.log(JSON.stringify(retrievedData, null, 2));

    // Step 3: Delete document
    console.log(`[Step 3/3] Deleting dummy document 'businesses/${testDocId}'...`);
    await docRef.delete();

    // Verify deletion
    const verifySnapshot = await docRef.get();
    if (verifySnapshot.exists) {
      throw new Error('Document deletion failed, document still exists.');
    }
    console.log('  ✓ Cleanup/Delete verified successful.');

    console.log('\n=====================================================');
    console.log('  ✅ SUCCESS: Firestore Admin SDK connection works end-to-end!');
    console.log('=====================================================\n');
    process.exit(0);
  } catch (error: any) {
    console.error('\n❌ [TEST FAILURE] Firestore operation failed:');
    console.error(error);

    // Clean up if document was created
    try {
      await docRef.delete();
    } catch {}

    process.exit(1);
  }
}

runTest();
