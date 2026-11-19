import {
  collection,
  doc,
  getDoc,
  getDocs,
  setDoc,
  updateDoc,
  deleteDoc,
  query,
  where,
  orderBy,
  limit,
  onSnapshot,
  runTransaction,
  serverTimestamp,
  Timestamp,
} from 'firebase/firestore';
import { db, auth, handleFirestoreError, OperationType } from '../lib/firebase';
import {
  UserProfile,
  UserRole,
  Donation,
  DonationStatus,
  Organization,
  VolunteerProfile,
  InAppNotification,
  ImpactRecord,
  AuditLog,
  TimelineEntry,
  VerificationRecord,
  LiveTrackingSession,
} from '../types';
import { calculateDistanceKm } from '../utils/geo';
import { computeSafeUntil, isDonationExpired } from '../utils/foodSafety';
import {
  sanitizeForFirestore,
  validateDonationRequiredFields,
  normalizeDonationPayload,
} from '../utils/firestoreSanitizer';
import { dispatchFcmToNearbyVolunteers, dispatchDonationLifecyclePush } from './fcmService';
import {
  getUserNotifications as fetchUserNotifications,
  sendNotification,
  toggleNotificationRead as toggleNotifRead,
  deleteNotification as removeNotification,
  clearAllNotifications as clearAllUserNotifications,
} from './dbNotificationService';
import { createAuditLog, recordImpact } from './dbOrgService';
import { stopLiveTracking } from './dbTrackingService';
import { verifyPickupWithToken as verifyPickupToken } from './dbVerificationService';

// ----------------------------------------------------
// Modular Service Re-exports
// ----------------------------------------------------
export * from './dbUserService';


// ----------------------------------------------------
// Donation Services with Transaction Safeguards
// ----------------------------------------------------
export function subscribeDonations(
  callback: (donations: Donation[]) => void,
  filter?: { status?: DonationStatus; donorId?: string; assignedNgoId?: string; assignedVolunteerId?: string }
) {
  const path = 'donations';
  try {
    let q = query(collection(db, 'donations'), orderBy('createdAt', 'desc'), limit(100));

    if (filter?.donorId) {
      q = query(collection(db, 'donations'), where('donorId', '==', filter.donorId));
    } else if (filter?.assignedNgoId) {
      q = query(collection(db, 'donations'), where('assignedNgoId', '==', filter.assignedNgoId));
    } else if (filter?.assignedVolunteerId) {
      q = query(collection(db, 'donations'), where('assignedVolunteerId', '==', filter.assignedVolunteerId));
    } else if (filter?.status) {
      q = query(collection(db, 'donations'), where('status', '==', filter.status));
    }

    return onSnapshot(
      q,
      (snapshot) => {
        const items: Donation[] = [];
        snapshot.forEach((docSnap) => {
          items.push({ id: docSnap.id, ...docSnap.data() } as Donation);
        });
        callback(items);
      },
      (error) => {
        handleFirestoreError(error, OperationType.LIST, path);
      }
    );
  } catch (error) {
    handleFirestoreError(error, OperationType.LIST, path);
  }
}

/**
 * Retrieves a single donation by ID from Firestore
 */
export async function getDonation(donationId: string): Promise<Donation | null> {
  const path = `donations/${donationId}`;
  try {
    const donationRef = doc(db, 'donations', donationId);
    const snap = await getDoc(donationRef);
    if (!snap.exists()) return null;
    return { id: snap.id, ...snap.data() } as Donation;
  } catch (error: any) {
    const msg = error?.message || String(error);
    if (
      msg.includes('the client is offline') ||
      msg.includes('offline') ||
      msg.includes('unavailable') ||
      msg.includes('permission-denied')
    ) {
      console.warn(`[dbService] Donation lookup notice for ${path}:`, msg);
      return null;
    }
    handleFirestoreError(error, OperationType.GET, path);
    return null;
  }
}

/**
 * Automatically identifies eligible nearby registered volunteers and sends real-time in-app collection alerts
 */
