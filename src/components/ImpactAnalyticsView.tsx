import React, { useState, useMemo } from 'react';
import {
  TrendingUp,
  Award,
  Utensils,
  Leaf,
  Users,
  Building2,
  CheckCircle2,
  Calendar,
  Info,
  Clock,
  PieChart,
  BarChart,
  Droplets,
  PackageCheck,
  Bike,
} from 'lucide-react';
import { Donation } from '../types';
import { useLanguage } from '../context/LanguageContext';

interface ImpactAnalyticsViewProps {
  donations: Donation[];
}

export const ImpactAnalyticsView: React.FC<ImpactAnalyticsViewProps> = ({ donations }) => {
  const { t } = useLanguage();
  const [timeFilter, setTimeFilter] = useState<'all' | '30d' | '7d' | 'today'>('all');

  // Filter donations based on date
  const filteredDonations = useMemo(() => {
    if (timeFilter === 'all') return donations;

    const now = Date.now();
    let msRange = Infinity;
    if (timeFilter === '30d') msRange = 30 * 24 * 60 * 60 * 1000;
    else if (timeFilter === '7d') msRange = 7 * 24 * 60 * 60 * 1000;
    else if (timeFilter === 'today') msRange = 24 * 60 * 60 * 1000;

    return donations.filter((d) => {
      const created = new Date(d.createdAt).getTime();
      return now - created <= msRange;
    });
  }, [donations, timeFilter]);

  // Status metrics
  const totalCreated = filteredDonations.length;
  const delivered = filteredDonations.filter((d) => d.status === 'delivered');
  const totalDelivered = delivered.length;
  const inTransitOrScheduled = filteredDonations.filter((d) =>
    ['accepted', 'scheduled', 'picked_up'].includes(d.status)
  ).length;
  const availableCount = filteredDonations.filter((d) => d.status === 'available').length;

  const resolvedCount = filteredDonations.filter((d) =>
    ['delivered', 'cancelled', 'expired'].includes(d.status)
  ).length;

  const successRate =
    resolvedCount > 0 ? Math.round((totalDelivered / resolvedCount) * 100) : totalCreated > 0 ? 100 : 0;

  // Quantity calculations separating units safely
  const kgDelivered = delivered.reduce((acc, curr) => {
    if (curr.unit.toLowerCase() === 'kg') return acc + curr.quantity;
    return acc;
  }, 0);

  const servingsDelivered = delivered.reduce((acc, curr) => {
    if (curr.servings) return acc + curr.servings;
    if (curr.unit.toLowerCase() === 'servings' || curr.unit.toLowerCase() === 'plates') {
      return acc + curr.quantity;
    }
    return acc;
  }, 0);

  // Normalized total kg for ecological modeling:
  // 1 adult meal equivalent ≈ 0.4 kg
  const normalizedTotalKg = delivered.reduce((acc, curr) => {
    if (curr.unit.toLowerCase() === 'kg') return acc + curr.quantity;
    const s = curr.servings || curr.quantity;
    return acc + s * 0.4;
  }, 0);

  // Environmental metrics (FAO Food Wastage Footprint & WRAP standards)
  const co2AvoidedKg = Math.round(normalizedTotalKg * 2.5);
  const waterSavedLiters = Math.round(normalizedTotalKg * 1000);

  // Unique actors
  const uniqueDonors = new Set(filteredDonations.map((d) => d.donorId)).size;
  const uniqueNgos = new Set(
    filteredDonations.filter((d) => d.assignedNgoId).map((d) => d.assignedNgoId)
  ).size;
  const uniqueVolunteers = new Set(
    filteredDonations.filter((d) => d.assignedVolunteerId).map((d) => d.assignedVolunteerId)
  ).size;

  // Category breakdown
  const categoryCounts = useMemo(() => {
    const map: Record<string, number> = {};
    filteredDonations.forEach((d) => {
      const cat = d.category || 'Other';
      map[cat] = (map[cat] || 0) + 1;
    });
    return map;
  }, [filteredDonations]);

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 space-y-8">
      {/* Header & Date Range Filter */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-extrabold text-stone-900">{t('impact.title')}</h1>
          <p className="text-xs sm:text-sm text-stone-500 mt-1">
            {t('impact.subtitle')}
          </p>
        </div>

        <div className="flex items-center bg-stone-100 p-1 rounded-2xl border border-stone-200 self-start sm:self-auto">
          <button
            onClick={() => setTimeFilter('all')}
            className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-all cursor-pointer ${
              timeFilter === 'all' ? 'bg-white text-emerald-800 shadow-2xs' : 'text-stone-500 hover:text-stone-800'
            }`}
          >
            All Time
          </button>
          <button
            onClick={() => setTimeFilter('30d')}
            className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-all cursor-pointer ${
              timeFilter === '30d' ? 'bg-white text-emerald-800 shadow-2xs' : 'text-stone-500 hover:text-stone-800'
            }`}
          >
            Past 30 Days
          </button>
          <button
            onClick={() => setTimeFilter('7d')}
            className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-all cursor-pointer ${
              timeFilter === '7d' ? 'bg-white text-emerald-800 shadow-2xs' : 'text-stone-500 hover:text-stone-800'
            }`}
          >
            Past 7 Days
          </button>
          <button
            onClick={() => setTimeFilter('today')}
            className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-all cursor-pointer ${
              timeFilter === 'today' ? 'bg-white text-emerald-800 shadow-2xs' : 'text-stone-500 hover:text-stone-800'
            }`}
          >
            Today
          </button>
        </div>
      </div>

      {/* Main KPI Grid */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-5">
        {/* Total Food Rescued */}
        <div className="bg-white p-6 rounded-3xl border border-stone-200 shadow-2xs space-y-2">
          <div className="w-10 h-10 rounded-xl bg-emerald-100 text-emerald-800 flex items-center justify-center font-bold">
            <Utensils className="w-5 h-5" />
          </div>
          <span className="text-xs text-stone-500 font-semibold uppercase tracking-wider block">
            {t('impact.kgDiverted')}
          </span>
          <div className="text-3xl font-extrabold text-emerald-950">
            {Math.round(normalizedTotalKg * 10) / 10} <span className="text-base font-bold text-stone-500">kg eq.</span>
          </div>
          <p className="text-[11px] text-stone-400">
            {kgDelivered > 0 ? `${kgDelivered} kg raw produce & groceries` : 'From verified deliveries'}
          </p>
        </div>

        {/* Meals Distributed */}
        <div className="bg-white p-6 rounded-3xl border border-stone-200 shadow-2xs space-y-2">
          <div className="w-10 h-10 rounded-xl bg-orange-100 text-orange-800 flex items-center justify-center font-bold">
            <Award className="w-5 h-5" />
          </div>
          <span className="text-xs text-stone-500 font-semibold uppercase tracking-wider block">
            {t('impact.mealsRescued')}
          </span>
          <div className="text-3xl font-extrabold text-stone-900">
            {servingsDelivered > 0 ? servingsDelivered : Math.round(normalizedTotalKg * 2.5)}{' '}
            <span className="text-base font-bold text-stone-500">portions</span>
          </div>
          <p className="text-[11px] text-stone-400">Fed to shelters & community kitchens</p>
        </div>

        {/* CO2 Emissions Avoided */}
        <div className="bg-white p-6 rounded-3xl border border-stone-200 shadow-2xs space-y-2">
          <div className="w-10 h-10 rounded-xl bg-teal-100 text-teal-800 flex items-center justify-center font-bold">
            <Leaf className="w-5 h-5" />
          </div>
          <span className="text-xs text-stone-500 font-semibold uppercase tracking-wider block">
            {t('impact.co2Prevented')}
          </span>
          <div className="text-3xl font-extrabold text-teal-900">
            {co2AvoidedKg} <span className="text-base font-bold text-stone-500">kg CO₂e</span>
          </div>
          <p className="text-[11px] text-stone-400">FAO factor: 2.5 kg CO₂e / kg diverted</p>
        </div>

        {/* Rescue Success Rate */}
        <div className="bg-white p-6 rounded-3xl border border-stone-200 shadow-2xs space-y-2">
          <div className="w-10 h-10 rounded-xl bg-blue-100 text-blue-800 flex items-center justify-center font-bold">
            <TrendingUp className="w-5 h-5" />
          </div>
          <span className="text-xs text-stone-500 font-semibold uppercase tracking-wider block">
            {t('impact.successRate')}
          </span>
          <div className="text-3xl font-extrabold text-blue-900">{successRate}%</div>
          <p className="text-[11px] text-stone-400">
            {totalDelivered} delivered of {totalCreated} listings
          </p>
        </div>
      </div>

      {/* Operations & Participants Breakdown */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-5">
        <div className="bg-white p-5 rounded-3xl border border-stone-200 shadow-2xs space-y-1 text-center">
          <div className="w-8 h-8 rounded-xl bg-stone-100 text-stone-700 mx-auto flex items-center justify-center mb-2">
            <Users className="w-4 h-4 text-emerald-600" />
          </div>
          <span className="text-2xl font-extrabold text-stone-900 block">{uniqueDonors}</span>
          <span className="text-xs font-semibold text-stone-600">Active Donors</span>
          <p className="text-[11px] text-stone-400">Hotels, canteens & supermarkets</p>
        </div>

        <div className="bg-white p-5 rounded-3xl border border-stone-200 shadow-2xs space-y-1 text-center">
          <div className="w-8 h-8 rounded-xl bg-stone-100 text-stone-700 mx-auto flex items-center justify-center mb-2">
            <Building2 className="w-4 h-4 text-orange-600" />
          </div>
          <span className="text-2xl font-extrabold text-stone-900 block">{uniqueNgos}</span>
          <span className="text-xs font-semibold text-stone-600">Verified Recipient NGOs</span>
          <p className="text-[11px] text-stone-400">Shelters & community kitchens</p>
        </div>

        <div className="bg-white p-5 rounded-3xl border border-stone-200 shadow-2xs space-y-1 text-center">
          <div className="w-8 h-8 rounded-xl bg-stone-100 text-stone-700 mx-auto flex items-center justify-center mb-2">
            <Bike className="w-4 h-4 text-blue-600" />
          </div>
          <span className="text-2xl font-extrabold text-stone-900 block">{uniqueVolunteers}</span>
          <span className="text-xs font-semibold text-stone-600">Volunteer Couriers</span>
          <p className="text-[11px] text-stone-400">GPS tracked deliveries</p>
        </div>

        <div className="bg-white p-5 rounded-3xl border border-stone-200 shadow-2xs space-y-1 text-center">
          <div className="w-8 h-8 rounded-xl bg-stone-100 text-stone-700 mx-auto flex items-center justify-center mb-2">
            <Clock className="w-4 h-4 text-teal-600" />
          </div>
          <span className="text-2xl font-extrabold text-teal-900 block">{inTransitOrScheduled}</span>
          <span className="text-xs font-semibold text-stone-600">Active Couriers En Route</span>
          <p className="text-[11px] text-stone-400">Currently in delivery transit</p>
        </div>
      </div>

      {/* Visual Distribution Charts */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Status Distribution */}
        <div className="bg-white p-6 rounded-3xl border border-stone-200 shadow-2xs space-y-4">
          <h3 className="font-bold text-stone-900 text-sm flex items-center gap-2">
            <PieChart className="w-4 h-4 text-emerald-600" />
            Donation Workflow Status Distribution
          </h3>
          <div className="space-y-3">
            {[
              { label: 'Successfully Delivered', count: totalDelivered, color: 'bg-emerald-600' },
              { label: 'Courier Scheduled / En Route', count: inTransitOrScheduled, color: 'bg-teal-500' },
              { label: 'Available on Map Radar', count: availableCount, color: 'bg-amber-400' },
              {
                label: 'Other / Expired / Cancelled',
                count: Math.max(0, totalCreated - totalDelivered - inTransitOrScheduled - availableCount),
                color: 'bg-stone-300',
              },
            ].map((item, idx) => {
              const pct = totalCreated > 0 ? Math.round((item.count / totalCreated) * 100) : 0;
              return (
                <div key={idx} className="space-y-1">
                  <div className="flex items-center justify-between text-xs">
                    <span className="text-stone-700 font-medium">{item.label}</span>
                    <span className="text-stone-900 font-bold">
                      {item.count} ({pct}%)
                    </span>
                  </div>
                  <div className="w-full bg-stone-100 h-2.5 rounded-full overflow-hidden">
                    <div
                      className={`h-full ${item.color} rounded-full transition-all duration-500`}
                      style={{ width: `${pct}%` }}
                    />
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* Food Categories Breakdown */}
        <div className="bg-white p-6 rounded-3xl border border-stone-200 shadow-2xs space-y-4">
          <h3 className="font-bold text-stone-900 text-sm flex items-center gap-2">
            <BarChart className="w-4 h-4 text-teal-600" />
            Surplus Food Categories Rescued
          </h3>
          <div className="space-y-3">
            {Object.keys(categoryCounts).length === 0 ? (
              <p className="text-xs text-stone-400 py-6 text-center">No donation records in this period.</p>
            ) : (
              Object.entries(categoryCounts).map(([cat, count], idx) => {
                const pct = totalCreated > 0 ? Math.round((count / totalCreated) * 100) : 0;
                return (
                  <div key={idx} className="space-y-1">
                    <div className="flex items-center justify-between text-xs">
                      <span className="text-stone-700 font-medium">{cat}</span>
                      <span className="text-stone-900 font-bold">
                        {count} batches ({pct}%)
                      </span>
                    </div>
                    <div className="w-full bg-stone-100 h-2.5 rounded-full overflow-hidden">
                      <div
                        className="h-full bg-emerald-600 rounded-full transition-all duration-500"
                        style={{ width: `${pct}%` }}
                      />
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </div>
      </div>

      {/* Environmental Equivalencies */}
      <div className="bg-gradient-to-r from-emerald-800 to-teal-900 text-white p-6 rounded-3xl shadow-md grid grid-cols-1 sm:grid-cols-2 gap-6 items-center">
        <div className="space-y-2">
          <span className="text-xs font-bold uppercase tracking-wider text-emerald-300">
            Scientific Environmental Impact
          </span>
          <h3 className="text-lg font-bold">Landfill Diversion & Resource Conservation</h3>
          <p className="text-xs text-emerald-100/90 leading-relaxed">
            Every kilogram of food saved from rotting in landfills avoids potent methane emissions and conserves embodied agricultural water used during cultivation and preparation.
          </p>
        </div>
        <div className="grid grid-cols-2 gap-4 text-center">
          <div className="bg-white/10 p-4 rounded-2xl backdrop-blur-xs">
            <Droplets className="w-6 h-6 text-cyan-300 mx-auto mb-1" />
            <div className="text-2xl font-black">{waterSavedLiters.toLocaleString()} L</div>
            <div className="text-[11px] text-cyan-200">Freshwater Conserved (est.)</div>
          </div>
          <div className="bg-white/10 p-4 rounded-2xl backdrop-blur-xs">
            <Leaf className="w-6 h-6 text-emerald-300 mx-auto mb-1" />
            <div className="text-2xl font-black">{co2AvoidedKg} kg</div>
            <div className="text-[11px] text-emerald-200">CO₂ Equivalent Mitigated</div>
          </div>
        </div>
      </div>

      {/* Methodology & Verification Standards */}
      <div className="p-5 bg-stone-50 rounded-2xl border border-stone-200 text-xs text-stone-600 space-y-2">
        <div className="font-bold text-stone-800 flex items-center gap-1.5">
          <Info className="w-4 h-4 text-stone-500" />
          Transparent Impact Methodology & Standards
        </div>
        <p className="leading-relaxed">
          1. <strong>Direct Firestore Documents:</strong> Figures are calculated from live records without mock extrapolation.
        </p>
        <p className="leading-relaxed">
          2. <strong>Meal Equivalent Standard:</strong> Food recorded in kilograms is converted at 400g (0.4 kg) per standard nutritional meal equivalent (UN FAO & Global FoodBanking Network guidelines).
        </p>
        <p className="leading-relaxed">
          3. <strong>Environmental Conversions:</strong> Greenhouse gas prevention is modelled at 2.5 kg CO₂e per 1 kg of edible organic surplus diverted from anaerobic landfill decomposition. Freshwater conservation reflects average embodied irrigation and processing water (~1,000 L / kg).
        </p>
      </div>
    </div>
  );
};
