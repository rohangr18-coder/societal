import { initializeApp, getApps, cert, applicationDefault, App } from 'firebase-admin/app';
import { getFirestore, Firestore } from 'firebase-admin/firestore';
import appletConfigJson from '../firebase-applet-config.json' with { type: 'json' };

const appletConfig = appletConfigJson as {
  projectId?: string;
  firestoreDatabaseId?: string;
};

export const DEFAULT_APPLET_PROJECT_ID = 'omega-plexus-n14dk';
export const DEFAULT_APPLET_DATABASE_ID = 'ai-studio-3944ed17-9bc7-40a0-9e59-d94f9b926b0e';

export const SERVER_NOT_CONFIGURED_RESPONSE = {
  success: false,
  code: 'SERVER_NOT_CONFIGURED',
  message: 'Server is missing Firebase credentials. Ask the admin to set FIREBASE_SERVICE_ACCOUNT_JSON.',
};

let adminAppInstance: App | null = null;
let hasAdminCredentials = false;
let warnedMissingVercelCreds = false;
let warnedMissingServiceAccount = false;

function hasAdcEnvironment(): boolean {
  return Boolean(
    process.env.GOOGLE_APPLICATION_CREDENTIALS?.trim() ||
      process.env.K_SERVICE ||
      process.env.GOOGLE_CLOUD_PROJECT ||
      process.env.GCLOUD_PROJECT ||
      process.env.GAE_APPLICATION
  );
}

/**
 * Returns true when FIREBASE_SERVICE_ACCOUNT_JSON is configured and valid,
 * or Application Default Credentials initialized in a GCP/ADC environment.
 */
export function adminConfigured(): boolean {
  if (hasAdminCredentials) return true;
  const serviceAccountJson = process.env.FIREBASE_SERVICE_ACCOUNT_JSON?.trim();
  if (serviceAccountJson) {
    try {
      const parsed = JSON.parse(serviceAccountJson);
      if (parsed && typeof parsed === 'object' && parsed.private_key && parsed.client_email) {
        return true;
      }
    } catch {
      return false;
    }
  }
  return false;
}

/**
 * Detects Firebase Admin credential / IAM permission errors so API endpoints can
 * return a consistent 503 SERVER_NOT_CONFIGURED JSON payload instead of opaque 500s.
 */
export function isCredentialOrPermissionError(err: unknown): boolean {
  if (!err || typeof err !== 'object') {
    const str = String(err || '');
    return /credential|PERMISSION_DENIED|UNAUTHENTICATED|Could not load the default credentials/i.test(str);
  }
  const e = err as { code?: unknown; message?: unknown; details?: unknown };
  const code = e.code;
  if (
    code === 7 ||
    code === 16 ||
    code === '7' ||
    code === '16' ||
    code === 'PERMISSION_DENIED' ||
    code === 'UNAUTHENTICATED'
  ) {
    return true;
  }
  const combined = `${String(e.message || '')} ${String(e.details || '')}`;
  return /credential|PERMISSION_DENIED|UNAUTHENTICATED|Could not load the default credentials/i.test(combined);
}

/**
 * Returns existing Admin app if present; otherwise initializes with:
 * - cert(JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT_JSON)) (replace \n with real newlines in private_key)
 * - else applicationDefault()
 * ProjectId from FIREBASE_PROJECT_ID / VITE_FIREBASE_PROJECT_ID / bundled firebase-applet-config.json.
 * Falls back to initializeApp({ projectId }) if credential loading fails.
 */
export function getAdminApp(): App {
  const existingApps = getApps();
  if (existingApps.length > 0) {
    return existingApps[0];
  }
  if (adminAppInstance) {
    return adminAppInstance;
  }

  const projectId =
    process.env.FIREBASE_PROJECT_ID ||
    process.env.VITE_FIREBASE_PROJECT_ID ||
    appletConfig.projectId ||
    DEFAULT_APPLET_PROJECT_ID;

  const serviceAccountJson = process.env.FIREBASE_SERVICE_ACCOUNT_JSON?.trim();

  try {
    if (serviceAccountJson) {
      const parsedServiceAccount = JSON.parse(serviceAccountJson);
      if (parsedServiceAccount.private_key && typeof parsedServiceAccount.private_key === 'string') {
        parsedServiceAccount.private_key = parsedServiceAccount.private_key.replace(/\\n/g, '\n');
      }
      adminAppInstance = initializeApp({
        credential: cert(parsedServiceAccount),
        projectId,
      });
      hasAdminCredentials = true;
      return adminAppInstance;
    }

    const adcAvailable = hasAdcEnvironment();

    if (process.env.VERCEL && !adcAvailable && !warnedMissingVercelCreds) {
      warnedMissingVercelCreds = true;
      console.error(
        '[firebaseAdmin] Missing FIREBASE_SERVICE_ACCOUNT_JSON on Vercel. Server verification and Firestore Admin operations require a service account.'
      );
    } else if (!warnedMissingServiceAccount && process.env.NODE_ENV !== 'test' && !adcAvailable) {
      warnedMissingServiceAccount = true;
      console.warn(
        '[firebaseAdmin] Neither FIREBASE_SERVICE_ACCOUNT_JSON nor GOOGLE_APPLICATION_CREDENTIALS is configured; falling back to Application Default Credentials / projectId.'
      );
    }

    try {
      adminAppInstance = initializeApp({
        credential: applicationDefault(),
        projectId,
      });
      hasAdminCredentials = adcAvailable;
      return adminAppInstance;
    } catch {
      hasAdminCredentials = false;
      adminAppInstance = initializeApp({ projectId });
      return adminAppInstance;
    }
  } catch (err) {
    hasAdminCredentials = false;
    console.error('[firebaseAdmin] Primary initialization failed, falling back to projectId-only:', err);
    adminAppInstance = initializeApp({ projectId });
    return adminAppInstance;
  }
}

/**
 * Returns the Firestore database instance pointing to the named database
 * from FIREBASE_FIRESTORE_DATABASE_ID / VITE_FIREBASE_FIRESTORE_DATABASE_ID / bundled firebase-applet-config.json / DEFAULT_APPLET_DATABASE_ID.
 */
export function adminDb(): Firestore {
  const app = getAdminApp();
  const databaseId =
    process.env.FIREBASE_FIRESTORE_DATABASE_ID ||
    process.env.VITE_FIREBASE_FIRESTORE_DATABASE_ID ||
    appletConfig.firestoreDatabaseId ||
    DEFAULT_APPLET_DATABASE_ID;

  if (databaseId && databaseId !== '(default)') {
    return getFirestore(app, databaseId);
  }
  return getFirestore(app);
}
