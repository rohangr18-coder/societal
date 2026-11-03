import React from 'react';
import { Award, Leaf, TrendingUp, Utensils } from 'lucide-react';

interface ImpactStatCardsProps {
  t: (key: string) => string;
  normalizedTotalKg: number;
  kgDelivered: number;
  servingsDelivered: number;
  co2AvoidedKg: number;
  successRate: number;
  totalDelivered: number;
  totalCreated: number;
}

export const ImpactStatCards: React.FC<ImpactStatCardsProps> = ({
  t,
  normalizedTotalKg,
  kgDelivered,
  servingsDelivered,
  co2AvoidedKg,
  successRate,
  totalDelivered,
  totalCreated,
}) => {
  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-5">
      {/* Total Food Rescued */}
      <div className="bg-white p-6 rounded-3xl border border-stone-200 shadow-2xs space-y-2">
        <div className="w-10 h-10 rounded-xl bg-emerald-100 text-emerald-800 flex items-center justify-center font-bold">
          <Utensils className="w-5 h-5" />
        </div>
        <span className="text-xs text-stone-500 font-semibold uppercase tracking-wider block">
          {t('impact.totalRescued')}
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
  );
};
