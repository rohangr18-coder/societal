import { getMessaging, getToken, onMessage, isSupported, Messaging } from 'firebase/messaging';
import { app, db, handleFirestoreError, OperationType } from '../lib/firebase';
import { doc, updateDoc } from 'firebase/firestore';
import { VolunteerProfile, Donation } from '../types';

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
 * Registers the Firebase Cloud Messaging Service Worker
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
 * Requests browser Notification permission
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
 * Retrieves the FCM Web Push registration token
 */
export async function getFcmToken(swRegistration?: ServiceWorkerRegistration): Promise<string | null> {
  try {
    const messaging = await getMessagingInstance();
    if (!messaging) return null;

    let registration = swRegistration;
    if (!registration) {
      registration = (await registerFcmServiceWorker()) || undefined;
    }

    // Default VAPID key from environment if specified
    const vapidKey = import.meta.env?.VITE_FIREBASE_VAPID_KEY || undefined;

    const token = await getToken(messaging, {
      serviceWorkerRegistration: registration,
      ...(vapidKey ? { vapidKey } : {}),
    });

    if (token) {
      console.info('[FCM] Registration token generated successfully');
      return token;
    } else {
      console.warn('[FCM] No registration token returned. Request permission first.');
      return null;
    }
  } catch (err) {
    console.warn('[FCM] Error retrieving FCM token:', err);
    return null;
  }
}

/**
 * Complete flow for volunteers to enable browser push notifications:
 * 1. Request permission
 * 2. Register service worker
 * 3. Retrieve FCM registration token
 * 4. Save token to volunteer profile in Firestore
 */
export async function enableVolunteerPushNotifications(
  userId: string
): Promise<{ success: boolean; token?: string; permission: NotificationPermission; message: string }> {
  try {
    const permission = await requestNotificationPermission();
    if (permission !== 'granted') {
      return {
        success: false,
        permission,
        message:
          permission === 'denied'
            ? 'Browser notification permission was blocked. Please enable notifications in your browser site settings.'
            : 'Notification permission was dismissed.',
      };
    }

    const swReg = await registerFcmServiceWorker();
    const token = await getFcmToken(swReg || undefined);

    const now = new Date().toISOString();
    const path = `volunteerProfiles/${userId}`;

    try {
      await updateDoc(doc(db, 'volunteerProfiles', userId), {
        pushNotificationsEnabled: true,
        pushNotificationPermission: 'granted',
        ...(token ? { fcmToken: token } : {}),
        lastTokenUpdate: now,
        updatedAt: now,
      });
    } catch (dbErr) {
      handleFirestoreError(dbErr, OperationType.UPDATE, path);
    }

    return {
      success: true,
      token: token || undefined,
      permission: 'granted',
      message: 'Browser push notifications successfully enabled! You will now receive instant alerts for nearby donations.',
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
 * Disable volunteer push notifications
 */
export async function disableVolunteerPushNotifications(userId: string): Promise<boolean> {
  const path = `volunteerProfiles/${userId}`;
  try {
    const now = new Date().toISOString();
    await updateDoc(doc(db, 'volunteerProfiles', userId), {
      pushNotificationsEnabled: false,
      updatedAt: now,
    });
    return true;
  } catch (err) {
    handleFirestoreError(err, OperationType.UPDATE, path);
    return false;
  }
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

      const title = payload.notification?.title || payload.data?.title || '🚨 Food Rescue Alert!';
      const body = payload.notification?.body || payload.data?.body || 'New surplus food collection available nearby.';
      const donationId = payload.data?.donationId;
      const distanceKm = payload.data?.distanceKm ? Number(payload.data.distanceKm) : undefined;

      // If browser permission is granted, display a native notification popup
      if (typeof window !== 'undefined' && 'Notification' in window && Notification.permission === 'granted') {
        try {
          const nativeNotif = new Notification(title, {
            body,
            icon: '/favicon.ico',
            tag: donationId ? `resqbite-donation-${donationId}` : 'resqbite-alert',
            data: {
              url: '/volunteer',
              donationId,
            },
          });

          nativeNotif.onclick = () => {
            window.focus();
            if (window.location.pathname !== '/volunteer') {
              window.location.href = '/volunteer';
            }
            nativeNotif.close();
          };
        } catch (e) {
          console.warn('[FCM] Could not create native notification popup:', e);
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
 * Triggers an immediate browser test push notification on the user's current device
 */
export async function sendTestBrowserPushNotification(
  customTitle?: string,
  customBody?: string
): Promise<{ success: boolean; message: string }> {
  if (typeof window === 'undefined' || !('Notification' in window)) {
    return { success: false, message: 'Browser notifications are not supported by this browser.' };
  }

  const permission = await requestNotificationPermission();
  if (permission !== 'granted') {
    return {
      success: false,
      message: 'Notification permission not granted. Please allow notifications in your browser.',
    };
  }

  const title = customTitle || '🚨 ResQBite Test Push Notification';
  const body =
    customBody ||
    'Firebase Cloud Messaging test successful! You are configured to receive instant alerts when surplus food is posted near you.';

  try {
    // If Service Worker registration is active, prefer showNotification for system-level appearance
    if ('serviceWorker' in navigator) {
      const reg = await navigator.serviceWorker.getRegistration();
      if (reg) {
        await reg.showNotification(title, {
          body,
          icon: '/favicon.ico',
          badge: '/favicon.ico',
          vibrate: [200, 100, 200],
          tag: 'resqbite-test-push',
          data: { url: '/volunteer' },
        } as any);
        return { success: true, message: 'Test notification triggered via Service Worker!' };
      }
    }

    // Direct Notification API fallback
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

  // Extract volunteers who have enabled push notifications or have an FCM token
  const eligiblePushRecipients = volunteers.filter(
    (item) => item.volunteer.pushNotificationsEnabled || item.volunteer.fcmToken || item.volunteer.optInNotifications
  );

  if (eligiblePushRecipients.length === 0) {
    return { sentCount: 0, errors: 0 };
  }

  const tokens = eligiblePushRecipients
    .map((item) => item.volunteer.fcmToken)
    .filter((tok): tok is string => Boolean(tok));

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
    // Send to backend FCM endpoint
    const response = await fetch('/api/notifications/fcm-send', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
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

  // Also trigger local notification if the current authenticated user is one of the eligible nearby volunteers
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
