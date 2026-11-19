import {
  collection,
  doc,
  getDoc,
  setDoc,
  updateDoc,
  query,
  orderBy,
  limit,
  onSnapshot,
} from 'firebase/firestore';
import { db, handleFirestoreError, OperationType } from '../lib/firebase';
import {
  Organization,
  VolunteerProfile,
  ImpactRecord,
  AuditLog,
} from '../types';
import { sanitizeForFirestore } from '../utils/firestoreSanitizer';
import { sendNotification } from './dbNotificationService';

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

export async function registerOrganization(
  data: Omit<Organization, 'id' | 'createdAt' | 'updatedAt' | 'verificationStatus'>
): Promise<string> {
  const path = 'organizations';
  try {
    const orgRef = doc(collection(db, 'organizations'));
    const now = new Date().toISOString();

    const newOrg: Organization = {
      ...data,
      id: orgRef.id,
      latitude: typeof data.latitude === 'number' && !isNaN(data.latitude) ? data.latitude : undefined,
      longitude: typeof data.longitude === 'number' && !isNaN(data.longitude) ? data.longitude : undefined,
      acceptedCategories: Array.isArray(data.acceptedCategories)
        ? data.acceptedCategories
        : ['Cooked Meals', 'Bakery & Bread', 'Fresh Produce & Fruits'],
      hasRefrigeration: typeof data.hasRefrigeration === 'boolean' ? data.hasRefrigeration : false,
      operatingHours: data.operatingHours || '08:00 - 20:00',
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
      message:
        status === 'verified'
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
  } catch (error: any) {
    const msg = error?.message || String(error);
    if (
      msg.includes('the client is offline') ||
      msg.includes('offline') ||
      msg.includes('unavailable') ||
      msg.includes('permission-denied')
    ) {
      console.warn(`[dbOrgService] Volunteer profile lookup notice for ${path}:`, msg);
      return null;
    }
    handleFirestoreError(error, OperationType.GET, path);
    return null;
  }
}

export async function saveVolunteerProfile(
  profile: Partial<VolunteerProfile> & { userId: string; fullName: string }
): Promise<void> {
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
      ...(profile.pushNotificationsEnabled !== undefined
        ? { pushNotificationsEnabled: profile.pushNotificationsEnabled }
        : {}),
      ...(profile.pushNotificationPermission
        ? { pushNotificationPermission: profile.pushNotificationPermission }
        : {}),
      ...(profile.lastTokenUpdate ? { lastTokenUpdate: profile.lastTokenUpdate } : {}),
      createdAt: profile.createdAt || now,
      updatedAt: now,
    };

    await setDoc(doc(db, 'volunteerProfiles', profile.userId), sanitizeForFirestore(volData), {
      merge: true,
    });
  } catch (error) {
    handleFirestoreError(error, OperationType.WRITE, path);
  }
}

// ----------------------------------------------------
// Impact Records & Analytics
// ----------------------------------------------------
export async function recordImpact(data: Omit<ImpactRecord, 'id'>): Promise<void> {
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
  try {
    const ref = doc(collection(db, 'auditLogs'));
    await setDoc(
      ref,
      sanitizeForFirestore({
        ...data,
        id: ref.id,
        timestamp: new Date().toISOString(),
      })
    );
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
