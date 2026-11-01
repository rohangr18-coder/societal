/**
 * Validation Suite: Firestore Undefined Values & Donation Submission Sanitization
 *
 * Verifies that:
 * 1. `sanitizeForFirestore` recursively strips any `undefined` properties while preserving `false`, `0`, `""`, `null`, Dates, and Arrays.
 * 2. `normalizeDonationPayload` correctly omits empty/blank optional fields (e.g. `preferredPickupTime`, `prepTime`, `allergens`)
 *    so Firestore `setDoc()` never encounters unsupported `undefined` values.
 * 3. Required donation fields are strictly validated (no silent corruption or fake defaults).
 * 4. Raw Firestore errors are transformed into human-friendly explanations for donors.
 * 5. Complete simulated donation payloads are 100% free of `undefined` values.
 */

import {
  sanitizeForFirestore,
  validateDonationRequiredFields,
  normalizeDonationPayload,
  formatUserFriendlyFirestoreError,
} from '../src/utils/firestoreSanitizer';

function assert(condition: boolean, msg: string) {
  if (!condition) {
    throw new Error(`❌ Assertion Failed: ${msg}`);
  }
}

console.log('🧪 Testing Firestore Sanitizer & Donation Payload Normalization...');

// --- TEST 1: sanitizeForFirestore recursive removal & preservation ---
console.log('  1. Testing sanitizeForFirestore behavior...');

const rawObjectWithUndefined = {
  a: 'valid-string',
  b: 0,
  c: false,
  d: null,
  e: '',
  f: undefined, // Must be stripped
  nested: {
    n1: 'deep',
    n2: undefined, // Must be stripped
    n3: 42,
    n4: null,
    inner: {
      deepUndefined: undefined,
      deepValid: 'safe',
    },
  },
  arr: [
    'item1',
    undefined, // Must be filtered out
    { itemKey: 'val', badKey: undefined },
    0,
    false,
  ],
  dateField: new Date('2026-11-01T10:00:00Z'),
};

const cleaned = sanitizeForFirestore(rawObjectWithUndefined) as any;

assert(cleaned.a === 'valid-string', 'Preserves valid string');
assert(cleaned.b === 0, 'Preserves numeric 0 (not treated as falsy/undefined)');
assert(cleaned.c === false, 'Preserves boolean false');
assert(cleaned.d === null, 'Preserves intentional null');
assert(cleaned.e === '', 'Preserves empty string');
assert(!('f' in cleaned), 'Key "f" with undefined value must be deleted');
assert(!('n2' in cleaned.nested), 'Nested key "n2" with undefined value must be deleted');
assert(cleaned.nested.n1 === 'deep', 'Preserves valid nested string');
assert(cleaned.nested.n3 === 42, 'Preserves valid nested number');
assert(cleaned.nested.n4 === null, 'Preserves valid nested null');
assert(!('deepUndefined' in cleaned.nested.inner), 'Deeply nested undefined key must be deleted');
assert(cleaned.nested.inner.deepValid === 'safe', 'Deeply nested valid value preserved');
assert(cleaned.arr.length === 4, 'Array undefined item filtered out');
assert(cleaned.arr[0] === 'item1', 'Array item preserved');
assert(!('badKey' in cleaned.arr[1]), 'Nested object inside array had undefined key stripped');
assert(cleaned.arr[2] === 0, 'Array item 0 preserved');
assert(cleaned.arr[3] === false, 'Array item false preserved');
assert(cleaned.dateField instanceof Date, 'Date instance preserved');

console.log('    ✓ sanitizeForFirestore successfully cleans undefined while preserving 0, false, "", null, and Dates.');

// --- TEST 2: normalizeDonationPayload with empty/optional fields ---
console.log('  2. Testing normalizeDonationPayload optional field handling...');

// Case A: Preferred Pickup Time left blank (the exact user trigger for the error)
const payloadBlankOptional: any = {
  donorId: 'donor_user_123',
  donorName: 'City Bakery',
  foodName: 'Surplus Pastries & Croissants',
  category: 'Baked Goods',
  description: 'Fresh artisanal baguettes and croissants',
  quantity: 15,
  unit: 'boxes',
  pickupDate: '2026-11-01',
  availableFrom: '14:00',
  availableUntil: '18:00',
  collectionDeadline: '2026-11-01T18:00:00',
  pickupDeadline: 'Today before 6:00 PM',
  timeZone: 'Asia/Kolkata',
  pickupAddress: '42 Baker Street, Sector 5',
  latitude: 12.9716,
  longitude: 77.5946,
  storageType: 'Room Temperature (Dry)',
  packaging: 'Sealed cardboard boxes',
  preferredPickupTime: '', // Blank
  prepTime: undefined, // Missing
  allergens: '   ', // Whitespace
  imageUrl: '', // Blank
};