export async function notifyNearbyVolunteers(donation: Donation): Promise<number> {
  let notifiedCount = 0;
  try {
    // Check if donation collection deadline has passed; if expired, do not dispatch alerts
    const deadlineStr = donation.collectionDeadline || donation.pickupDeadline;
    if (deadlineStr) {
      const deadlineTime = new Date(deadlineStr).getTime();
      if (!isNaN(deadlineTime) && deadlineTime < Date.now()) {
        return 0; // Request has expired
      }
    }

    const snaps = await getDocs(query(collection(db, 'volunteerProfiles')));
    const promises: Promise<void>[] = [];
    const nearbyVolunteersList: { volunteer: VolunteerProfile; distanceKm: number }[] = [];

    snaps.forEach((volDoc) => {
      const vol = volDoc.data() as VolunteerProfile;

      // Eligibility: registered, available, and opted in to collection alerts
      if (vol.isAvailable === false || vol.optInNotifications === false) {
        return;
      }

      // Do not notify the donor themselves if they are also registered as volunteer
      if (vol.userId === donation.donorId) {
        return;
      }

      // Configurable radius: default 10 km or volunteer's custom radius
      const maxRadiusKm = vol.notificationRadiusKm || 10;
      let isWithinRadius = false;
      let calculatedDistance = 0;

      if (typeof vol.latitude === 'number' && typeof vol.longitude === 'number' && vol.latitude !== 0) {
        const d = calculateDistanceKm(
          donation.latitude,
          donation.longitude,
          vol.latitude,
          vol.longitude
        );
        if (d !== null) {
          calculatedDistance = d;
          isWithinRadius = calculatedDistance <= maxRadiusKm;
        } else {
          isWithinRadius = true;
          calculatedDistance = 3.5;
        }
      } else {
        // Fallback for volunteers without exact GPS set yet
        isWithinRadius = true;
        calculatedDistance = 3.5;
      }

      if (isWithinRadius) {
        notifiedCount++;
        nearbyVolunteersList.push({ volunteer: vol, distanceKm: calculatedDistance });

        const pickupWindowInfo = donation.availableFrom && donation.availableUntil
          ? ` Window: ${donation.availableFrom} – ${donation.availableUntil}`
          : '';
        // Idempotent deterministic notification ID to prevent duplicates
        const deterministicId = `notif_vol_${vol.userId}_${donation.id}`;
        promises.push(
          sendNotification({
            id: deterministicId,
            userId: vol.userId,
            recipientUserId: vol.userId,
            title: '🚨 Nearby Food Collection Alert!',
            message: `"${donation.foodName}" (${donation.quantity} ${donation.unit}) needs pickup ~${calculatedDistance.toFixed(1)} km away.${pickupWindowInfo} Deadline: ${donation.collectionDeadline || donation.pickupDeadline}.`,
            type: 'collection_request',
            link: `/volunteer`,
            donationId: donation.id,
            distanceKm: Math.round(calculatedDistance * 10) / 10,
            deadline: donation.collectionDeadline || donation.pickupDeadline,
            deliveryStatus: 'delivered',
          })
        );
      }
    });

    await Promise.all(promises);

    // Send browser-based push notifications via Firebase Cloud Messaging (FCM)
    if (nearbyVolunteersList.length > 0) {
      dispatchFcmToNearbyVolunteers(nearbyVolunteersList, donation).catch((fcmErr) => {
        console.warn('[FCM] Push dispatch to nearby volunteers warning:', fcmErr);
      });
    }

    return notifiedCount;
  } catch (err) {
    console.warn('Could not dispatch volunteer notifications:', err);
    return 0;
  }
}

