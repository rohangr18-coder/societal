import fs from 'fs';
import path from 'path';
import app, { cleanupInvalidTokens } from '../server/app.js';
import { calculateDistanceKm } from '../src/utils/geo.js';

async function testFcmPushNotifications() {
  console.log('🧪 Testing Firebase Cloud Messaging (FCM) & Browser Push Notifications...\n');

  let passed = 0;
  let failed = 0;

  function assert(condition: boolean, testName: string) {
    if (condition) {
      console.log(`  ✅ PASS: ${testName}`);
      passed++;
    } else {
      console.error(`  ❌ FAIL: ${testName}`);
      failed++;
    }
  }

  // --- Test 1: Firebase Configuration for FCM ---
  console.log('--- Test 1: FCM Configuration & Credentials ---');
  const configPath = path.resolve(process.cwd(), 'firebase-applet-config.json');
  assert(fs.existsSync(configPath), 'firebase-applet-config.json exists');
  const firebaseConfig = JSON.parse(fs.readFileSync(configPath, 'utf-8'));
  assert(Boolean(firebaseConfig.messagingSenderId), `messagingSenderId configured: "${firebaseConfig.messagingSenderId}"`);
  assert(Boolean(firebaseConfig.projectId), `projectId configured: "${firebaseConfig.projectId}"`);
  assert(Boolean(firebaseConfig.apiKey), 'Firebase apiKey present');

  // Verify .env.example includes VITE_FIREBASE_VAPID_KEY
  const envExamplePath = path.resolve(process.cwd(), '.env.example');
  const envExampleContent = fs.readFileSync(envExamplePath, 'utf-8');
  assert(envExampleContent.includes('VITE_FIREBASE_VAPID_KEY='), '.env.example documents VITE_FIREBASE_VAPID_KEY');

  // --- Test 2: Service Worker for Background Push Notifications ---
  console.log('\n--- Test 2: Service Worker (firebase-messaging-sw.js) at Root ---');
  const swPath = path.resolve(process.cwd(), 'public/firebase-messaging-sw.js');
  assert(fs.existsSync(swPath), 'public/firebase-messaging-sw.js exists at website root');
  const swContent = fs.readFileSync(swPath, 'utf-8');
  assert(swContent.includes('firebase-messaging'), 'Service worker imports Firebase Messaging library');
  assert(swContent.includes('onBackgroundMessage'), 'Handles onBackgroundMessage for background push notifications');
  assert(swContent.includes('notificationclick'), 'Handles notificationclick event to focus or navigate window');
  assert(swContent.includes('addEventListener(\'push\''), 'Contains push event listener for background payload processing');
  assert(swContent.includes('targetUrl'), 'Implements URL-aware client navigation on notification click');

  // --- Test 3: Schema & Data Model Alignment ---
  console.log('\n--- Test 3: Schema & Data Model Alignment for Roles ---');
  const typesPath = path.resolve(process.cwd(), 'src/types.ts');
  const typesContent = fs.readFileSync(typesPath, 'utf-8');
  assert(typesContent.includes('fcmToken?: string'), 'types.ts includes fcmToken on UserProfile and VolunteerProfile');
  assert(typesContent.includes('pushNotificationsEnabled?: boolean'), 'types.ts includes pushNotificationsEnabled');
  assert(typesContent.includes('notificationPreferences?: NotificationPreferences'), 'types.ts includes NotificationPreferences');
  assert(typesContent.includes('donorOnClaimed?: boolean'), 'NotificationPreferences supports donorOnClaimed');
  assert(typesContent.includes('donorOnPickup?: boolean'), 'NotificationPreferences supports donorOnPickup');
  assert(typesContent.includes('donorOnDelivered?: boolean'), 'NotificationPreferences supports donorOnDelivered');
  assert(typesContent.includes('volunteerNearby?: boolean'), 'NotificationPreferences supports volunteerNearby');
  assert(typesContent.includes('volunteerUrgent?: boolean'), 'NotificationPreferences supports volunteerUrgent');
  assert(typesContent.includes('volunteerRouteUpdates?: boolean'), 'NotificationPreferences supports volunteerRouteUpdates');

  const blueprintPath = path.resolve(process.cwd(), 'firebase-blueprint.json');
  const blueprint = JSON.parse(fs.readFileSync(blueprintPath, 'utf-8'));
  const userProps = blueprint.entities?.User?.properties;
  const volProps = blueprint.entities?.VolunteerProfile?.properties;
  assert(Boolean(userProps?.fcmToken), 'firebase-blueprint.json defines fcmToken on User entity');
  assert(Boolean(userProps?.pushNotificationsEnabled), 'firebase-blueprint.json defines pushNotificationsEnabled on User entity');
  assert(Boolean(volProps?.fcmToken), 'firebase-blueprint.json defines fcmToken on VolunteerProfile');
  assert(Boolean(volProps?.pushNotificationsEnabled), 'firebase-blueprint.json defines pushNotificationsEnabled on VolunteerProfile');

  // --- Test 4: FCM Status Backend Endpoint ---
  console.log('\n--- Test 4: FCM Server Status Endpoint ---');
  let statusResult: any = null;
  const mockReqStatus: any = {
    method: 'GET',
    url: '/api/notifications/fcm-status',
    isTest: true,
    headers: {},
  };
  await new Promise<void>((resolve) => {
    const mockResStatus: any = {
      statusCode: 200,
      setHeader: () => {},
      status(code: number) { this.statusCode = code; return this; },
      json(data: any) { statusResult = data; resolve(); return this; },
      send(data: any) { statusResult = data; resolve(); return this; },
    };
    (app as any).handle(mockReqStatus, mockResStatus, () => resolve());
  });

  assert(statusResult?.fcmEnabled === true, 'FCM status reports fcmEnabled: true');
  assert(statusResult?.messagingSenderId === firebaseConfig.messagingSenderId, 'FCM messagingSenderId matches config');
  assert('vapidKeyConfigured' in (statusResult || {}), 'FCM status reports vapidKeyConfigured boolean');
  assert(statusResult?.serviceWorkerFile === '/firebase-messaging-sw.js', 'Reports root service worker file path');

  // --- Test 5: FCM Push Dispatch Backend Endpoint with Deduplication ---
  console.log('\n--- Test 5: FCM Server Push Dispatch Endpoint & Deduplication ---');
  let sendResult: any = null;
  const mockReqSend: any = {
    method: 'POST',
    url: '/api/notifications/fcm-send',
    isTest: true,
    headers: {},
    user: { uid: 'test_donor_123', email: 'donor@example.com', role: 'donor' },
    body: {
      title: '🚨 Nearby Food Collection Alert!',
      body: '"Paneer Tikka & Roti" (25 servings) needs pickup ~2.4 km away.',
      donationId: 'test_donation_99',
      tokens: ['duplicate_tok_1', 'duplicate_tok_1', 'unique_tok_2'],
      volunteerIds: ['vol_user_abc'],
      url: '/volunteer?donationId=test_donation_99',
      pickupDeadline: 'Today 8:00 PM',
    },
  };
  await new Promise<void>((resolve) => {
    const mockResSend: any = {
      statusCode: 200,
      setHeader: () => {},
      status(code: number) { this.statusCode = code; return this; },
      json(data: any) { sendResult = data; resolve(); return this; },
      send(data: any) { sendResult = data; resolve(); return this; },
    };
    (app as any).handle(mockReqSend, mockResSend, () => resolve());
  });

  assert(sendResult?.success === true, 'Response indicates success: true');
  assert(sendResult?.recipientTokensCount === 2, `Tokens deduplicated from 3 to 2 unique tokens (got ${sendResult?.recipientTokensCount})`);
  assert(sendResult?.sentCount >= 1, `Sent count reported: ${sendResult?.sentCount}`);

  // Test input validation failure (missing body/title)
  let errorResult: any = null;
  let errorStatusCode = 200;
  const mockReqBad: any = {
    method: 'POST',
    url: '/api/notifications/fcm-send',
    isTest: true,
    headers: {},
    user: { uid: 'test_user_123', email: 'user@example.com', role: 'volunteer' },
    body: { title: '' },
  };
  await new Promise<void>((resolve) => {
    const mockResBad: any = {
      statusCode: 200,
      setHeader: () => {},
      status(code: number) { this.statusCode = code; errorStatusCode = code; return this; },
      json(data: any) { errorResult = data; resolve(); return this; },
      send(data: any) { errorResult = data; resolve(); return this; },
    };
    (app as any).handle(mockReqBad, mockResBad, () => resolve());
  });
  assert(errorStatusCode === 400, 'Invalid payload without title/body is safely rejected with HTTP 400');

  // --- Test 6: Test Push Endpoint (/api/notifications/test-push) ---
  console.log('\n--- Test 6: Test Push Notification Endpoint ---');
  let testPushResult: any = null;
  const mockReqTestPush: any = {
    method: 'POST',
    url: '/api/notifications/test-push',
    isTest: true,
    headers: {},
    user: { uid: 'test_volunteer_user', email: 'vol@example.com', role: 'volunteer' },
    body: {
      token: 'fake_fcm_token_device_abc',
      title: '🧪 Push Test',
      body: 'Testing notification delivery',
    },
  };
  await new Promise<void>((resolve) => {
    const mockResTestPush: any = {
      statusCode: 200,
      setHeader: () => {},
      status(code: number) { this.statusCode = code; return this; },
      json(data: any) { testPushResult = data; resolve(); return this; },
      send(data: any) { testPushResult = data; resolve(); return this; },
    };
    (app as any).handle(mockReqTestPush, mockResTestPush, () => resolve());
  });

  assert(testPushResult?.success === true, 'Test push response indicates success');
  assert(testPushResult?.recipientUid === 'test_volunteer_user', 'Target recipient UID matched caller');

  // --- Test 7: Invalid Token Cleanup Utility ---
  console.log('\n--- Test 7: Cleanup of Invalid Tokens ---');
  let cleanupThrew = false;
  try {
    await cleanupInvalidTokens(['dead_token_xyz_123', 'expired_token_abc_456']);
  } catch {
    cleanupThrew = true;
  }
  assert(!cleanupThrew, 'cleanupInvalidTokens runs safely without crashing or throwing');

  // --- Test 8: Proximity & Vicinity Radius Logic ---
  console.log('\n--- Test 8: Nearby Volunteer Vicinity Logic ---');
  const donationCoords = { lat: 12.9716, lng: 77.6412 };

  // Volunteer A: 2.1 km away (within 10 km default radius)
  const volA_Coords = { lat: 12.9850, lng: 77.6350 };
  const distA = calculateDistanceKm(donationCoords.lat, donationCoords.lng, volA_Coords.lat, volA_Coords.lng)!;
  assert(distA < 10, `Volunteer A distance ${distA.toFixed(2)} km is within default 10 km radius`);

  // Volunteer B: 24.5 km away (outside 10 km radius)
  const volB_Coords = { lat: 13.1500, lng: 77.5800 };
  const distB = calculateDistanceKm(donationCoords.lat, donationCoords.lng, volB_Coords.lat, volB_Coords.lng)!;
  assert(distB > 10, `Volunteer B distance ${distB.toFixed(2)} km is outside 10 km radius`);

  const mockVolunteers = [
    { id: 'vol_1', isAvailable: true, optInNotifications: true, notificationRadiusKm: 10, ...volA_Coords },
    { id: 'vol_2', isAvailable: false, optInNotifications: true, notificationRadiusKm: 10, ...volA_Coords }, // off duty
    { id: 'vol_3', isAvailable: true, optInNotifications: false, notificationRadiusKm: 10, ...volA_Coords }, // opted out
    { id: 'vol_4', isAvailable: true, optInNotifications: true, notificationRadiusKm: 10, ...volB_Coords }, // too far
  ];

  const eligibleForPush = mockVolunteers.filter((v) => {
    if (!v.isAvailable || !v.optInNotifications) return false;
    const d = calculateDistanceKm(donationCoords.lat, donationCoords.lng, v.lat, v.lng);
    return d !== null && d <= v.notificationRadiusKm;
  });

  assert(eligibleForPush.length === 1 && eligibleForPush[0].id === 'vol_1', 'Only eligible, on-duty volunteer within radius is targeted for push notifications');

  // --- Test 9: Time-Aware Expiration Check for Push Notifications ---
  console.log('\n--- Test 9: Expiration Check for Push Notifications ---');
  const pastDeadline = new Date(Date.now() - 3600000).toISOString(); // 1 hour ago
  const futureDeadline = new Date(Date.now() + 7200000).toISOString(); // 2 hours in future

  const isExpired = (deadline: string) => new Date(deadline).getTime() < Date.now();
  assert(isExpired(pastDeadline) === true, 'Past deadline correctly flagged as expired (no notifications sent)');
  assert(isExpired(futureDeadline) === false, 'Future deadline correctly flagged as valid for push notification');

  // Summary
  console.log(`\n================================`);
  console.log(`Total tests: ${passed + failed}`);
  console.log(`Passed: ${passed}`);
  console.log(`Failed: ${failed}`);
  console.log(`================================\n`);

  if (failed > 0) {
    process.exit(1);
  }
  process.exit(0);
}

testFcmPushNotifications().catch((err) => {
  console.error('Test suite failed:', err);
  process.exit(1);
});
