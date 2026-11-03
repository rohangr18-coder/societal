import { getMessaging } from 'firebase-admin/messaging';
import { getAdminApp, adminDb } from './firebaseAdmin.js';
import { isDonationExpired, computeSafeUntil } from '../src/utils/foodSafety.js';

export interface ExpirationScanResult {
  success: boolean;
  scannedCount: number;
  expiredCount: number;
  expiredDonationIds: string[];
  timestamp: string;
  durationMs: number;
  error?: string;
}

export interface ExpirationJobStatus {
  isRunning: boolean;
  intervalMs: number;
  lastRunAt: string | null;
  lastScannedCount: number;
  lastExpiredCount: number;
  totalExpiredCount: number;
  lastError: string | null;
}

let cronIntervalHandle: NodeJS.Timeout | null = null;
let currentIntervalMs = 60 * 1000; // Default: scan every 60 seconds (1 minute)
let lastRunTimestamp: string | null = null;
let lastScannedCount = 0;
let lastExpiredCount = 0;
let totalExpiredCount = 0;
let lastError: string | null = null;

/**
 * Core scanning and expiration logic.
 * Periodically scans active donations, evaluates safeUntil threshold,
 * marks overdue items as 'expired', and notifies the original donor.
 */
export async function scanAndExpireOverdueDonations(nowMs: number = Date.now()): Promise<ExpirationScanResult> {
  const startTime = Date.now();
  const nowIso = new Date(nowMs).toISOString();
  const expiredDonationIds: string[] = [];
  let scannedCount = 0;

  try {
    const firestore = adminDb();

    // Query active uncollected donations: available, requested, accepted, scheduled
    const activeStatuses = ['available', 'requested', 'accepted', 'scheduled'];
    const activeSnaps = await firestore
      .collection('donations')
      .where('status', 'in', activeStatuses)
      .get();

    scannedCount = activeSnaps.size;

    for (const docSnap of activeSnaps.docs) {
      const data = docSnap.data();
      const donationId = docSnap.id;

      // Evaluate food safety expiration rule
      const expirationCheck = isDonationExpired(data as any, nowMs);

      if (expirationCheck.isExpired) {
        expiredDonationIds.push(donationId);

        const currentTimeline = Array.isArray(data.timeline) ? data.timeline : [];
        const newTimeline = [
          ...currentTimeline,
          {
            status: 'expired',
            timestamp: nowIso,
            actorName: 'Food Safety Guard (System)',
            actorId: 'system',
            note: `Donation marked expired after passing safe food threshold. ${expirationCheck.reason}`,
          },
        ];

        // 1. Update Donation Document
        await docSnap.ref.update({
          status: 'expired',
          safeUntil: data.safeUntil || expirationCheck.effectiveSafeUntilIso,
          expiredAt: nowIso,
          updatedAt: nowIso,
          timeline: newTimeline,
        });

        // 2. Release volunteer active assignment if courier was assigned
        if (data.assignedVolunteerId) {
          try {
            const volRef = firestore.collection('volunteerProfiles').doc(data.assignedVolunteerId);
            const volSnap = await volRef.get();
            if (volSnap.exists && volSnap.data()?.activeAssignmentId === donationId) {
              await volRef.update({
                activeAssignmentId: '',
                updatedAt: nowIso,
              });
            }
          } catch (volErr) {
            console.warn(`[Expiration Job] Could not release volunteer assignment ${data.assignedVolunteerId}:`, volErr);
          }
        }

        // 3. Notify the Original Donor
        if (data.donorId) {
          const donorNotifRef = firestore.collection('notifications').doc();
          const thresholdFormatted = new Date(expirationCheck.effectiveSafeUntilMs).toLocaleTimeString([], {
            hour: '2-digit',
            minute: '2-digit',
          });

          const donorNotif = {
            id: donorNotifRef.id,
            userId: data.donorId,
            recipientUserId: data.donorId,
            title: '⚠️ Food Safety Notice: Donation Expired',
            message: `Your donation "${data.foodName}" has passed its safe consumption threshold (${thresholdFormatted}) and was marked expired to protect community safety. Thank you for listing it!`,
            type: 'alert',
            link: '/dashboard',
            donationId,
            deadline: expirationCheck.effectiveSafeUntilIso,
            deliveryStatus: 'delivered',
            read: false,
            createdAt: nowIso,
          };

          await donorNotifRef.set(donorNotif);

          // Dispatch FCM Push Notification to Donor if configured
          try {
            const donorUserDoc = await firestore.collection('users').doc(data.donorId).get();
            if (donorUserDoc.exists) {
              const donorData = donorUserDoc.data();
              if (donorData?.pushNotificationsEnabled && (donorData?.fcmToken || Array.isArray(donorData?.fcmTokens))) {
                const tokens = donorData.fcmTokens || [donorData.fcmToken];
                const validTokens = tokens.filter((t: any) => typeof t === 'string' && t.length > 0);
                if (validTokens.length > 0) {
                  await getMessaging(getAdminApp()).sendEachForMulticast({
                    tokens: validTokens,
                    notification: {
                      title: '⚠️ Food Safety: Donation Expired',
                      body: `"${data.foodName}" has passed its safe consumption threshold and has expired.`,
                    },
                    data: {
                      donationId,
                      url: '/dashboard',
                      type: 'donation_expired',
                    },
                  });
                }
              }
            }
          } catch (fcmErr) {
            console.warn(`[Expiration Job] FCM push notice to donor ${data.donorId}:`, fcmErr);
          }
        }

        // 4. Notify Assigned NGO if reservation existed
        if (data.assignedNgoId) {
          try {
            const ngoNotifRef = firestore.collection('notifications').doc();
            await ngoNotifRef.set({
              id: ngoNotifRef.id,
              userId: data.assignedNgoId,
              recipientUserId: data.assignedNgoId,
              title: 'Donation Expired Before Pickup',
              message: `The food listing "${data.foodName}" has reached its safe consumption threshold and is no longer available for collection.`,
              type: 'alert',
              link: '/dashboard',
              donationId,
              deliveryStatus: 'delivered',
              read: false,
              createdAt: nowIso,
            });
          } catch (ngoNotifErr) {
            console.warn(`[Expiration Job] NGO notification warning:`, ngoNotifErr);
          }
        }

        // 5. Notify Assigned Volunteer if courier was en route
        if (data.assignedVolunteerId) {
          try {
            const volNotifRef = firestore.collection('notifications').doc();
            await volNotifRef.set({
              id: volNotifRef.id,
              userId: data.assignedVolunteerId,
              recipientUserId: data.assignedVolunteerId,
              title: 'Collection Assignment Cancelled',
              message: `Collection for "${data.foodName}" was cancelled because the food reached its safe consumption deadline.`,
              type: 'alert',
              link: '/volunteer',
              donationId,
              deliveryStatus: 'delivered',
              read: false,
              createdAt: nowIso,
            });
          } catch (volNotifErr) {
            console.warn(`[Expiration Job] Volunteer notification warning:`, volNotifErr);
          }
        }

        // 6. Write Server-Side Audit Log
        try {
          const auditRef = firestore.collection('auditLogs').doc();
          await auditRef.set({
            id: auditRef.id,
            action: 'DONATION_EXPIRED_SCHEDULED',
            performedBy: 'system',
            targetId: donationId,
            details: `Scheduled food safety job expired donation "${data.foodName}" (${donationId}). Reason: ${expirationCheck.reason}. SafeUntil threshold: ${expirationCheck.effectiveSafeUntilIso}.`,
            timestamp: nowIso,
          });
        } catch (auditErr) {
          console.warn(`[Expiration Job] Audit log error for ${donationId}:`, auditErr);
        }
      }
    }

    lastRunTimestamp = nowIso;
    lastScannedCount = scannedCount;
    lastExpiredCount = expiredDonationIds.length;
    totalExpiredCount += expiredDonationIds.length;
    lastError = null;

    if (expiredDonationIds.length > 0) {
      console.info(`[Expiration Job] Scanned ${scannedCount} active donations. Expired ${expiredDonationIds.length} overdue items: ${expiredDonationIds.join(', ')}.`);
    }

    return {
      success: true,
      scannedCount,
      expiredCount: expiredDonationIds.length,
      expiredDonationIds,
      timestamp: nowIso,
      durationMs: Date.now() - startTime,
    };
  } catch (err: any) {
    const errorMsg = err?.message || String(err);
    console.warn('[Expiration Job] Scan status notice:', errorMsg);
    lastError = errorMsg;
    return {
      success: false,
      scannedCount,
      expiredCount: expiredDonationIds.length,
      expiredDonationIds,
      timestamp: nowIso,
      durationMs: Date.now() - startTime,
      error: errorMsg,
    };
  }
}

