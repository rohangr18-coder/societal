import { Donation, Organization, SmartMatchResult, MatchBreakdown } from '../types';
import { calculateDistanceKm, isValidCoordinate } from './geo';

/**
 * Standardized portions conversion ratio: 1 kg -> servings by category
 */
export const KG_TO_SERVINGS_RATIO: Record<string, number> = {
  'Cooked Meals': 2.5,
  'Bakery & Bread': 3.0,
  'Fresh Produce & Fruits': 2.0,
  'Dairy & Eggs': 3.0,
  'Packaged & Canned Goods': 2.5,
  'Beverages': 4.0,
  'Raw Ingredients': 2.5,
  default: 2.5,
};

/**
 * Centralized portions conversion helper (kg / units -> servings)
 */
export function convertDonationToServings(donation: Donation): number {
  if (typeof donation.servings === 'number' && donation.servings > 0) {
    return Math.round(donation.servings);
  }
  const unit = (donation.unit || '').toLowerCase().trim();
  const qty = Number(donation.quantity) || 0;
  if (
    unit === 'kg' ||
    unit === 'kgs' ||
    unit === 'kilogram' ||
    unit === 'kilograms' ||
    unit === 'liters' ||
    unit === 'liter' ||
    unit === 'l'
  ) {
    const ratio = KG_TO_SERVINGS_RATIO[donation.category] || KG_TO_SERVINGS_RATIO.default;
    return Math.round(qty * ratio);
  }
  return Math.round(qty);
}

/**
 * Deterministic AI Smart Matching Engine
 * Ranks NGOs for a donation based on verified platform criteria:
 * - Proximity (Haversine formula from confirmed coordinates, no hardcoded fallbacks)
 * - Category compatibility & refrigeration requirement
 * - Deadline feasibility & 2-hour food safety window (at 25 km/h urban average travel speed)
 * - NGO capacity avoiding recommending 200 meals to 30-person shelters
 * - NGO verification status
 */
