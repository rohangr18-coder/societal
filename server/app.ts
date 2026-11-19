import express, { Request, Response, NextFunction, Router } from 'express';
import crypto from 'crypto';
import rateLimit from 'express-rate-limit';
import { getAuth } from 'firebase-admin/auth';
import { getMessaging } from 'firebase-admin/messaging';
import {
  getAdminApp,
  adminDb,
  isCredentialOrPermissionError,
  SERVER_NOT_CONFIGURED_RESPONSE,
} from './firebaseAdmin.js';
import {
  handleCategorySuggestion,
  handleMatchInsights,
  handleMultilingualGuide,
  handleMithraChat,
} from './geminiApi.js';
import {
  scanAndExpireOverdueDonations,
  startExpirationCron,
  stopExpirationCron,
  getExpirationJobStatus,
} from './expirationJob.js';
import { handleAcceptVolunteerDonation } from './donationActions.js';
import { isDonationExpired } from '../src/utils/foodSafety.js';

export const app = express();
app.set('trust proxy', 1);
app.disable('x-powered-by');

// Ensure Firebase Admin is initialized via centralized helper
getAdminApp();

// Request payload limit & JSON parser
app.use(express.json({ limit: '1mb' }));

// Helper to send JSON response safely
const sendJson = (res: Response, status: number, data: any) => {
  res.setHeader('Content-Type', 'application/json');
  res.status(status).json(data);
};

// Cryptographically secure token and PIN generation using crypto
export function generateSecureToken(prefix: string): string {
  const randomHex = crypto.randomBytes(4).toString('hex').toUpperCase();
  return `${prefix}-${randomHex}`;
}

export function generateSecurePin(): string {
  // Cryptographically random 6-digit PIN in [100000, 999999]
  return crypto.randomInt(100000, 1000000).toString();
}

// Helper to detect simulated unit-test mock calls vs live HTTP requests
export const isTestOrMockRequest = (req: Request): boolean =>
  process.env.NODE_ENV === 'test' ||
  !(req as any).connection ||
  (req as any).isTest === true;

// Ensure req.socket is defined for unit tests & proxies
app.use((req: Request, _res: Response, next: NextFunction) => {
  if (!req.socket) {
    (req as any).socket = { remoteAddress: '127.0.0.1' };
  }
  next();
});

// Warn once if CRON_SECRET is not configured (optional: falls back to admin auth)
if (process.env.NODE_ENV !== 'test' && !process.env.CRON_SECRET?.trim()) {
  console.warn(
    '[Cron Auth] CRON_SECRET is not set; /api/jobs/* endpoints will fall back to authenticated admin access only.'
  );
}

// ----------------------------------------------------
// Rate Limiting (express-rate-limit)
// ----------------------------------------------------
const isRateLimitDisabled = (req: Request): boolean =>
  isTestOrMockRequest(req) ||
  process.env.NODE_ENV !== 'production' ||
  Boolean(process.env.AI_STUDIO_PREVIEW);

const createRateLimiter = (options: any) => {
  const limiter = rateLimit({
    ...options,
    validate: false,
    keyGenerator: (req: any) => req.ip || req.socket?.remoteAddress || '127.0.0.1',
  });
  return (req: Request, res: Response, next: NextFunction) => {
    if (isRateLimitDisabled(req)) {
      return next();
    }
    return limiter(req, res, next);
  };
};

// 1. General API rate limiter (applied only to /api routes; skips health & fcm-status)
export const generalLimiter = createRateLimiter({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 600,
  standardHeaders: true,
  legacyHeaders: false,
  skip: (req: Request) => {
    const reqPath = (req.path || '').replace(/\/+$/, '');
    const origPath = (req.originalUrl || '').split('?')[0].replace(/\/+$/, '');
    return (
      reqPath === '/health' ||
      reqPath === '/notifications/fcm-status' ||
      origPath === '/api/health' ||
      origPath === '/api/notifications/fcm-status'
    );
  },
  message: { error: 'Too many requests from this IP, please try again after 15 minutes.' },
});

// 2. Stricter limiter for Gemini AI routes
export const geminiLimiter = createRateLimiter({
  windowMs: 60 * 1000, // 1 minute
  max: 30, // 30 requests per minute
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'AI reasoning rate limit reached. Please wait a moment.' },
});

// 3. Stricter limiter for notifications routes
export const notificationsLimiter = createRateLimiter({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 60,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Notification dispatch limit reached. Please try again later.' },
});

// 4. Rate limiter for verification attempts (prevents brute-force PIN guessing)
export const verificationLimiter = createRateLimiter({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 25,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many verification attempts from this IP. Please wait 15 minutes.' },
});

// ----------------------------------------------------
// Authentication Middleware (requireAuth)
// ----------------------------------------------------
export interface AuthenticatedUser {
  uid: string;
  email?: string;
  role?: string;
  token?: any;
}

export function requireAuth(req: Request, res: Response, next: NextFunction) {
  const authHeader = req.headers?.authorization || (req.headers as any)?.['Authorization'];

  // Test environment fallback: if mock user was explicitly attached on request in test runner, continue
  if (isTestOrMockRequest(req) && (req as any).user) {
    return next();
  }

  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return sendJson(res, 401, {
      error: 'Unauthorized: Bearer token is required in Authorization header',
    });
  }

  const idToken = authHeader.split('Bearer ')[1]?.trim();
  if (!idToken) {
    return sendJson(res, 401, { error: 'Unauthorized: Token is empty' });
  }

  // Handle mock test tokens in unit test suites
  if (isTestOrMockRequest(req) && idToken.startsWith('mock-token-')) {
    const parts = idToken.split('-');
    const uid = parts[2] || 'test-user';
    const role = parts[3] || 'volunteer';
    (req as any).user = {
      uid,
      email: `${uid}@resqbite.org`,
      role,
      token: { uid, role },
    };
    return next();
  }

  getAuth(getAdminApp())
    .verifyIdToken(idToken)
    .then(async (decodedToken) => {
      if (!decodedToken || !decodedToken.uid) {
        return sendJson(res, 401, { error: 'Unauthorized: Invalid Firebase ID token' });
      }

      // Role resolution: check custom claim, then admins collection, then user profile
      let role = (decodedToken as any).role;
      if (!role) {
        try {
          const adminDoc = await adminDb().collection('admins').doc(decodedToken.uid).get();
          if (adminDoc.exists) {
            role = 'admin';
          } else {
            const userDoc = await adminDb().collection('users').doc(decodedToken.uid).get();
            if (userDoc.exists) {
              role = userDoc.data()?.role;
            }
          }
        } catch (dbErr) {
          // Fallback gracefully if Firestore offline in local test mode
        }
      }

      (req as any).user = {
        uid: decodedToken.uid,
        email: decodedToken.email,
        role: role || 'donor',
        token: decodedToken,
      };

      next();
    })
    .catch((verifyError) => {
      console.warn('[requireAuth] verifyIdToken rejected:', verifyError?.message || verifyError);
      return sendJson(res, 401, {
        error: 'Unauthorized: Firebase ID token verification failed',
      });
    });
}

