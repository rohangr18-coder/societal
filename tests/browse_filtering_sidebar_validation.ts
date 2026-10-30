import {
  CATEGORIES,
  matchesCategory,
  matchesUrgency,
  UrgencyFilter,
  DistanceRange,
} from '../src/components/BrowseDonationsView';
import { Donation } from '../src/types';
import { calculateDistanceKm } from '../src/utils/geo';

console.log('🧪 Starting BrowseDonationsView Filtering Sidebar validation suite...');

let passedTests = 0;
let totalTests = 0;

function assert(condition: boolean, msg: string) {
  totalTests++;
  if (!condition) {
    console.error(`❌ FAILED: ${msg}`);
    throw new Error(msg);
  } else {
    passedTests++;
    console.log(`✅ PASSED: ${msg}`);
  }
}

// Mock Donations
const baseDonation: Donation = {
  id: 'don-1',
  donorId: 'donor-123',
  donorName: 'Bengaluru Tech Kitchen',
  foodName: 'Nutritious Dal Khichdi and Sabzi',
  category: 'Cooked Meals',
  description: 'Hot freshly prepared food from lunch service',
  quantity: 25,
  unit: 'servings',
  pickupDeadline: new Date(Date.now() + 30 * 60 * 1000).toISOString(), // 30 mins left (Urgent)
  pickupAddress: 'Indiranagar 100ft Road, Bengaluru',
  latitude: 12.9716,
  longitude: 77.5946,
  storageType: 'Hot / Insulated',
  packaging: 'Steel Containers',
  status: 'available',
  createdAt: new Date().toISOString(),
  updatedAt: new Date().toISOString(),
};

const produceDonation: Donation = {
  ...baseDonation,
  id: 'don-2',
  foodName: 'Fresh Organic Tomatoes & Spinach',
  category: 'Fresh Produce & Fruits',
  description: 'Farm fresh surplus harvest',
  pickupDeadline: new Date(Date.now() + 5 * 60 * 60 * 1000).toISOString(), // 5 hours left (Pending/Today)
  latitude: 12.96,
  longitude: 77.6, // Shantinagar (~1.4 km from Indiranagar)
  storageType: 'Ambient',
};

const bakeryDonation: Donation = {
  ...baseDonation,
  id: 'don-3',
  foodName: 'Whole Wheat Sourdough Loaves',
  category: 'Bakery & Bread',
  description: 'Freshly baked artisanal bread',
  pickupDeadline: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(), // 24 hours left (Flexible)
  latitude: 13.0358,
  longitude: 77.597, // Hebbal (~7.5 km away)
  storageType: 'Ambient',
};

const farDonation: Donation = {
  ...baseDonation,
  id: 'don-4',
  foodName: 'Packaged Biscuits and Rice Bags',
  category: 'Packaged & Canned Goods',
  pickupDeadline: new Date(Date.now() + 48 * 60 * 60 * 1000).toISOString(),
  latitude: 13.2,
  longitude: 77.7, // Devanahalli (~30 km away)
  storageType: 'Ambient',
};

// 1. Validate Category Filter Options
console.log('\n--- 1. Category Filter Options & Matching ---');
assert(CATEGORIES.includes('All Categories'), 'Includes All Categories option');
assert(CATEGORIES.includes('Cooked Meals'), 'Includes Cooked Meals option');
assert(CATEGORIES.includes('Produce'), 'Includes Produce option');
assert(CATEGORIES.includes('Bakery & Bread'), 'Includes Bakery & Bread option');

assert(matchesCategory(baseDonation.category, 'All Categories') === true, 'All Categories matches any donation');
assert(matchesCategory(baseDonation.category, 'Cooked Meals') === true, 'Matches Cooked Meals');
assert(matchesCategory(baseDonation.category, 'Produce') === false, 'Does not match Produce');
assert(matchesCategory(produceDonation.category, 'Produce') === true, 'Produce matches Fresh Produce & Fruits');
assert(matchesCategory(bakeryDonation.category, 'Bakery & Bread') === true, 'Matches Bakery & Bread');

// 2. Validate Pickup Urgency Matching
console.log('\n--- 2. Pickup Urgency Matching ---');
assert(matchesUrgency(baseDonation, 'all') === true, 'All urgency matches all donations');
assert(matchesUrgency(baseDonation, 'urgent') === true, 'Donation with 30 mins remaining matches urgent (< 2 hours)');
assert(matchesUrgency(produceDonation, 'urgent') === false, 'Donation with 5 hours remaining does not match urgent');
assert(matchesUrgency(produceDonation, 'pending') === true, 'Donation with 5 hours remaining matches pending / today (< 12 hours)');
assert(matchesUrgency(bakeryDonation, 'flexible') === true, 'Donation with 24 hours remaining matches flexible');
assert(matchesUrgency(bakeryDonation, 'urgent') === false, 'Donation with 24 hours remaining does not match urgent');

// 3. Validate Distance Radius Filtering
console.log('\n--- 3. Distance Radius Filtering ---');
const userLat = 12.9716;
const userLng = 77.5946;

const distBase = calculateDistanceKm(userLat, userLng, baseDonation.latitude, baseDonation.longitude)!;
const distProduce = calculateDistanceKm(userLat, userLng, produceDonation.latitude, produceDonation.longitude)!;
const distFar = calculateDistanceKm(userLat, userLng, farDonation.latitude, farDonation.longitude)!;

console.log(`Calculated distances: Base=${distBase.toFixed(2)}km, Produce=${distProduce.toFixed(2)}km, Far=${distFar.toFixed(2)}km`);

assert(distBase <= 1, 'Base donation is at user reference coords (~0km)');
assert(distProduce > 1 && distProduce < 10, 'Produce donation is within 10km radius');
assert(distFar > 25, 'Far donation is > 25km radius');

// Test radius predicate
const filterWithinRadius = (don: Donation, radiusKm: DistanceRange) => {
  if (radiusKm === 'all') return true;
  const dist = calculateDistanceKm(userLat, userLng, don.latitude, don.longitude);
  return dist !== null && dist <= radiusKm;
};

assert(filterWithinRadius(baseDonation, 5) === true, 'Base is within 5km');
assert(filterWithinRadius(produceDonation, 5) === true, 'Produce is within 5km');
assert(filterWithinRadius(farDonation, 5) === false, 'Far is NOT within 5km');
assert(filterWithinRadius(farDonation, 10) === false, 'Far is NOT within 10km');
assert(filterWithinRadius(farDonation, 50) === true, 'Far is within 50km');
assert(filterWithinRadius(farDonation, 'all') === true, 'All distances includes far');

console.log(`\n🎉 All ${passedTests}/${totalTests} BrowseDonationsView filtering tests passed successfully!`);