export function calculateSmartMatches(
  donation: Donation,
  organizations: Organization[],
  options?: { excludeMissingCoordinates?: boolean }
): SmartMatchResult[] {
  if (!organizations || organizations.length === 0) {
    return [];
  }

  // Filter out rejected organizations
  const eligibleOrgs = organizations.filter(
    (org) => org.verificationStatus !== 'rejected'
  );

  const donationPortions = convertDonationToServings(donation);
  const donationCategory = (donation.category || '').toLowerCase();
  const isCookedMeal =
    donationCategory.includes('cook') ||
    donationCategory.includes('meal') ||
    donationCategory.includes('prepared');

  const requiresRefrigeration =
    Boolean(donation.storageType && (
      donation.storageType.toLowerCase().includes('refrigerat') ||
      donation.storageType.toLowerCase().includes('cold') ||
      donation.storageType.toLowerCase().includes('frozen')
    )) ||
    donationCategory.includes('dairy') ||
    donationCategory.includes('egg');

  // Compute remaining window in minutes
  let remainingWindowMinutes = 180; // default 3 hours
  const deadlineStr = donation.collectionDeadline || donation.pickupDeadline || donation.availableUntil;
  if (deadlineStr) {
    const parsedTime = new Date(deadlineStr).getTime();
    if (!isNaN(parsedTime)) {
      const diffMin = Math.round((parsedTime - Date.now()) / (1000 * 60));
      remainingWindowMinutes = Math.max(10, diffMin);
    }
  }

  // 2-Hour cooked food safety rule limits the maximum safe dispatch window
  const safeFoodWindowMinutes = isCookedMeal
    ? Math.min(remainingWindowMinutes, 120)
    : remainingWindowMinutes;

  const results: SmartMatchResult[] = [];

  for (const ngo of eligibleOrgs) {
    const reasons: string[] = [];
    let score = 0;

    const hasValidCoords =
      isValidCoordinate(donation.latitude, donation.longitude) &&
      isValidCoordinate(ngo.latitude, ngo.longitude);

    // 1. Proximity Calculation (No Delhi fallbacks!)
    let distanceKm: number | null = null;
    let distanceScore = 0;
    let estimatedTravelMinutes: number | null = null;

    if (!hasValidCoords) {
      // Excluded from proximity ranking; flagged "location missing"
      reasons.push('Location missing: NGO coordinates not confirmed on file');
    } else {
      distanceKm = calculateDistanceKm(
        donation.latitude,
        donation.longitude,
        ngo.latitude,
        ngo.longitude
      );

      if (distanceKm !== null) {
        // Average urban transit speed in Bengaluru traffic: 25 km/h
        estimatedTravelMinutes = Math.max(5, Math.round((distanceKm / 25) * 60));

        if (distanceKm <= 5) {
          distanceScore = 35;
          reasons.push(`Close proximity: ~${distanceKm} km away (under 5 km priority zone)`);
        } else if (distanceKm <= 10) {
          distanceScore = 25;
          reasons.push(`Moderate proximity: ~${distanceKm} km away (within 10 km transit coverage)`);
        } else if (distanceKm <= 20) {
          distanceScore = 15;
          reasons.push(`Extended coverage: ~${distanceKm} km away`);
        } else if (distanceKm <= 35) {
          distanceScore = 5;
          reasons.push(`Distant location: ~${distanceKm} km away`);
        } else {
          distanceScore = 0;
          reasons.push(`Out of range: ~${distanceKm} km away (>35 km)`);
        }
      }
    }
    score += distanceScore;

    // 2. Category & Refrigeration Compatibility
    let categoryMatch = true;
    let refrigerationMatch = true;
    let dietaryScore = 0;

    // Check acceptedCategories if NGO defined them
    if (ngo.acceptedCategories && ngo.acceptedCategories.length > 0) {
      const accepts = ngo.acceptedCategories.some(
        (cat) =>
          cat.toLowerCase().includes(donationCategory) ||
          donationCategory.includes(cat.toLowerCase())
      );
      if (accepts) {
        dietaryScore += 15;
        reasons.push(`Category match: Accepts ${donation.category}`);
      } else {
        categoryMatch = false;
        reasons.push(`Category mismatch: NGO does not list ${donation.category} in accepted categories`);
      }
    } else {
      // NGO accepts all general food rescue categories
      dietaryScore += 12;
      reasons.push(`General food intake: Compatible with ${donation.category}`);
    }

    // Check cold-storage requirement
    if (requiresRefrigeration) {
      if (ngo.hasRefrigeration) {
        dietaryScore += 10;
        refrigerationMatch = true;
        reasons.push('Refrigeration verified: Shelter equipped for cold-chain storage');
      } else {
        refrigerationMatch = false;
        categoryMatch = false;
        reasons.push('Refrigeration missing: Item requires cold storage but NGO has no refrigeration equipment');
      }
    } else {
      dietaryScore += 10;
      refrigerationMatch = true;
    }
    score += dietaryScore;

    // 3. Capacity Compatibility (avoid recommending 200 meals to 30-person shelters)
    let capacityScore = 0;
    let capacityMatch = false;
    const dailyCapacity = Number(ngo.capacityDailyMeals) || 100;
    const capacityRatio = dailyCapacity > 0 ? donationPortions / dailyCapacity : 999;

    if (capacityRatio > 1.5) {
      // Severe overload: e.g. 200 meals to 30-person shelter
      capacityScore = 5;
      capacityMatch = false;
      reasons.push(
        `Capacity mismatch: Donation (~${donationPortions} portions) exceeds shelter capacity (${dailyCapacity} meals/day) by ${Math.round(
          capacityRatio * 100
        )}%`
      );
    } else if (capacityRatio > 1.0) {
      // Partial overload
      capacityScore = 12;
      capacityMatch = false;
      reasons.push(
        `Partial capacity: Has ${dailyCapacity} slots for ~${donationPortions} portions`
      );
    } else if (capacityRatio >= 0.2) {
      // Optimal fit: 40 meals for 50-person shelter
      capacityScore = 25;
      capacityMatch = true;
      reasons.push(
        `Optimal capacity fit: ~${donationPortions} portions fits shelter daily capacity (${dailyCapacity} meals)`
      );
    } else {
      // Large shelter absorbing modest donation
      capacityScore = 20;
      capacityMatch = true;
      reasons.push(
        `Ample capacity: Large facility (${dailyCapacity} meals/day) can receive ~${donationPortions} portions`
      );
    }
    score += capacityScore;

    // 4. Deadline & Safe-Food Window Feasibility
    let deadlineMatch = false;
    let urgencyScore = 0;

    if (estimatedTravelMinutes !== null) {
      if (estimatedTravelMinutes <= safeFoodWindowMinutes) {
        deadlineMatch = true;
        urgencyScore = isCookedMeal ? 15 : 10;
        reasons.push(
          `Safe turnaround: ~${estimatedTravelMinutes} min travel time (at 25 km/h urban average) fits within ${safeFoodWindowMinutes} min safe window`
        );
      } else {
        deadlineMatch = false;
        urgencyScore = 2;
        reasons.push(
          `Deadline risk: ~${estimatedTravelMinutes} min travel time exceeds ${safeFoodWindowMinutes} min safe window`
        );
      }
    } else {
      deadlineMatch = false;
    }
    score += urgencyScore;

    // 5. Verification Status bonus
    if (ngo.verificationStatus === 'verified') {
      score += 5;
      reasons.push('Verified Partner NGO on ResQBite registry');
    }

    // Flag location missing
    const isLocationMissing = !hasValidCoords;
    if (isLocationMissing) {
      score = 0;
    }

    // Grounded explanation
    const distanceText = distanceKm !== null ? `~${distanceKm} km away` : 'location unconfirmed';
    const travelText = estimatedTravelMinutes !== null ? `~${estimatedTravelMinutes} min travel` : 'transit uncalculated';
    const summaryExplanation = isLocationMissing
      ? `${ngo.name} is registered but its facility coordinates are missing. Please update address to enable GPS dispatch.`
      : `Recommended with ${Math.min(100, Math.max(0, score))}% match: Located ${distanceText} (${travelText} at 25 km/h), reported daily capacity of ${dailyCapacity} meals, ${
          refrigerationMatch ? 'cold-storage compatible' : 'ambient intake only'
        }, and ${deadlineMatch ? 'feasible transit within safety window' : 'transit window warning'}.`;

    const breakdown: MatchBreakdown = {
      distanceKm,
      distanceScore,
      categoryMatch,
      refrigerationMatch,
      dietaryScore,
      capacityMatch,
      capacityRatio: Math.round(capacityRatio * 100) / 100,
      capacityScore,
      deadlineMatch,
      urgencyScore,
      estimatedTravelMinutes,
      reasons,
    };

    const matchItem: SmartMatchResult = {
      ngo,
      donation,
      score: Math.min(100, Math.max(0, score)),
      distanceKm,
      categoryMatch,
      capacityMatch,
      deadlineMatch,
      reasons,
      summaryExplanation,
      breakdown,
    };

    if (isLocationMissing && options?.excludeMissingCoordinates) {
      // Excluded when caller explicitly asks to exclude
      continue;
    }

    results.push(matchItem);
  }

  // Sort: valid coordinates with highest score first, location-missing at the end
  return results.sort((a, b) => {
    if (a.distanceKm === null && b.distanceKm !== null) return 1;
    if (a.distanceKm !== null && b.distanceKm === null) return -1;
    return b.score - a.score;
  });
}