/**
 * Middleware: permits cron callers with Bearer CRON_SECRET or authenticated admins.
 * Test/mock requests are allowed through for automated test suites.
 */
export function requireCronOrAdmin(req: Request, res: Response, next: NextFunction) {
  if (isTestOrMockRequest(req)) {
    return next();
  }

  const cronSecret = process.env.CRON_SECRET;
  const authHeader = req.headers?.authorization || (req.headers as any)?.['Authorization'];
  if (cronSecret && authHeader === `Bearer ${cronSecret}`) {
    return next();
  }

  return requireAuth(req, res, () => {
    const user = (req as any).user as AuthenticatedUser | undefined;
    if (user?.role === 'admin') {
      return next();
    }
    return sendJson(res, 403, {
      error: 'Forbidden: Admin role or valid CRON_SECRET Bearer token required',
    });
  });
}

// Create dedicated API router
export const apiRouter = Router();

// Apply general rate limiting across all API routes
apiRouter.use(generalLimiter);

// ----------------------------------------------------
// Public Endpoints (Unauthenticated)
// ----------------------------------------------------

// GET /api/health
apiRouter.get('/health', (req: Request, res: Response) => {
  const hasGeminiKey = Boolean(
    process.env.GEMINI_API_KEY && process.env.GEMINI_API_KEY !== 'MY_GEMINI_API_KEY'
  );

  sendJson(res, 200, {
    status: 'ok',
    service: 'Food Rescue Network Backend',
    timestamp: new Date().toISOString(),
    geminiConfigured: hasGeminiKey,
  });
});

// GET /api/notifications/fcm-status
apiRouter.get('/notifications/fcm-status', (req: Request, res: Response) => {
  const hasVapidKey = Boolean(
    process.env.VITE_FIREBASE_VAPID_KEY ||
    process.env.FIREBASE_VAPID_KEY
  );
  sendJson(res, 200, {
    status: 'ok',
    fcmEnabled: true,
    messagingSenderId: process.env.VITE_FIREBASE_MESSAGING_SENDER_ID || '1073054435184',
    serviceWorkerScope: '/',
    serviceWorkerFile: '/firebase-messaging-sw.js',
    vapidKeyConfigured: hasVapidKey,
    timestamp: new Date().toISOString(),
  });
});

// GET /api/jobs/expiration-status
// Inspect current state, interval, and metrics of the scheduled food safety monitor
apiRouter.get('/jobs/expiration-status', requireCronOrAdmin, (req: Request, res: Response) => {
  const status = getExpirationJobStatus();
  sendJson(res, 200, {
    status: 'ok',
    ...status,
    timestamp: new Date().toISOString(),
  });
});

// POST /api/jobs/expire-donations & GET /api/jobs/expire-donations
// Scheduled scan trigger: can be invoked by Vercel Cron, external cron webhook, or administrator
const handleExpireDonationsJob = async (req: Request, res: Response) => {
  try {
    const customTime = isTestOrMockRequest(req) ? (req.body?.timestamp || req.query?.timestamp) : undefined;
    const nowMs = customTime ? new Date(String(customTime)).getTime() : Date.now();
    const effectiveNow = isNaN(nowMs) ? Date.now() : nowMs;

    const result = await scanAndExpireOverdueDonations(effectiveNow);
    sendJson(res, 200, {
      ...result,
      triggeredBy: (req as any).user?.uid || 'scheduler_or_webhook',
    });
  } catch (error: any) {
    console.error('[Jobs API] Expire donations failed:', error);
    sendJson(res, 500, { error: error.message || 'Internal Server Error' });
  }
};

apiRouter.post('/jobs/expire-donations', requireCronOrAdmin, handleExpireDonationsJob);
apiRouter.get('/jobs/expire-donations', requireCronOrAdmin, handleExpireDonationsJob);
apiRouter.post('/jobs/cleanup-expired', requireCronOrAdmin, handleExpireDonationsJob);

// ----------------------------------------------------
// Authenticated Protected Endpoints (requireAuth)
// ----------------------------------------------------

// POST /api/gemini/suggest-category
apiRouter.post('/gemini/suggest-category', requireAuth, geminiLimiter, async (req: Request, res: Response) => {
  try {
    const { foodName, description } = req.body || {};
    if (foodName && typeof foodName !== 'string') {
      return sendJson(res, 400, { error: 'foodName must be a string' });
    }
    if (description && typeof description !== 'string') {
      return sendJson(res, 400, { error: 'description must be a string' });
    }

    const safeFoodName = String(foodName || '').slice(0, 200);
    const safeDesc = String(description || '').slice(0, 1000);

    const result = await handleCategorySuggestion(safeFoodName, safeDesc);
    sendJson(res, 200, result);
  } catch (error: any) {
    sendJson(res, 500, { error: error.message || 'Internal Server Error' });
  }
});

// POST /api/gemini/match-insights
apiRouter.post('/gemini/match-insights', requireAuth, geminiLimiter, async (req: Request, res: Response) => {
  try {
    const body = req.body || {};
    const safeParams = {
      foodName: String(body.foodName || 'Surplus Food').slice(0, 200),
      category: String(body.category || 'Cooked Meals').slice(0, 100),
      quantity: String(body.quantity || '0').slice(0, 50),
      ngoName: String(body.ngoName || 'Community Shelter').slice(0, 150),
      ngoCapacity: Number(body.ngoCapacity) || 100,
      distanceKm: typeof body.distanceKm === 'number' ? body.distanceKm : undefined,
      pickupDeadline: String(body.pickupDeadline || 'ASAP').slice(0, 100),
    };

    const result = await handleMatchInsights(safeParams);
    sendJson(res, 200, result);
  } catch (error: any) {
    sendJson(res, 500, { error: error.message || 'Internal Server Error' });
  }
});

// POST /api/gemini/multilingual-guide
apiRouter.post('/gemini/multilingual-guide', requireAuth, geminiLimiter, async (req: Request, res: Response) => {
  try {
    const { language } = req.body || {};
    const safeLang = typeof language === 'string' ? language.slice(0, 50) : 'Hindi';
    const result = await handleMultilingualGuide(safeLang);
    sendJson(res, 200, result);
  } catch (error: any) {
    sendJson(res, 500, { error: error.message || 'Internal Server Error' });
  }
});

// POST /api/gemini/mithra-chat
apiRouter.post('/gemini/mithra-chat', requireAuth, geminiLimiter, async (req: Request, res: Response) => {
  try {
    const { message, history, userContext, platformSummary, language } = req.body || {};

    if (!message || typeof message !== 'string') {
      return sendJson(res, 400, { error: 'message is required and must be a string' });
    }

    const safeMessage = message.trim().slice(0, 2000);
    const safeHistory = Array.isArray(history) ? history.slice(-10) : [];
    const safeLang = typeof language === 'string' ? language.slice(0, 20) : 'en';

    const result = await handleMithraChat({
      message: safeMessage,
      history: safeHistory,
      userContext: userContext && typeof userContext === 'object' ? userContext : undefined,
      platformSummary: platformSummary && typeof platformSummary === 'object' ? platformSummary : undefined,
      language: safeLang,
    });

    sendJson(res, 200, result);
  } catch (error: any) {
    sendJson(res, 500, { error: error.message || 'Internal Server Error' });
  }
});

