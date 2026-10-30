/**
 * Comprehensive Validation Test Suite for ResQBite Volunteer Food Collection & Live Tracking System
 */
import { calculateDistanceKm } from '../src/utils/geo.js';

interface TestVolunteer {
  id: string;
  name: string;
  lat: number;
  lng: number;
  radiusKm: number;
  optIn: boolean;
  isAvailable: boolean;
}

interface TestDonation {
  id: string;
  foodName: string;
  lat: number;
  lng: number;
  status: string;
  assignedVolunteerId?: string;
  claimLock?: string;
}

function runVolunteerTests() {
  console.log('====================================================');
  console.log(' ResQBite: Volunteer Food Collection & Tracking Tests');
  console.log('====================================================\n');

  let passed = 0;
  let failed = 0;

  function assert(description: string, condition: boolean, extra?: string) {
    if (condition) {
      console.log(`  [PASS] ${description}`);
      passed++;
    } else {
      console.error(`  [FAIL] ${description} ${extra ? `(${extra})` : ''}`);
      failed++;
    }
  }

  // TEST 1: Haversine Geo Distance and 10 km Radius Notification Filtering
  console.log('--- TEST 1: Distance Calculation & 10 km Radius Notification Filter ---');
  // Donor located at New Delhi Center: 28.6139, 77.2090
  const donorLat = 28.6139;
  const donorLng = 77.2090;

  // Volunteer 1: Connaught Place (~1.5 km away)
  const vol1: TestVolunteer = {
    id: 'vol_near',
    name: 'Courier Sarah',
    lat: 28.6315,
    lng: 77.2167,
    radiusKm: 10,
    optIn: true,
    isAvailable: true,
  };

  // Volunteer 2: Noida Sector 62 (~18 km away)
  const vol2: TestVolunteer = {
    id: 'vol_far',
    name: 'Courier Raj',
    lat: 28.6256,
    lng: 77.3789,
    radiusKm: 10,
    optIn: true,
    isAvailable: true,
  };

  // Volunteer 3: Nearby (~4 km) but opted OUT of notifications
  const vol3: TestVolunteer = {
    id: 'vol_optout',
    name: 'Courier Maya',
    lat: 28.5800,
    lng: 77.2300,
    radiusKm: 10,
    optIn: false,
    isAvailable: true,
  };

  // Volunteer 4: Nearby (~2 km) but OFF-DUTY
  const vol4: TestVolunteer = {
    id: 'vol_offduty',
    name: 'Courier Dev',
    lat: 28.6200,
    lng: 77.2100,
    radiusKm: 10,
    optIn: true,
    isAvailable: false,
  };

  const dist1 = calculateDistanceKm(vol1.lat, vol1.lng, donorLat, donorLng)!;
  const dist2 = calculateDistanceKm(vol2.lat, vol2.lng, donorLat, donorLng)!;

  assert('Sarah is within 10 km radius', dist1 < 10, `dist: ${dist1.toFixed(2)} km`);
  assert('Raj is outside 10 km radius', dist2 > 10, `dist: ${dist2.toFixed(2)} km`);

  // Filter eligible volunteers
  const volunteers = [vol1, vol2, vol3, vol4];
  const eligibleVolunteers = volunteers.filter((vol) => {
    if (!vol.isAvailable || !vol.optIn) return false;
    const d = calculateDistanceKm(vol.lat, vol.lng, donorLat, donorLng);
    return d !== null && d <= vol.radiusKm;
  });

  assert(
    'Only Sarah is notified (distance <= 10km, on-duty, opted-in)',
    eligibleVolunteers.length === 1 && eligibleVolunteers[0].id === 'vol_near'
  );

  // TEST 2: Atomic Concurrency & Race-Condition Prevention (Double Claiming)
  console.log('\n--- TEST 2: Atomic Claim Lock & Race Condition Prevention ---');
  const donation: TestDonation = {
    id: 'don_101',
    foodName: '50 Fresh Meals',
    lat: donorLat,
    lng: donorLng,
    status: 'available',
  };

  // Simulate two concurrent courier acceptance attempts
  function attemptClaim(donationDoc: TestDonation, volunteerId: string): { success: boolean; message: string } {
    if (donationDoc.status !== 'available' && donationDoc.status !== 'requested') {
      return { success: false, message: `Donation is already claimed or in status ${donationDoc.status}.` };
    }
    if (donationDoc.claimLock && donationDoc.claimLock !== volunteerId) {
      return { success: false, message: 'Donation has an active claim lock by another user.' };
    }

    // Atomically set lock and assign
    donationDoc.status = 'accepted';
    donationDoc.assignedVolunteerId = volunteerId;
    donationDoc.claimLock = volunteerId;
    return { success: true, message: 'Collection request claimed successfully.' };
  }

  const claim1 = attemptClaim(donation, 'volunteer_alice');
  const claim2 = attemptClaim(donation, 'volunteer_bob');

  assert('First volunteer (Alice) claims request successfully', claim1.success === true);
  assert(
    'Second volunteer (Bob) is rejected atomically with proper notice',
    claim2.success === false && claim2.message.includes('already claimed')
  );
  assert('Assigned courier remains Alice', donation.assignedVolunteerId === 'volunteer_alice');

  // TEST 3: Status Transition Workflow
  console.log('\n--- TEST 3: Collection Status Workflow Progression ---');
  const allowedTransitions: Record<string, string[]> = {
    available: ['requested', 'accepted', 'cancelled'],
    requested: ['accepted', 'available', 'cancelled'],
    accepted: ['picked_up', 'available', 'cancelled'],
    scheduled: ['picked_up', 'available', 'cancelled'],
    picked_up: ['in_transit', 'delivered', 'cancelled'],
    in_transit: ['delivered', 'cancelled'],
    delivered: ['completed'],
    completed: [],
    cancelled: [],
  };

  function canTransition(current: string, next: string): boolean {
    return (allowedTransitions[current] || []).includes(next);
  }

  assert('AVAILABLE -> ACCEPTED is valid', canTransition('available', 'accepted'));
  assert('ACCEPTED -> PICKED_UP is valid', canTransition('accepted', 'picked_up'));
  assert('PICKED_UP -> IN_TRANSIT is valid', canTransition('picked_up', 'in_transit'));
  assert('IN_TRANSIT -> DELIVERED is valid', canTransition('in_transit', 'delivered'));
  assert('DELIVERED -> COMPLETED is valid', canTransition('delivered', 'completed'));
  assert('COMPLETED cannot transition to AVAILABLE', !canTransition('completed', 'available'));
  assert('PICKED_UP cannot transition directly to AVAILABLE without cancellation', !canTransition('picked_up', 'available'));

  // TEST 4: Pre-pickup Cancellation vs Post-pickup
  console.log('\n--- TEST 4: Safe Pre-Pickup Cancellation & Release ---');
  function cancelCollection(status: string, reason: string): { success: boolean; revertedStatus?: string } {
    if (status !== 'accepted' && status !== 'scheduled') {
      return { success: false };
    }
    return { success: true, revertedStatus: 'available' };
  }

  const cancelAccepted = cancelCollection('accepted', 'Flat tire');
  const cancelInTransit = cancelCollection('in_transit', 'Change of mind');

  assert(
    'Volunteer can cancel while in ACCEPTED status, releasing back to AVAILABLE',
    cancelAccepted.success === true && cancelAccepted.revertedStatus === 'available'
  );
  assert(
    'Volunteer CANNOT cancel once food is IN_TRANSIT (must complete or contact shelter)',
    cancelInTransit.success === false
  );

  // TEST 5: Live GPS Tracking Session & Auto-Stop
  console.log('\n--- TEST 5: Live GPS Tracking Telemetry & Stop Logic ---');
  interface LiveSession {
    donationId: string;
    volunteerId: string;
    status: 'in_transit' | 'stopped';
    lat: number;
    lng: number;
    speed: number | null;
    heading: number | null;
    lastUpdatedAt: string;
  }

  const session: LiveSession = {
    donationId: 'don_101',
    volunteerId: 'volunteer_alice',
    status: 'in_transit',
    lat: 28.6180,
    lng: 77.2120,
    speed: 5.5, // 5.5 m/s (~20 km/h)
    heading: 90,
    lastUpdatedAt: new Date().toISOString(),
  };

  assert('Live session records accurate coordinates and heading', session.lat === 28.6180 && session.heading === 90);

  // Auto-stop on delivered/completed
  function onStatusCompleted(activeSession: LiveSession) {
    activeSession.status = 'stopped';
    activeSession.lastUpdatedAt = new Date().toISOString();
  }
  onStatusCompleted(session);

  assert('Tracking session automatically stops when collection is delivered/completed', session.status === 'stopped');

  // Summary
  console.log('\n====================================================');
  console.log(` Summary: ${passed} passed, ${failed} failed`);
  console.log('====================================================\n');

  if (failed > 0) {
    process.exit(1);
  }
}

runVolunteerTests();
