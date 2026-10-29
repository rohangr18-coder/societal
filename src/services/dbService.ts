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
    let role = profile.role || 'donor';
    if (!isBootstrapAdmin && role === 'admin') {
      role = 'donor'; // Security: prevent self-assigning admin role
    }
    if (isBootstrapAdmin) {
      role = 'admin';
    }
    
    const userDoc: UserProfile = {
      uid: profile.uid,
      email: profile.email,
      displayName: profile.displayName || profile.email.split('@')[0],
      role: role,
      phoneNumber: profile.phoneNumber || '',
      organizationId: profile.organizationId || '',
      createdAt: profile.createdAt || new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };

    await setDoc(doc(db, 'users', profile.uid), userDoc, { merge: true });

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
      status: 'available',
      createdAt: now,
      updatedAt: now,
      timeline: [initialTimeline],
    };

    await setDoc(donationRef, newDonation);

    // Audit log
    await createAuditLog({
      action: 'DONATION_CREATED',
      performedBy: data.donorId,
      targetId: donationRef.id,
      details: `Created donation: ${data.foodName} (${data.quantity} ${data.unit})`,
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
      limit(50)
    );

    return onSnapshot(
      q,
      (snapshot) => {
        const list: InAppNotification[] = [];
        snapshot.forEach((docSnap) => {
          list.push({ id: docSnap.id, ...docSnap.data() } as InAppNotification);
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

export async function sendNotification(data: Omit<InAppNotification, 'id' | 'createdAt' | 'read'>): Promise<void> {
  const path = 'notifications';
  try {
    const notifRef = doc(collection(db, 'notifications'));
    const notifDoc: InAppNotification = {
      ...data,
      id: notifRef.id,
      read: false,
      createdAt: new Date().toISOString(),
    };
    await setDoc(notifRef, notifDoc);
  } catch (error) {
    console.warn('Notification send failed:', error);
  }
}

export async function markNotificationAsRead(id: string): Promise<void> {
  const path = `notifications/${id}`;
  try {
    await updateDoc(doc(db, 'notifications', id), { read: true });
  } catch (error) {
    handleFirestoreError(error, OperationType.UPDATE, path);
  }
}

export async function markAllNotificationsAsRead(userId: string): Promise<void> {
  const path = 'notifications';
  try {
    const q = query(collection(db, 'notifications'), where('userId', '==', userId), where('read', '==', false));
    const snaps = await getDocs(q);
    const promises = snaps.docs.map((d) => updateDoc(d.ref, { read: true }));
    await Promise.all(promises);
  } catch (error) {
    handleFirestoreError(error, OperationType.UPDATE, path);
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