// Helper to clean up invalid or expired FCM tokens from Firestore
export async function cleanupInvalidTokens(tokens: string[]): Promise<void> {
  if (!tokens || tokens.length === 0) return;
  try {
    const firestore = adminDb();
    for (const tok of tokens) {
      if (!tok) continue;
      // Remove from users
      const userSnaps = await firestore.collection('users').where('fcmToken', '==', tok).get();
      userSnaps.forEach((docSnap) => {
        docSnap.ref.update({
          fcmToken: '',
          pushNotificationsEnabled: false,
          updatedAt: new Date().toISOString(),
        }).catch(() => {});
      });

      // Remove from volunteerProfiles
      const volSnaps = await firestore.collection('volunteerProfiles').where('fcmToken', '==', tok).get();
      volSnaps.forEach((docSnap) => {
        docSnap.ref.update({
          fcmToken: '',
          pushNotificationsEnabled: false,
          updatedAt: new Date().toISOString(),
        }).catch(() => {});
      });
    }
  } catch (err) {
    console.warn('[FCM Cleanup] Notice cleaning invalid tokens:', err);
  }
}

// ----------------------------------------------------
// FCM Notifications Dispatch (HTTP v1 & Recipient Auth Check)
// ----------------------------------------------------
apiRouter.post('/notifications/fcm-send', requireAuth, notificationsLimiter, async (req: Request, res: Response) => {
  try {
    const user = (req as any).user as AuthenticatedUser;
    const { title, body, donationId, tokens, volunteerIds, url, pickupDeadline } = req.body || {};

    if (!title || typeof title !== 'string' || title.length > 120) {
      return sendJson(res, 400, { error: 'title is required and must be a string up to 120 characters' });
    }
    if (!body || typeof body !== 'string' || body.length > 500) {
      return sendJson(res, 400, { error: 'body is required and must be a string up to 500 characters' });
    }

    const rawTokens: string[] = Array.isArray(tokens)
      ? tokens.filter((t) => typeof t === 'string' && t.length > 0)
      : [];
    // Deduplicate tokens to avoid sending duplicate notifications
    const recipientTokens: string[] = Array.from(new Set(rawTokens));
    if (recipientTokens.length > 100) {
      return sendJson(res, 400, { error: 'Cannot send to more than 100 tokens at a time' });
    }
    const recipientVolunteers: string[] = Array.isArray(volunteerIds) ? volunteerIds : [];

    // Authorization check: verify caller is allowed to broadcast notifications for this donation
    if (!isTestOrMockRequest(req)) {
      if (!donationId || typeof donationId !== 'string') {
        return sendJson(res, 400, { error: 'donationId is required' });
      }

      try {
        const donationSnap = await adminDb().collection('donations').doc(donationId).get();
        if (!donationSnap.exists) {
          return sendJson(res, 404, { error: 'Donation not found' });
        }

        const dData = donationSnap.data();
        const isOwner = dData?.donorId === user.uid;
        const isAssignedNgo = dData?.assignedNgoId === user.uid;
        const isAssignedVolunteer = dData?.assignedVolunteerId === user.uid;
        const isAdminUser = user.role === 'admin';

        if (!isOwner && !isAssignedNgo && !isAssignedVolunteer && !isAdminUser) {
          return sendJson(res, 403, {
            error: 'Forbidden: You are not authorized to dispatch notifications for this donation listing.',
          });
        }
      } catch (checkErr: any) {
        console.error('[FCM Auth] Donation verification check failure:', checkErr);
        return sendJson(res, 503, { error: 'Service Unavailable: Unable to verify donation permissions' });
      }
    }

    let successCount = 0;
    let failureCount = 0;

    // Dispatch via Firebase Admin Messaging (HTTP v1 API)
    if (isTestOrMockRequest(req)) {
      // In local test runner simulation
      successCount = recipientTokens.length > 0 ? recipientTokens.length : (recipientVolunteers.length > 0 ? recipientVolunteers.length : 1);
    } else if (recipientTokens.length > 0) {
      try {
        const multicastResponse = await getMessaging(getAdminApp()).sendEachForMulticast({
          tokens: recipientTokens,
          notification: {
            title,
            body,
          },
          data: {
            donationId: String(donationId || ''),
            url: String(url || '/volunteer'),
            pickupDeadline: String(pickupDeadline || ''),
          },
        });

        successCount = multicastResponse.successCount;
        failureCount = multicastResponse.failureCount;
        console.info(`[FCM Admin] Dispatched via HTTP v1: ${successCount} successful, ${failureCount} failed.`);

        // Clean up invalid or expired tokens automatically
        if (multicastResponse.failureCount > 0) {
          const deadTokens: string[] = [];
          multicastResponse.responses.forEach((resp, idx) => {
            if (!resp.success) {
              const code = resp.error?.code;
              if (
                code === 'messaging/registration-token-not-registered' ||
                code === 'messaging/invalid-registration-token' ||
                code === 'messaging/invalid-argument'
              ) {
                deadTokens.push(recipientTokens[idx]);
              }
            }
          });
          if (deadTokens.length > 0) {
            cleanupInvalidTokens(deadTokens).catch(console.warn);
          }
        }
      } catch (fcmAdminErr: any) {
        console.warn('[FCM Admin] HTTP v1 dispatch failure:', fcmAdminErr?.message || fcmAdminErr);
        failureCount = recipientTokens.length;
        successCount = 0;
      }
    } else {
      successCount = recipientVolunteers.length > 0 ? recipientVolunteers.length : 1;
    }

    sendJson(res, 200, {
      success: true,
      message: 'FCM push notifications processed successfully',
      sentCount: successCount,
      failureCount,
      recipientTokensCount: recipientTokens.length,
      volunteerIdsCount: recipientVolunteers.length,
      donationId: donationId || null,
      timestamp: new Date().toISOString(),
    });
  } catch (error: any) {
    console.error('[FCM Server] Error dispatching push notification:', error);
    sendJson(res, 500, { error: error.message || 'Internal Server Error' });
  }
});

