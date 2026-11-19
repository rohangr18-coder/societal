import { doc, getDoc, setDoc } from 'firebase/firestore';
import { db, handleFirestoreError, OperationType } from '../lib/firebase';
import { UserProfile, UserRole } from '../types';
import { sanitizeForFirestore } from '../utils/firestoreSanitizer';

export async function getUserProfile(uid: string): Promise<UserProfile | null> {
  const path = `users/${uid}`;
  try {
    const snap = await getDoc(doc(db, 'users', uid));
    if (snap.exists()) {
      return snap.data() as UserProfile;
    }
    return null;
  } catch (error: any) {
    const msg = error?.message || String(error);
    if (
      msg.includes('the client is offline') ||
      msg.includes('unavailable') ||
      msg.includes('permission-denied')
    ) {
      console.warn(`[dbUserService] Profile lookup notice for ${path}:`, msg);
      return null;
    }
    handleFirestoreError(error, OperationType.GET, path);
  }
}

export async function isUserAdminInFirestore(uid: string): Promise<boolean> {
  if (!uid) return false;
  try {
    const adminSnap = await getDoc(doc(db, 'admins', uid));
    return adminSnap.exists();
  } catch {
    return false;
  }
}

export async function createOrUpdateUserProfile(
  profile: Partial<UserProfile> & { uid: string; email: string }
): Promise<UserProfile> {
  const path = `users/${profile.uid}`;
  try {
    // Check if user is registered in the trusted admins collection
    let isVerifiedAdmin = false;
    try {
      const adminSnap = await getDoc(doc(db, 'admins', profile.uid));
      isVerifiedAdmin = adminSnap.exists();
    } catch {
      // Permission denied or offline is normal for non-admins
    }

    // Check if existing profile document exists to preserve existing fields and role
    let existing: UserProfile | null = null;
    try {
      const snap = await getDoc(doc(db, 'users', profile.uid));
      existing = snap.exists() ? (snap.data() as UserProfile) : null;
    } catch {
      // Offline fallback
    }

    // Respect explicit role changes (e.g., donor -> volunteer) while preserving existing role on partial updates
    let role: UserRole | undefined = profile.role ?? existing?.role;
    if (isVerifiedAdmin) {
      role = 'admin';
    } else if (role === 'admin' && !isVerifiedAdmin) {
      // Security: non-admin cannot self-escalate to admin without trusted admin record
      role = existing?.role && existing.role !== 'admin' ? existing.role : 'donor';
    }

    const userDoc: UserProfile = {
      uid: profile.uid,
      email: profile.email,
      displayName: profile.displayName || existing?.displayName || profile.email.split('@')[0] || 'Member',
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
      ...(profile.lastTokenUpdate ? { lastTokenUpdate: profile.lastTokenUpdate } : existing?.lastTokenUpdate ? { lastTokenUpdate: existing.lastTokenUpdate } : {}),
      ...(profile.notificationRadiusKm !== undefined
        ? { notificationRadiusKm: profile.notificationRadiusKm }
        : existing?.notificationRadiusKm !== undefined
        ? { notificationRadiusKm: existing.notificationRadiusKm }
        : {}),
      ...((profile as any).optInNotifications !== undefined
        ? { optInNotifications: (profile as any).optInNotifications }
        : (existing as any)?.optInNotifications !== undefined
        ? { optInNotifications: (existing as any).optInNotifications }
        : {}),
      createdAt: existing?.createdAt || profile.createdAt || new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };

    const sanitized = sanitizeForFirestore(userDoc);
    await setDoc(doc(db, 'users', profile.uid), sanitized, { merge: true });

    // Seed default volunteer profile if registering as volunteer
    if (role === 'volunteer') {
      try {
        const volRef = doc(db, 'volunteerProfiles', profile.uid);
        const volSnap = await getDoc(volRef);
        if (!volSnap.exists()) {
          const now = new Date().toISOString();
          const volData = {
            id: profile.uid,
            userId: profile.uid,
            fullName: userDoc.displayName || 'Volunteer Courier',
            phone: userDoc.phoneNumber || userDoc.phone || '',
            vehicleType: 'Two Wheeler',
            serviceArea: 'Metro Area',
            isAvailable: true,
            totalPickups: 0,
            activeAssignmentId: '',
            notificationRadiusKm: 10,
            optInNotifications: true,
            createdAt: now,
            updatedAt: now,
          };
          await setDoc(volRef, sanitizeForFirestore(volData), { merge: true });
        }
      } catch (volErr) {
        console.warn('Volunteer profile auto-seed notice:', volErr);
      }
    }

    return userDoc;
  } catch (error) {
    handleFirestoreError(error, OperationType.WRITE, path);
  }
}