/**
 * Starts the periodic background cron job scanning active donations.
 */
export function startExpirationCron(intervalMs?: number): void {
  if (intervalMs && intervalMs >= 5000) {
    currentIntervalMs = intervalMs;
  }

  if (cronIntervalHandle) {
    clearInterval(cronIntervalHandle);
    cronIntervalHandle = null;
  }

  console.info(`[Expiration Job] Starting background food safety monitor (interval: ${currentIntervalMs / 1000}s)`);

  // Run initial scan promptly
  scanAndExpireOverdueDonations().catch((err) => {
    console.warn('[Expiration Job] Initial scan warning:', err?.message || err);
  });

  // Schedule recurring interval
  cronIntervalHandle = setInterval(() => {
    scanAndExpireOverdueDonations().catch((err) => {
      console.warn('[Expiration Job] Recurring scan warning:', err?.message || err);
    });
  }, currentIntervalMs);
}

/**
 * Stops the periodic cron job.
 */
export function stopExpirationCron(): void {
  if (cronIntervalHandle) {
    clearInterval(cronIntervalHandle);
    cronIntervalHandle = null;
    console.info('[Expiration Job] Background monitor stopped.');
  }
}

/**
 * Returns current health and execution statistics for the expiration job.
 */
export function getExpirationJobStatus(): ExpirationJobStatus {
  return {
    isRunning: cronIntervalHandle !== null,
    intervalMs: currentIntervalMs,
    lastRunAt: lastRunTimestamp,
    lastScannedCount,
    lastExpiredCount,
    totalExpiredCount,
    lastError,
  };
}