export async function createDonation(data: Omit<Donation, 'id' | 'createdAt' | 'updatedAt' | 'timeline'>): Promise<string> {
  const path = 'donations';
  try {
    // 1. Strictly validate required fields before attempting Firestore mutation
    const validation = validateDonationRequiredFields(data);
    if (!validation.isValid) {
      throw new Error(`Validation Error: ${validation.errors.join(' ')}`);
    }

    const donationRef = doc(collection(db, 'donations'));
    const now = new Date().toISOString();
    
    const initialTimeline: TimelineEntry = {
      status: 'available',
      timestamp: now,
      actorName: data.donorName,
      actorId: data.donorId,
      note: 'Donation created and listed for rescue.',
    };

    const preparedAt = data.preparedAt || now;
    const computedSafety = computeSafeUntil({
      category: data.category,
      storageType: data.storageType,
      preparedAt,
      createdAt: now,
      pickupDeadline: data.pickupDeadline,
      collectionDeadline: data.collectionDeadline,
      safeUntil: data.safeUntil,
    });

    // 2. Normalize payload and recursively remove any undefined fields
    const sanitizedDonation = normalizeDonationPayload({
      ...data,
      id: donationRef.id,
      preparedAt,
      safeUntil: data.safeUntil || computedSafety.safeUntilIso,
      timeZone: data.timeZone || 'Asia/Kolkata',
      status: 'available',
      createdAt: now,
      updatedAt: now,
      timeline: [initialTimeline],
    }) as Donation;

    await setDoc(donationRef, sanitizedDonation);

    // Store private contact info (address and phone) in secure private subcollection
    try {
      await setDoc(doc(db, 'donations', donationRef.id, 'private', 'contact'), sanitizeForFirestore({
        pickupAddress: data.pickupAddress || '',
        donorPhone: (data as any).donorPhone || '',
        createdAt: now,
        updatedAt: now,
      }));
    } catch (contactErr) {
      console.warn('Could not save donation private contact subcollection:', contactErr);
    }

    // Private confirmation notification strictly isolated to the creating donor
    await sendNotification({
      id: `notif_donor_create_${donationRef.id}`,
      userId: data.donorId,
      recipientUserId: data.donorId,
      title: 'Donation Listed Successfully',
      message: `Your donation "${data.foodName}" has been posted.${data.availableFrom && data.availableUntil ? ` Scheduled pickup window: ${data.availableFrom} – ${data.availableUntil} (${data.pickupDate || 'Today'}, ${sanitizedDonation.timeZone}).` : ''} Nearby volunteers are being alerted.`,
      type: 'system',
      link: '/dashboard',
      donationId: donationRef.id,
      deliveryStatus: 'delivered',
    });

    // Audit log
    await createAuditLog({
      action: 'DONATION_CREATED',
      performedBy: data.donorId,
      targetId: donationRef.id,
      details: `Created donation: ${data.foodName} (${data.quantity} ${data.unit})`,
    });

    // Automatically notify nearby eligible volunteers in real-time
    notifyNearbyVolunteers(sanitizedDonation).catch((notifErr) => {
      console.warn('Async volunteer notification warning:', notifErr);
    });

    return donationRef.id;
  } catch (error) {
    handleFirestoreError(error, OperationType.CREATE, path);
  }
}

/**
 * Transactional claim request to prevent duplicate claims by multiple NGOs
 * Uses Firestore runTransaction for atomic claim and conflict elimination
 */
