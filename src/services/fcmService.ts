import { getMessaging, getToken, onMessage, isSupported, Messaging } from 'firebase/messaging';
import { app, db, auth, handleFirestoreError, OperationType } from '../lib/firebase';
import { doc, updateDoc, arrayUnion } from 'firebase/firestore';
import { VolunteerProfile, Donation, NotificationPreferences } from '../types';

let messagingInstance: Messaging | null = null;
let isMessagingSupportedPromise: Promise<boolean> | null = null;

/**
 * Checks whether Firebase Cloud Messaging and Service Workers are supported in the current environment
 */
export async function isFcmSupported(): Promise<boolean> {
  if (typeof window === 'undefined' || typeof navigator === 'undefined') {
    return false;
  }
  if (!('serviceWorker' in navigator) || !('Notification' in window)) {
    return false;
  }
  if (!isMessagingSupportedPromise) {
    isMessagingSupportedPromise = isSupported().catch(() => false);
  }
  return isMessagingSupportedPromise;
}

/**
 * Returns the VAPID Public Key configured in environment variables
 */
export function getVapidKey(): string | undefined {
  const envKey = import.meta.env?.VITE_FIREBASE_VAPID_KEY;
  if (typeof envKey === 'string' && envKey.trim().length > 0) {
    return envKey.trim();
  }
  return undefined;
}

/**
 * Lazily gets or initializes the Firebase Messaging instance
 */
export async function getMessagingInstance(): Promise<Messaging | null> {
  const supported = await isFcmSupported();
  if (!supported) {
    return null;
  }
  if (!messagingInstance) {
    try {
      messagingInstance = getMessaging(app);
    } catch (err) {
      console.warn('[FCM] Error initializing getMessaging:', err);
      return null;
    }
  }
  return messagingInstance;
}

/**
 * Registers the Firebase Cloud Messaging Service Worker at root scope
 */
export async function registerFcmServiceWorker(): Promise<ServiceWorkerRegistration | null> {
  if (typeof window === 'undefined' || !('serviceWorker' in navigator)) {
    return null;
  }
  try {
    const registration = await navigator.serviceWorker.register('/firebase-messaging-sw.js', {
      scope: '/',
    });
    console.info('[FCM] Service worker registered with scope:', registration.scope);
    return registration;
  } catch (err) {
    console.warn('[FCM] Service worker registration failed:', err);
    return null;
  }
}

/**
 * Requests browser Notification permission ONLY after explicit user interaction
 */
export async function requestNotificationPermission(): Promise<NotificationPermission> {
  if (typeof window === 'undefined' || !('Notification' in window)) {
    return 'denied';
  }
  if (Notification.permission === 'granted') {
    return 'granted';
  }
  try {
    const permission = await Notification.requestPermission();
    return permission;
  } catch (err) {
    console.warn('[FCM] Error requesting notification permission:', err);
    return Notification.permission;
  }
}

/**
 * Retrieves the FCM Web Push registration token using VITE_FIREBASE_VAPID_KEY
 */
export async function getFcmToken(swRegistration?: ServiceWorkerRegistration): Promise<string | null> {
  try {
    const messaging = await getMessagingInstance();
    if (!messaging) return null;

    let registration = swRegistration;
    if (!registration) {
      registration = (await registerFcmServiceWorker()) || undefined;
    }

    const vapidKey = getVapidKey();

    const token = await getToken(messaging, {
      serviceWorkerRegistration: registration,
      ...(vapidKey ? { vapidKey } : {}),
    });

    if (token) {
      console.info('[FCM] Registration token generated successfully');
      return token;
    } else {
      console.warn('[FCM] No registration token returned. Ensure permission is granted and VAPID key is valid.');
      return null;
    }
  } catch (err: any) {
    console.warn('[FCM] Error retrieving FCM token:', err?.message || err);
    return null;
  }
}

/**
 * Default notification preferences according to user role
 */
export function getDefaultPreferences(role?: string): NotificationPreferences {
  return {
    donorOnClaimed: true,
    donorOnPickup: true,
    donorOnDelivered: true,
    volunteerNearby: true,
    volunteerUrgent: true,
    volunteerRouteUpdates: true,
    adminNewDonations: role === 'admin',
    adminUrgentEscalations: role === 'admin',
    adminNgoRegistrations: role === 'admin',
  };
}

/**
 * User-initiated flow to enable browser push notifications:
 * 1. Request permission
 * 2. Register service worker
 * 3. Retrieve FCM registration token using VITE_FIREBASE_VAPID_KEY
 * 4. Save token to user profile (and volunteer profile if applicable) in Firestore
 */
