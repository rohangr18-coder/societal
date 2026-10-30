import fs from 'fs';
import path from 'path';
import { Donation } from '../src/types';
import {
  clusterDonations,
  getPickupWindowInfo,
} from '../src/utils/clustering';
import { calculateDistanceKm } from '../src/utils/geo';

async function testVolunteerClusterMap() {
  console.log('🧪 Testing Volunteer Dashboard Map Clustering & Proximity Radar...\n');

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

  // --- Test 1: Pending Pickup Window Calculation ---
  console.log('--- Test 1: Pending Pickup Window Calculation ---');
  const now = Date.now();

  // 1. Urgent: 30 minutes in future
  const urgentDeadline = new Date(now + 30 * 60 * 1000).toISOString();
  const donationUrgent: Donation = {
    id: 'd_urgent',
    donorId: 'u1',
    donorName: 'Spice Garden',
    foodName: 'Hot Veg Pulao',
    category: 'Cooked Meals',
    quantity: 30,
    unit: 'boxes',
    servings: 30,
    pickupDeadline: urgentDeadline,
    pickupAddress: 'Indiranagar, Bangalore',
    latitude: 12.9716,
    longitude: 77.6412,
    status: 'available',
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };
  const urgentInfo = getPickupWindowInfo(donationUrgent);
  assert(urgentInfo.isUrgent === true, '30m remaining flagged as isUrgent: true');
  assert(urgentInfo.isExpired === false, '30m remaining is NOT expired');
  assert(urgentInfo.badgeColor === 'rose', 'Urgent window gets rose badge color');

  // 2. Pending: 2 hours in future
  const pendingDeadline = new Date(now + 120 * 60 * 1000).toISOString();
  const donationPending: Donation = {
    id: 'd_pending',
    donorId: 'u2',
    donorName: 'Fresh Bakery',
    foodName: 'Artisan Bread Loaves',
    category: 'Bakery',
    quantity: 15,
    unit: 'loaves',
    servings: 25,
    pickupDeadline: pendingDeadline,
    pickupAddress: 'Domlur, Bangalore',
    latitude: 12.9600,
    longitude: 77.6400,
    status: 'available',
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };
  const pendingInfo = getPickupWindowInfo(donationPending);
  assert(pendingInfo.isPending === true, '120m remaining flagged as isPending: true');
  assert(pendingInfo.isUrgent === false, '120m remaining is not urgent');
  assert(pendingInfo.badgeColor === 'amber', 'Pending window gets amber badge color');

  // 3. Expired: 15 minutes in past
  const expiredDeadline = new Date(now - 15 * 60 * 1000).toISOString();
  const donationExpired: Donation = {
    id: 'd_expired',
    donorId: 'u3',
    donorName: 'Cafe Coffee',
    foodName: 'Cold Sandwiches',
    category: 'Cooked Meals',
    quantity: 10,
    unit: 'boxes',
    pickupDeadline: expiredDeadline,
    pickupAddress: 'Koramangala, Bangalore',
    latitude: 12.9352,
    longitude: 77.6245,
    status: 'available',
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };
  const expiredInfo = getPickupWindowInfo(donationExpired);
  assert(expiredInfo.isExpired === true, 'Past deadline correctly flagged as isExpired: true');
  assert(expiredInfo.minutesRemaining === 0, 'Expired window has 0 minutes remaining');

  // --- Test 2: Spatial Clustering Algorithm ---
  console.log('\n--- Test 2: Real-Time Spatial Clustering Algorithm ---');
  // Two donations 1.3 km apart (should cluster within 2.0 km radius)
  const dCluster1 = { ...donationUrgent, id: 'c1', latitude: 12.9716, longitude: 77.6412 };
  const dCluster2 = { ...donationPending, id: 'c2', latitude: 12.9780, longitude: 77.6450 }; // ~0.8 km from c1
  // One isolated donation 15 km away in Whitefield
  const dIsolated = {
    ...donationPending,
    id: 'c3_iso',
    foodName: 'Fresh Apples',
    category: 'Produce',
    latitude: 12.9698,
    longitude: 77.7500, // ~12 km away from c1
  };

  const volunteerLat = 12.9700;
  const volunteerLng = 77.6400;

  const testDonations = [dCluster1, dCluster2, dIsolated, donationExpired];
  const clusters = clusterDonations(testDonations, 2.0, volunteerLat, volunteerLng);

  assert(clusters.length === 2, 'Generated exactly 2 clusters (1 group + 1 isolated)');
  assert(clusters.every((c) => !c.donations.some((d) => d.id === 'd_expired')), 'Expired donations are automatically excluded from active clusters');

  const multiCluster = clusters.find((c) => c.count > 1);
  assert(Boolean(multiCluster), 'Found multi-donation cluster');
  assert(multiCluster?.count === 2, 'Multi-cluster contains exactly 2 nearby donations');
  assert(multiCluster?.totalQuantity === 45, 'Aggregated totalQuantity is 30 + 15 = 45');
  assert(multiCluster?.hasUrgent === true, 'Cluster correctly inherits hasUrgent: true from urgent member');

  const isolatedCluster = clusters.find((c) => c.count === 1);
  assert(Boolean(isolatedCluster), 'Found isolated single-pickup cluster');
  assert(isolatedCluster?.donations[0].id === 'c3_iso', 'Isolated cluster contains isolated donation c3_iso');

  // --- Test 3: Proximity Filtering Logic ---
  console.log('\n--- Test 3: Proximity Radius Filter Calculations ---');
  const dist1 = calculateDistanceKm(volunteerLat, volunteerLng, dCluster1.latitude, dCluster1.longitude);
  const dist2 = calculateDistanceKm(volunteerLat, volunteerLng, dCluster2.latitude, dCluster2.longitude);
  const distIso = calculateDistanceKm(volunteerLat, volunteerLng, dIsolated.latitude, dIsolated.longitude);

  assert(dist1 <= 3.0, `Indiranagar donation is within 3 km (${dist1.toFixed(2)} km)`);
  assert(dist2 <= 3.0, `Domlur donation is within 3 km (${dist2.toFixed(2)} km)`);
  assert(distIso > 10.0, `Whitefield donation is beyond 10 km (${distIso.toFixed(2)} km)`);

  // Filter within 5 km
  const within5km = testDonations.filter((d) => {
    if (d.id === 'd_expired') return false;
    const dist = calculateDistanceKm(volunteerLat, volunteerLng, d.latitude, d.longitude);
    return dist <= 5.0;
  });
  assert(within5km.length === 2, 'Proximity filter 5 km returns only the 2 nearby donations');

  // Filter within 20 km
  const within20km = testDonations.filter((d) => {
    if (d.id === 'd_expired') return false;
    const dist = calculateDistanceKm(volunteerLat, volunteerLng, d.latitude, d.longitude);
    return dist <= 20.0;
  });
  assert(within20km.length === 3, 'Proximity filter 20 km includes the distant Whitefield donation');

  // --- Test 4: Component Integration & Governance Directives ---
  console.log('\n--- Test 4: Component Integration & Compliance ---');
  const clusterMapPath = path.resolve('src/components/VolunteerClusterMap.tsx');
  assert(fs.existsSync(clusterMapPath), 'VolunteerClusterMap.tsx component exists in src/components');

  const clusterMapContent = fs.readFileSync(clusterMapPath, 'utf-8');
  assert(clusterMapContent.includes('export const VolunteerClusterMap'), 'Exports VolunteerClusterMap component');
  assert(clusterMapContent.includes('clusterDonations'), 'Uses clusterDonations real-time clustering utility');
  assert(clusterMapContent.includes('gmp_mcp_codeassist_v1_aistudio'), 'Enforces internalUsageAttributionIds: gmp_mcp_codeassist_v1_aistudio');
  assert(clusterMapContent.includes('selectedProximity'), 'Supports proximity filtering by radius');
  assert(clusterMapContent.includes('DEMO_MAP_ID'), 'Specifies DEMO_MAP_ID for AdvancedMarker support');

  const volunteerViewPath = path.resolve('src/components/VolunteerView.tsx');
  const volunteerViewContent = fs.readFileSync(volunteerViewPath, 'utf-8');
  assert(volunteerViewContent.includes('VolunteerClusterMap'), 'VolunteerView imports and renders VolunteerClusterMap');
  assert(volunteerViewContent.includes('availableViewMode'), 'VolunteerView provides availableViewMode switcher (map, grid, split)');
  assert(volunteerViewContent.includes('Proximity Filter'), 'VolunteerView exposes proximity distance filter buttons');

  console.log('\n================================');
  console.log(`Total tests: ${passed + failed}`);
  console.log(`Passed: ${passed}`);
  console.log(`Failed: ${failed}`);
  console.log('================================');

  if (failed > 0) {
    process.exit(1);
  }
}

testVolunteerClusterMap().catch((err) => {
  console.error('Fatal test error:', err);
  process.exit(1);
});