const normalizedA = normalizeDonationPayload(payloadBlankOptional);

assert(!('preferredPickupTime' in normalizedA), 'preferredPickupTime must be omitted when blank string');
assert(!('prepTime' in normalizedA), 'prepTime must be omitted when undefined');
assert(!('allergens' in normalizedA), 'allergens must be omitted when empty or whitespace');
assert(typeof normalizedA.imageUrl === 'string' && normalizedA.imageUrl.length > 0, 'Fallback image URL provided');
assert(normalizedA.foodName === 'Surplus Pastries & Croissants', 'Food name preserved');
assert(normalizedA.quantity === 15, 'Quantity preserved');
assert(normalizedA.donorId === 'donor_user_123', 'Donor ID preserved');

// Verify that NO key anywhere in normalizedA is undefined
function scanForUndefined(obj: any, path = ''): string[] {
  const issues: string[] = [];
  if (obj === null || typeof obj !== 'object') {
    return issues;
  }
  for (const [k, v] of Object.entries(obj)) {
    const currentPath = path ? `${path}.${k}` : k;
    if (v === undefined) {
      issues.push(currentPath);
    } else if (typeof v === 'object' && v !== null && !(v instanceof Date)) {
      issues.push(...scanForUndefined(v, currentPath));
    }
  }
  return issues;
}

const undefinedKeysA = scanForUndefined(normalizedA);
assert(undefinedKeysA.length === 0, `Found undefined keys in normalized payload: ${undefinedKeysA.join(', ')}`);
console.log('    ✓ Payload with blank optional fields contains ZERO undefined values.');

// Case B: All optional fields filled
const payloadFullOptional: any = {
  donorId: 'donor_user_456',
  donorName: 'Green Salad Bar',
  foodName: 'Organic Harvest Salad Bowls',
  category: 'Produce',
  description: 'Fresh leafy greens and chopped vegetables',
  quantity: 20,
  unit: 'bowls',
  servings: 20,
  pickupDate: '2026-11-01',
  availableFrom: '12:00',
  availableUntil: '16:00',
  collectionDeadline: '2026-11-01T16:00:00',
  pickupDeadline: 'Today before 4:00 PM',
  timeZone: 'Asia/Kolkata',
  pickupAddress: '88 Market Avenue',
  latitude: 12.9352,
  longitude: 77.6245,
  storageType: 'Chilled / Refrigerated',
  packaging: 'Individual compostable containers',
  preferredPickupTime: '13:30',
  prepTime: 'Prepared at 11:30 AM',
  allergens: 'Contains walnuts, sesame dressing',
  imageUrl: 'https://images.unsplash.com/custom-salad.jpg',
  preparedAt: '2026-11-01T06:00:00.000Z',
  safeUntil: '2026-11-01T12:00:00.000Z',
};

const normalizedB = normalizeDonationPayload(payloadFullOptional);

assert(normalizedB.preferredPickupTime === '13:30', 'Preserves provided preferredPickupTime');
assert(normalizedB.prepTime === 'Prepared at 11:30 AM', 'Preserves provided prepTime');
assert(normalizedB.allergens === 'Contains walnuts, sesame dressing', 'Preserves provided allergens');
assert(normalizedB.imageUrl === 'https://images.unsplash.com/custom-salad.jpg', 'Preserves provided imageUrl');
assert(normalizedB.servings === 20, 'Preserves provided servings');
assert(normalizedB.preparedAt === '2026-11-01T06:00:00.000Z', 'Preserves preparedAt');
assert(normalizedB.safeUntil === '2026-11-01T12:00:00.000Z', 'Preserves safeUntil');

const undefinedKeysB = scanForUndefined(normalizedB);
assert(undefinedKeysB.length === 0, `Found undefined keys in full payload: ${undefinedKeysB.join(', ')}`);
console.log('    ✓ Payload with full optional fields correctly stores all provided values.');

// --- TEST 3: validateDonationRequiredFields strict validation ---
console.log('  3. Testing required fields validation...');

// Missing food name
const inv1 = validateDonationRequiredFields({
  donorId: 'user1',
  foodName: '',
  category: 'Cooked Meals',
  quantity: 5,
  unit: 'servings',
  pickupAddress: 'Address',
  latitude: 12.9,
  longitude: 77.5,
  pickupDate: '2026-11-01',
  availableFrom: '10:00',
  availableUntil: '12:00',
  collectionDeadline: '2026-11-01T12:00:00',
});
assert(!inv1.isValid, 'Missing food name must fail validation');
assert(inv1.errors.some((e) => e.includes('Food Title')), 'Error message mentions Food Title');

