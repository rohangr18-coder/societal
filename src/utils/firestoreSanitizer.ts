/**
 * Firestore Data Normalization & Sanitization Utilities
 *
 * Firestore strictly rejects documents containing `undefined` values anywhere in the payload
 * (e.g. `FirebaseError: Function setDoc() called with invalid data. Unsupported field value: undefined`).
 *
 * This utility:
 * 1. Recursively removes any properties whose value is `undefined`.
 * 2. Preserves valid values: `false`, `0`, empty strings `""`, `null` (when intentional), Arrays, and Timestamps.
 * 3. Normalizes optional donation fields (preferredPickupTime, prepTime, allergens, imageUrl) so missing
 *    optional values are omitted cleanly rather than written as `undefined`.
 * 4. Validates required fields strictly before Firestore mutations.
 * 5. Provides human-friendly error formatting for UI display.
 */

import { Donation, DonationStatus } from '../types';

/**
 * Recursively removes all properties with `undefined` values from an object or array.
 * Preserves false, 0, "", null, Dates, and plain arrays/objects.
 */
export function sanitizeForFirestore<T>(input: T): T {
  if (input === undefined) {
    return undefined as unknown as T;
  }

  if (input === null || typeof input !== 'object') {
    return input;
  }

  // Preserve Dates and Date-like objects (e.g. Firestore Timestamp with toDate/toMillis)
  if (input instanceof Date || ('toDate' in (input as any) && typeof (input as any).toDate === 'function')) {
    return input;
  }

  // Handle Arrays
  if (Array.isArray(input)) {
    const sanitizedArray = input
      .map((item) => sanitizeForFirestore(item))
      .filter((item) => item !== undefined);
    return sanitizedArray as unknown as T;
  }

  // Handle Plain Objects
  const cleaned: Record<string, any> = {};
  for (const [key, value] of Object.entries(input)) {
    if (value === undefined) {
      // Omit property completely from Firestore payload
      continue;
    }

    const sanitizedValue = sanitizeForFirestore(value);
    if (sanitizedValue !== undefined) {
      cleaned[key] = sanitizedValue;
    }
  }

  return cleaned as T;
}

export interface DonationValidationResult {
  isValid: boolean;
  errors: string[];
}

/**
 * Validates all required fields for a new food donation listing according to schema.
 * Prevents missing required fields from being submitted or converted into false defaults.
 */
export function validateDonationRequiredFields(data: Partial<Donation>): DonationValidationResult {
  const errors: string[] = [];

  if (!data.donorId || typeof data.donorId !== 'string' || !data.donorId.trim()) {
    errors.push('Donor account identification is required. Please ensure you are logged in.');
  }

  if (!data.foodName || typeof data.foodName !== 'string' || !data.foodName.trim()) {
    errors.push('Food Title is required.');
  }

  if (!data.category || typeof data.category !== 'string' || !data.category.trim()) {
    errors.push('Food Category is required.');
  }

  if (typeof data.quantity !== 'number' || isNaN(data.quantity) || data.quantity <= 0) {
    errors.push('Quantity must be a valid number greater than zero.');
  }

  if (!data.unit || typeof data.unit !== 'string' || !data.unit.trim()) {
    errors.push('Quantity Unit is required.');
  }

  if (!data.pickupAddress || typeof data.pickupAddress !== 'string' || !data.pickupAddress.trim()) {
    errors.push('Pickup Address is required.');
  }

  if (
    typeof data.latitude !== 'number' ||
    typeof data.longitude !== 'number' ||
    isNaN(data.latitude) ||
    isNaN(data.longitude)
  ) {
    errors.push('Valid geographic coordinates (latitude & longitude) are required.');
  }

  if (!data.pickupDate || typeof data.pickupDate !== 'string' || !data.pickupDate.trim()) {
    errors.push('Pickup Date is required.');
  }

  if (!data.availableFrom || !data.availableUntil) {
    errors.push('Both Available From and Available Until times are required.');
  }

  if (data.availableFrom && data.availableUntil && data.availableUntil <= data.availableFrom) {
    errors.push('Available Until time must be later than Available From start time.');
  }

  const effectiveDeadline = data.collectionDeadline || data.pickupDeadline;
  if (!effectiveDeadline || !effectiveDeadline.trim()) {
    errors.push('Collection Deadline is required.');
  }

  return {
    isValid: errors.length === 0,
    errors,
  };
}

/**
 * Normalizes a raw donation input object into a pristine, sanitized Firestore-safe payload.
 * Safely handles optional fields:
 * - preferredPickupTime: omitted if empty or whitespace (never undefined)
 * - prepTime: omitted if empty (never undefined)
 * - allergens: trimmed if provided, omitted if blank
 * - imageUrl: fallback to clean default if blank
 * - servings: numeric value preserved, omitted if invalid
 */
