/**
 * Food Safety & Expiration Rules Utility
 * Implements food safety guidelines including the 2-hour rule for perishable cooked foods
 * outside hot/cold holding (temperature danger zone).
 */

export interface FoodSafetyParams {
  category?: string;
  storageType?: string;
  preparedAt?: string | number | Date;
  createdAt?: string | number | Date;
  pickupDeadline?: string;
  collectionDeadline?: string;
  safeUntil?: string;
}

export interface FoodSafetyCalculation {
  safeUntilIso: string;
  safeUntilTimestamp: number;
  hoursAllowed: number;
  isCookedOutsideHolding: boolean;
  ruleDescription: string;
  temperatureCategory: 'danger_zone' | 'hot_holding' | 'refrigerated' | 'frozen' | 'ambient_stable';
}

export interface ExpirationCheckResult {
  isExpired: boolean;
  effectiveSafeUntilMs: number;
  effectiveSafeUntilIso: string;
  remainingMs: number;
  remainingMinutes: number;
  reason: string;
  isCookedPerishable: boolean;
}

/**
 * Normalizes input timestamp (ISO string, date, or epoch ms) to numeric epoch ms
 */
export function normalizeTimestamp(input?: string | number | Date | null): number | null {
  if (!input) return null;
  if (typeof input === 'number') {
    return isNaN(input) ? null : input;
  }
  if (input instanceof Date) {
    const t = input.getTime();
    return isNaN(t) ? null : t;
  }
  const parsed = new Date(input).getTime();
  return isNaN(parsed) ? null : parsed;
}

/**
 * Categorizes storage condition into food safety thermal tiers
 */
export function getStorageTier(storageType?: string): 'hot_holding' | 'refrigerated' | 'frozen' | 'ambient' {
  const s = (storageType || '').toLowerCase();
  if (s.includes('hot') || s.includes('> 60') || s.includes('60°c') || s.includes('warmer')) {
    return 'hot_holding';
  }
  if (s.includes('refrigerat') || s.includes('0-4') || s.includes('chilled') || s.includes('cold')) {
    return 'refrigerated';
  }
  if (s.includes('frozen') || s.includes('< -18') || s.includes('freezer')) {
    return 'frozen';
  }
  return 'ambient'; // Outside active holding / room temp
}

/**
 * Determines maximum allowed safe consumption window in hours based on
 * food category and storage conditions.
 * Crucially enforces the 2-Hour Rule for cooked food outside hot/cold holding.
 */