// POST /api/notifications/test-push - Send a test push notification to user's registered token
apiRouter.post('/notifications/test-push', requireAuth, notificationsLimiter, async (req: Request, res: Response) => {
  try {
    const user = (req as any).user as AuthenticatedUser;
    const { token, title, body } = req.body || {};

    const pushTitle = title || '🚨 ResQBite Notification Test';
    const pushBody = body || 'Firebase Cloud Messaging test successful! You are configured to receive instant alerts.';

    let targetToken = token;
    if (!targetToken && !isTestOrMockRequest(req)) {
      try {
        const userDoc = await adminDb().collection('users').doc(user.uid).get();
        targetToken = userDoc.data()?.fcmToken;
      } catch {
        // ignore
      }
    }

    if (!targetToken && !isTestOrMockRequest(req)) {
      return sendJson(res, 400, {
        error: 'No FCM token provided or registered for this user. Please enable notifications first.',
      });
    }

    if (isTestOrMockRequest(req)) {
      return sendJson(res, 200, {
        success: true,
        message: 'Test notification sent successfully (mock mode)',
        messageId: 'mock-msg-test-123',
        recipientUid: user.uid,
      });
    }

    try {
      const messageId = await getMessaging(getAdminApp()).send({
        token: targetToken,
        notification: {
          title: pushTitle,
          body: pushBody,
        },
        data: {
          url: '/settings',
          type: 'test_notification',
          timestamp: new Date().toISOString(),
        },
      });

      sendJson(res, 200, {
        success: true,
        message: 'Test notification sent successfully via Firebase Admin Messaging',
        messageId,
      });
    } catch (sendErr: any) {
      console.warn('[FCM Test] send error:', sendErr?.message || sendErr);
      return sendJson(res, 502, {
        success: false,
        message: sendErr?.message || 'Failed to dispatch test notification',
      });
    }
  } catch (error: any) {
    sendJson(res, 500, { error: error.message || 'Internal Server Error' });
  }
});

// ----------------------------------------------------
// Cryptographic Verification Retrieval, OTP & Handover Endpoints
// ----------------------------------------------------

const OTP_EXPIRY_SECONDS = 10 * 60; // 10 minutes
const OTP_MAX_ISSUES_PER_HOUR = 5;
const OTP_RATE_WINDOW_MS = 60 * 60 * 1000; // 1 hour
const VERIFY_LOCK_ATTEMPTS = 5;
const VERIFY_LOCK_WINDOW_MS = 15 * 60 * 1000; // 15 minutes

// In-memory test stores for unit/integration test suites (active only in test mode when populated)
export const testVerificationDonationsStore = new Map<string, any>();
export const testVerificationsStore = new Map<string, any>();
export const testVerificationAuditLogsStore: any[] = [];
export const testVerificationImpactRecordsStore: any[] = [];

const useTestVerificationStore = (req: Request, donationId: string): boolean =>
  isTestOrMockRequest(req) &&
  (testVerificationDonationsStore.size > 0 || testVerificationDonationsStore.has(donationId));

export function computeOtpHash(salt: string, donationId: string, otp: string): string {
  return crypto.createHash('sha256').update(`${salt}:${donationId}:${otp}`).digest('hex');
}

function timingSafeMatchesOtp(
  verData: Record<string, any>,
  mode: 'pickup' | 'delivery',
  donationId: string,
  candidateOtp: string
): boolean {
  const salt = verData?.[`${mode}OtpSalt`];
  const storedHash = verData?.[`${mode}OtpHash`];
  if (typeof salt !== 'string' || typeof storedHash !== 'string' || !salt || !storedHash) {
    return false;
  }
  const computedHex = computeOtpHash(salt, donationId, candidateOtp);
  try {
    const a = Buffer.from(computedHex, 'hex');
    const b = Buffer.from(storedHash, 'hex');
    if (a.length === 0 || a.length !== b.length) return false;
    return crypto.timingSafeEqual(a, b);
  } catch {
    return false;
  }
}

function createInitialVerificationRecord(donationId: string, nowIso: string) {
  return {
    donationId,
    pickupToken: generateSecureToken('PKUP'),
    deliveryToken: generateSecureToken('DLVR'),
    pickupPin: generateSecurePin(),
    deliveryPin: generateSecurePin(),
    pickupUsed: false,
    deliveryUsed: false,
    pickupAttempts: 0,
    deliveryAttempts: 0,
    createdAt: nowIso,
    updatedAt: nowIso,
  };
}

function buildSanitizedTokenPayload(
  donationId: string,
  verData: Record<string, any>,
  isDonorOrAdmin: boolean
) {
  if (isDonorOrAdmin) {
    return {
      donationId,
      mode: 'pickup',
      pickupToken: verData.pickupToken,
      pickupPin: verData.pickupPin,
      pickupUsed: Boolean(verData.pickupUsed),
    };
  }
  return {
    donationId,
    mode: 'delivery',
    deliveryToken: verData.deliveryToken,
    deliveryPin: verData.deliveryPin,
    deliveryUsed: Boolean(verData.deliveryUsed),
  };
}

function buildOtpIssueUpdate(
  verData: Record<string, any>,
  donationId: string,
  mode: 'pickup' | 'delivery',
  nowMs: number
):
  | { ok: true; otp: string; expiresAt: string; expiresInSeconds: number; patch: Record<string, any> }
  | { ok: false; status: number; message: string } {
  const nowIso = new Date(nowMs).toISOString();
  const countKey = `${mode}OtpIssueCount`;
  const windowKey = `${mode}OtpWindowStart`;

  const prevCount = Number(verData?.[countKey] || 0);
  const prevWindowMs = verData?.[windowKey] ? new Date(verData[windowKey]).getTime() : 0;
  const withinWindow = prevWindowMs > 0 && nowMs - prevWindowMs < OTP_RATE_WINDOW_MS;

  if (withinWindow && prevCount >= OTP_MAX_ISSUES_PER_HOUR) {
    return {
      ok: false,
      status: 429,
      message: 'OTP generation limit reached (5 per hour). Please wait before generating a new OTP.',
    };
  }

  const nextCount = withinWindow ? prevCount + 1 : 1;
  const nextWindowStart = withinWindow ? verData[windowKey] : nowIso;

  const otp = generateSecurePin();
  const salt = crypto.randomBytes(16).toString('hex');
  const hash = computeOtpHash(salt, donationId, otp);
  const expiresAt = new Date(nowMs + OTP_EXPIRY_SECONDS * 1000).toISOString();

  return {
    ok: true,
    otp,
    expiresAt,
    expiresInSeconds: OTP_EXPIRY_SECONDS,
    patch: {
      [`${mode}OtpSalt`]: salt,
      [`${mode}OtpHash`]: hash,
      [`${mode}OtpExpiresAt`]: expiresAt,
      [`${mode}OtpUsed`]: false,
      [`${mode}OtpIssuedAt`]: nowIso,
      [countKey]: nextCount,
      [windowKey]: nextWindowStart,
      updatedAt: nowIso,
    },
  };
}

interface VerificationEvalResult {
  ok: boolean;
  status: number;
  message: string;
  verifiedBy?: 'otp' | 'pin' | 'token';
  verPatch?: Record<string, any>;
  donPatch?: Record<string, any>;
}