export async function enableUserPushNotifications(
  userId: string,
  role?: string,
  preferences?: NotificationPreferences
): Promise<{ success: boolean; token?: string; permission: NotificationPermission; message: string }> {
  try {
    const supported = await isFcmSupported();
    if (!supported) {
      return {
        success: false,
        permission: 'denied',
        message: 'Browser push notifications are not supported in this browser environment.',
      };
    }

    const permission = await requestNotificationPermission();
    if (permission !== 'granted') {
      return {
        success: false,
        permission,
        message:
          permission === 'denied'
            ? 'Browser notification permission was blocked. Please click the padlock or tune icon in your address bar and change Notifications to "Allow".'
            : 'Notification permission was dismissed.',
      };
    }

    const swReg = await registerFcmServiceWorker();
    const token = await getFcmToken(swReg || undefined);
    const now = new Date().toISOString();
    const effectivePrefs = preferences || getDefaultPreferences(role);

    // Update user profile in Firestore
    const userPath = `users/${userId}`;
    try {
      await updateDoc(doc(db, 'users', userId), {
        pushNotificationsEnabled: true,
        pushNotificationPermission: 'granted',
        ...(token ? { fcmToken: token, fcmTokens: arrayUnion(token) } : {}),
        notificationPreferences: effectivePrefs,
        lastTokenUpdate: now,
        updatedAt: now,
      });
    } catch (dbErr) {
      handleFirestoreError(dbErr, OperationType.UPDATE, userPath);
    }

    // Also update volunteer profile if applicable
    if (role === 'volunteer') {
      const volPath = `volunteerProfiles/${userId}`;
      try {
        await updateDoc(doc(db, 'volunteerProfiles', userId), {
          pushNotificationsEnabled: true,
          pushNotificationPermission: 'granted',
          ...(token ? { fcmToken: token } : {}),
          notificationPreferences: effectivePrefs,
          lastTokenUpdate: now,
          updatedAt: now,
        });
      } catch (volErr) {
        handleFirestoreError(volErr, OperationType.UPDATE, volPath);
      }
    }

    const vapidKey = getVapidKey();
    const vapidNotice = !vapidKey && !token
      ? ' (Note: VITE_FIREBASE_VAPID_KEY is not configured; local in-tab notifications will work, configure VAPID in Firebase Console for full Web Push delivery).'
      : '';

    return {
      success: true,
      token: token || undefined,
      permission: 'granted',
      message: `Browser push notifications successfully enabled!${vapidNotice}`,
    };
  } catch (err: any) {
    console.error('[FCM] Failed to enable push notifications:', err);
    return {
      success: false,
      permission: 'denied',
      message: err.message || 'Failed to enable push notifications.',
    };
  }
}

/**
 * Backward-compatible helper for volunteer push notifications
 */
export async function enableVolunteerPushNotifications(
  userId: string,
  _radiusKm?: number,
  preferences?: NotificationPreferences
): Promise<{ success: boolean; token?: string; permission: NotificationPermission; message: string }> {
  return enableUserPushNotifications(userId, 'volunteer', preferences);
}

/**
 * Disable push notifications for a user
 */
export async function disableUserPushNotifications(userId: string, role?: string): Promise<boolean> {
  const now = new Date().toISOString();
  try {
    await updateDoc(doc(db, 'users', userId), {
      pushNotificationsEnabled: false,
      updatedAt: now,
    });

    if (role === 'volunteer') {
      await updateDoc(doc(db, 'volunteerProfiles', userId), {
        pushNotificationsEnabled: false,
        updatedAt: now,
      });
    }
    return true;
  } catch (err) {
    handleFirestoreError(err, OperationType.UPDATE, `users/${userId}`);
    return false;
  }
}

/**
 * Backward-compatible disable helper
 */
export async function disableVolunteerPushNotifications(userId: string): Promise<boolean> {
  return disableUserPushNotifications(userId, 'volunteer');
}

/**
 * Subscribes to foreground push notifications while the app tab is open
 */
