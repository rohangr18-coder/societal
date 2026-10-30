import { Donation } from '../types';
import { calculateDistanceKm } from './geo';

export interface PickupWindowInfo {
  label: string;
  isUrgent: boolean; // < 60 min remaining
  isPending: boolean; // 1-4 hours remaining
  isExpired: boolean;
  minutesRemaining: number;
  badgeColor: 'rose' | 'amber' | 'emerald';
}

/**
 * Calculates time-aware pending pickup window and urgency status
 */
export function getPickupWindowInfo(donation: Donation): PickupWindowInfo {
  const deadlineStr = donation.collectionDeadline || donation.pickupDeadline;
  if (!deadlineStr) {
    return {
      label: 'Flexible Window',
      isUrgent: false,
      isPending: true,
      isExpired: false,
      minutesRemaining: 9999,
      badgeColor: 'emerald',
    };
  }

  const t = new Date(deadlineStr).getTime();
  if (isNaN(t)) {
    return {
      label: deadlineStr,
      isUrgent: false,
      isPending: true,
      isExpired: false,
      minutesRemaining: 9999,
      badgeColor: 'amber',
    };
  }

  const diffMs = t - Date.now();
  if (diffMs <= 0) {
    return {
      label: 'Window Expired',
      isUrgent: false,
      isPending: false,
      isExpired: true,
      minutesRemaining: 0,
      badgeColor: 'rose',
    };
  }

  const totalMins = Math.floor(diffMs / (1000 * 60));
  const hours = Math.floor(totalMins / 60);
  const mins = totalMins % 60;
  const isUrgent = totalMins <= 60;
  const isPending = totalMins > 60 && totalMins <= 240;

  let label = '';
  if (hours > 0) {
    label = `${hours}h ${mins}m left`;
  } else {
    label = `${mins}m left`;
  }

  return {
    label,
    isUrgent,
    isPending,
    isExpired: false,
    minutesRemaining: totalMins,
    badgeColor: isUrgent ? 'rose' : isPending ? 'amber' : 'emerald',
  };
}

export interface DonationCluster {
  id: string;
  latitude: number;
  longitude: number;
  donations: Donation[];
  count: number;
  totalQuantity: number;
  totalServings: number;
  hasUrgent: boolean;
  categories: string[];
  minDistanceKm?: number;
}

/**
 * Real-time spatial clustering algorithm for active food donations with pending pickup windows
 */
export function clusterDonations(
  donations: Donation[],
  clusterRadiusKm: number = 2.0,
  userLat?: number,
  userLng?: number
): DonationCluster[] {
  // Target only active donations with pending pickup windows and valid coordinates
  const valid = donations.filter((d) => {
    if (typeof d.latitude !== 'number' || typeof d.longitude !== 'number') return false;
    if (d.latitude === 0 && d.longitude === 0) return false;
    if (!['available', 'requested'].includes(d.status)) return false;
    const windowInfo = getPickupWindowInfo(d);
    return !windowInfo.isExpired;
  });

  const clusters: DonationCluster[] = [];
  const visited = new Set<string>();

  for (const donation of valid) {
    if (visited.has(donation.id)) continue;

    const clusterMembers: Donation[] = [donation];
    visited.add(donation.id);

    // Find proximate neighbors within clusterRadiusKm
    for (const other of valid) {
      if (visited.has(other.id)) continue;
      const dist = calculateDistanceKm(
        donation.latitude,
        donation.longitude,
        other.latitude,
        other.longitude
      );
      if (dist !== null && dist <= clusterRadiusKm) {
        clusterMembers.push(other);
        visited.add(other.id);
      }
    }

    // Compute cluster center of mass
    const avgLat =
      clusterMembers.reduce((sum, d) => sum + d.latitude, 0) / clusterMembers.length;
    const avgLng =
      clusterMembers.reduce((sum, d) => sum + d.longitude, 0) / clusterMembers.length;

    const totalQuantity = clusterMembers.reduce((sum, d) => sum + (d.quantity || 0), 0);
    const totalServings = clusterMembers.reduce(
      (sum, d) => sum + (d.servings || Math.round((d.quantity || 0) * 2.5)),
      0
    );
    const hasUrgent = clusterMembers.some((d) => getPickupWindowInfo(d).isUrgent);
    const categories = Array.from(new Set(clusterMembers.map((d) => d.category)));

    let minDistanceKm: number | undefined;
    if (typeof userLat === 'number' && typeof userLng === 'number') {
      const dist = calculateDistanceKm(userLat, userLng, avgLat, avgLng);
      minDistanceKm = dist !== null ? dist : undefined;
    }

    clusters.push({
      id: `cluster_${donation.id}_${clusterMembers.length}`,
      latitude: avgLat,
      longitude: avgLng,
      donations: clusterMembers,
      count: clusterMembers.length,
      totalQuantity,
      totalServings,
      hasUrgent,
      categories,
      minDistanceKm,
    });
  }

  // Sort clusters by distance if volunteer location is available
  if (typeof userLat === 'number' && typeof userLng === 'number') {
    clusters.sort((a, b) => (a.minDistanceKm || 0) - (b.minDistanceKm || 0));
  }

  return clusters;
}
