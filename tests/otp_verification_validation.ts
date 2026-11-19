/**
 * OTP Verification & Handover Security Validation Suite
 *
 * Verifies:
 * 1. OTP generation permissions (donor for pickup, assigned NGO for delivery, admin allowed; others 403).
 * 2. Status validation (pickup only accepted/scheduled; delivery only picked_up/in_transit).
 * 3. Rate limit (5 OTPs per donation per hour -> 6th returns 429).
 * 4. Salted SHA-256 hash-only storage (plain OTP never stored; new OTP replaces & invalidates old OTP).
 * 5. Expiry rejection ("OTP has expired. Ask the donor to generate a new one.").
 * 6. Single-use enforcement ("This OTP was already used.").
 * 7. Wrong OTP counts toward 5-attempt / 15-minute lock.
 * 8. Legacy static PIN and QR token compatibility (pickup & delivery).
 * 9. GET /api/verify/:donationId/token NEVER leaks OTP hashes or salts.
 * 10. Unknown /api/* routes return JSON 404; credential error helper & client service hardening.
 */

import fs from 'fs';
import path from 'path';
import {
  app,
  testVerificationDonationsStore,
  testVerificationsStore,
  testVerificationAuditLogsStore,
  testVerificationImpactRecordsStore,
} from '../server/app.js';
import {
  adminConfigured,
  isCredentialOrPermissionError,
} from '../server/firebaseAdmin.js';

function assert(condition: boolean, msg: string) {
  if (!condition) {
    throw new Error(`❌ Assertion Failed: ${msg}`);
  }
}

function makeMockRequest(
  appInstance: any,
  options: {
    method: string;
    url: string;
    headers?: Record<string, string>;
    body?: any;
  }
): Promise<{ statusCode: number; headers: Record<string, any>; body: any }> {
  return new Promise((resolve) => {
    let statusCode = 200;
    const responseHeaders: Record<string, any> = {};
    let responseBody: any = null;

    const req: any = {
      method: options.method,
      url: options.url,
      headers: {
        'content-type': 'application/json',
        ...(options.headers || {}),
      },
      body: options.body || {},
      connection: { remoteAddress: '127.0.0.1' },
      isTest: true,
    };

    const res: any = {
      statusCode: 200,
      headersSent: false,
      setHeader(name: string, value: any) {
        responseHeaders[name.toLowerCase()] = value;
        return this;
      },
      status(code: number) {
        statusCode = code;
        this.statusCode = code;
        return this;
      },
      json(data: any) {
        this.headersSent = true;
        responseBody = data;
        resolve({ statusCode, headers: responseHeaders, body: responseBody });
        return this;
      },
      send(data: any) {
        this.headersSent = true;
        try {
          responseBody = JSON.parse(data);
        } catch {
          responseBody = data;
        }
        resolve({ statusCode, headers: responseHeaders, body: responseBody });
        return this;
      },
      end() {
        this.headersSent = true;
        resolve({ statusCode, headers: responseHeaders, body: responseBody });
        return this;
      },
    };

    appInstance.handle(req, res, () => {
      resolve({ statusCode: 404, headers: responseHeaders, body: { error: 'Not found' } });
    });
  });
}

function futureIso(hoursFromNow = 6): string {
  return new Date(Date.now() + hoursFromNow * 60 * 60 * 1000).toISOString();
}

function seedDonation(id: string, overrides: Record<string, any> = {}) {
  const base = {
    id,
    donorId: 'donor1',
    donorName: 'Fresh Kitchen',
    assignedNgoId: 'ngo1',
    assignedVolunteerId: 'vol1',
    foodName: 'Warm Pasta Trays',
    quantity: 12,
    unit: 'kg',
    servings: 30,
    status: 'accepted',
    safeUntil: futureIso(8),
    collectionDeadline: futureIso(6),
    timeline: [],
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    ...overrides,
  };
  testVerificationDonationsStore.set(id, base);
  return base;
}