export function subscribeForegroundFcm(
  callback: (payload: { title: string; body: string; donationId?: string; distanceKm?: number; data?: any }) => void
): () => void {
  let unsubscribe: (() => void) | null = null;

  getMessagingInstance().then((messaging) => {
    if (!messaging) return;

    unsubscribe = onMessage(messaging, (payload) => {
      console.log('[FCM Foreground] Message received:', payload);

      const title = payload.notification?.title || payload.data?.title || '🚨 ResQBite Notification';
      const body = payload.notification?.body || payload.data?.body || 'New surplus food activity in ResQBite.';
      const donationId = payload.data?.donationId;
      const distanceKm = payload.data?.distanceKm ? Number(payload.data.distanceKm) : undefined;
      const clickUrl = payload.data?.url || (donationId ? `/volunteer?donationId=${donationId}` : '/');

      // Native browser notification for foreground alert
      if (typeof window !== 'undefined' && 'Notification' in window && Notification.permission === 'granted') {
        try {
          const nativeNotif = new Notification(title, {
            body,
            icon: '/favicon.ico',
            tag: donationId ? `resqbite-donation-${donationId}` : `resqbite-alert-${Date.now()}`,
            data: { url: clickUrl, donationId },
          });

          nativeNotif.onclick = () => {
            window.focus();
            if (clickUrl && window.location.pathname !== clickUrl) {
              window.location.href = clickUrl;
            }
            nativeNotif.close();
          };
        } catch (e) {
          console.warn('[FCM] Could not create foreground notification popup:', e);
        }
      }

      callback({
        title,
        body,
        donationId,
        distanceKm,
        data: payload.data,
      });
    });
  });

  return () => {
    if (unsubscribe) {
      unsubscribe();
    }
  };
}

/**
 * Dispatches a test push notification through backend Firebase Admin SDK
 */
export async function sendTestBrowserPushNotification(
  customTitle?: string,
  customBody?: string,
  fcmToken?: string
): Promise<{ success: boolean; message: string }> {
  if (typeof window === 'undefined' || !('Notification' in window)) {
    return { success: false, message: 'Browser notifications are not supported by this browser.' };
  }

  const permission = await requestNotificationPermission();
  if (permission !== 'granted') {
    return {
      success: false,
      message: 'Notification permission not granted. Please click "Enable Notifications" first.',
    };
  }

  const title = customTitle || '🚨 ResQBite Test Push Notification';
  const body =
    customBody ||
    'Firebase Cloud Messaging test successful! You are configured to receive instant alerts for surplus food rescues.';

  // 1. Trigger backend FCM dispatch via Firebase Admin
  try {
    const user = auth.currentUser;
    const idToken = user ? await user.getIdToken().catch(() => null) : null;

    const response = await fetch('/api/notifications/test-push', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...(idToken ? { Authorization: `Bearer ${idToken}` } : {}),
      },
      body: JSON.stringify({
        token: fcmToken,
        title,
        body,
      }),
    });

    if (response.ok) {
      const data = await response.json();
      console.info('[FCM Test] Backend dispatch result:', data);
    }
  } catch (backendErr) {
    console.warn('[FCM Test] Backend test dispatch warning:', backendErr);
  }

  // 2. Trigger native display via Service Worker or Notification API
  try {
    if ('serviceWorker' in navigator) {
      const reg = await navigator.serviceWorker.getRegistration();
      if (reg) {
        await reg.showNotification(title, {
          body,
          icon: '/favicon.ico',
          badge: '/favicon.ico',
          vibrate: [200, 100, 200],
          tag: 'resqbite-test-push',
          data: { url: '/settings' },
        } as any);
        return { success: true, message: 'Test push notification delivered via Service Worker!' };
      }
    }

    const notif = new Notification(title, {
      body,
      icon: '/favicon.ico',
      tag: 'resqbite-test-push',
    });
    notif.onclick = () => {
      window.focus();
      notif.close();
    };

    return { success: true, message: 'Test notification triggered on your screen!' };
  } catch (err: any) {
    return { success: false, message: `Could not trigger notification: ${err.message}` };
  }
}

/**
 * Dispatches FCM push notifications to eligible nearby registered volunteers when a donation is posted
 */
