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
import { dispatchFcmToNearbyVolunteers } from './fcmService';

const ADMIN_BOOTSTRAP_EMAIL = 'rohangr18@gmail.com';

// ----------------------------------------------------
// User & Auth Profile Service
// ----------------------------------------------------
export async function getUserProfile(uid: string): Promise<UserProfile | null> {
  const path = `users/${uid}`;
  try {
    const snap = await getDoc(doc(db, 'users', uid));
    if (snap.exists()) {
      return snap.data() as UserProfile;
    }
    return null;
  } catch (error) {
    if (error instanceof Error && error.message.includes('the client is offline')) {
      console.warn('Firestore is connecting or temporarily offline for path:', path);
      return null;
    }
    handleFirestoreError(error, OperationType.GET, path);
  }
}

export async function createOrUpdateUserProfile(profile: Partial<UserProfile> & { uid: string; email: string }): Promise<UserProfile> {
  const path = `users/${profile.uid}`;
  try {
    const isBootstrapAdmin = profile.email.toLowerCase() === ADMIN_BOOTSTRAP_EMAIL.toLowerCase();

    // Check if existing profile document exists to preserve existing fields and role
    const snap = await getDoc(doc(db, 'users', profile.uid));
    const existing = snap.exists() ? (snap.data() as UserProfile) : null;

    let role: UserRole | undefined = profile.role || existing?.role;
    if (isBootstrapAdmin) {
      role = 'admin';
    } else if (role === 'admin') {
      role = 'donor'; // Security: prevent self-assigning admin role
    }

    const userDoc: UserProfile = {
      uid: profile.uid,
      email: profile.email,
      displayName: profile.displayName || existing?.displayName || profile.email.split('@')[0],
      ...(role ? { role } : {}),
      phoneNumber: profile.phoneNumber ?? existing?.phoneNumber ?? '',
      phone: profile.phone ?? existing?.phone ?? '',
      organizationId: profile.organizationId ?? existing?.organizationId ?? '',
      preferredLanguage: profile.preferredLanguage ?? existing?.preferredLanguage ?? 'en',
      ...(profile.pushNotificationsEnabled !== undefined
        ? { pushNotificationsEnabled: profile.pushNotificationsEnabled }
        : existing?.pushNotificationsEnabled !== undefined
        ? { pushNotificationsEnabled: existing.pushNotificationsEnabled }
        : {}),
      ...(profile.pushNotificationPermission
        ? { pushNotificationPermission: profile.pushNotificationPermission }
        : existing?.pushNotificationPermission
        ? { pushNotificationPermission: existing.pushNotificationPermission }
        : {}),
      ...(profile.fcmToken ? { fcmToken: profile.fcmToken } : existing?.fcmToken ? { fcmToken: existing.fcmToken } : {}),
      ...(profile.notificationRadiusKm !== undefined
        ? { notificationRadiusKm: profile.notificationRadiusKm }
        : existing?.notificationRadiusKm !== undefined
        ? { notificationRadiusKm: existing.notificationRadiusKm }
        : {}),
      createdAt: existing?.createdAt || profile.createdAt || new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };

    await setDoc(doc(db, 'users', profile.uid), userDoc, { merge: true });

    // If role is volunteer, ensure volunteerProfiles entry exists
    if (role === 'volunteer') {
      try {
        const volSnap = await getDoc(doc(db, 'volunteerProfiles', profile.uid));
        if (!volSnap.exists()) {
          await saveVolunteerProfile({
            userId: profile.uid,
            fullName: userDoc.displayName,
            phone: userDoc.phone || userDoc.phoneNumber || '',
            vehicleType: 'Two Wheeler',
            serviceArea: 'Downtown & Metro',
            isAvailable: true,
            notificationRadiusKm: 10,
            optInNotifications: true,
          });
        }
      } catch (volErr) {
        console.warn('Could not auto-initialize volunteer profile:', volErr);
      }
    }

    // If bootstrap admin, also record in admins collection
    if (isBootstrapAdmin) {
      try {
        await setDoc(doc(db, 'admins', profile.uid), {
          uid: profile.uid,
          email: profile.email,
          assignedAt: new Date().toISOString(),
        }, { merge: true });
      } catch (adminErr) {
        console.warn('Could not set admins doc:', adminErr);
      }
    }

    return userDoc;
  } catch (error) {
    handleFirestoreError(error, OperationType.WRITE, path);
    throw error;
  }
}

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
        calculatedDistance = calculateDistanceKm(
          donation.latitude,
          donation.longitude,
          vol.latitude,
          vol.longitude
        );
        isWithinRadius = calculatedDistance <= maxRadiusKm;
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
    const donationRef = doc(collection(db, 'donations'));
    const now = new Date().toISOString();
    
    const initialTimeline: TimelineEntry = {
      status: 'available',
      timestamp: now,
      actorName: data.donorName,
      actorId: data.donorId,
      note: 'Donation created and listed for rescue.',
    };

    const newDonation: Donation = {
      ...data,
      id: donationRef.id,
      timeZone: data.timeZone || 'Asia/Kolkata',
      status: 'available',
      createdAt: now,
      updatedAt: now,
      timeline: [initialTimeline],
    };

    await setDoc(donationRef, newDonation);

    // Private confirmation notification strictly isolated to the creating donor
    await sendNotification({
      id: `notif_donor_create_${donationRef.id}`,
      userId: data.donorId,
      recipientUserId: data.donorId,
      title: 'Donation Listed Successfully',
      message: `Your donation "${data.foodName}" has been posted.${data.availableFrom && data.availableUntil ? ` Scheduled pickup window: ${data.availableFrom} – ${data.availableUntil} (${data.pickupDate || 'Today'}, ${newDonation.timeZone}).` : ''} Nearby volunteers are being alerted.`,
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
    notifyNearbyVolunteers(newDonation).catch((notifErr) => {
      console.warn('Async volunteer notification warning:', notifErr);
    });

    return donationRef.id;
  } catch (error) {
    handleFirestoreError(error, OperationType.CREATE, path);
  }
}

