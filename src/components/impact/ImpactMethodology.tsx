import React from 'react';
import { Droplets, Leaf, Info } from 'lucide-react';

interface ImpactMethodologyProps {
  waterSavedLiters: number;
  co2AvoidedKg: number;
}

export const ImpactMethodology: React.FC<ImpactMethodologyProps> = ({
  waterSavedLiters,
  co2AvoidedKg,
}) => {
  return (
    <>
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
    </>
  );
};