export function normalizeDonationPayload(
  raw: Omit<Donation, 'id' | 'createdAt' | 'updatedAt' | 'timeline'> & {
    id?: string;
    createdAt?: string;
    updatedAt?: string;
    timeline?: any[];
  }
): Record<string, any> {
  const result: Record<string, any> = {
    donorId: String(raw.donorId || '').trim(),
    donorName: String(raw.donorName || 'Food Donor').trim(),
    foodName: String(raw.foodName || '').trim(),
    category: String(raw.category || '').trim(),
    description: String(raw.description || '').trim(),
    quantity: Number(raw.quantity) || 0,
    unit: String(raw.unit || 'servings').trim(),
    pickupDeadline: String(raw.pickupDeadline || '').trim(),
    pickupDate: String(raw.pickupDate || '').trim(),
    availableFrom: String(raw.availableFrom || '').trim(),
    availableUntil: String(raw.availableUntil || '').trim(),
    collectionDeadline: String(raw.collectionDeadline || raw.pickupDeadline || '').trim(),
    timeZone: String(raw.timeZone || 'Asia/Kolkata').trim(),
    pickupAddress: String(raw.pickupAddress || '').trim(),
    latitude: Number(raw.latitude),
    longitude: Number(raw.longitude),
    storageType: String(raw.storageType || 'Room Temperature (Dry)').trim(),
    packaging: String(raw.packaging || 'Sealed food-grade containers').trim(),
    status: (raw.status as DonationStatus) || 'available',
  };

  // Optional: Servings
  if (typeof raw.servings === 'number' && !isNaN(raw.servings) && raw.servings > 0) {
    result.servings = raw.servings;
  } else if (result.quantity > 0 && (result.unit === 'servings' || result.unit === 'meals')) {
    result.servings = result.quantity;
  }

  // Optional: Preferred Pickup Time
  // CRITICAL FIX: If preferredPickupTime is blank, omitted, or undefined, DO NOT write undefined
  if (typeof raw.preferredPickupTime === 'string' && raw.preferredPickupTime.trim()) {
    result.preferredPickupTime = raw.preferredPickupTime.trim();
  }

  // Optional: Prep Time note
  if (typeof raw.prepTime === 'string' && raw.prepTime.trim()) {
    result.prepTime = raw.prepTime.trim();
  }

  // Optional: Prepared At ISO timestamp
  if (raw.preparedAt && typeof raw.preparedAt === 'string' && raw.preparedAt.trim()) {
    result.preparedAt = raw.preparedAt.trim();
  }

  // Optional: Safe Until ISO timestamp
  if (raw.safeUntil && typeof raw.safeUntil === 'string' && raw.safeUntil.trim()) {
    result.safeUntil = raw.safeUntil.trim();
  }

  // Optional: Allergens
  if (typeof raw.allergens === 'string' && raw.allergens.trim()) {
    result.allergens = raw.allergens.trim();
  }

  // Optional: Food Image URL
  if (typeof raw.imageUrl === 'string' && raw.imageUrl.trim()) {
    result.imageUrl = raw.imageUrl.trim();
  } else {
    result.imageUrl = 'https://images.unsplash.com/photo-1546069901-ba9599a7e63c?auto=format&fit=crop&w=600&q=80';
  }

  // Preserve existing document metadata if present
  if (raw.id) result.id = raw.id;
  if (raw.createdAt) result.createdAt = raw.createdAt;
  if (raw.updatedAt) result.updatedAt = raw.updatedAt;
  if (Array.isArray(raw.timeline)) result.timeline = raw.timeline;

  // Run recursive sanitizer to mathematically guarantee zero undefined properties
  return sanitizeForFirestore(result);
}

/**
 * Transforms any raw Firebase/network error into a user-friendly, readable message
 * while preserving detailed diagnostic logs in console.
 */
export function formatUserFriendlyFirestoreError(err: unknown): string {
  if (!err) {
    return 'An unexpected error occurred while saving your donation. Please try again.';
  }

  const rawMessage = err instanceof Error ? err.message : String(err);

  // If the error message is a serialized JSON FirestoreErrorInfo from handleFirestoreError
  let parsedError = rawMessage;
  try {
    const json = JSON.parse(rawMessage);
    if (json && typeof json.error === 'string') {
      parsedError = json.error;
    }
  } catch {
    // rawMessage was not JSON, use as-is
  }

  const lower = parsedError.toLowerCase();

  if (lower.includes('unsupported field value: undefined')) {
    return 'A data formatting issue was encountered while preparing your donation. Please check your form fields and try again.';
  }

  if (lower.includes('permission') || lower.includes('unauthorized') || lower.includes('forbidden')) {
    return 'Permission denied: Please ensure you are signed in as an active donor account.';
  }

  if (lower.includes('offline') || lower.includes('network') || lower.includes('unavailable') || lower.includes('timeout')) {
    return 'Network connection issue. Your device appears to be offline. Please check your internet connection.';
  }

  if (lower.includes('quota') || lower.includes('resource-exhausted')) {
    return 'The system is experiencing unusually high traffic. Please wait a moment and submit again.';
  }

  // Return clean message if short, otherwise safe fallback
  if (parsedError.length > 0 && parsedError.length < 150 && !parsedError.includes('{')) {
    return parsedError;
  }

  return 'Unable to submit your donation listing right now. Please check your inputs and try again.';
}