export function getSafeHoursAllowed(category?: string, storageType?: string): {
  hours: number;
  isCookedOutsideHolding: boolean;
  ruleDescription: string;
  temperatureCategory: 'danger_zone' | 'hot_holding' | 'refrigerated' | 'frozen' | 'ambient_stable';
} {
  const cat = (category || '').toLowerCase();
  const tier = getStorageTier(storageType);

  const isCooked =
    cat.includes('cooked') ||
    cat.includes('meal') ||
    cat.includes('prepared') ||
    cat.includes('curry') ||
    cat.includes('rice') ||
    cat.includes('biryani') ||
    cat.includes('soup');

  const isDairy = cat.includes('dairy') || cat.includes('milk') || cat.includes('egg') || cat.includes('paneer') || cat.includes('cheese');
  const isProduce = cat.includes('produce') || cat.includes('fruit') || cat.includes('vegetable');
  const isBakery = cat.includes('bakery') || cat.includes('bread') || cat.includes('pastry');
  const isPackaged = cat.includes('packaged') || cat.includes('canned') || cat.includes('dry') || cat.includes('sealed');
  const isBeverage = cat.includes('beverage') || cat.includes('juice') || cat.includes('drink');

  // 1. Cooked Meals
  if (isCooked) {
    if (tier === 'hot_holding') {
      return {
        hours: 4,
        isCookedOutsideHolding: false,
        ruleDescription: 'Hot holding (>60°C) maintains cooked food safety for up to 4 hours.',
        temperatureCategory: 'hot_holding',
      };
    }
    if (tier === 'refrigerated') {
      return {
        hours: 24,
        isCookedOutsideHolding: false,
        ruleDescription: 'Refrigerated storage (0-4°C) preserves cooked food for 24 hours.',
        temperatureCategory: 'refrigerated',
      };
    }
    if (tier === 'frozen') {
      return {
        hours: 168, // 7 days
        isCookedOutsideHolding: false,
        ruleDescription: 'Deep frozen (< -18°C) cooked food remains safe for up to 7 days.',
        temperatureCategory: 'frozen',
      };
    }
    // Ambient / Room Temperature outside hot/cold holding: Strict 2-Hour Rule
    return {
      hours: 2,
      isCookedOutsideHolding: true,
      ruleDescription: '2-Hour Safety Rule: Perishable cooked food outside temperature control must be consumed or refrigerated within 2 hours.',
      temperatureCategory: 'danger_zone',
    };
  }

  // 2. Dairy & Eggs
  if (isDairy) {
    if (tier === 'refrigerated') {
      return {
        hours: 48,
        isCookedOutsideHolding: false,
        ruleDescription: 'Refrigerated dairy & eggs safe for up to 48 hours.',
        temperatureCategory: 'refrigerated',
      };
    }
    return {
      hours: 4,
      isCookedOutsideHolding: false,
      ruleDescription: 'Dairy & egg products at room temperature must be distributed within 4 hours.',
      temperatureCategory: 'danger_zone',
    };
  }

  // 3. Fresh Produce & Fruits
  if (isProduce) {
    if (tier === 'refrigerated') {
      return {
        hours: 72,
        isCookedOutsideHolding: false,
        ruleDescription: 'Chilled fresh produce remains fresh for up to 72 hours.',
        temperatureCategory: 'refrigerated',
      };
    }
    return {
      hours: 24,
      isCookedOutsideHolding: false,
      ruleDescription: 'Fresh whole produce safe for ambient room temperature distribution within 24 hours.',
      temperatureCategory: 'ambient_stable',
    };
  }

  // 4. Bakery & Bread
  if (isBakery) {
    return {
      hours: 24,
      isCookedOutsideHolding: false,
      ruleDescription: 'Fresh baked bread and pastries retain freshness for 24 hours at room temperature.',
      temperatureCategory: 'ambient_stable',
    };
  }

  // 5. Packaged & Canned Goods
  if (isPackaged) {
    return {
      hours: 168, // 7 days
      isCookedOutsideHolding: false,
      ruleDescription: 'Sealed packaged and dry goods have extended 7-day rescue window.',
      temperatureCategory: 'ambient_stable',
    };
  }

  // 6. Beverages
  if (isBeverage) {
    if (tier === 'refrigerated') {
      return {
        hours: 48,
        isCookedOutsideHolding: false,
        ruleDescription: 'Chilled beverages safe for up to 48 hours.',
        temperatureCategory: 'refrigerated',
      };
    }
    return {
      hours: 6,
      isCookedOutsideHolding: false,
      ruleDescription: 'Fresh unsealed beverages outside chilling must be consumed within 6 hours.',
      temperatureCategory: 'danger_zone',
    };
  }

  // Default fallback
  if (tier === 'refrigerated') {
    return {
      hours: 24,
      isCookedOutsideHolding: false,
      ruleDescription: 'Refrigerated surplus food safe for 24 hours.',
      temperatureCategory: 'refrigerated',
    };
  }
  return {
    hours: 4,
    isCookedOutsideHolding: false,
    ruleDescription: 'General food safety rule: Room temperature surplus should be collected within 4 hours.',
    temperatureCategory: 'danger_zone',
  };
}

/**
 * Computes exact safeUntil ISO timestamp and milliseconds from donation attributes.
 * Uses preparedAt (or createdAt) as base and applies the category + storage formula.
 */