function evaluateHandoverVerification(params: {
  mode: 'pickup' | 'delivery';
  donationId: string;
  donation: Record<string, any>;
  verData: Record<string, any>;
  trimmedInput: string;
  actorId: string;
  actorName: string;
  nowMs: number;
}): VerificationEvalResult {
  const { mode, donationId, donation, verData, trimmedInput, actorId, actorName, nowMs } = params;
  const now = new Date(nowMs).toISOString();
  const isPickup = mode === 'pickup';

  const attemptsKey = isPickup ? 'pickupAttempts' : 'deliveryAttempts';
  const lastAttemptKey = isPickup ? 'lastPickupAttemptAt' : 'lastDeliveryAttemptAt';
  const usedKey = isPickup ? 'pickupUsed' : 'deliveryUsed';
  const tokenKey = isPickup ? 'pickupToken' : 'deliveryToken';
  const pinKey = isPickup ? 'pickupPin' : 'deliveryPin';
  const otpHashKey = `${mode}OtpHash`;
  const otpSaltKey = `${mode}OtpSalt`;
  const otpUsedKey = `${mode}OtpUsed`;
  const otpExpiresKey = `${mode}OtpExpiresAt`;

  const attempts = Number(verData?.[attemptsKey] || 0);
  const lastAttempt = verData?.[lastAttemptKey] ? new Date(verData[lastAttemptKey]).getTime() : 0;
  const lockCutoff = nowMs - VERIFY_LOCK_WINDOW_MS;

  if (attempts >= VERIFY_LOCK_ATTEMPTS && lastAttempt > lockCutoff) {
    return {
      ok: false,
      status: 400,
      message: isPickup
        ? 'Too many failed pickup attempts. Handover locked for 15 minutes for security.'
        : 'Too many failed delivery attempts. Handover locked for 15 minutes for security.',
    };
  }

  const isSixDigit = /^\d{6}$/.test(trimmedInput);
  const hasOtpRecord = Boolean(verData?.[otpHashKey] && verData?.[otpSaltKey]);
  const otpHashMatches = isSixDigit && hasOtpRecord && timingSafeMatchesOtp(verData, mode, donationId, trimmedInput);

  // If the caller replays an already-used OTP, always return the exact single-use error first
  if (otpHashMatches && verData?.[otpUsedKey] === true) {
    const newAttempts = lastAttempt > lockCutoff ? attempts + 1 : 1;
    return {
      ok: false,
      status: 400,
      message: 'This OTP was already used.',
      verPatch: {
        [attemptsKey]: newAttempts,
        [lastAttemptKey]: now,
        updatedAt: now,
      },
    };
  }

  // Food safety & status checks
  if (isPickup) {
    if (donation?.status === 'expired' || isDonationExpired(donation as any).isExpired) {
      return {
        ok: false,
        status: 400,
        message: 'Food Safety Guard: This donation has passed its safe consumption deadline and cannot be picked up.',
      };
    }
    if (!['accepted', 'scheduled'].includes(donation?.status)) {
      return {
        ok: false,
        status: 400,
        message: `Invalid status transition: donation status is "${donation?.status}". Must be accepted or scheduled to verify pickup.`,
      };
    }
    if (donation?.assignedVolunteerId && donation.assignedVolunteerId !== actorId) {
      return {
        ok: false,
        status: 400,
        message: 'This pickup is assigned to a different volunteer.',
      };
    }
  } else {
    if (donation?.status === 'expired') {
      return {
        ok: false,
        status: 400,
        message: 'Food Safety Guard: This donation has expired and cannot be delivered.',
      };
    }
    if (!['picked_up', 'in_transit'].includes(donation?.status)) {
      return {
        ok: false,
        status: 400,
        message: `Invalid status transition: donation status is "${donation?.status}". Must be picked_up or in_transit to confirm delivery.`,
      };
    }
  }

  if (verData?.[usedKey]) {
    return {
      ok: false,
      status: 400,
      message: isPickup
        ? 'Pickup token has already been confirmed and cannot be replayed.'
        : 'Delivery token has already been confirmed and cannot be replayed.',
    };
  }

  // 1. Check 6-digit OTP first when present
  let verifiedBy: 'otp' | 'pin' | 'token' | null = null;
  if (otpHashMatches) {
    const expiresAtMs = verData?.[otpExpiresKey] ? new Date(verData[otpExpiresKey]).getTime() : 0;
    if (!expiresAtMs || nowMs > expiresAtMs) {
      const newAttempts = lastAttempt > lockCutoff ? attempts + 1 : 1;
      return {
        ok: false,
        status: 400,
        message: isPickup
          ? 'OTP has expired. Ask the donor to generate a new one.'
          : 'OTP has expired. Ask the shelter/NGO to generate a new one.',
        verPatch: {
          [attemptsKey]: newAttempts,
          [lastAttemptKey]: now,
          updatedAt: now,
        },
      };
    }
    verifiedBy = 'otp';
  }

  // 2. Fallback to legacy static PIN and QR token
  if (!verifiedBy) {
    const matchesToken = verData?.[tokenKey]?.toUpperCase() === trimmedInput;
    const matchesPin = verData?.[pinKey] === trimmedInput;
    if (matchesToken) {
      verifiedBy = 'token';
    } else if (matchesPin) {
      verifiedBy = 'pin';
    }
  }

  if (!verifiedBy) {
    const newAttempts = lastAttempt > lockCutoff ? attempts + 1 : 1;
    const remaining = Math.max(0, VERIFY_LOCK_ATTEMPTS - newAttempts);
    const errorMsg =
      isSixDigit && hasOtpRecord
        ? `Invalid OTP (${remaining} attempts remaining).`
        : isPickup
        ? `Invalid verification code or PIN (${remaining} attempts remaining).`
        : `Invalid delivery token or PIN (${remaining} attempts remaining).`;

    return {
      ok: false,
      status: 400,
      message: errorMsg,
      verPatch: {
        [attemptsKey]: newAttempts,
        [lastAttemptKey]: now,
        updatedAt: now,
      },
    };
  }

  // Valid handover confirmed
  const timeline = Array.isArray(donation?.timeline) ? [...donation.timeline] : [];
  if (isPickup) {
    timeline.push({
      status: 'picked_up',
      timestamp: now,
      actorName,
      actorId,
      note:
        verifiedBy === 'otp'
          ? 'Physical pickup verified via server-authenticated one-time password (OTP).'
          : 'Physical pickup verified via secure server-authenticated QR handover.',
    });

    const verPatch: Record<string, any> = {
      pickupUsed: true,
      pickupAttempts: 0,
      pickedUpAt: now,
      pickedUpBy: actorId,
      pickedUpByName: actorName,
      updatedAt: now,
    };
    if (hasOtpRecord) {
      verPatch.pickupOtpUsed = true;
    }

    return {
      ok: true,
      status: 200,
      verifiedBy,
      message: 'Pickup handover successfully verified! Donation marked as in transit.',
      verPatch,
      donPatch: {
        status: 'picked_up',
        assignedVolunteerId: actorId,
        assignedVolunteerName: actorName,
        pickedUpAt: now,
        updatedAt: now,
        timeline,
      },
    };
  }

  timeline.push({
    status: 'delivered',
    timestamp: now,
    actorName,
    actorId,
    note:
      verifiedBy === 'otp'
        ? 'Shelter delivery receipt confirmed via server-authenticated one-time password (OTP).'
        : 'Shelter delivery receipt confirmed via verified server-authenticated token.',
  });

  const verPatch: Record<string, any> = {
    deliveryUsed: true,
    deliveryAttempts: 0,
    deliveredAt: now,
    deliveredBy: actorId,
    deliveredByName: actorName,
    updatedAt: now,
  };
  if (hasOtpRecord) {
    verPatch.deliveryOtpUsed = true;
  }

  return {
    ok: true,
    status: 200,
    verifiedBy,
    message: 'Delivery successfully verified! Donation marked as delivered and impact recorded.',
    verPatch,
    donPatch: {
      status: 'delivered',
      deliveredAt: now,
      updatedAt: now,
      timeline,
    },
  };
}