export async function claimDonationByNgo(
  donationId: string,
  ngoId: string,
  ngoName: string,
  userDisplayName: string
): Promise<{ success: boolean; code?: 'SUCCESS' | 'ALREADY_CLAIMED' | 'ERROR'; message: string }> {
  const donationRef = doc(db, 'donations', donationId);
  const path = `donations/${donationId}`;

  try {
    const result = await runTransaction(db, async (transaction) => {
      const snap = await transaction.get(donationRef);
      if (!snap.exists()) {
        return {
          success: false,
          code: 'ERROR' as const,
          message: 'Donation listing not found.',
        };
      }

      const donation = snap.data() as Donation;

      // Atomic conflict check: ensure status is available and not claimed by another NGO
      if (donation.status !== 'available' || (donation.claimLock && donation.claimLock !== ngoId)) {
        return {
          success: false,
          code: 'ALREADY_CLAIMED' as const,
          message: `This donation is no longer available (current status: ${donation.status}). It has already been claimed by another organization.`,
        };
      }

      // Food safety check: block claims on expired items
      if (isDonationExpired(donation).isExpired) {
        return {
          success: false,
          code: 'ERROR' as const,
          message: 'Food Safety Notice: This donation has passed its safe consumption threshold and can no longer be claimed.',
        };
      }

      if (donation.assignedNgoId && donation.assignedNgoId !== ngoId) {
        return {
          success: false,
          code: 'ALREADY_CLAIMED' as const,
          message: 'This donation has already been assigned to another partner NGO.',
        };
      }

      const now = new Date().toISOString();
      const updatedTimeline = [
        ...(donation.timeline || []),
        {
          status: 'requested' as DonationStatus,
          timestamp: now,
          actorName: `${ngoName} (${userDisplayName})`,
          note: 'Requested by verified NGO partner',
        },
      ];

      transaction.update(donationRef, {
        status: 'requested',
        assignedNgoId: ngoId,
        assignedNgoName: ngoName,
        claimLock: ngoId,
        updatedAt: now,
        timeline: updatedTimeline,
      });

      return {
        success: true,
        code: 'SUCCESS' as const,
        message: 'Donation successfully claimed and locked for your organization!',
        donation,
      };
    });

    if (result.success && result.donation?.donorId) {
      sendNotification({
        id: `notif_donor_req_${donationId}`,
        userId: result.donation.donorId,
        recipientUserId: result.donation.donorId,
        title: 'Shelter Requested Your Donation',
        message: `${ngoName} has requested your food donation "${result.donation.foodName}".`,
        type: 'request',
        link: '/dashboard',
        donationId,
      }).catch(console.warn);

      getDoc(doc(db, 'users', result.donation.donorId)).then((donorSnap) => {
        if (donorSnap.exists()) {
          const donorData = donorSnap.data() as UserProfile;
          if (donorData.pushNotificationsEnabled && donorData.notificationPreferences?.donorOnClaimed !== false) {
            const tokens = donorData.fcmTokens || (donorData.fcmToken ? [donorData.fcmToken] : []);
            dispatchDonationLifecyclePush(result.donation!, 'requested', {
              actorName: ngoName,
              recipientTokens: tokens,
              recipientUserIds: [result.donation!.donorId],
            }).catch(console.warn);
          }
        }
      }).catch(console.warn);
    }

    return result;
  } catch (error: any) {
    handleFirestoreError(error, OperationType.UPDATE, path);
    return {
      success: false,
      code: 'ERROR' as const,
      message: error?.message || 'Transaction error claiming donation.',
    };
  }
}

/**
 * Safe transactional request acceptance by a volunteer courier
 * Prevents race conditions and duplicate claims using a Firestore atomic transaction
 */
