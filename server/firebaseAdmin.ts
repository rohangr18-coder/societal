import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { initializeApp, getApps, cert, applicationDefault, App } from 'firebase-admin/app';
import { getFirestore, Firestore } from 'firebase-admin/firestore';

export const DEFAULT_APPLET_PROJECT_ID = 'omega-plexus-n14dk';
export const DEFAULT_APPLET_DATABASE_ID = 'ai-studio-3944ed17-9bc7-40a0-9e59-d94f9b926b0e';

let adminAppInstance: App | null = null;
let cachedConfig: Record<string, any> | null = null;

function readAppletConfig(): Record<string, any> {
  if (cachedConfig) return cachedConfig;

  let currentDir = '';
  try {
    if (typeof __dirname !== 'undefined') {
      currentDir = __dirname;
    } else if (typeof import.meta !== 'undefined' && import.meta.url) {
      currentDir = path.dirname(fileURLToPath(import.meta.url));
    }
  } catch {
    // ignore
  }

  const candidatePaths = [
    path.resolve(process.cwd(), 'firebase-applet-config.json'),
    path.resolve(process.cwd(), '..', 'firebase-applet-config.json'),
    ...(currentDir ? [
      path.resolve(currentDir, 'firebase-applet-config.json'),
      path.resolve(currentDir, '..', 'firebase-applet-config.json'),
    ] : []),
    '/app/applet/firebase-applet-config.json',
  ];

  for (const p of candidatePaths) {
    try {
      if (fs.existsSync(p)) {
        const raw = fs.readFileSync(p, 'utf-8');
        cachedConfig = JSON.parse(raw);
        if (cachedConfig && (cachedConfig.projectId || cachedConfig.firestoreDatabaseId)) {
          return cachedConfig;
        }
      }
    } catch {
      // continue checking other candidates
    }
  }

  return {};
}

/**
 * Returns existing Admin app if present; otherwise initializes with:
 * - cert(JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT_JSON)) (replace \n with real newlines in private_key)
 * - else applicationDefault()
 * ProjectId from FIREBASE_PROJECT_ID / VITE_FIREBASE_PROJECT_ID / firebase-applet-config.json.
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

  const appletConfig = readAppletConfig();
  const projectId =
    process.env.FIREBASE_PROJECT_ID ||
    process.env.VITE_FIREBASE_PROJECT_ID ||
    appletConfig.projectId ||
    DEFAULT_APPLET_PROJECT_ID;

  try {
    if (process.env.FIREBASE_SERVICE_ACCOUNT_JSON) {
      let parsedServiceAccount = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT_JSON);
      if (parsedServiceAccount.private_key && typeof parsedServiceAccount.private_key === 'string') {
        parsedServiceAccount.private_key = parsedServiceAccount.private_key.replace(/\\n/g, '\n');
      }
      adminAppInstance = initializeApp({
        credential: cert(parsedServiceAccount),
        projectId,
      });
      return adminAppInstance;
    }

    try {
      adminAppInstance = initializeApp({
        credential: applicationDefault(),
        projectId,
      });
      return adminAppInstance;
    } catch {
      // applicationDefault not available, fall back to initializeApp({ projectId })
      adminAppInstance = initializeApp({ projectId });
      return adminAppInstance;
    }
  } catch (err) {
    console.warn('[firebaseAdmin] Primary initialization notice, falling back to projectId-only:', err);
    adminAppInstance = initializeApp({ projectId });
    return adminAppInstance;
  }
}

/**
 * Returns the Firestore database instance pointing to the named database (e.g. ai-studio-3944ed17-9bc7-40a0-9e59-d94f9b926b0e)
 * from FIREBASE_FIRESTORE_DATABASE_ID / VITE_FIREBASE_FIRESTORE_DATABASE_ID / firebase-applet-config.json firestoreDatabaseId / DEFAULT_APPLET_DATABASE_ID.
 */
export function adminDb(): Firestore {
  const app = getAdminApp();
  const appletConfig = readAppletConfig();
  const databaseId =
    process.env.FIREBASE_FIRESTORE_DATABASE_ID ||
    process.env.VITE_FIREBASE_FIRESTORE_DATABASE_ID ||
    appletConfig.firestoreDatabaseId ||
    DEFAULT_APPLET_DATABASE_ID;

  if (databaseId && databaseId !== '(default)') {
    return getFirestore(app, databaseId);
  }
  return getFirestore(app, DEFAULT_APPLET_DATABASE_ID);
}