export function computeSafeUntil(params: FoodSafetyParams): FoodSafetyCalculation {
  // If explicit valid safeUntil is passed, use it directly
  if (params.safeUntil) {
    const directMs = normalizeTimestamp(params.safeUntil);
    if (directMs) {
      const { hours, isCookedOutsideHolding, ruleDescription, temperatureCategory } = getSafeHoursAllowed(
        params.category,
        params.storageType
      );
      return {
        safeUntilIso: new Date(directMs).toISOString(),
        safeUntilTimestamp: directMs,
        hoursAllowed: hours,
        isCookedOutsideHolding,
        ruleDescription,
        temperatureCategory,
      };
    }
  }

  // Determine base preparation timestamp
  const baseTimestamp =
    normalizeTimestamp(params.preparedAt) ||
    normalizeTimestamp(params.createdAt) ||
    Date.now();

  const { hours, isCookedOutsideHolding, ruleDescription, temperatureCategory } = getSafeHoursAllowed(
    params.category,
    params.storageType
  );

  const safeUntilTimestamp = baseTimestamp + hours * 60 * 60 * 1000;
  const safeUntilIso = new Date(safeUntilTimestamp).toISOString();

  return {
    safeUntilIso,
    safeUntilTimestamp,
    hoursAllowed: hours,
    isCookedOutsideHolding,
    ruleDescription,
    temperatureCategory,
  };
}

/**
 * Comprehensive expiration check for any donation item.
 * Evaluates safeUntil, preparedAt, and collection/pickup deadlines.
 */
export function isDonationExpired(
  donation: {
    status?: string;
    safeUntil?: string;
    preparedAt?: string;
    createdAt?: string;
    category?: string;
    storageType?: string;
    collectionDeadline?: string;
    pickupDeadline?: string;
  },
  nowMs: number = Date.now()
): ExpirationCheckResult {
  if (donation.status === 'expired') {
    return {
      isExpired: true,
      effectiveSafeUntilMs: 0,
      effectiveSafeUntilIso: new Date(0).toISOString(),
      remainingMs: 0,
      remainingMinutes: 0,
      reason: 'Donation explicitly marked as expired.',
      isCookedPerishable: false,
    };
  }

  // 1. Calculate safeUntil threshold from category + storage rule
  const safetyCalc = computeSafeUntil({
    category: donation.category,
    storageType: donation.storageType,
    preparedAt: donation.preparedAt,
    createdAt: donation.createdAt,
    safeUntil: donation.safeUntil,
  });

  let effectiveSafeUntilMs = safetyCalc.safeUntilTimestamp;
  let reason = safetyCalc.ruleDescription;

  // 2. Also check if collectionDeadline is earlier
  const collectionDeadlineMs = normalizeTimestamp(donation.collectionDeadline);
  if (collectionDeadlineMs && collectionDeadlineMs < effectiveSafeUntilMs) {
    effectiveSafeUntilMs = collectionDeadlineMs;
    reason = `Passed scheduled collection deadline (${donation.collectionDeadline}).`;
  }

  // 3. Fallback check for pickupDeadline if parsed
  if (!collectionDeadlineMs && donation.pickupDeadline) {
    const pickupDeadlineMs = normalizeTimestamp(donation.pickupDeadline);
    if (pickupDeadlineMs && pickupDeadlineMs < effectiveSafeUntilMs) {
      effectiveSafeUntilMs = pickupDeadlineMs;
      reason = `Passed pickup deadline (${donation.pickupDeadline}).`;
    }
  }

  const remainingMs = effectiveSafeUntilMs - nowMs;
  const isExpired = remainingMs <= 0;
  const remainingMinutes = Math.floor(remainingMs / (60 * 1000));

  return {
    isExpired,
    effectiveSafeUntilMs,
    effectiveSafeUntilIso: new Date(effectiveSafeUntilMs).toISOString(),
    remainingMs: Math.max(0, remainingMs),
    remainingMinutes,
    reason: isExpired
      ? `Food item has passed its safe consumption threshold (${new Date(effectiveSafeUntilMs).toISOString()}). ${reason}`
      : reason,
    isCookedPerishable: safetyCalc.isCookedOutsideHolding,
  };
}