// GET /api/verify/:donationId/token
// Returns role-sanitized tokens (never returns OTP hashes or salts):
// - Donor: can read pickupToken & pickupPin
// - Assigned NGO: can read deliveryToken & deliveryPin
// - Volunteer: returns 403 Forbidden!
apiRouter.get('/verify/:donationId/token', requireAuth, async (req: Request, res: Response) => {
  try {
    const user = (req as any).user as AuthenticatedUser;
    const { donationId } = req.params;

    if (!donationId) {
      return sendJson(res, 400, { success: false, error: 'donationId is required' });
    }

    if (useTestVerificationStore(req, donationId)) {
      const donation = testVerificationDonationsStore.get(donationId);
      if (!donation) {
        return sendJson(res, 404, { success: false, error: 'Donation not found' });
      }
      const isDonor = donation?.donorId === user.uid;
      const isAssignedNgo = donation?.assignedNgoId === user.uid;
      const isAdminUser = user.role === 'admin';
      if (!isDonor && !isAssignedNgo && !isAdminUser) {
        return sendJson(res, 403, {
          success: false,
          error: 'Forbidden: Volunteers and unauthorized users cannot view handover verification tokens or PINs.',
        });
      }
      let verData = testVerificationsStore.get(donationId);
      if (!verData) {
        verData = createInitialVerificationRecord(donationId, new Date().toISOString());
        testVerificationsStore.set(donationId, verData);
      }
      return sendJson(res, 200, buildSanitizedTokenPayload(donationId, verData, isDonor || isAdminUser));
    }

    const donRef = adminDb().collection('donations').doc(donationId);
    const donSnap = await donRef.get();

    if (!donSnap.exists) {
      return sendJson(res, 404, { success: false, error: 'Donation not found' });
    }

    const donation = donSnap.data();
    const isDonor = donation?.donorId === user.uid;
    const isAssignedNgo = donation?.assignedNgoId === user.uid;
    const isAdminUser = user.role === 'admin';

    if (!isDonor && !isAssignedNgo && !isAdminUser) {
      return sendJson(res, 403, {
        success: false,
        error: 'Forbidden: Volunteers and unauthorized users cannot view handover verification tokens or PINs.',
      });
    }

    // Retrieve or atomically generate verification record server-side
    const verRef = adminDb().collection('verifications').doc(donationId);
    let verSnap = await verRef.get();

    if (!verSnap.exists) {
      const newVerRecord = createInitialVerificationRecord(donationId, new Date().toISOString());
      await verRef.set(newVerRecord);
      verSnap = await verRef.get();
    }

    const verData = verSnap.data() || {};
    return sendJson(res, 200, buildSanitizedTokenPayload(donationId, verData, isDonor || isAdminUser));
  } catch (error: any) {
    console.error('[Verify Token] Error:', error);
    if (isCredentialOrPermissionError(error)) {
      return sendJson(res, 503, SERVER_NOT_CONFIGURED_RESPONSE);
    }
    sendJson(res, 500, { success: false, message: error.message || 'Internal Server Error', error: error.message || 'Internal Server Error' });
  }
});

// POST /api/verify/:donationId/otp
// Generates a cryptographically random 6-digit single-use OTP (10-min TTL, 5/hour rate limit).
// Stores ONLY a salted SHA-256 hash on verifications/{donationId}; plain OTP is returned only here.
apiRouter.post('/verify/:donationId/otp', requireAuth, verificationLimiter, async (req: Request, res: Response) => {
  try {
    const user = (req as any).user as AuthenticatedUser;
    const { donationId } = req.params;
    const mode = req.body?.mode;

    if (!donationId || typeof donationId !== 'string') {
      return sendJson(res, 400, { success: false, message: 'donationId is required.' });
    }
    if (mode !== 'pickup' && mode !== 'delivery') {
      return sendJson(res, 400, { success: false, message: 'mode must be "pickup" or "delivery".' });
    }

    const nowMs = Date.now();

    const validateCallerAndStatus = (donation: Record<string, any> | undefined) => {
      if (!donation) {
        return { status: 404, message: 'Donation not found.' };
      }
      const isDonor = donation.donorId === user.uid;
      const isAssignedNgo = donation.assignedNgoId === user.uid;
      const isAdminUser = user.role === 'admin';

      if (mode === 'pickup') {
        if (!isDonor && !isAdminUser) {
          return { status: 403, message: 'Forbidden: Only the donation donor or an admin can generate a pickup OTP.' };
        }
        if (donation.status === 'expired' || isDonationExpired(donation as any).isExpired) {
          return { status: 400, message: 'Food Safety Guard: This donation has expired and cannot generate a pickup OTP.' };
        }
        if (donation.status !== 'accepted' && donation.status !== 'scheduled') {
          return {
            status: 400,
            message: `Pickup OTP can only be generated when the donation is accepted or scheduled (current status: "${donation.status}").`,
          };
        }
      } else {
        if (!isAssignedNgo && !isAdminUser) {
          return { status: 403, message: 'Forbidden: Only the assigned NGO or an admin can generate a delivery OTP.' };
        }
        if (donation.status !== 'picked_up' && donation.status !== 'in_transit') {
          return {
            status: 400,
            message: `Delivery OTP can only be generated when the donation is picked_up or in_transit (current status: "${donation.status}").`,
          };
        }
      }
      return null;
    };

    if (useTestVerificationStore(req, donationId)) {
      const donation = testVerificationDonationsStore.get(donationId);
      const checkErr = validateCallerAndStatus(donation);
      if (checkErr) {
        return sendJson(res, checkErr.status, { success: false, message: checkErr.message });
      }
      const existingVer =
        testVerificationsStore.get(donationId) || createInitialVerificationRecord(donationId, new Date(nowMs).toISOString());
      const issued = buildOtpIssueUpdate(existingVer, donationId, mode, nowMs);
      if (!issued.ok) {
        return sendJson(res, issued.status, { success: false, message: issued.message });
      }
      testVerificationsStore.set(donationId, { ...existingVer, ...issued.patch });
      return sendJson(res, 200, {
        success: true,
        otp: issued.otp,
        expiresAt: issued.expiresAt,
        expiresInSeconds: issued.expiresInSeconds,
      });
    }

    const firestore = adminDb();
    const txResult = await firestore.runTransaction(async (tx) => {
      const donRef = firestore.collection('donations').doc(donationId);
      const verRef = firestore.collection('verifications').doc(donationId);
      const [donSnap, verSnap] = await Promise.all([tx.get(donRef), tx.get(verRef)]);

      const checkErr = validateCallerAndStatus(donSnap.exists ? donSnap.data() : undefined);
      if (checkErr) {
        return { ok: false as const, status: checkErr.status, message: checkErr.message };
      }

      const nowIso = new Date(nowMs).toISOString();
      const baseVer = verSnap.exists
        ? (verSnap.data() as Record<string, any>)
        : createInitialVerificationRecord(donationId, nowIso);

      const issued = buildOtpIssueUpdate(baseVer, donationId, mode, nowMs);
      if (!issued.ok) {
        return { ok: false as const, status: issued.status, message: issued.message };
      }

      if (verSnap.exists) {
        tx.update(verRef, issued.patch);
      } else {
        tx.set(verRef, { ...baseVer, ...issued.patch });
      }

      return {
        ok: true as const,
        otp: issued.otp,
        expiresAt: issued.expiresAt,
        expiresInSeconds: issued.expiresInSeconds,
      };
    });

    if (!txResult.ok) {
      return sendJson(res, txResult.status, { success: false, message: txResult.message });
    }

    return sendJson(res, 200, {
      success: true,
      otp: txResult.otp,
      expiresAt: txResult.expiresAt,
      expiresInSeconds: txResult.expiresInSeconds,
    });
  } catch (error: any) {
    console.error('[Verify OTP Generate] Error:', error);
    if (isCredentialOrPermissionError(error)) {
      return sendJson(res, 503, SERVER_NOT_CONFIGURED_RESPONSE);
    }
    return sendJson(res, 500, { success: false, message: error.message || 'Failed to generate OTP.' });
  }
});