// Zero or negative quantity
const inv2 = validateDonationRequiredFields({
  donorId: 'user1',
  foodName: 'Rice',
  category: 'Cooked Meals',
  quantity: 0,
  unit: 'kg',
  pickupAddress: 'Address',
  latitude: 12.9,
  longitude: 77.5,
  pickupDate: '2026-11-01',
  availableFrom: '10:00',
  availableUntil: '12:00',
  collectionDeadline: '2026-11-01T12:00:00',
});
assert(!inv2.isValid, 'Quantity <= 0 must fail validation');

// Missing GPS coordinates
const inv3 = validateDonationRequiredFields({
  donorId: 'user1',
  foodName: 'Rice',
  category: 'Cooked Meals',
  quantity: 10,
  unit: 'kg',
  pickupAddress: 'Address',
  latitude: NaN,
  longitude: 77.5,
  pickupDate: '2026-11-01',
  availableFrom: '10:00',
  availableUntil: '12:00',
  collectionDeadline: '2026-11-01T12:00:00',
});
assert(!inv3.isValid, 'NaN coordinates must fail validation');

// Invalid time window (availableUntil <= availableFrom)
const inv4 = validateDonationRequiredFields({
  donorId: 'user1',
  foodName: 'Rice',
  category: 'Cooked Meals',
  quantity: 10,
  unit: 'kg',
  pickupAddress: 'Address',
  latitude: 12.9,
  longitude: 77.5,
  pickupDate: '2026-11-01',
  availableFrom: '14:00',
  availableUntil: '13:00',
  collectionDeadline: '2026-11-01T13:00:00',
});
assert(!inv4.isValid, 'End time earlier than start time must fail validation');

// Valid donation
const validDonation = validateDonationRequiredFields({
  donorId: 'donor_real_123',
  foodName: 'Fresh Basmati Rice & Curry',
  category: 'Cooked Meals',
  quantity: 50,
  unit: 'meals',
  pickupAddress: '100 Community Center Road',
  latitude: 12.9716,
  longitude: 77.5946,
  pickupDate: '2026-11-01',
  availableFrom: '13:00',
  availableUntil: '15:30',
  collectionDeadline: '2026-11-01T15:30:00',
});
assert(validDonation.isValid, 'Fully valid donation must pass validation');
assert(validDonation.errors.length === 0, 'No errors for valid donation');

console.log('    ✓ Strict validation protects data integrity without silent fallbacks.');

// --- TEST 4: formatUserFriendlyFirestoreError translation ---
console.log('  4. Testing user-friendly error formatting...');

// Raw Firebase undefined error
const rawUndefinedErr = new Error(
  'Function setDoc() called with invalid data. Unsupported field value: undefined (found in field preferredPickupTime in document donations/xyz)'
);
const friendlyUndefined = formatUserFriendlyFirestoreError(rawUndefinedErr);
assert(
  !friendlyUndefined.includes('setDoc()'),
  'Friendly message must not expose raw setDoc() stack trace'
);
assert(
  friendlyUndefined.includes('formatting issue'),
  'Explains issue clearly to the donor'
);

// Permission denied error
const rawPermissionErr = new Error(
  'PERMISSION_DENIED: Missing or insufficient permissions.'
);
const friendlyPermission = formatUserFriendlyFirestoreError(rawPermissionErr);
assert(
  friendlyPermission.includes('Permission denied'),
  'Explains permission issue clearly'
);

// Offline error
const rawOfflineErr = new Error('Failed to get document because the client is offline.');
const friendlyOffline = formatUserFriendlyFirestoreError(rawOfflineErr);
assert(
  friendlyOffline.includes('offline') || friendlyOffline.includes('Network'),
  'Explains network/offline issue clearly'
);

// Serialized JSON error from handleFirestoreError
const serializedJsonErr = new Error(
  JSON.stringify({
    error: 'Unsupported field value: undefined found in field preferredPickupTime',
    operation: 'create',
    path: 'donations',
  })
);
const friendlyJson = formatUserFriendlyFirestoreError(serializedJsonErr);
assert(
  !friendlyJson.startsWith('{'),
  'Serialized JSON is cleanly decoded and translated'
);

console.log('    ✓ formatUserFriendlyFirestoreError properly converts raw errors to friendly donor messages.');

console.log('\n✅ All Firestore undefined sanitizer & donation submission validation tests PASSED successfully!\n');