export async function dispatchFcmToNearbyVolunteers(
  volunteers: { volunteer: VolunteerProfile; distanceKm: number }[],
  donation: Donation
): Promise<{ sentCount: number; errors: number }> {
  if (!volunteers || volunteers.length === 0) {
    return { sentCount: 0, errors: 0 };
  }

  let sentCount = 0;
  let errors = 0;

  // Filter volunteers who have enabled push notifications or opt-in
  const eligiblePushRecipients = volunteers.filter(
    (item) => item.volunteer.pushNotificationsEnabled || item.volunteer.fcmToken || item.volunteer.optInNotifications
  );

  if (eligiblePushRecipients.length === 0) {
    return { sentCount: 0, errors: 0 };
  }

  const rawTokens = eligiblePushRecipients
    .map((item) => item.volunteer.fcmToken)
    .filter((tok): tok is string => Boolean(tok));
  const tokens = Array.from(new Set(rawTokens));

  const volunteerIds = eligiblePushRecipients.map((item) => item.volunteer.userId);

  const pickupInfo = donation.availableFrom && donation.availableUntil
    ? ` Window: ${donation.availableFrom} – ${donation.availableUntil}`
    : '';

  const payload = {
    title: '🚨 Nearby Food Collection Alert!',
    body: `"${donation.foodName}" (${donation.quantity} ${donation.unit}) needs pickup nearby.${pickupInfo} Tap to accept.`,
    donationId: donation.id,
    tokens,
    volunteerIds,
    url: `/volunteer?donationId=${donation.id}`,
    pickupDeadline: donation.collectionDeadline || donation.pickupDeadline,
  };

  try {
    const user = auth.currentUser;
    const idToken = user ? await user.getIdToken().catch(() => null) : null;

    const response = await fetch('/api/notifications/fcm-send', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...(idToken ? { Authorization: `Bearer ${idToken}` } : {}),
      },
      body: JSON.stringify(payload),
    });

    if (response.ok) {
      const result = await response.json();
      sentCount = result.sentCount || eligiblePushRecipients.length;
    } else {
      errors++;
    }
  } catch (err) {
    console.warn('[FCM] Backend push dispatch error:', err);
    errors++;
  }

  // Also trigger local notification if the current user is an eligible nearby volunteer
  try {
    if (typeof window !== 'undefined' && 'Notification' in window && Notification.permission === 'granted') {
      const reg = 'serviceWorker' in navigator ? await navigator.serviceWorker.getRegistration() : null;
      if (reg) {
        reg.showNotification(payload.title, {
          body: payload.body,
          icon: '/favicon.ico',
          badge: '/favicon.ico',
          tag: `donation-${donation.id}`,
          data: { url: payload.url, donationId: donation.id },
        });
      } else {
        new Notification(payload.title, {
          body: payload.body,
          icon: '/favicon.ico',
          tag: `donation-${donation.id}`,
        });
      }
    }
  } catch (localErr) {
    console.warn('[FCM] Local notification fallback warning:', localErr);
  }

  return { sentCount, errors };
}

/**
 * Dispatches push notifications for donation lifecycle events:
 * - 'requested': NGO claimed food -> alerts donor
 * - 'accepted': volunteer courier accepted -> alerts donor & NGO
 * - 'picked_up': courier collected food -> alerts donor & NGO
 * - 'delivered': delivery confirmed at shelter -> alerts donor, volunteer & admin
 */
export async function dispatchDonationLifecyclePush(
  donation: Donation,
  eventType: 'requested' | 'accepted' | 'picked_up' | 'delivered',
  options?: {
    actorName?: string;
    note?: string;
    recipientTokens?: string[];
    recipientUserIds?: string[];
  }
): Promise<{ success: boolean; sentCount: number }> {
  const actorName = options?.actorName || 'A network participant';
  let title = 'Donation Update';
  let body = `Status changed for "${donation.foodName}"`;
  let url = `/dashboard`;

  switch (eventType) {
    case 'requested':
      title = 'Shelter Requested Your Donation';
      body = `${actorName} requested "${donation.foodName}". Please confirm handover.`;
      url = `/dashboard`;
      break;
    case 'accepted':
      title = 'Volunteer Accepted Collection';
      body = `${actorName} is scheduled to pick up "${donation.foodName}".`;
      url = `/dashboard`;
      break;
    case 'picked_up':
      title = 'Food Collected & En Route';
      body = `${actorName} has collected "${donation.foodName}" from donor.`;
      url = `/dashboard`;
      break;
    case 'delivered':
      title = '🎉 Donation Successfully Delivered';
      body = `"${donation.foodName}" (${donation.quantity} ${donation.unit}) has been safely delivered to shelter.`;
      url = `/impact`;
      break;
  }

  const rawTokens = options?.recipientTokens || [];
  const tokens = Array.from(new Set(rawTokens.filter(Boolean)));
  const recipientUserIds = options?.recipientUserIds || [];

  const payload = {
    title,
    body,
    donationId: donation.id,
    tokens,
    volunteerIds: recipientUserIds,
    url,
    pickupDeadline: donation.collectionDeadline || donation.pickupDeadline,
  };

  try {
    const user = auth.currentUser;
    const idToken = user ? await user.getIdToken().catch(() => null) : null;

    const response = await fetch('/api/notifications/fcm-send', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...(idToken ? { Authorization: `Bearer ${idToken}` } : {}),
      },
      body: JSON.stringify(payload),
    });

    if (response.ok) {
      const res = await response.json();
      return { success: true, sentCount: res.sentCount || 1 };
    }
  } catch (err) {
    console.warn('[FCM Lifecycle] Push notification error:', err);
  }

  return { success: false, sentCount: 0 };
}