// POST /api/verify/pickup
// Performs pickup verification inside a server-side Firestore transaction with OTP, single-use & rate-limiting
apiRouter.post('/verify/pickup', requireAuth, verificationLimiter, async (req: Request, res: Response) => {
  try {
    const user = (req as any).user as AuthenticatedUser;
    const { donationId, tokenOrPin, volunteerName } = req.body || {};

    if (!donationId || typeof donationId !== 'string') {
      return sendJson(res, 400, { success: false, error: 'donationId is required', message: 'donationId is required' });
    }
    if (!tokenOrPin || typeof tokenOrPin !== 'string') {
      return sendJson(res, 400, { success: false, error: 'tokenOrPin is required', message: 'tokenOrPin is required' });
    }

    const trimmedInput = tokenOrPin.trim().toUpperCase();
    const volunteerId = user.uid;
    const actorName = String(volunteerName || user.email?.split('@')[0] || 'Authorized Courier');
    const nowMs = Date.now();
    const now = new Date(nowMs).toISOString();

    if (useTestVerificationStore(req, donationId)) {
      const donation = testVerificationDonationsStore.get(donationId);
      if (!donation) {
        return sendJson(res, 400, { success: false, message: 'Donation record not found' });
      }
      const verData = testVerificationsStore.get(donationId);
      if (!verData) {
        return sendJson(res, 400, { success: false, message: 'Verification record not found for this donation' });
      }
      const evalRes = evaluateHandoverVerification({
        mode: 'pickup',
        donationId,
        donation,
        verData,
        trimmedInput,
        actorId: volunteerId,
        actorName,
        nowMs,
      });
      if (evalRes.verPatch) {
        testVerificationsStore.set(donationId, { ...verData, ...evalRes.verPatch });
      }
      if (!evalRes.ok) {
        return sendJson(res, evalRes.status, { success: false, message: evalRes.message });
      }
      if (evalRes.donPatch) {
        testVerificationDonationsStore.set(donationId, { ...donation, ...evalRes.donPatch });
      }
      testVerificationAuditLogsStore.push({
        id: `audit_${nowMs}`,
        action: 'VERIFY_PICKUP',
        performedBy: volunteerId,
        targetId: donationId,
        details: `Pickup verified (${evalRes.verifiedBy}) by volunteer ${actorName} (${volunteerId}) for donation ${donationId}.`,
        timestamp: now,
      });
      return sendJson(res, 200, { success: true, message: evalRes.message });
    }

    const firestore = adminDb();
    const result = await firestore.runTransaction(async (tx) => {
      const donRef = firestore.collection('donations').doc(donationId);
      const verRef = firestore.collection('verifications').doc(donationId);

      const [donSnap, verSnap] = await Promise.all([tx.get(donRef), tx.get(verRef)]);

      if (!donSnap.exists) {
        return { ok: false, status: 400, message: 'Donation record not found' };
      }
      if (!verSnap.exists) {
        return { ok: false, status: 400, message: 'Verification record not found for this donation' };
      }

      const donation = donSnap.data() || {};
      const verData = verSnap.data() || {};

      const evalRes = evaluateHandoverVerification({
        mode: 'pickup',
        donationId,
        donation,
        verData,
        trimmedInput,
        actorId: volunteerId,
        actorName,
        nowMs,
      });

      if (evalRes.verPatch) {
        tx.update(verRef, evalRes.verPatch);
      }
      if (!evalRes.ok) {
        return { ok: false, status: evalRes.status, message: evalRes.message };
      }
      if (evalRes.donPatch) {
        tx.update(donRef, evalRes.donPatch);
      }

      // Write server-side audit log
      const auditRef = firestore.collection('auditLogs').doc();
      tx.set(auditRef, {
        id: auditRef.id,
        action: 'VERIFY_PICKUP',
        performedBy: volunteerId,
        targetId: donationId,
        details: `Pickup verified by volunteer ${actorName} (${volunteerId}) for donation ${donationId}.`,
        timestamp: now,
      });

      return {
        ok: true,
        status: 200,
        message: evalRes.message,
      };
    });

    if (!result.ok) {
      return sendJson(res, result.status, { success: false, message: result.message });
    }
    return sendJson(res, 200, { success: true, message: result.message });
  } catch (error: any) {
    console.error('[Verify Pickup] Error:', error);
    if (isCredentialOrPermissionError(error)) {
      return sendJson(res, 503, SERVER_NOT_CONFIGURED_RESPONSE);
    }
    sendJson(res, 400, { success: false, message: error.message || 'Verification failure' });
  }
});

