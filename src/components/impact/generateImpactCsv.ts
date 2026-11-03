import { Donation } from '../../types';
import { MonthlyCategoryData } from '../ImpactAnalyticsView';

export interface ImpactSummaryMetrics {
  timeFilter: string;
  normalizedTotalKg: number;
  servingsDelivered: number;
  co2AvoidedKg: number;
  waterSavedLiters: number;
  successRate: number;
  totalDonations: number;
  totalDelivered: number;
  uniqueDonors: number;
  uniqueNgos: number;
  uniqueVolunteers: number;
}

/**
 * Generates structured, RFC-4180 compliant CSV content covering KPI aggregates,
 * monthly distribution trends, and individual donation tracking rows.
 */
export function generateImpactCsv(
  donations: Donation[],
  metrics: ImpactSummaryMetrics,
  monthlyData: MonthlyCategoryData[]
): string {
  const lines: string[] = [];

  // Header & Metadata
  lines.push('RESQBITE FOOD RESCUE NETWORK - VERIFIED IMPACT METRICS REPORT');
  lines.push(`Generated At,"${new Date().toLocaleString()}"`);
  lines.push(`Reporting Period,"${metrics.timeFilter.toUpperCase()}"`);
  lines.push('');

  // High-Level KPIs
  lines.push('--- KEY IMPACT PERFORMANCE INDICATORS ---');
  lines.push('Metric,Value,Unit,Description');
  lines.push(`Total Food Diverted from Landfills,${metrics.normalizedTotalKg.toFixed(1)},kg,Total edible surplus recovered and redirected`);
  lines.push(`Meals & Portions Distributed,${metrics.servingsDelivered},portions,Direct nourishment supplied to community shelters`);
  lines.push(`Greenhouse Gas Mitigated,${metrics.co2AvoidedKg},kg CO2e,UN FAO factor: 2.5 kg CO2e per 1 kg food waste diverted`);
  lines.push(`Agricultural Freshwater Conserved,${metrics.waterSavedLiters},liters,Embodied freshwater conserved from crop cultivation & prep`);
  lines.push(`Rescue Logistics Success Rate,${metrics.successRate},%,Ratio of delivered batches to completed listings`);
  lines.push(`Total Surplus Listings,${metrics.totalDonations},listings,Recorded listings in the active reporting window`);
  lines.push(`Confirmed Successful Deliveries,${metrics.totalDelivered},batches,Handover verified by recipient shelters`);
  lines.push(`Participating Food Donors,${metrics.uniqueDonors},entities,Hotels caterers supermarkets and restaurants`);
  lines.push(`Verified Partner NGOs & Shelters,${metrics.uniqueNgos},shelters,Registered community kitchens & feeding points`);
  lines.push(`Active Volunteer Couriers,${metrics.uniqueVolunteers},couriers,Logged GPS-verified rescue couriers`);
  lines.push('');

  // Monthly Trends Table
  lines.push('--- MONTHLY FOOD RESCUED BY CATEGORY (LAST 6 MONTHS) ---');
  lines.push('Month,Cooked Meals (servings),Produce & Fruits,Bakery & Bread,Dairy & Eggs,Packaged Goods,Other Surplus,Total Rescued');
  monthlyData.forEach((m) => {
    lines.push(`"${m.monthLabel}",${m.cookedMeals},${m.produce},${m.bakery},${m.dairy},${m.packagedGoods},${m.other},${m.total}`);
  });
  lines.push('');

  // Detailed Records Table
  lines.push('--- INDIVIDUAL DONATION RESCUE RECORDS ---');
  lines.push('ID,Food Name,Category,Quantity,Unit,Estimated Servings,Status,Donor Name,Pickup Address,Storage Type,Packaging,Created At,Pickup Deadline');
  donations.forEach((d) => {
    const safe = (val: any) => `"${String(val ?? '').replace(/"/g, '""')}"`;
    lines.push([
      safe(d.id),
      safe(d.foodName),
      safe(d.category),
      d.quantity ?? 0,
      safe(d.unit),
      d.servings ?? 0,
      safe(d.status),
      safe(d.donorName),
      safe(d.pickupAddress),
      safe(d.storageType),
      safe(d.packaging),
      safe(d.createdAt),
      safe(d.pickupDeadline || d.collectionDeadline),
    ].join(','));
  });

  return lines.join('\n');
}