export async function acceptDonationByVolunteer(
  donationId: string,
  volunteerUid: string,
  volunteerName: string,
  volunteerPhone?: string
): Promise<{ success: boolean; code?: 'SUCCESS' | 'ALREADY_CLAIMED' | 'EXPIRED' | 'NOT_FOUND' | 'ERROR'; message: string; donation?: Donation }> {
  // 1. Attempt secure server-side atomic transaction
  try {
    const idToken = await auth.currentUser?.getIdToken();
    if (idToken) {
      const resp = await fetch('/api/donations/accept-volunteer', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${idToken}` },
        body: JSON.stringify({ donationId, volunteerName, volunteerPhone }),
      });
      const data = await resp.json().catch(() => ({}));
      if (resp.ok && data.success) {
        return { success: true, code: 'SUCCESS', message: data.message || 'Collection accepted!', donation: data.donation };
      }
      if (resp.status === 409) {
        return { success: false, code: 'ALREADY_CLAIMED', message: data.message || 'Already claimed by another courier.' };
      }
      if (resp.status === 400 && data.message?.includes('safe consumption threshold')) {
        return { success: false, code: 'EXPIRED', message: data.message };
      }
      if (resp.status >= 400 && resp.status < 500) {
        return { success: false, code: 'ERROR', message: data.message || data.error || 'Failed to accept collection.' };
      }
    }
  } catch (netErr) {
    console.warn('[acceptDonationByVolunteer] Server endpoint notice, falling back to client transaction:', netErr);
  }

  // 2. Direct Firestore atomic transaction fallback
  const donationRef = doc(db, 'donations', donationId);
  const path = `donations/${donationId}`;
  try {
    const result = await runTransaction(db, async (tx) => {
      const snap = await tx.get(donationRef);
      if (!snap.exists()) {
        return { success: false, code: 'NOT_FOUND' as const, message: 'Donation listing not found.' };
      }
      const donation = snap.data() as Donation;
      if (donation.status !== 'available' && donation.status !== 'requested') {
        return {
          success: false,
          code: 'ALREADY_CLAIMED' as const,
          message: `This collection request is no longer available (current status: ${donation.status.toUpperCase()}). Another volunteer or NGO may have claimed it.`,
        };
      }
      if (isDonationExpired(donation).isExpired) {
        return {
          success: false,
          code: 'EXPIRED' as const,
          message: 'Food Safety Alert: This food collection request has passed its safe consumption threshold and cannot be accepted.',
        };
      }
      if (donation.assignedVolunteerId && donation.assignedVolunteerId !== volunteerUid) {
        return {
          success: false,
          code: 'ALREADY_CLAIMED' as const,
          message: 'Another volunteer courier has already accepted this collection request.',
        };
      }
      const now = new Date().toISOString();
      const nextStatus: DonationStatus = 'accepted';
      const updatedTimeline: TimelineEntry[] = [
        ...(donation.timeline || []),
        {
          status: nextStatus,
          timestamp: now,
          actorName: volunteerName,
          actorId: volunteerUid,
          note: `Volunteer courier ${volunteerName} accepted collection request. En route for pickup.`,
        },
      ];
      tx.update(donationRef, {
        status: nextStatus,
        assignedVolunteerId: volunteerUid,
        assignedVolunteerName: volunteerName,
        assignedVolunteerPhone: volunteerPhone || '',
        acceptedAt: now,
        claimLock: volunteerUid,
        updatedAt: now,
        timeline: updatedTimeline,
      });
      const volRef = doc(db, 'volunteerProfiles', volunteerUid);
      tx.set(volRef, { activeAssignmentId: donationId, updatedAt: now }, { merge: true });
      return {
        success: true,
        code: 'SUCCESS' as const,
        message: 'Collection request accepted! You are now assigned to pickup this food.',
        donation: {
          ...donation,
          status: nextStatus,
          assignedVolunteerId: volunteerUid,
          assignedVolunteerName: volunteerName,
          assignedVolunteerPhone: volunteerPhone || '',
          acceptedAt: now,
        },
      };
    });

    if (result.success && result.donation?.donorId) {
      sendNotification({
        id: `notif_donor_accepted_${result.donation.id}`,
        userId: result.donation.donorId,
        recipientUserId: result.donation.donorId,
        title: 'Volunteer Accepted Collection',
        message: `${volunteerName} has accepted your donation "${result.donation.foodName}" and is scheduled for pickup.`,
        type: 'assignment',
        link: '/dashboard',
        donationId: result.donation.id,
        deliveryStatus: 'delivered',
      }).catch(console.warn);
    }
    return result;
  } catch (error) {
    handleFirestoreError(error, OperationType.WRITE, path);
    return { success: false, code: 'ERROR' as const, message: 'Transaction error accepting collection request.' };
  }
}

/**
 * Safe transactional cancellation of volunteer collection before pickup
 */
export async function cancelVolunteerCollection(
  donationId: string,
  volunteerUid: string,
  volunteerName: string,
  reason?: string
): Promise<{ success: boolean; message: string }> {
  const donationRef = doc(db, 'donations', donationId);
  const path = `donations/${donationId}`;

  try {
    const result = await runTransaction(db, async (tx) => {
      const snap = await tx.get(donationRef);
      if (!snap.exists()) {
        return { success: false, message: 'Donation listing not found.' };
      }

      const donation = snap.data() as Donation;

      if (donation.assignedVolunteerId !== volunteerUid) {
        return { success: false, message: 'You are not assigned to this collection.' };
      }

      if (donation.status !== 'accepted' && donation.status !== 'scheduled') {
        return {
          success: false,
          message: `Cannot cancel collection in status "${donation.status.toUpperCase()}". Food has already been picked up.`,
        };
      }

      const now = new Date().toISOString();
      const revertedStatus: DonationStatus = donation.assignedNgoId ? 'requested' : 'available';

      const updatedTimeline: TimelineEntry[] = [
        ...(donation.timeline || []),
        {
          status: revertedStatus,
          timestamp: now,
          actorName: volunteerName,
          actorId: volunteerUid,
          note: `Volunteer released collection request (${reason || 'Change in availability'}). Reopened for nearby couriers.`,
        },
      ];

      tx.update(donationRef, {
        status: revertedStatus,
        assignedVolunteerId: '',
        assignedVolunteerName: '',
        assignedVolunteerPhone: '',
        acceptedAt: '',
        claimLock: donation.assignedNgoId || '',
        updatedAt: now,
        timeline: updatedTimeline,
      });

      const volRef = doc(db, 'volunteerProfiles', volunteerUid);
      tx.set(
        volRef,
        {
          activeAssignmentId: '',
          updatedAt: now,
        },
        { merge: true }
      );

      return {
        success: true,
        message: 'Collection assignment cancelled. Donation has been made available again.',
        revertedDonation: {
          ...donation,
          status: revertedStatus,
        },
      };
    });

    if (result.success && result.revertedDonation) {
      if (result.revertedDonation.donorId) {
        sendNotification({
          userId: result.revertedDonation.donorId,
          title: 'Collection Assignment Released',
          message: `Volunteer ${volunteerName} had to release your collection request. It is now open again for nearby volunteers.`,
          type: 'alert',
          link: '/dashboard',
        }).catch(console.warn);
      }
      notifyNearbyVolunteers(result.revertedDonation).catch(console.warn);
    }

    return { success: result.success, message: result.message };
  } catch (error) {
    handleFirestoreError(error, OperationType.WRITE, path);
    return { success: false, message: 'Error cancelling collection.' };
  }
}

/**
 * Validated collection status progression
 * AVAILABLE → ACCEPTED → PICKED_UP → IN_TRANSIT → DELIVERED → COMPLETED
 */
export async function transitionCollectionStatus(
  donationId: string,
  nextStatus: DonationStatus,
  actorId: string,
  actorName: string,
  note?: string,
  extra?: Partial<Donation>
): Promise<{ success: boolean; message: string }> {
  const donationRef = doc(db, 'donations', donationId);
  const path = `donations/${donationId}`;

  try {
    const result = await runTransaction(db, async (tx) => {
      const snap = await tx.get(donationRef);
      if (!snap.exists()) {
        return { success: false, message: 'Donation not found' };
      }

      const donation = snap.data() as Donation;
      const current = donation.status;

      const allowedTransitions: Record<DonationStatus, DonationStatus[]> = {
        available: ['requested', 'accepted', 'cancelled', 'expired'],
        requested: ['accepted', 'available', 'cancelled', 'expired'],
        accepted: ['picked_up', 'available', 'cancelled'],
        scheduled: ['picked_up', 'available', 'cancelled'],
        picked_up: ['in_transit', 'delivered', 'cancelled'],
        in_transit: ['delivered', 'cancelled'],
        delivered: ['completed'],
        completed: [],
        cancelled: [],
        expired: [],
      };

      if (!allowedTransitions[current]?.includes(nextStatus)) {
        return {
          success: false,
          message: `Invalid transition from "${current}" to "${nextStatus}".`,
        };
      }

      if (nextStatus === 'picked_up' || nextStatus === 'delivered') {
        return {
          success: false,
          message: 'Pickup and delivery must be confirmed with the QR code or PIN handover.',
        };
      }

      const now = new Date().toISOString();

      const updatedTimeline: TimelineEntry[] = [
        ...(donation.timeline || []),
        {
          status: nextStatus,
          timestamp: now,
          actorName,
          actorId,
          note: note || `Status updated to ${nextStatus.replace('_', ' ').toUpperCase()}`,
        },
      ];

      const updates: Partial<Donation> = {
        ...extra,
        status: nextStatus,
        updatedAt: now,
        timeline: updatedTimeline,
      };

      if ((nextStatus as string) === 'picked_up') {
        updates.pickedUpAt = now;
      } else if ((nextStatus as string) === 'delivered') {
        updates.deliveredAt = now;
      } else if ((nextStatus as string) === 'completed') {
        updates.completedAt = now;
      }

      tx.update(donationRef, sanitizeForFirestore(updates));

      // If delivered or completed, clean up volunteer stats (impact records are created server-side via /api/verify/delivery)
      if ((nextStatus as string) === 'delivered' || (nextStatus as string) === 'completed') {

        // Update volunteer stats
        if (donation.assignedVolunteerId) {
          const volRef = doc(db, 'volunteerProfiles', donation.assignedVolunteerId);
          tx.set(
            volRef,
            {
              activeAssignmentId: '',
              isAvailable: true,
              updatedAt: now,
            },
            { merge: true }
          );
        }

        // Auto-stop any active live tracking session
        stopLiveTracking(donation.id).catch(console.warn);
      }

      return {
        success: true,
        message: `Status transitioned to ${nextStatus.replace('_', ' ').toUpperCase()}`,
        donation,
      };
    });

    if (result.success && result.donation) {
      const don = result.donation;
      if (nextStatus === 'picked_up' && don.donorId) {
        getDoc(doc(db, 'users', don.donorId)).then((snap) => {
          if (snap.exists()) {
            const u = snap.data() as UserProfile;
            if (u?.pushNotificationsEnabled && u?.notificationPreferences?.donorOnPickup !== false) {
              const tokens = u.fcmTokens || (u.fcmToken ? [u.fcmToken] : []);
              dispatchDonationLifecyclePush(don, 'picked_up', {
                actorName,
                recipientTokens: tokens,
                recipientUserIds: [don.donorId],
              }).catch(console.warn);
            }
          }
        }).catch(console.warn);
      } else if ((nextStatus === 'delivered' || nextStatus === 'completed') && don.donorId) {
        getDoc(doc(db, 'users', don.donorId)).then((snap) => {
          if (snap.exists()) {
            const u = snap.data() as UserProfile;
            if (u?.pushNotificationsEnabled && u?.notificationPreferences?.donorOnDelivered !== false) {
              const tokens = u.fcmTokens || (u.fcmToken ? [u.fcmToken] : []);
              dispatchDonationLifecyclePush(don, 'delivered', {
                actorName,
                recipientTokens: tokens,
                recipientUserIds: [don.donorId],
              }).catch(console.warn);
            }
          }
        }).catch(console.warn);
      }
    }

    return result;
  } catch (error) {
    handleFirestoreError(error, OperationType.WRITE, path);
    return { success: false, message: 'Error updating collection status.' };
  }
}

/**
 * Update donation status with timeline tracking
 */
export async function updateDonationStatus(
  donationId: string,
  newStatus: DonationStatus,
  actorName: string,
  actorId: string,
  note?: string,
  extraUpdates?: Partial<Donation>
): Promise<void> {
  const path = `donations/${donationId}`;
  try {
    if (newStatus === 'picked_up' || newStatus === 'delivered') {
      throw new Error('Pickup and delivery must be confirmed with the QR code or PIN handover.');
    }

    const donationRef = doc(db, 'donations', donationId);
    const snap = await getDoc(donationRef);
    if (!snap.exists()) {
      throw new Error('Donation not found');
    }

    const donation = snap.data() as Donation;
    const now = new Date().toISOString();

    const updatedTimeline: TimelineEntry[] = [
      ...(donation.timeline || []),
      {
        status: newStatus,
        timestamp: now,
        actorName,
        actorId,
        note: note || `Status transitioned to ${newStatus}`,
      },
    ];

    const updates: Partial<Donation> = {
      ...extraUpdates,
      status: newStatus,
      updatedAt: now,
      timeline: updatedTimeline,
    };

    await updateDoc(donationRef, updates);

    // If delivered, record verified impact
    if ((newStatus as string) === 'delivered') {
      const quantityKg = donation.unit.toLowerCase() === 'kg'
        ? donation.quantity
        : (donation.servings ? donation.servings * 0.4 : donation.quantity * 0.5);

      const estimatedMeals = donation.servings || Math.round(quantityKg * 2.5);

      await recordImpact({
        donationId: donation.id,
        foodName: donation.foodName,
        quantityKg: Math.round(quantityKg * 10) / 10,
        estimatedMeals,
        donorId: donation.donorId,
        ngoId: donation.assignedNgoId || 'unknown_ngo',
        volunteerId: donation.assignedVolunteerId || actorId,
        deliveredAt: now,
      });

      // Update volunteer total pickups count if applicable
      if (donation.assignedVolunteerId) {
        try {
          const volSnap = await getDoc(doc(db, 'volunteerProfiles', donation.assignedVolunteerId));
          if (volSnap.exists()) {
            const vData = volSnap.data() as VolunteerProfile;
            await updateDoc(doc(db, 'volunteerProfiles', donation.assignedVolunteerId), {
              totalPickups: (vData.totalPickups || 0) + 1,
              activeAssignmentId: '',
              isAvailable: true,
              updatedAt: now,
            });
          }
        } catch (volErr) {
          console.warn('Could not increment volunteer stats:', volErr);
        }
      }
    }

    // Send notifications to donor and assigned parties
    if (donation.donorId && donation.donorId !== actorId) {
      await sendNotification({
        userId: donation.donorId,
        title: `Donation Update: ${donation.foodName}`,
        message: `Status is now "${newStatus.replace('_', ' ').toUpperCase()}". Note: ${note || 'Updated by network partner.'}`,
        type: 'status_change',
        link: `/donations/${donationId}`,
      });
    }

    if (donation.assignedNgoId && donation.assignedNgoId !== actorId) {
      await sendNotification({
        userId: donation.assignedNgoId,
        title: `Pickup Update: ${donation.foodName}`,
        message: `Status changed to "${newStatus.replace('_', ' ').toUpperCase()}".`,
        type: 'status_change',
        link: `/donations/${donationId}`,
      });
    }

    // Audit log
    await createAuditLog({
      action: `DONATION_STATUS_${newStatus.toUpperCase()}`,
      performedBy: actorId,
      targetId: donationId,
      details: `Status set to ${newStatus}. Actor: ${actorName}`,
    });
  } catch (error) {
    handleFirestoreError(error, OperationType.UPDATE, path);
  }
}

// ----------------------------------------------------
// Re-exports from Modular Domain Services
// ----------------------------------------------------
export * from './dbOrgService';
export * from './dbTrackingService';

export {
  subscribeNotifications,
  sendNotification,
  markAllNotificationsAsRead,
  markNotificationAsRead,
} from './dbNotificationService';

export async function getUserNotifications(userId: string): Promise<InAppNotification[]> {
  return fetchUserNotifications(userId);
}

export async function toggleNotificationRead(notificationId: string, currentReadStatus: boolean): Promise<void> {
  return toggleNotifRead(notificationId, currentReadStatus);
}

export async function deleteNotification(notificationId: string): Promise<void> {
  return removeNotification(notificationId);
}

export async function clearAllNotifications(userId: string): Promise<void> {
  return clearAllUserNotifications(userId);
}

export {
  getOrCreateVerification,
  verifyDeliveryWithToken,
  getDonationPrivateContact,
} from './dbVerificationService';

export async function verifyPickupWithToken(
  donationId: string,
  token: string,
  volunteerId: string,
  volunteerName: string
): Promise<{ success: boolean; message: string; verifiedAt?: string }> {
  return verifyPickupToken(donationId, token, volunteerId, volunteerName);
}