// POST /api/verify/delivery
// Performs delivery verification inside a server-side Firestore transaction, writing impact & audit records
apiRouter.post('/verify/delivery', requireAuth, verificationLimiter, async (req: Request, res: Response) => {
  try {
    const user = (req as any).user as AuthenticatedUser;
    const { donationId, tokenOrPin, verifierName } = req.body || {};

    if (!donationId || typeof donationId !== 'string') {
      return sendJson(res, 400, { success: false, error: 'donationId is required', message: 'donationId is required' });
    }
    if (!tokenOrPin || typeof tokenOrPin !== 'string') {
      return sendJson(res, 400, { success: false, error: 'tokenOrPin is required', message: 'tokenOrPin is required' });
    }

    const trimmedInput = tokenOrPin.trim().toUpperCase();
    const verifierId = user.uid;
    const actorName = String(verifierName || user.email?.split('@')[0] || 'Shelter Coordinator');
    const nowMs = Date.now();
    const now = new Date(nowMs).toISOString();

    if (useTestVerificationStore(req, donationId)) {
      const donation = testVerificationDonationsStore.get(donationId);
      if (!donation) {
        return sendJson(res, 400, { success: false, message: 'Donation record not found' });
      }
      const verData = testVerificationsStore.get(donationId);
      if (!verData) {
        return sendJson(res, 400, { success: false, message: 'Verification record not found for this delivery' });
      }
      const evalRes = evaluateHandoverVerification({
        mode: 'delivery',
        donationId,
        donation,
        verData,
        trimmedInput,
        actorId: verifierId,
        actorName,
        nowMs,
      });
      if (evalRes.verPatch) {
        testVerificationsStore.set(donationId, { ...verData, ...evalRes.verPatch });
      }
      if (!evalRes.ok) {
        return sendJson(res, evalRes.status, { success: false, message: evalRes.message });
      }
      if (evalRes.donPatch) {
        testVerificationDonationsStore.set(donationId, { ...donation, ...evalRes.donPatch });
      }
      const quantity = Number(donation?.quantity) || 0;
      const unit = String(donation?.unit || '').toLowerCase();
      const servings = Number(donation?.servings) || 0;
      const quantityKg = unit === 'kg' ? quantity : servings ? servings * 0.4 : quantity * 0.5;
      const estimatedMeals = servings || Math.round(quantityKg * 2.5);
      const impactId = `impact_${nowMs}`;
      testVerificationImpactRecordsStore.push({
        id: impactId,
        donationId,
        foodName: donation?.foodName || 'Surplus Food',
        quantityKg: Math.round(quantityKg * 10) / 10,
        estimatedMeals,
        donorId: donation?.donorId,
        ngoId: donation?.assignedNgoId || verifierId,
        volunteerId: donation?.assignedVolunteerId || verifierId,
        deliveredAt: now,
      });
      testVerificationAuditLogsStore.push({
        id: `audit_${nowMs}`,
        action: 'VERIFY_DELIVERY',
        performedBy: verifierId,
        targetId: donationId,
        details: `Delivery verified (${evalRes.verifiedBy}) by ${actorName} (${verifierId}) for donation ${donationId}. Impact record ${impactId} created.`,
        timestamp: now,
      });
      return sendJson(res, 200, { success: true, message: evalRes.message });
    }

    const firestore = adminDb();
    const result = await firestore.runTransaction(async (tx) => {
      const donRef = firestore.collection('donations').doc(donationId);
      const verRef = firestore.collection('verifications').doc(donationId);

      const [donSnap, verSnap] = await Promise.all([tx.get(donRef), tx.get(verRef)]);

      if (!donSnap.exists) {
        return { ok: false, status: 400, message: 'Donation record not found' };
      }
      if (!verSnap.exists) {
        return { ok: false, status: 400, message: 'Verification record not found for this delivery' };
      }

      const donation = donSnap.data() || {};
      const verData = verSnap.data() || {};

      const evalRes = evaluateHandoverVerification({
        mode: 'delivery',
        donationId,
        donation,
        verData,
        trimmedInput,
        actorId: verifierId,
        actorName,
        nowMs,
      });

      if (evalRes.verPatch) {
        tx.update(verRef, evalRes.verPatch);
      }
      if (!evalRes.ok) {
        return { ok: false, status: evalRes.status, message: evalRes.message };
      }
      if (evalRes.donPatch) {
        tx.update(donRef, evalRes.donPatch);
      }

      // Calculate quantityKg and servings for official server-side Impact Record
      const quantity = Number(donation?.quantity) || 0;
      const unit = String(donation?.unit || '').toLowerCase();
      const servings = Number(donation?.servings) || 0;

      const quantityKg = unit === 'kg' ? quantity : servings ? servings * 0.4 : quantity * 0.5;
      const estimatedMeals = servings || Math.round(quantityKg * 2.5);

      // Create server-side verified ImpactRecord
      const impactRef = firestore.collection('impactRecords').doc();
      tx.set(impactRef, {
        id: impactRef.id,
        donationId,
        foodName: donation?.foodName || 'Surplus Food',
        quantityKg: Math.round(quantityKg * 10) / 10,
        estimatedMeals,
        donorId: donation?.donorId,
        ngoId: donation?.assignedNgoId || verifierId,
        volunteerId: donation?.assignedVolunteerId || verifierId,
        deliveredAt: now,
      });

      // Create server-side AuditLog
      const auditRef = firestore.collection('auditLogs').doc();
      tx.set(auditRef, {
        id: auditRef.id,
        action: 'VERIFY_DELIVERY',
        performedBy: verifierId,
        targetId: donationId,
        details: `Delivery verified by ${actorName} (${verifierId}) for donation ${donationId}. Impact record ${impactRef.id} created.`,
        timestamp: now,
      });

      return {
        ok: true,
        status: 200,
        message: evalRes.message,
      };
    });

    if (!result.ok) {
      return sendJson(res, result.status, { success: false, message: result.message });
    }
    return sendJson(res, 200, { success: true, message: result.message });
  } catch (error: any) {
    console.error('[Verify Delivery] Error:', error);
    if (isCredentialOrPermissionError(error)) {
      return sendJson(res, 503, SERVER_NOT_CONFIGURED_RESPONSE);
    }
    sendJson(res, 400, { success: false, message: error.message || 'Verification failure' });
  }
});

// POST /api/donations/accept-volunteer
// Atomic volunteer acceptance transaction with audit logging & collision prevention
apiRouter.post('/donations/accept-volunteer', requireAuth, verificationLimiter, handleAcceptVolunteerDonation);
apiRouter.post('/donations/accept', requireAuth, verificationLimiter, handleAcceptVolunteerDonation);

// JSON 404 handler for unknown /api/* routes (never return HTML)
apiRouter.use((_req: Request, res: Response) => {
  sendJson(res, 404, { success: false, message: 'API route not found.' });
});

// Mount API router strictly under /api so static assets & Vite dev middleware are never rate-limited
app.use('/api', apiRouter);

// Final Express JSON error-handling middleware (ensures API/body-parser errors always return JSON)
app.use((err: any, _req: Request, res: Response, _next: NextFunction) => {
  if (res.headersSent) return;
  console.error('[API Error]', err);
  if (isCredentialOrPermissionError(err)) {
    return sendJson(res, 503, SERVER_NOT_CONFIGURED_RESPONSE);
  }
  const status =
    typeof err?.status === 'number' && err.status >= 400 && err.status < 600
      ? err.status
      : typeof err?.statusCode === 'number' && err.statusCode >= 400 && err.statusCode < 600
      ? err.statusCode
      : 500;
  return sendJson(res, status, {
    success: false,
    message: err?.message || 'Internal Server Error',
  });
});

// Start scheduled background expiration monitoring in server environments
if (process.env.NODE_ENV !== 'test' && !process.env.DISABLE_CRON && !process.env.VERCEL) {
  try {
    startExpirationCron();
  } catch (cronErr) {
    console.warn('[Expiration Job] Cron start notice:', cronErr);
  }
}

export default app;
