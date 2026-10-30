import { initializeApp, getApps, getApp } from 'firebase/app';
import { getAuth } from 'firebase/auth';
import { getFirestore, initializeFirestore, Firestore, doc, getDocFromServer } from 'firebase/firestore';
import defaultFirebaseConfig from '../../firebase-applet-config.json';

export enum OperationType {
  CREATE = 'create',
  UPDATE = 'update',
  DELETE = 'delete',
  LIST = 'list',
  GET = 'get',
  WRITE = 'write',
}

export interface FirestoreErrorInfo {
  error: string;
  operationType: OperationType;
  path: string | null;
  authInfo: {
    userId?: string | null;
    email?: string | null;
    emailVerified?: boolean | null;
    isAnonymous?: boolean | null;
    tenantId?: string | null;
    providerInfo?: {
      providerId?: string | null;
      email?: string | null;
    }[];
  };
}

export function handleFirestoreError(error: unknown, operationType: OperationType, path: string | null): never {
  const errInfo: FirestoreErrorInfo = {
    error: error instanceof Error ? error.message : String(error),
    authInfo: {
      userId: auth?.currentUser?.uid,
      email: auth?.currentUser?.email,
      emailVerified: auth?.currentUser?.emailVerified,
      isAnonymous: auth?.currentUser?.isAnonymous,
      tenantId: auth?.currentUser?.tenantId,
      providerInfo: auth?.currentUser?.providerData?.map(provider => ({
        providerId: provider.providerId,
        email: provider.email,
      })) || [],
    },
    operationType,
    path,
  };
  if (errInfo.error.includes('the client is offline')) {
    console.warn('Firestore temporarily offline or initializing connection for path:', path);
  } else {
    console.error('Firestore Error:', JSON.stringify(errInfo));
  }
  throw new Error(JSON.stringify(errInfo));
}

// Support Vercel / Vite environment variables with graceful fallback to firebase-applet-config.json
export const activeFirebaseConfig = {
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY || defaultFirebaseConfig.apiKey || '',
  authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN || defaultFirebaseConfig.authDomain || '',
  projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID || defaultFirebaseConfig.projectId || '',
  storageBucket: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET || defaultFirebaseConfig.storageBucket || '',
  messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID || defaultFirebaseConfig.messagingSenderId || '',
  appId: import.meta.env.VITE_FIREBASE_APP_ID || defaultFirebaseConfig.appId || '',
  measurementId: import.meta.env.VITE_FIREBASE_MEASUREMENT_ID || defaultFirebaseConfig.measurementId || '',
};

export const activeFirestoreDatabaseId =
  import.meta.env.VITE_FIREBASE_FIRESTORE_DATABASE_ID ||
  defaultFirebaseConfig.firestoreDatabaseId ||
  '';

export const firebaseProjectInfo = {
  projectId: activeFirebaseConfig.projectId,
  authDomain: activeFirebaseConfig.authDomain,
  firestoreDatabaseId: activeFirestoreDatabaseId,
  isCustomEnvConfigured: Boolean(import.meta.env.VITE_FIREBASE_PROJECT_ID),
};

export interface FirebaseDiagnostic {
  isValid: boolean;
  projectId: string;
  authDomain: string;
  firestoreDatabaseId: string;
  hasApiKey: boolean;
  hasAppId: boolean;
  warnings: string[];
}

export function validateFirebaseConfig(): FirebaseDiagnostic {
  const warnings: string[] = [];
  if (!activeFirebaseConfig.apiKey) {
    warnings.push('Missing Firebase API Key (VITE_FIREBASE_API_KEY).');
  }
  if (!activeFirebaseConfig.projectId) {
    warnings.push('Missing Firebase Project ID (VITE_FIREBASE_PROJECT_ID).');
  }
  if (!activeFirebaseConfig.authDomain) {
    warnings.push('Missing Firebase Auth Domain (VITE_FIREBASE_AUTH_DOMAIN).');
  }
  if (!activeFirebaseConfig.appId) {
    warnings.push('Missing Firebase App ID (VITE_FIREBASE_APP_ID).');
  }
  if (!activeFirestoreDatabaseId) {
    warnings.push('Missing Firestore Database ID (VITE_FIREBASE_FIRESTORE_DATABASE_ID).');
  }

  return {
    isValid: warnings.length === 0,
    projectId: activeFirebaseConfig.projectId,
    authDomain: activeFirebaseConfig.authDomain,
    firestoreDatabaseId: activeFirestoreDatabaseId,
    hasApiKey: Boolean(activeFirebaseConfig.apiKey),
    hasAppId: Boolean(activeFirebaseConfig.appId),
    warnings,
  };
}

// Perform startup diagnostic validation (never prints secret keys)
export const startupDiagnostic = validateFirebaseConfig();
if (!startupDiagnostic.isValid) {
  console.warn('[Firebase Config Diagnostic] Warnings:', startupDiagnostic.warnings);
} else {
  console.info(`[Firebase Config Diagnostic] Connected to Project: "${startupDiagnostic.projectId}", Database: "${startupDiagnostic.firestoreDatabaseId}"`);
}

// Initialize Firebase App
export const app = !getApps().length ? initializeApp(activeFirebaseConfig) : getApp();

// CRITICAL: Initialize Firestore with custom databaseId and resilient long-polling
let firestoreDb: Firestore;
try {
  firestoreDb = initializeFirestore(
    app,
    {
      experimentalAutoDetectLongPolling: true,
    },
    activeFirestoreDatabaseId && activeFirestoreDatabaseId !== '(default)'
      ? activeFirestoreDatabaseId
      : undefined
  );
} catch {
  firestoreDb =
    activeFirestoreDatabaseId && activeFirestoreDatabaseId !== '(default)'
      ? getFirestore(app, activeFirestoreDatabaseId)
      : getFirestore(app);
}

export const db: Firestore = firestoreDb;

export const auth = getAuth(app);

// Connection test
export async function testConnection(): Promise<boolean> {
  try {
    await getDocFromServer(doc(db, 'test', 'connection'));
    return true;
  } catch (error) {
    if (error instanceof Error && error.message.includes('the client is offline')) {
      console.warn('Firebase client is offline or database initializing.');
      return false;
    }
    // permission-denied or other is normal for non-existent test document
    return true;
  }
}
