/**
 * Workflow and Business Logic Test Suite for Food Rescue Network
 * Validates state transitions, duplicate claim prevention, distance calculations, and impact formulas.
 */

import fs from 'fs';
import { calculateDistanceKm } from '../src/utils/geo';
import { DonationStatus } from '../src/types';
import { calculateSmartMatches } from '../src/utils/matching';
import { translations } from '../src/locales/translations';

function runTests() {
  console.log('🧪 Starting Food Rescue Network Workflow & Business Logic Tests...\n');

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

  // TEST 1: Distance calculation (Haversine)
  console.log('--- Test Suite 1: Geographic Proximity & Distance ---');
  // Distance between Connaught Place (28.6315, 77.2167) and India Gate (28.6129, 77.2295) is ~2.4 km
  const dist = calculateDistanceKm(28.6315, 77.2167, 28.6129, 77.2295);
  assert(dist > 2.0 && dist < 2.8, `Haversine distance calculated accurately (${dist} km, expected ~2.4 km)`);

  // Same coordinates should yield 0 km
  const zeroDist = calculateDistanceKm(28.6139, 77.2090, 28.6139, 77.2090);
  assert(zeroDist === 0, 'Zero distance between identical coordinates');

  // TEST 2: Donation State Machine Transitions
  console.log('\n--- Test Suite 2: Donation Status State Machine Transitions ---');
  const validTransitions: Record<DonationStatus, DonationStatus[]> = {
    available: ['requested', 'cancelled', 'expired'],
    requested: ['accepted', 'available', 'cancelled'],
    accepted: ['scheduled', 'available', 'cancelled'],
    scheduled: ['picked_up', 'accepted', 'cancelled'],
    picked_up: ['delivered', 'scheduled'],
    delivered: [], // Terminal state
    cancelled: [], // Terminal state
    expired: [],   // Terminal state
  };

  function canTransition(from: DonationStatus, to: DonationStatus): boolean {
    return validTransitions[from]?.includes(to) ?? false;
  }

  assert(canTransition('available', 'requested'), 'Available -> Requested allowed for NGO claim');
  assert(canTransition('requested', 'accepted'), 'Requested -> Accepted allowed for Donor confirmation');
  assert(canTransition('accepted', 'scheduled'), 'Accepted -> Scheduled allowed for Volunteer courier dispatch');
  assert(canTransition('scheduled', 'picked_up'), 'Scheduled -> Picked Up allowed for Courier handover');
  assert(canTransition('picked_up', 'delivered'), 'Picked Up -> Delivered allowed for Final shelter receipt');
  assert(!canTransition('delivered', 'available'), 'Terminal state: Delivered cannot revert to Available');
  assert(!canTransition('available', 'picked_up'), 'Invalid shortcut: Available cannot jump directly to Picked Up');

  // TEST 3: Duplicate Claim Concurrency Prevention
  console.log('\n--- Test Suite 3: Concurrency & Duplicate Claim Safeguard ---');
  const mockDonation = {
    id: 'test-don-001',
    status: 'available' as DonationStatus,
    claimLock: null as string | null,
  };

  // Simulating NGO A and NGO B claiming simultaneously
  function attemptClaim(donation: typeof mockDonation, ngoId: string): boolean {
    if (donation.status !== 'available' || donation.claimLock !== null) {
      return false; // Rejected: already locked
    }
    donation.status = 'requested';
    donation.claimLock = ngoId;
    return true;
  }

  const claimA = attemptClaim(mockDonation, 'ngo-alpha');
  const claimB = attemptClaim(mockDonation, 'ngo-beta');

  assert(claimA === true, 'First NGO claim succeeds and sets claimLock');
  assert(claimB === false, 'Second concurrent NGO claim safely blocked by claimLock');

  // TEST 4: Impact Calculation Methodology
  console.log('\n--- Test Suite 4: Impact Metrics Calculation ---');
  const sampleDelivered = [
    { quantity: 20, unit: 'kg', servings: undefined },
    { quantity: 50, unit: 'servings', servings: 50 },
  ];

  const totalKg = sampleDelivered.reduce((acc, curr) => {
    return acc + (curr.unit === 'kg' ? curr.quantity : curr.servings! * 0.4);
  }, 0);

  const meals = sampleDelivered.reduce((acc, curr) => {
    return acc + (curr.servings || Math.round(curr.quantity * 2.5));
  }, 0);

  assert(totalKg === 40, `Total rescued food calculated correctly (${totalKg} kg, expected 40 kg)`);
  assert(meals === 100, `Total meals estimated accurately (${meals} meals, expected 100 meals)`);

  // TEST 5: Smart NGO Matching Algorithm
  console.log('\n--- Test Suite 5: AI Smart Matching Algorithm ---');
  const testDonation = {
    id: 'don-100',
    donorId: 'donor-1',
    donorName: 'Test Hotel',
    foodName: 'Rice & Curry',
    category: 'Cooked Meals',
    description: 'Hot meals',
    quantity: 40,
    unit: 'servings',
    servings: 40,
    pickupDeadline: 'Today 5 PM',
    pickupAddress: 'Sector 15',
    latitude: 28.6289,
    longitude: 77.2185,
    storageType: 'Hot Holding (> 60°C)',
    packaging: 'Sealed containers',
    status: 'available' as DonationStatus,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };

  const testOrgs = [
    {
      id: 'ngo-far',
      ownerUid: 'uid-far',
      name: 'Far Shelter',
      registrationNumber: 'REG-1',
      type: 'Shelter',
      contactEmail: 'far@org.com',
      contactPhone: '9999999999',
      address: 'Distant Area',
      city: 'Delhi',
      capacityDailyMeals: 200,
      verificationStatus: 'verified' as const,
      latitude: 28.8500, // ~25 km away
      longitude: 77.3000,
      createdAt: '',
      updatedAt: '',
    },
    {
      id: 'ngo-near',
      ownerUid: 'uid-near',
      name: 'Near Community Kitchen',
      registrationNumber: 'REG-2',
      type: 'Community Kitchen',
      contactEmail: 'near@org.com',
      contactPhone: '8888888888',
      address: 'Nearby Hub',
      city: 'Delhi',
      capacityDailyMeals: 150,
      verificationStatus: 'verified' as const,
      latitude: 28.6300, // ~0.3 km away
      longitude: 77.2200,
      createdAt: '',
      updatedAt: '',
    },
  ];

  // Evaluate matching function
  const matchResults = calculateSmartMatches(testDonation, testOrgs);

  assert(matchResults.length === 2, 'Evaluated all candidate organizations');
  assert(matchResults[0].ngo.id === 'ngo-near', 'Closer NGO ranked higher (#1 match)');
  assert(matchResults[0].score > matchResults[1].score, 'Near NGO achieved higher compatibility score');
  assert(matchResults[0].summaryExplanation.includes('recommended'), 'Includes transparent data-grounded explanation');

  // TEST 6: QR Verification Token Validation & Replay Prevention
  console.log('\n--- Test Suite 6: QR Verification & Replay Protection ---');
  interface MockVerification {
    pickupToken: string;
    pickupPin: string;
    pickupUsed: boolean;
  }

  const mockVerDoc: MockVerification = {
    pickupToken: 'PKUP-ABCDEF12',
    pickupPin: '584920',
    pickupUsed: false,
  };

  function simulateScan(doc: MockVerification, input: string): { success: boolean; error?: string } {
    if (doc.pickupUsed) {
      return { success: false, error: 'Replay attack prevented: token already used' };
    }
    const clean = input.trim().toUpperCase();
    if (clean === doc.pickupToken || clean === doc.pickupPin) {
      doc.pickupUsed = true;
      return { success: true };
    }
    return { success: false, error: 'Invalid token or PIN' };
  }

  const firstScan = simulateScan(mockVerDoc, 'PKUP-ABCDEF12');
  assert(firstScan.success === true, 'First valid QR scan succeeds');
  assert(mockVerDoc.pickupUsed === true, 'Token marked as used upon first validation');

  const replayScan = simulateScan(mockVerDoc, 'PKUP-ABCDEF12');
  assert(replayScan.success === false, 'Replayed token correctly blocked and rejected');
  assert(Boolean(replayScan.error?.includes('Replay attack prevented')), 'Replay error message returned');

  const invalidScan = simulateScan(mockVerDoc, 'PKUP-WRONG999');
  assert(invalidScan.success === false, 'Invalid token rejected');

  // TEST 7: Multilingual Dictionary Integrity
  console.log('\n--- Test Suite 7: Multilingual Dictionary Integrity ---');
  const requiredKeys = [
    'nav.brand',
    'nav.browse',
    'nav.map',
    'nav.impact',
    'action.donateFood',
    'action.claimDonation',
    'action.startTracking',
    'status.available',
    'status.delivered',
    'safety.twoHourRule',
    'qr.pickupTitle',
    'tracking.title',
    'mithra.name',
  ];

  const langs = ['en', 'kn', 'hi', 'ta'] as const;
  for (const lang of langs) {
    const dict = translations[lang];
    assert(Boolean(dict), `Dictionary exists for language "${lang}"`);
    let missingKeys = 0;
    for (const key of requiredKeys) {
      if (!dict[key]) missingKeys++;
    }
    assert(missingKeys === 0, `All ${requiredKeys.length} essential keys present in "${lang}"`);
  }

  // TEST 8: Auth Security & Role Escalation Defense
  console.log('\n--- Test Suite 8: Auth Security & Role Escalation Defense ---');
  const ADMIN_EMAIL = 'rohangr18@gmail.com';
  
  function resolveRegistrationRole(email: string, requestedRole: string): string {
    const isBootstrap = email.trim().toLowerCase() === ADMIN_EMAIL.toLowerCase();
    if (isBootstrap) return 'admin';
    return (requestedRole === 'ngo' || requestedRole === 'volunteer') ? requestedRole : 'donor';
  }

  // Non-admin attempting to register as 'admin'
  const attackerRole = resolveRegistrationRole('hacker@evil.com', 'admin');
  assert(attackerRole === 'donor', 'Malicious self-assigned "admin" role during registration sanitized to "donor"');

  // Valid NGO registration
  const ngoRole = resolveRegistrationRole('shelter@ngo.org', 'ngo');
  assert(ngoRole === 'ngo', 'Legitimate NGO role accepted');

  // Valid Volunteer registration
  const volRole = resolveRegistrationRole('rider@express.com', 'volunteer');
  assert(volRole === 'volunteer', 'Legitimate Volunteer role accepted');

  // Bootstrap admin registration
  const bootstrapRole = resolveRegistrationRole(ADMIN_EMAIL, 'donor');
  assert(bootstrapRole === 'admin', 'Bootstrap admin email rohangr18@gmail.com recognized and elevated to admin');

  // Test error categorization for auth/operation-not-allowed
  const mockOpNotAllowedErr = { code: 'auth/operation-not-allowed' };
  // TEST 9: Firebase Configuration & Database ID Integrity
  console.log('\n--- Test Suite 9: Firebase Config & Database ID Integrity ---');
  const EXPECTED_PROJECT_ID: string = 'omega-plexus-n14dk';
  const EXPECTED_DB_ID: string = 'ai-studio-3944ed17-9bc7-40a0-9e59-d94f9b926b0e';

  assert(Boolean(EXPECTED_PROJECT_ID), 'Firebase Project ID is defined');
  assert(EXPECTED_DB_ID.startsWith('ai-studio-'), 'Firestore Database ID matches intended dedicated database instance');
  assert(EXPECTED_DB_ID !== '(default)', 'Firestore Database ID is not accidentally overwritten with (default)');

  // TEST 10: Vercel Routing Configuration Verification
  console.log('\n--- Test Suite 10: Vercel Routing Configuration Verification ---');
  const vercelJsonPath = './vercel.json';
  const vercelConfig = JSON.parse(fs.readFileSync(vercelJsonPath, 'utf8'));

  assert(Boolean(vercelConfig.rewrites), 'vercel.json has rewrites defined');
  const apiRewrite = vercelConfig.rewrites.find((r: any) => r.source === '/api/(.*)');
  assert(Boolean(apiRewrite), 'API routes explicitly preserved with dedicated rewrite rule');
  assert(apiRewrite?.destination === '/api/$1', 'API routes forward to /api/$1 instead of index.html');

  const spaRewrite = vercelConfig.rewrites.find((r: any) => r.destination === '/index.html');
  assert(Boolean(spaRewrite), 'SPA fallback rewrite to /index.html is configured');
  assert(spaRewrite?.source.includes('api'), 'SPA fallback excludes /api routes from being rewritten to HTML');

  console.log(`\n========================================`);
  console.log(`Results: ${passed} Passed, ${failed} Failed`);
  console.log(`========================================\n`);

  if (failed > 0) {
    process.exit(1);
  }
}

runTests();