/**
 * Transactional claim request to prevent duplicate claims by multiple NGOs
 */
export async function claimDonationByNgo(
  donationId: string,
  ngoId: string,
  ngoName: string,
  userDisplayName: string
): Promise<{ success: boolean; message: string }> {
  const donationRef = doc(db, 'donations', donationId);
  const path = `donations/${donationId}`;

  try {
    return await runTransaction(db, async (transaction) => {
      const snap = await transaction.get(donationRef);
      if (!snap.exists()) {
        throw new Error('Donation listing not found');
      }

      const donation = snap.data() as Donation;

      if (donation.status !== 'available') {
        return {
          success: false,
          message: `This donation is no longer available. Current status: ${donation.status}`,
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
        message: 'Donation successfully claimed and locked for your organization!',
      };
    });
  } catch (error) {
    handleFirestoreError(error, OperationType.UPDATE, path);
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
): Promise<{ success: boolean; message: string; donation?: Donation }> {
  const donationRef = doc(db, 'donations', donationId);
  const path = `donations/${donationId}`;

  try {
    const result = await runTransaction(db, async (tx) => {
      const snap = await tx.get(donationRef);
      if (!snap.exists()) {
        return { success: false, message: 'Donation listing not found.' };
      }

      const donation = snap.data() as Donation;

      // Safe state check: can only accept if available or requested
      if (donation.status !== 'available' && donation.status !== 'requested') {
        return {
          success: false,
          message: `This collection request is no longer available (current status: ${donation.status.toUpperCase()}).`,
        };
      }

      // Strict expiration check: reject if collection deadline has already passed
      const deadlineStr = donation.collectionDeadline || donation.pickupDeadline;
      if (deadlineStr) {
        const deadlineTime = new Date(deadlineStr).getTime();
        if (!isNaN(deadlineTime) && deadlineTime < Date.now()) {
          return {
            success: false,
            message: 'This collection request has expired and cannot be accepted.',
          };
        }
      }

      // Check collision: if another volunteer already claimed
      if (donation.assignedVolunteerId && donation.assignedVolunteerId !== volunteerUid) {
        return {
          success: false,
          message: 'Another volunteer has already accepted this collection request.',
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

      // Update volunteer profile's active assignment
      const volRef = doc(db, 'volunteerProfiles', volunteerUid);
      tx.set(
        volRef,
        {
          activeAssignmentId: donationId,
          updatedAt: now,
        },
        { merge: true }
      );

      // Audit log
      const auditRef = doc(collection(db, 'auditLogs'));
      tx.set(auditRef, {
        id: auditRef.id,
        action: 'COLLECTION_ACCEPTED_BY_VOLUNTEER',
        performedBy: volunteerUid,
        targetId: donationId,
        details: `Volunteer ${volunteerName} accepted collection for "${donation.foodName}"`,
        timestamp: now,
      });

      return {
        success: true,
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

    // Notify donor & recipient NGO privately
    if (result.success && result.donation) {
      if (result.donation.donorId) {
        const schedWindow = result.donation.availableFrom && result.donation.availableUntil
          ? ` (Scheduled pickup window: ${result.donation.availableFrom} – ${result.donation.availableUntil}${result.donation.pickupDate ? `, ${result.donation.pickupDate}` : ''}${result.donation.timeZone ? ` ${result.donation.timeZone}` : ''})`
          : '';
        sendNotification({
          id: `notif_donor_accepted_${result.donation.id}`,
          userId: result.donation.donorId,
          recipientUserId: result.donation.donorId,
          title: 'Volunteer Accepted Collection',
          message: `${volunteerName} has accepted your donation "${result.donation.foodName}" and is scheduled for pickup${schedWindow}.`,
          type: 'assignment',
          link: '/dashboard',
          donationId: result.donation.id,
          deliveryStatus: 'delivered',
        }).catch(console.warn);
      }

      if (result.donation.assignedNgoId) {
        sendNotification({
          userId: result.donation.assignedNgoId,
          recipientUserId: result.donation.assignedNgoId,
          title: 'Volunteer Courier En Route',
          message: `${volunteerName} is collecting food donation "${result.donation.foodName}" for delivery.`,
          type: 'status_change',
          link: '/dashboard',
          donationId: result.donation.id,
        }).catch(console.warn);
      }
    }

    return result;
  } catch (error) {
    handleFirestoreError(error, OperationType.WRITE, path);
    return { success: false, message: 'Transaction error accepting collection request.' };
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
    return await runTransaction(db, async (tx) => {
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

      if (nextStatus === 'picked_up') {
        updates.pickedUpAt = now;
      } else if (nextStatus === 'delivered') {
        updates.deliveredAt = now;
      } else if (nextStatus === 'completed') {
        updates.completedAt = now;
      }

      tx.update(donationRef, updates);

      // If delivered or completed, create impact record & clean up volunteer stats
      if (nextStatus === 'delivered' || nextStatus === 'completed') {
        const quantityKg = donation.unit.toLowerCase() === 'kg'
          ? donation.quantity
          : (donation.servings ? donation.servings * 0.4 : donation.quantity * 0.5);
        const estimatedMeals = donation.servings || Math.round(quantityKg * 2.5);

        const impactRef = doc(collection(db, 'impactRecords'));
        tx.set(impactRef, {
          id: impactRef.id,
          donationId: donation.id,
          foodName: donation.foodName,
          quantityKg: Math.round(quantityKg * 10) / 10,
          estimatedMeals,
          donorId: donation.donorId,
          ngoId: donation.assignedNgoId || 'community_shelter',
          volunteerId: donation.assignedVolunteerId || actorId,
          deliveredAt: now,
        });

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
      };
    });
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
    if (newStatus === 'delivered') {
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
// Organizations (NGOs) Services
// ----------------------------------------------------
export function subscribeOrganizations(callback: (orgs: Organization[]) => void) {
  const path = 'organizations';
  try {
    const q = query(collection(db, 'organizations'), orderBy('createdAt', 'desc'));
    return onSnapshot(
      q,
      (snapshot) => {
        const orgs: Organization[] = [];
        snapshot.forEach((docSnap) => {
          orgs.push({ id: docSnap.id, ...docSnap.data() } as Organization);
        });
        callback(orgs);
      },
      (error) => {
        handleFirestoreError(error, OperationType.LIST, path);
      }
    );
  } catch (error) {
    handleFirestoreError(error, OperationType.LIST, path);
  }
}

export async function registerOrganization(data: Omit<Organization, 'id' | 'createdAt' | 'updatedAt' | 'verificationStatus'>): Promise<string> {
  const path = 'organizations';
  try {
    const orgRef = doc(collection(db, 'organizations'));
    const now = new Date().toISOString();

    const newOrg: Organization = {
      ...data,
      id: orgRef.id,
      verificationStatus: 'pending',
      createdAt: now,
      updatedAt: now,
    };

    await setDoc(orgRef, newOrg);

    // Link user profile to organization
    await updateDoc(doc(db, 'users', data.ownerUid), {
      organizationId: orgRef.id,
      updatedAt: now,
    });

    return orgRef.id;
  } catch (error) {
    handleFirestoreError(error, OperationType.CREATE, path);
  }
}

export async function setOrganizationVerification(
  orgId: string,
  status: 'verified' | 'rejected',
  notes: string,
  adminId: string
): Promise<void> {
  const path = `organizations/${orgId}`;
  try {
    const orgRef = doc(db, 'organizations', orgId);
    const snap = await getDoc(orgRef);
    if (!snap.exists()) throw new Error('Organization not found');

    const org = snap.data() as Organization;

    await updateDoc(orgRef, {
      verificationStatus: status,
      verificationNotes: notes,
      updatedAt: new Date().toISOString(),
    });

    // Notify organization owner
    await sendNotification({
      userId: org.ownerUid,
      title: `Organization Verification: ${status.toUpperCase()}`,
      message: status === 'verified'
        ? 'Congratulations! Your NGO profile has been verified. You can now request food donations directly.'
        : `Verification request review: ${notes || 'Please contact support with documentation.'}`,
      type: 'alert',
      link: '/ngo',
    });

    await createAuditLog({
      action: `ORG_VERIFICATION_${status.toUpperCase()}`,
      performedBy: adminId,
      targetId: orgId,
      details: `Organization ${org.name} verification marked ${status}. Notes: ${notes}`,
    });
  } catch (error) {
    handleFirestoreError(error, OperationType.UPDATE, path);
  }
}

// ----------------------------------------------------
// Volunteer Profiles
// ----------------------------------------------------
export function subscribeVolunteerProfiles(callback: (vols: VolunteerProfile[]) => void) {
  const path = 'volunteerProfiles';
  try {
    const q = query(collection(db, 'volunteerProfiles'));
    return onSnapshot(
      q,
      (snapshot) => {
        const vols: VolunteerProfile[] = [];
        snapshot.forEach((docSnap) => {
          vols.push({ id: docSnap.id, ...docSnap.data() } as VolunteerProfile);
        });
        callback(vols);
      },
      (error) => {
        handleFirestoreError(error, OperationType.LIST, path);
      }
    );
  } catch (error) {
    handleFirestoreError(error, OperationType.LIST, path);
  }
}

export async function getVolunteerProfile(userId: string): Promise<VolunteerProfile | null> {
  const path = `volunteerProfiles/${userId}`;
  try {
    const snap = await getDoc(doc(db, 'volunteerProfiles', userId));
    if (snap.exists()) {
      return { id: snap.id, ...snap.data() } as VolunteerProfile;
    }
    return null;
  } catch (error) {
    handleFirestoreError(error, OperationType.GET, path);
    return null;
  }
}

export async function saveVolunteerProfile(profile: Partial<VolunteerProfile> & { userId: string; fullName: string }): Promise<void> {
  const path = `volunteerProfiles/${profile.userId}`;
  try {
    const now = new Date().toISOString();
    const volData: VolunteerProfile = {
      id: profile.userId,
      userId: profile.userId,
      fullName: profile.fullName,
      phone: profile.phone || '',
      vehicleType: profile.vehicleType || 'Two Wheeler',
      serviceArea: profile.serviceArea || 'Downtown & Metro',
      isAvailable: profile.isAvailable ?? true,
      totalPickups: profile.totalPickups || 0,
      activeAssignmentId: profile.activeAssignmentId || '',
      latitude: profile.latitude,
      longitude: profile.longitude,
      address: profile.address,
      notificationRadiusKm: profile.notificationRadiusKm ?? 10,
      optInNotifications: profile.optInNotifications ?? true,
      emergencyContact: profile.emergencyContact,
      ...(profile.fcmToken !== undefined ? { fcmToken: profile.fcmToken } : {}),
      ...(profile.pushNotificationsEnabled !== undefined ? { pushNotificationsEnabled: profile.pushNotificationsEnabled } : {}),
      ...(profile.pushNotificationPermission ? { pushNotificationPermission: profile.pushNotificationPermission } : {}),
      ...(profile.lastTokenUpdate ? { lastTokenUpdate: profile.lastTokenUpdate } : {}),
      createdAt: profile.createdAt || now,
      updatedAt: now,
    };

    await setDoc(doc(db, 'volunteerProfiles', profile.userId), volData, { merge: true });
  } catch (error) {
    handleFirestoreError(error, OperationType.WRITE, path);
  }
}

// ----------------------------------------------------
// Notifications Service
// ----------------------------------------------------
export function subscribeNotifications(userId: string, callback: (notifications: InAppNotification[]) => void) {
  const path = 'notifications';
  try {
    const q = query(
      collection(db, 'notifications'),
      where('userId', '==', userId),
      orderBy('createdAt', 'desc'),
      limit(100)
    );

    return onSnapshot(
      q,
      (snapshot) => {
        const list: InAppNotification[] = [];
        snapshot.forEach((docSnap) => {
          list.push({ id: docSnap.id, ...docSnap.data() } as InAppNotification);
        });
        // Guarantee newest-first timestamp sorting
        list.sort((a, b) => new Date(b.createdAt || 0).getTime() - new Date(a.createdAt || 0).getTime());
        callback(list);
      },
      (error) => {
        // Fallback without orderBy if composite index is pending
        console.warn('subscribeNotifications fallback query:', error.message);
        try {
          const fallbackQ = query(
            collection(db, 'notifications'),
            where('userId', '==', userId),
            limit(100)
          );
          return onSnapshot(
            fallbackQ,
            (snapshot) => {
              const list: InAppNotification[] = [];
              snapshot.forEach((docSnap) => {
                list.push({ id: docSnap.id, ...docSnap.data() } as InAppNotification);
              });
              list.sort((a, b) => new Date(b.createdAt || 0).getTime() - new Date(a.createdAt || 0).getTime());
              callback(list);
            },
            (fallbackErr) => {
              handleFirestoreError(fallbackErr, OperationType.LIST, path);
            }
          );
        } catch {
          handleFirestoreError(error, OperationType.LIST, path);
        }
      }
    );
  } catch (error) {
    handleFirestoreError(error, OperationType.LIST, path);
  }
}

export async function getUserNotifications(userId: string): Promise<InAppNotification[]> {
  const path = 'notifications';
  try {
    try {
      const q = query(
        collection(db, 'notifications'),
        where('userId', '==', userId),
        orderBy('createdAt', 'desc'),
        limit(100)
      );
      const snaps = await getDocs(q);
      const list: InAppNotification[] = [];
      snaps.forEach((d) => list.push({ id: d.id, ...d.data() } as InAppNotification));
      list.sort((a, b) => new Date(b.createdAt || 0).getTime() - new Date(a.createdAt || 0).getTime());
      return list;
    } catch {
      // Fallback query without orderBy
      const fallbackQ = query(
        collection(db, 'notifications'),
        where('userId', '==', userId),
        limit(100)
      );
      const snaps = await getDocs(fallbackQ);
      const list: InAppNotification[] = [];
      snaps.forEach((d) => list.push({ id: d.id, ...d.data() } as InAppNotification));
      list.sort((a, b) => new Date(b.createdAt || 0).getTime() - new Date(a.createdAt || 0).getTime());
      return list;
    }
  } catch (error) {
    handleFirestoreError(error, OperationType.LIST, path);
    return [];
  }
}

export async function sendNotification(
  data: Omit<InAppNotification, 'id' | 'createdAt' | 'read'> & { id?: string }
): Promise<void> {
  const path = 'notifications';
  try {
    const notifId = data.id || doc(collection(db, 'notifications')).id;
    const notifRef = doc(db, 'notifications', notifId);
    const notifDoc: InAppNotification = {
      ...data,
      id: notifId,
      recipientUserId: data.recipientUserId || data.userId,
      deliveryStatus: data.deliveryStatus || 'delivered',
      read: false,
      createdAt: new Date().toISOString(),
    };
    await setDoc(notifRef, notifDoc, { merge: true });
  } catch (error) {
    console.warn('Notification send failed:', error);
  }
}

export async function markNotificationAsRead(id: string): Promise<void> {
  const path = `notifications/${id}`;
  try {
    await updateDoc(doc(db, 'notifications', id), {
      read: true,
      readAt: new Date().toISOString(),
      deliveryStatus: 'read',
    });
  } catch (error) {
    handleFirestoreError(error, OperationType.UPDATE, path);
  }
}

export async function toggleNotificationRead(id: string, read: boolean): Promise<void> {
  const path = `notifications/${id}`;
  try {
    await updateDoc(doc(db, 'notifications', id), {
      read,
      readAt: read ? new Date().toISOString() : null,
      deliveryStatus: read ? 'read' : 'delivered',
    });
  } catch (error) {
    handleFirestoreError(error, OperationType.UPDATE, path);
  }
}

export async function deleteNotification(id: string): Promise<void> {
  const path = `notifications/${id}`;
  try {
    await deleteDoc(doc(db, 'notifications', id));
  } catch (error) {
    handleFirestoreError(error, OperationType.DELETE, path);
  }
}

export async function markAllNotificationsAsRead(userId: string): Promise<void> {
  const path = 'notifications';
  try {
    const q = query(collection(db, 'notifications'), where('userId', '==', userId), where('read', '==', false));
    const snaps = await getDocs(q);
    const now = new Date().toISOString();
    const promises = snaps.docs.map((d) =>
      updateDoc(d.ref, {
        read: true,
        readAt: now,
        deliveryStatus: 'read',
      })
    );
    await Promise.all(promises);
  } catch (error) {
    handleFirestoreError(error, OperationType.UPDATE, path);
  }
}

export async function clearAllNotifications(userId: string): Promise<void> {
  const path = 'notifications';
  try {
    const q = query(collection(db, 'notifications'), where('userId', '==', userId));
    const snaps = await getDocs(q);
    const promises = snaps.docs.map((d) => deleteDoc(d.ref));
    await Promise.all(promises);
  } catch (error) {
    handleFirestoreError(error, OperationType.DELETE, path);
  }
}

// ----------------------------------------------------
// Impact Records & Analytics
// ----------------------------------------------------
export async function recordImpact(data: Omit<ImpactRecord, 'id'>): Promise<void> {
  const path = 'impactRecords';
  try {
    const recordRef = doc(collection(db, 'impactRecords'));
    await setDoc(recordRef, {
      ...data,
      id: recordRef.id,
    });
  } catch (error) {
    console.error('Impact record write error:', error);
  }
}

export function subscribeImpactRecords(callback: (records: ImpactRecord[]) => void) {
  const path = 'impactRecords';
  try {
    const q = query(collection(db, 'impactRecords'), orderBy('deliveredAt', 'desc'), limit(200));
    return onSnapshot(
      q,
      (snapshot) => {
        const list: ImpactRecord[] = [];
        snapshot.forEach((docSnap) => {
          list.push({ id: docSnap.id, ...docSnap.data() } as ImpactRecord);
        });
        callback(list);
      },
      (error) => {
        handleFirestoreError(error, OperationType.LIST, path);
      }
    );
  } catch (error) {
    handleFirestoreError(error, OperationType.LIST, path);
  }
}

// ----------------------------------------------------
// Audit Logging
// ----------------------------------------------------
export async function createAuditLog(data: Omit<AuditLog, 'id' | 'timestamp'>): Promise<void> {
  const path = 'auditLogs';
  try {
    const ref = doc(collection(db, 'auditLogs'));
    await setDoc(ref, {
      ...data,
      id: ref.id,
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    console.warn('Audit log write error:', error);
  }
}

export function subscribeAuditLogs(callback: (logs: AuditLog[]) => void) {
  const path = 'auditLogs';
  try {
    const q = query(collection(db, 'auditLogs'), orderBy('timestamp', 'desc'), limit(100));
    return onSnapshot(
      q,
      (snapshot) => {
        const list: AuditLog[] = [];
        snapshot.forEach((docSnap) => {
          list.push({ id: docSnap.id, ...docSnap.data() } as AuditLog);
        });
        callback(list);
      },
      (error) => {
        handleFirestoreError(error, OperationType.LIST, path);
      }
    );
  } catch (error) {
    handleFirestoreError(error, OperationType.LIST, path);
  }
}

// ----------------------------------------------------
// QR Verification Tokens & Handover Confirmation
// ----------------------------------------------------
function generateSecureToken(prefix: string): string {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let str = '';
  for (let i = 0; i < 8; i++) {
    str += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return `${prefix}-${str}`;
}

function generatePin(): string {
  return Math.floor(100000 + Math.random() * 900000).toString();
}

export async function getOrCreateVerification(donationId: string): Promise<VerificationRecord> {
  const path = `verifications/${donationId}`;
  try {
    const ref = doc(db, 'verifications', donationId);
    const snap = await getDoc(ref);

    if (snap.exists()) {
      return snap.data() as VerificationRecord;
    }

    const now = new Date().toISOString();
    const record: VerificationRecord = {
      donationId,
      pickupToken: generateSecureToken('PKUP'),
      deliveryToken: generateSecureToken('DLVR'),
      pickupPin: generatePin(),
      deliveryPin: generatePin(),
      pickupUsed: false,
      deliveryUsed: false,
      createdAt: now,
      updatedAt: now,
    };

    await setDoc(ref, record);
    return record;
  } catch (error) {
    handleFirestoreError(error, OperationType.WRITE, path);
    throw error;
  }
}

export async function verifyPickupWithToken(
  donationId: string,
  tokenOrPin: string,
  volunteerId: string,
  volunteerName: string
): Promise<{ success: boolean; message: string }> {
  const path = `verifications/${donationId}`;
  try {
    return await runTransaction(db, async (tx) => {
      const verRef = doc(db, 'verifications', donationId);
      const donRef = doc(db, 'donations', donationId);

      const verSnap = await tx.get(verRef);
      const donSnap = await tx.get(donRef);

      if (!donSnap.exists()) {
        return { success: false, message: 'Donation not found in records.' };
      }

      const donation = donSnap.data() as Donation;
      if (!['accepted', 'scheduled'].includes(donation.status)) {
        return {
          success: false,
          message: `Cannot verify pickup: donation status is currently "${donation.status}". Must be accepted or scheduled.`,
        };
      }

      if (!verSnap.exists()) {
        return { success: false, message: 'No verification record found for this pickup.' };
      }

      const verData = verSnap.data() as VerificationRecord;
      if (verData.pickupUsed) {
        return {
          success: false,
          message: 'Pickup token has already been used and cannot be replayed.',
        };
      }

      const trimmedInput = (tokenOrPin || '').trim().toUpperCase();
      const matchesToken = verData.pickupToken.toUpperCase() === trimmedInput;
      const matchesPin = verData.pickupPin === trimmedInput;

      if (!matchesToken && !matchesPin) {
        return {
          success: false,
          message: 'Invalid pickup verification token or PIN. Please check the donor QR code.',
        };
      }

      const now = new Date().toISOString();

      // Update verification doc
      tx.update(verRef, {
        pickupUsed: true,
        pickedUpAt: now,
        pickedUpBy: volunteerId,
        pickedUpByName: volunteerName,
        updatedAt: now,
      });

      // Update donation status to picked_up
      const updatedTimeline: TimelineEntry[] = [
        ...(donation.timeline || []),
        {
          status: 'picked_up',
          timestamp: now,
          actorName: volunteerName,
          actorId: volunteerId,
          note: 'Physical pickup verified via secure QR handover token.',
        },
      ];

      tx.update(donRef, {
        status: 'picked_up',
        assignedVolunteerId: volunteerId,
        assignedVolunteerName: volunteerName,
        updatedAt: now,
        timeline: updatedTimeline,
      });

      return {
        success: true,
        message: 'Pickup successfully verified! Food is now marked as in transit.',
      };
    });
  } catch (error) {
    handleFirestoreError(error, OperationType.WRITE, path);
    return { success: false, message: 'Error verifying pickup token.' };
  }
}

export async function verifyDeliveryWithToken(
  donationId: string,
  tokenOrPin: string,
  verifierId: string,
  verifierName: string
): Promise<{ success: boolean; message: string }> {
  const path = `verifications/${donationId}`;
  try {
    return await runTransaction(db, async (tx) => {
      const verRef = doc(db, 'verifications', donationId);
      const donRef = doc(db, 'donations', donationId);

      const verSnap = await tx.get(verRef);
      const donSnap = await tx.get(donRef);

      if (!donSnap.exists()) {
        return { success: false, message: 'Donation not found in records.' };
      }

      const donation = donSnap.data() as Donation;
      if (donation.status !== 'picked_up') {
        return {
          success: false,
          message: `Cannot verify delivery: donation status is currently "${donation.status}". Must be in transit (picked_up).`,
        };
      }

      if (!verSnap.exists()) {
        return { success: false, message: 'No verification record found for this delivery.' };
      }

      const verData = verSnap.data() as VerificationRecord;
      if (verData.deliveryUsed) {
        return {
          success: false,
          message: 'Delivery token has already been confirmed and cannot be replayed.',
        };
      }

      const trimmedInput = (tokenOrPin || '').trim().toUpperCase();
      const matchesToken = verData.deliveryToken.toUpperCase() === trimmedInput;
      const matchesPin = verData.deliveryPin === trimmedInput;

      if (!matchesToken && !matchesPin) {
        return {
          success: false,
          message: 'Invalid delivery verification token or PIN. Please check the recipient QR code.',
        };
      }

      const now = new Date().toISOString();

      // Update verification record
      tx.update(verRef, {
        deliveryUsed: true,
        deliveredAt: now,
        deliveredBy: verifierId,
        deliveredByName: verifierName,
        updatedAt: now,
      });

      // Update donation doc
      const updatedTimeline: TimelineEntry[] = [
        ...(donation.timeline || []),
        {
          status: 'delivered',
          timestamp: now,
          actorName: verifierName,
          actorId: verifierId,
          note: 'Shelter delivery receipt confirmed via verified QR token.',
        },
      ];

      tx.update(donRef, {
        status: 'delivered',
        updatedAt: now,
        timeline: updatedTimeline,
      });

      // Create verified Impact Record
      const quantityKg = donation.unit.toLowerCase() === 'kg'
        ? donation.quantity
        : (donation.servings ? donation.servings * 0.4 : donation.quantity * 0.5);

      const estimatedMeals = donation.servings || Math.round(quantityKg * 2.5);

      const impactRef = doc(collection(db, 'impactRecords'));
      tx.set(impactRef, {
        id: impactRef.id,
        donationId: donation.id,
        foodName: donation.foodName,
        quantityKg: Math.round(quantityKg * 10) / 10,
        estimatedMeals,
        donorId: donation.donorId,
        ngoId: donation.assignedNgoId || verifierId,
        volunteerId: donation.assignedVolunteerId || verifierId,
        deliveredAt: now,
      });

      return {
        success: true,
        message: 'Delivery successfully verified! Impact record created.',
      };
    });
  } catch (error) {
    handleFirestoreError(error, OperationType.WRITE, path);
    return { success: false, message: 'Error verifying delivery token.' };
  }
}

// ----------------------------------------------------
// Live GPS Pickup Tracking Sessions
// ----------------------------------------------------
export async function updateLiveTracking(session: LiveTrackingSession): Promise<void> {
  const path = `trackingSessions/${session.donationId}`;
  try {
    const ref = doc(db, 'trackingSessions', session.donationId);
    await setDoc(
      ref,
      {
        ...session,
        lastUpdatedAt: new Date().toISOString(),
      },
      { merge: true }
    );
  } catch (error) {
    handleFirestoreError(error, OperationType.WRITE, path);
  }
}

export async function stopLiveTracking(donationId: string): Promise<void> {
  const path = `trackingSessions/${donationId}`;
  try {
    const ref = doc(db, 'trackingSessions', donationId);
    await updateDoc(ref, {
      status: 'stopped',
      lastUpdatedAt: new Date().toISOString(),
    });
  } catch (error) {
    // Non-fatal if session was already deleted
    console.warn('Could not stop tracking session:', error);
  }
}

export function subscribeLiveTracking(
  donationId: string,
  callback: (session: LiveTrackingSession | null) => void
) {
  const path = `trackingSessions/${donationId}`;
  try {
    const ref = doc(db, 'trackingSessions', donationId);
    return onSnapshot(
      ref,
      (snap) => {
        if (snap.exists()) {
          callback(snap.data() as LiveTrackingSession);
        } else {
          callback(null);
        }
      },
      (error) => {
        handleFirestoreError(error, OperationType.GET, path);
      }
    );
  } catch (error) {
    handleFirestoreError(error, OperationType.GET, path);
  }
}