async function runOtpValidationSuite() {
  console.log('🔐 Starting ResQBite OTP Verification & QR Hardening Validation Suite...\n');

  testVerificationDonationsStore.clear();
  testVerificationsStore.clear();
  testVerificationAuditLogsStore.length = 0;
  testVerificationImpactRecordsStore.length = 0;

  // ====================================================
  // TEST 1: Permissions for OTP Generation
  // ====================================================
  console.log('--- Test 1: OTP Generation Role & Ownership Permissions ---');
  seedDonation('don_perm_1', { status: 'accepted' });

  // Volunteer denied pickup OTP
  const volPickupRes = await makeMockRequest(app, {
    method: 'POST',
    url: '/api/verify/don_perm_1/otp',
    headers: { Authorization: 'Bearer mock-token-vol1-volunteer' },
    body: { mode: 'pickup' },
  });
  assert(volPickupRes.statusCode === 403, `Volunteer cannot generate pickup OTP (got ${volPickupRes.statusCode})`);

  // Unassigned NGO denied pickup OTP
  const ngoPickupRes = await makeMockRequest(app, {
    method: 'POST',
    url: '/api/verify/don_perm_1/otp',
    headers: { Authorization: 'Bearer mock-token-ngo1-ngo' },
    body: { mode: 'pickup' },
  });
  assert(ngoPickupRes.statusCode === 403, `NGO cannot generate pickup OTP (got ${ngoPickupRes.statusCode})`);

  // Unassigned user denied pickup OTP
  const strangerPickupRes = await makeMockRequest(app, {
    method: 'POST',
    url: '/api/verify/don_perm_1/otp',
    headers: { Authorization: 'Bearer mock-token-donor2-donor' },
    body: { mode: 'pickup' },
  });
  assert(strangerPickupRes.statusCode === 403, `Other donor cannot generate pickup OTP (got ${strangerPickupRes.statusCode})`);

  // Donor allowed pickup OTP
  const donorPickupRes = await makeMockRequest(app, {
    method: 'POST',
    url: '/api/verify/don_perm_1/otp',
    headers: { Authorization: 'Bearer mock-token-donor1-donor' },
    body: { mode: 'pickup' },
  });
  assert(donorPickupRes.statusCode === 200, `Donor can generate pickup OTP (got ${donorPickupRes.statusCode})`);
  assert(donorPickupRes.body?.success === true, 'OTP response has success: true');
  assert(/^\d{6}$/.test(String(donorPickupRes.body?.otp)), 'Generated OTP is 6 digits');
  assert(donorPickupRes.body?.expiresInSeconds === 600, 'OTP TTL is 600 seconds (10 minutes)');

  // Admin allowed pickup OTP
  const adminPickupRes = await makeMockRequest(app, {
    method: 'POST',
    url: '/api/verify/don_perm_1/otp',
    headers: { Authorization: 'Bearer mock-token-admin1-admin' },
    body: { mode: 'pickup' },
  });
  assert(adminPickupRes.statusCode === 200, `Admin can generate pickup OTP (got ${adminPickupRes.statusCode})`);

  // Delivery OTP permissions
  seedDonation('don_perm_del', { status: 'in_transit' });
  const donorDeliveryRes = await makeMockRequest(app, {
    method: 'POST',
    url: '/api/verify/don_perm_del/otp',
    headers: { Authorization: 'Bearer mock-token-donor1-donor' },
    body: { mode: 'delivery' },
  });
  assert(donorDeliveryRes.statusCode === 403, `Donor cannot generate delivery OTP (got ${donorDeliveryRes.statusCode})`);

  const otherNgoDeliveryRes = await makeMockRequest(app, {
    method: 'POST',
    url: '/api/verify/don_perm_del/otp',
    headers: { Authorization: 'Bearer mock-token-ngo2-ngo' },
    body: { mode: 'delivery' },
  });
  assert(otherNgoDeliveryRes.statusCode === 403, `Unassigned NGO cannot generate delivery OTP (got ${otherNgoDeliveryRes.statusCode})`);

  const assignedNgoDeliveryRes = await makeMockRequest(app, {
    method: 'POST',
    url: '/api/verify/don_perm_del/otp',
    headers: { Authorization: 'Bearer mock-token-ngo1-ngo' },
    body: { mode: 'delivery' },
  });
  assert(assignedNgoDeliveryRes.statusCode === 200, `Assigned NGO can generate delivery OTP (got ${assignedNgoDeliveryRes.statusCode})`);
  console.log('  ✅ PASSED: Permissions enforced strictly for pickup & delivery OTP generation');

  // ====================================================
  // TEST 2: Status Validation for OTP Generation
  // ====================================================
  console.log('--- Test 2: Status Validation ---');
  seedDonation('don_status_avail', { status: 'available' });
  const availPickupOtp = await makeMockRequest(app, {
    method: 'POST',
    url: '/api/verify/don_status_avail/otp',
    headers: { Authorization: 'Bearer mock-token-donor1-donor' },
    body: { mode: 'pickup' },
  });
  assert(availPickupOtp.statusCode === 400, `Pickup OTP rejected when status is available (got ${availPickupOtp.statusCode})`);

  seedDonation('don_status_picked', { status: 'picked_up' });
  const pickedPickupOtp = await makeMockRequest(app, {
    method: 'POST',
    url: '/api/verify/don_status_picked/otp',
    headers: { Authorization: 'Bearer mock-token-donor1-donor' },
    body: { mode: 'pickup' },
  });
  assert(pickedPickupOtp.statusCode === 400, `Pickup OTP rejected when status is picked_up (got ${pickedPickupOtp.statusCode})`);

  seedDonation('don_status_accepted', { status: 'accepted' });
  const acceptedDeliveryOtp = await makeMockRequest(app, {
    method: 'POST',
    url: '/api/verify/don_status_accepted/otp',
    headers: { Authorization: 'Bearer mock-token-ngo1-ngo' },
    body: { mode: 'delivery' },
  });
  assert(acceptedDeliveryOtp.statusCode === 400, `Delivery OTP rejected when status is accepted (got ${acceptedDeliveryOtp.statusCode})`);
  console.log('  ✅ PASSED: OTP status guards enforce accepted/scheduled for pickup & picked_up/in_transit for delivery');

  // ====================================================
  // TEST 3: Hash-Only Storage & No Hash/Salt Leakage on GET
  // ====================================================
  console.log('--- Test 3: Hash-Only Storage & Sanitized GET Token Endpoint ---');
  seedDonation('don_hash_check', { status: 'scheduled' });
  const genHashRes = await makeMockRequest(app, {
    method: 'POST',
    url: '/api/verify/don_hash_check/otp',
    headers: { Authorization: 'Bearer mock-token-donor1-donor' },
    body: { mode: 'pickup' },
  });
  const issuedPlainOtp = genHashRes.body.otp;
  const storedVer = testVerificationsStore.get('don_hash_check');
  assert(storedVer && typeof storedVer.pickupOtpHash === 'string' && storedVer.pickupOtpHash.length === 64, 'SHA-256 hex hash stored');
  assert(typeof storedVer.pickupOtpSalt === 'string' && storedVer.pickupOtpSalt.length === 32, '16-byte random hex salt stored');
  assert(!JSON.stringify(storedVer).includes(issuedPlainOtp), 'Plain OTP is NEVER stored in verification record');

  const getTokenRes = await makeMockRequest(app, {
    method: 'GET',
    url: '/api/verify/don_hash_check/token',
    headers: { Authorization: 'Bearer mock-token-donor1-donor' },
  });
  assert(getTokenRes.statusCode === 200, 'Donor can fetch sanitized token payload');
  const tokenKeys = Object.keys(getTokenRes.body || {});
  assert(!tokenKeys.some((k) => k.toLowerCase().includes('otp')), `GET /token never returns OTP fields (keys: ${tokenKeys.join(',')})`);
  assert(!JSON.stringify(getTokenRes.body).includes(storedVer.pickupOtpHash), 'GET /token never leaks OTP hash');
  assert(!JSON.stringify(getTokenRes.body).includes(storedVer.pickupOtpSalt), 'GET /token never leaks OTP salt');
  console.log('  ✅ PASSED: Only salted SHA-256 hash stored; GET /token leaks zero OTP metadata');

  // ====================================================
  // TEST 4: Rate Limit (5 OTPs / hour -> 6th returns 429)
  // ====================================================
  console.log('--- Test 4: OTP Rate Limit (5/hour -> 429) ---');
  seedDonation('don_ratelimit', { status: 'accepted' });
  for (let i = 1; i <= 5; i++) {
    const r = await makeMockRequest(app, {
      method: 'POST',
      url: '/api/verify/don_ratelimit/otp',
      headers: { Authorization: 'Bearer mock-token-donor1-donor' },
      body: { mode: 'pickup' },
    });
    assert(r.statusCode === 200, `OTP issue #${i} succeeded (got ${r.statusCode})`);
  }
  const sixthRes = await makeMockRequest(app, {
    method: 'POST',
    url: '/api/verify/don_ratelimit/otp',
    headers: { Authorization: 'Bearer mock-token-donor1-donor' },
    body: { mode: 'pickup' },
  });
  assert(sixthRes.statusCode === 429, `6th OTP issue within 1 hour returns 429 (got ${sixthRes.statusCode})`);
  console.log('  ✅ PASSED: 5/hour OTP issuance limit enforced with HTTP 429');

  // ====================================================
  // TEST 5: New OTP Replaces & Invalidates Previous OTP + Single Use
  // ====================================================
  console.log('--- Test 5: Replacement Invalidation & Single-Use Enforcement ---');
  seedDonation('don_replace', { status: 'accepted' });
  const otp1Res = await makeMockRequest(app, {
    method: 'POST',
    url: '/api/verify/don_replace/otp',
    headers: { Authorization: 'Bearer mock-token-donor1-donor' },
    body: { mode: 'pickup' },
  });
  const otp1 = otp1Res.body.otp;

  const otp2Res = await makeMockRequest(app, {
    method: 'POST',
    url: '/api/verify/don_replace/otp',
    headers: { Authorization: 'Bearer mock-token-donor1-donor' },
    body: { mode: 'pickup' },
  });
  const otp2 = otp2Res.body.otp;

  if (otp1 !== otp2) {
    const tryOldOtp = await makeMockRequest(app, {
      method: 'POST',
      url: '/api/verify/pickup',
      headers: { Authorization: 'Bearer mock-token-vol1-volunteer' },
      body: { donationId: 'don_replace', tokenOrPin: otp1, volunteerName: 'Courier Sam' },
    });
    assert(tryOldOtp.statusCode === 400 && tryOldOtp.body?.success === false, 'Replaced old OTP is rejected');
  }

  // Valid current OTP succeeds
  const verifyNewOtp = await makeMockRequest(app, {
    method: 'POST',
    url: '/api/verify/pickup',
    headers: { Authorization: 'Bearer mock-token-vol1-volunteer' },
    body: { donationId: 'don_replace', tokenOrPin: otp2, volunteerName: 'Courier Sam' },
  });
  assert(verifyNewOtp.statusCode === 200 && verifyNewOtp.body?.success === true, 'Current valid OTP verifies pickup');
  assert(testVerificationDonationsStore.get('don_replace')?.status === 'picked_up', 'Donation transitioned to picked_up');
  assert(testVerificationsStore.get('don_replace')?.pickupOtpUsed === true, 'pickupOtpUsed marked true atomically');

  // Replaying the used OTP returns exact single-use message
  const replayOtp = await makeMockRequest(app, {
    method: 'POST',
    url: '/api/verify/pickup',
    headers: { Authorization: 'Bearer mock-token-vol1-volunteer' },
    body: { donationId: 'don_replace', tokenOrPin: otp2, volunteerName: 'Courier Sam' },
  });
  assert(replayOtp.statusCode === 400, `Replaying used OTP returns 400 (got ${replayOtp.statusCode})`);
  assert(
    replayOtp.body?.message === 'This OTP was already used.',
    `Replaying used OTP returns exact message (got "${replayOtp.body?.message}")`
  );
  console.log('  ✅ PASSED: New OTP invalidates previous OTP, valid OTP succeeds, and replay is blocked');

  // ====================================================
  // TEST 6: Expired OTP Rejection
  // ====================================================
  console.log('--- Test 6: Expired OTP Rejection ---');
  seedDonation('don_expired_otp', { status: 'accepted' });
  const expOtpRes = await makeMockRequest(app, {
    method: 'POST',
    url: '/api/verify/don_expired_otp/otp',
    headers: { Authorization: 'Bearer mock-token-donor1-donor' },
    body: { mode: 'pickup' },
  });
  const expOtp = expOtpRes.body.otp;
  // Force expiry timestamp into the past
  const verExp = testVerificationsStore.get('don_expired_otp');
  testVerificationsStore.set('don_expired_otp', {
    ...verExp,
    pickupOtpExpiresAt: new Date(Date.now() - 60_000).toISOString(),
  });

  const verifyExpired = await makeMockRequest(app, {
    method: 'POST',
    url: '/api/verify/pickup',
    headers: { Authorization: 'Bearer mock-token-vol1-volunteer' },
    body: { donationId: 'don_expired_otp', tokenOrPin: expOtp, volunteerName: 'Courier Sam' },
  });
  assert(verifyExpired.statusCode === 400, 'Expired OTP rejected with 400');
  assert(
    verifyExpired.body?.message === 'OTP has expired. Ask the donor to generate a new one.',
    `Expired OTP message matches expected text (got "${verifyExpired.body?.message}")`
  );
  console.log('  ✅ PASSED: Expired OTP is rejected with clear prompt to regenerate');

  // ====================================================
  // TEST 7: Wrong OTP Counts Toward 5-Attempt / 15-Minute Lock
  // ====================================================
  console.log('--- Test 7: 5-Attempt / 15-Minute Lockout ---');
  seedDonation('don_lockout', { status: 'accepted' });
  const lockOtpRes = await makeMockRequest(app, {
    method: 'POST',
    url: '/api/verify/don_lockout/otp',
    headers: { Authorization: 'Bearer mock-token-donor1-donor' },
    body: { mode: 'pickup' },
  });
  const realOtp = lockOtpRes.body.otp;
  const wrongOtp = realOtp === '000001' ? '000002' : '000001';

  for (let i = 1; i <= 5; i++) {
    const badRes = await makeMockRequest(app, {
      method: 'POST',
      url: '/api/verify/pickup',
      headers: { Authorization: 'Bearer mock-token-vol1-volunteer' },
      body: { donationId: 'don_lockout', tokenOrPin: wrongOtp, volunteerName: 'Courier Sam' },
    });
    assert(badRes.statusCode === 400, `Wrong OTP attempt #${i} fails with 400`);
  }

  // 6th attempt with the REAL valid OTP must be locked out for 15 minutes
  const lockedRes = await makeMockRequest(app, {
    method: 'POST',
    url: '/api/verify/pickup',
    headers: { Authorization: 'Bearer mock-token-vol1-volunteer' },
    body: { donationId: 'don_lockout', tokenOrPin: realOtp, volunteerName: 'Courier Sam' },
  });
  assert(lockedRes.statusCode === 400, '6th attempt after 5 failures is blocked');
  assert(
    String(lockedRes.body?.message || '').includes('locked for 15 minutes'),
    `Lockout message returned (got "${lockedRes.body?.message}")`
  );
  console.log('  ✅ PASSED: Failed OTP attempts count toward the 5-attempt / 15-minute lockout');

  // ====================================================
  // TEST 8: Delivery OTP + Legacy PIN & QR Token Compatibility
  // ====================================================
  console.log('--- Test 8: Delivery OTP & Legacy PIN/QR Compatibility ---');
  // 8a. Delivery OTP
  seedDonation('don_del_otp', { status: 'in_transit' });
  const delOtpRes = await makeMockRequest(app, {
    method: 'POST',
    url: '/api/verify/don_del_otp/otp',
    headers: { Authorization: 'Bearer mock-token-ngo1-ngo' },
    body: { mode: 'delivery' },
  });
  const delOtp = delOtpRes.body.otp;
  const verifyDelOtp = await makeMockRequest(app, {
    method: 'POST',
    url: '/api/verify/delivery',
    headers: { Authorization: 'Bearer mock-token-vol1-volunteer' },
    body: { donationId: 'don_del_otp', tokenOrPin: delOtp, verifierName: 'Courier Sam' },
  });
  assert(verifyDelOtp.statusCode === 200 && verifyDelOtp.body?.success === true, 'Delivery OTP verifies handover');
  assert(testVerificationDonationsStore.get('don_del_otp')?.status === 'delivered', 'Donation transitioned to delivered');
  assert(testVerificationsStore.get('don_del_otp')?.deliveryOtpUsed === true, 'deliveryOtpUsed marked true');
  assert(testVerificationImpactRecordsStore.some((r) => r.donationId === 'don_del_otp'), 'Impact record written on delivery OTP');

  // 8b. Legacy QR token still works even after OTP was generated
  seedDonation('don_legacy_qr', { status: 'accepted' });
  const legacyTokRes = await makeMockRequest(app, {
    method: 'GET',
    url: '/api/verify/don_legacy_qr/token',
    headers: { Authorization: 'Bearer mock-token-donor1-donor' },
  });
  const legacyQrToken = legacyTokRes.body.pickupToken;
  // Also generate an OTP so both coexist
  await makeMockRequest(app, {
    method: 'POST',
    url: '/api/verify/don_legacy_qr/otp',
    headers: { Authorization: 'Bearer mock-token-donor1-donor' },
    body: { mode: 'pickup' },
  });
  const verifyQr = await makeMockRequest(app, {
    method: 'POST',
    url: '/api/verify/pickup',
    headers: { Authorization: 'Bearer mock-token-vol1-volunteer' },
    body: { donationId: 'don_legacy_qr', tokenOrPin: legacyQrToken, volunteerName: 'Courier Sam' },
  });
  assert(verifyQr.statusCode === 200 && verifyQr.body?.success === true, 'Legacy QR pickupToken still verifies');

  // 8c. Legacy static PIN still works
  seedDonation('don_legacy_pin', { status: 'accepted' });
  const legacyPinTokRes = await makeMockRequest(app, {
    method: 'GET',
    url: '/api/verify/don_legacy_pin/token',
    headers: { Authorization: 'Bearer mock-token-donor1-donor' },
  });
  const legacyPin = legacyPinTokRes.body.pickupPin;
  const verifyPin = await makeMockRequest(app, {
    method: 'POST',
    url: '/api/verify/pickup',
    headers: { Authorization: 'Bearer mock-token-vol1-volunteer' },
    body: { donationId: 'don_legacy_pin', tokenOrPin: legacyPin, volunteerName: 'Courier Sam' },
  });
  assert(verifyPin.statusCode === 200 && verifyPin.body?.success === true, 'Legacy static pickupPin still verifies');
  console.log('  ✅ PASSED: Delivery OTP, legacy QR token, and legacy static PIN all verify properly');

  // ====================================================
  // TEST 9: JSON 404, Admin Config & Client Service Hardening
  // ====================================================
  console.log('--- Test 9: JSON 404, Firebase Admin Bundling & Client Hardening ---');
  const notFoundRes = await makeMockRequest(app, {
    method: 'GET',
    url: '/api/unknown-verification-route-xyz',
  });
  assert(notFoundRes.statusCode === 404, `Unknown /api/* returns 404 (got ${notFoundRes.statusCode})`);
  assert(notFoundRes.body?.success === false && typeof notFoundRes.body?.message === 'string', 'Unknown /api/* returns JSON { success: false, message }');

  assert(typeof adminConfigured === 'function', 'server/firebaseAdmin exports adminConfigured()');
  assert(isCredentialOrPermissionError({ code: 7, message: 'PERMISSION_DENIED' }), 'Detects gRPC code 7 PERMISSION_DENIED');
  assert(isCredentialOrPermissionError({ code: 16, message: 'UNAUTHENTICATED' }), 'Detects gRPC code 16 UNAUTHENTICATED');
  assert(
    isCredentialOrPermissionError(new Error('Could not load the default credentials')),
    'Detects missing ADC credential error'
  );

  const firebaseAdminSrc = fs.readFileSync(path.resolve(process.cwd(), 'server/firebaseAdmin.ts'), 'utf-8');
  assert(!firebaseAdminSrc.includes('readFileSync'), 'server/firebaseAdmin.ts uses static JSON import instead of fs.readFileSync');
  assert(firebaseAdminSrc.includes('firebase-applet-config.json'), 'server/firebaseAdmin.ts statically imports firebase-applet-config.json');

  const verSvcSrc = fs.readFileSync(path.resolve(process.cwd(), 'src/services/dbVerificationService.ts'), 'utf-8');
  assert(!verSvcSrc.includes("'123456'"), 'dbVerificationService.ts removed local fake pickupPin fallback');
  assert(verSvcSrc.includes('export async function generateVerificationOtp'), 'dbVerificationService.ts exports generateVerificationOtp');
  assert(verSvcSrc.includes('response.text()'), 'dbVerificationService.ts safely parses non-JSON responses via response.text()');

  const qrModalSrc = fs.readFileSync(path.resolve(process.cwd(), 'src/components/QRVerificationModal.tsx'), 'utf-8');
  assert(qrModalSrc.includes('if (isShowMode)'), 'QRVerificationModal.tsx only loads verification token in show modes');
  assert(qrModalSrc.includes('generateVerificationOtp'), 'QRVerificationModal.tsx integrates OTP generation');
  console.log('  ✅ PASSED: JSON 404, static config bundling, and client hardening verified');

  // Cleanup test stores
  testVerificationDonationsStore.clear();
  testVerificationsStore.clear();
  testVerificationAuditLogsStore.length = 0;
  testVerificationImpactRecordsStore.length = 0;

  console.log('\n🎉 ALL 9/9 OTP Verification & QR Hardening tests passed successfully!\n');
}

await runOtpValidationSuite();
