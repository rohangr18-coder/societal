// Firebase Cloud Messaging Service Worker for ResQBite Food Rescue Network
// Handles background push notifications when app is minimized or closed

importScripts('https://www.gstatic.com/firebasejs/10.13.0/firebase-app-compat.js');
importScripts('https://www.gstatic.com/firebasejs/10.13.0/firebase-messaging-compat.js');

// Initialize Firebase in Service Worker
firebase.initializeApp({
  projectId: "omega-plexus-n14dk",
  appId: "1:1073054435184:web:c9979d3509ba877c41f1b5",
  apiKey: "AIzaSyCMYOWj_jVHndxfqlQ-k2qAE4oUPb4a69Q",
  authDomain: "omega-plexus-n14dk.firebaseapp.com",
  messagingSenderId: "1073054435184",
  storageBucket: "omega-plexus-n14dk.firebasestorage.app",
});

let messaging = null;
try {
  if (firebase.messaging.isSupported()) {
    messaging = firebase.messaging();
  }
} catch (err) {
  console.warn('[FCM SW] firebase.messaging not supported in this context:', err);
}

// Background push notification handler
if (messaging) {
  messaging.onBackgroundMessage((payload) => {
    console.log('[FCM SW] Received background message:', payload);

    const title = payload.notification?.title || payload.data?.title || '🚨 ResQBite Nearby Food Collection Alert!';
    const body = payload.notification?.body || payload.data?.body || 'New surplus food needs collection nearby. Open ResQBite to accept.';
    const donationId = payload.data?.donationId || '';
    const clickUrl = payload.data?.url || (donationId ? `/volunteer?donationId=${donationId}` : '/volunteer');

    const notificationOptions = {
      body: body,
      icon: '/favicon.ico',
      badge: '/favicon.ico',
      tag: donationId ? `resqbite-donation-${donationId}` : 'resqbite-collection-alert',
      renotify: true,
      requireInteraction: true,
      vibrate: [200, 100, 200],
      data: {
        url: clickUrl,
        donationId: donationId,
        timestamp: Date.now(),
      },
      actions: [
        {
          action: 'view-collection',
          title: 'Accept / View Details',
        },
        {
          action: 'dismiss',
          title: 'Dismiss',
        },
      ],
    };

    return self.registration.showNotification(title, notificationOptions);
  });
}

// Handle notification click: focus or open the volunteer dashboard
self.addEventListener('notificationclick', (event) => {
  event.notification.close();

  if (event.action === 'dismiss') {
    return;
  }

  const targetUrl = event.notification.data?.url || '/volunteer';

  event.waitUntil(
    clients.matchAll({ type: 'window', includeUncontrolled: true }).then((windowClients) => {
      // If a tab is already open, focus it and navigate
      for (const client of windowClients) {
        if ('focus' in client) {
          if (client.url.includes('/volunteer') || client.url.includes(self.location.origin)) {
            client.navigate(targetUrl);
            return client.focus();
          }
        }
      }
      // If no tab is open, open a new window
      if (clients.openWindow) {
        return clients.openWindow(targetUrl);
      }
    })
  );
});

// Generic Web Push fallback listener
self.addEventListener('push', (event) => {
  if (event.data) {
    try {
      const data = event.data.json();
      const title = data.title || data.notification?.title || '🚨 ResQBite Nearby Food Collection Alert!';
      const body = data.body || data.notification?.body || 'New surplus food needs pickup in your area.';
      const donationId = data.donationId || data.data?.donationId || '';
      const url = data.url || data.data?.url || '/volunteer';

      event.waitUntil(
        self.registration.showNotification(title, {
          body,
          icon: '/favicon.ico',
          badge: '/favicon.ico',
          tag: donationId ? `resqbite-donation-${donationId}` : 'resqbite-push',
          data: { url, donationId },
          actions: [{ action: 'view', title: 'Open Volunteer Dashboard' }],
        })
      );
    } catch {
      const text = event.data.text();
      event.waitUntil(
        self.registration.showNotification('🚨 ResQBite Collection Alert', {
          body: text,
          icon: '/favicon.ico',
        })
      );
    }
  }
});
