import React from 'react';
import {
  FileText,
  Download,
  Printer,
  X,
  Leaf,
  ShieldCheck,
  CheckCircle2,
} from 'lucide-react';
import { Donation } from '../../types';
import { MonthlyCategoryData } from './MonthlyFoodRescuedChart';

export interface ImpactStatementModalProps {
  isOpen: boolean;
  onClose: () => void;
  filteredDonations: Donation[];
  timeFilter: string;
  normalizedTotalKg: number;
  servingsDelivered: number;
  co2AvoidedKg: number;
  waterSavedLiters: number;
  successRate: number;
  totalDelivered: number;
  totalCreated: number;
  uniqueDonors: number;
  uniqueNgos: number;
  uniqueVolunteers: number;
  monthlyData: MonthlyCategoryData[];
  sixMonthTotal: number;
  onExportCsv: () => void;
  onPrint: () => void;
}

export const ImpactStatementModal: React.FC<ImpactStatementModalProps> = ({
  isOpen,
  onClose,
  filteredDonations,
  timeFilter,
  normalizedTotalKg,
  servingsDelivered,
  co2AvoidedKg,
  waterSavedLiters,
  successRate,
  totalDelivered,
  totalCreated,
  uniqueDonors,
  uniqueNgos,
  uniqueVolunteers,
  monthlyData,
  sixMonthTotal,
  onExportCsv,
  onPrint,
}) => {
  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 bg-stone-900/60 backdrop-blur-xs flex items-center justify-center p-3 sm:p-6 overflow-y-auto">
      <div className="relative w-full max-w-4xl bg-white rounded-3xl shadow-2xl border border-stone-200 overflow-hidden my-auto max-h-[92vh] flex flex-col">
        {/* Modal Controls Toolbar (Hidden in Print) */}
        <div className="no-print bg-stone-50 px-6 py-3.5 border-b border-stone-200 flex items-center justify-between gap-3 shrink-0">
          <div className="flex items-center gap-2">
            <div className="p-1.5 rounded-lg bg-emerald-100 text-emerald-800">
              <FileText className="w-4 h-4" />
            </div>
            <div>
              <h3 className="text-sm font-bold text-stone-900">
                Official Impact & Sustainability Statement
              </h3>
              <p className="text-[11px] text-stone-500">
                Print or save as PDF for sustainability audits, donors, and annual ESG reports.
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={onExportCsv}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-white hover:bg-stone-100 text-stone-700 text-xs font-bold border border-stone-200 transition-colors shadow-2xs cursor-pointer"
              title="Export underlying CSV data"
            >
              <Download className="w-3.5 h-3.5 text-stone-600" />
              <span>Download CSV</span>
            </button>
            <button
              onClick={onPrint}
              className="flex items-center gap-1.5 px-4 py-1.5 rounded-xl bg-emerald-700 hover:bg-emerald-800 text-white text-xs font-bold transition-colors shadow-2xs cursor-pointer"
              title="Open system print / save as PDF dialog"
            >
              <Printer className="w-3.5 h-3.5" />
              <span>Print / Save PDF</span>
            </button>
            <button
              onClick={onClose}
              className="p-1.5 rounded-xl text-stone-400 hover:text-stone-700 hover:bg-stone-200 transition-colors cursor-pointer"
              title="Close Preview"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Document Content (Rendered on Screen and in Print) */}
        <div className="overflow-y-auto p-6 sm:p-10 space-y-8 bg-white" id="printable-impact-summary">
          {/* Document Header */}
          <div className="border-b-2 border-emerald-800/20 pb-6 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
            <div className="space-y-1">
              <div className="flex items-center gap-2.5">
                <div className="w-9 h-9 rounded-xl bg-emerald-800 text-white flex items-center justify-center font-black text-lg shadow-2xs">
                  <Leaf className="w-5 h-5 text-emerald-200" />
                </div>
                <div>
                  <span className="font-extrabold text-stone-900 tracking-tight text-lg">
                    ResQBite
                  </span>
                  <span className="text-emerald-700 font-bold text-xs ml-1.5 uppercase tracking-wider">
                    Food Rescue Network
                  </span>
                </div>
              </div>
              <h2 className="text-xl sm:text-2xl font-black text-stone-900 tracking-tight pt-1">
                Verified Community & Ecological Impact Statement
              </h2>
              <p className="text-xs text-stone-500">
                Official certificate of surplus diversion, hunger mitigation, and greenhouse gas offset.
              </p>
            </div>

            <div className="text-right sm:border-l sm:border-stone-200 sm:pl-6 space-y-1 text-xs">
              <div className="inline-flex items-center gap-1 bg-emerald-50 text-emerald-800 border border-emerald-200 px-2.5 py-1 rounded-full font-bold text-[11px]">
                <ShieldCheck className="w-3.5 h-3.5 text-emerald-600" />
                <span>VERIFIED AUDIT REPORT</span>
              </div>
              <div className="text-stone-500 text-[11px] pt-1">
                Report Date: <strong className="text-stone-800">{new Date().toLocaleDateString('en-US', { dateStyle: 'medium' })}</strong>
              </div>
              <div className="text-stone-500 text-[11px]">
                Timeframe: <strong className="text-stone-800">{timeFilter === 'all' ? 'All Time Records' : timeFilter === '30d' ? 'Past 30 Days' : timeFilter === '7d' ? 'Past 7 Days' : 'Today'}</strong>
              </div>
            </div>
          </div>

          {/* Primary Impact Highlights */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
            <div className="border border-stone-200 p-4 rounded-2xl bg-stone-50/50">
              <div className="text-[10px] uppercase font-bold text-stone-400 tracking-wider">
                Total Edible Food Rescued
              </div>
              <div className="text-2xl sm:text-3xl font-black text-emerald-950 mt-1">
                {Math.round(normalizedTotalKg * 10) / 10} <span className="text-sm font-bold text-stone-500">kg</span>
              </div>
              <div className="text-[11px] text-stone-500 mt-1">
                Diverted from decomposing in municipal landfills
              </div>
            </div>

            <div className="border border-stone-200 p-4 rounded-2xl bg-stone-50/50">
              <div className="text-[10px] uppercase font-bold text-stone-400 tracking-wider">
                Meals & Portions Fed
              </div>
              <div className="text-2xl sm:text-3xl font-black text-stone-900 mt-1">
                {servingsDelivered.toLocaleString()} <span className="text-sm font-bold text-stone-500">portions</span>
              </div>
              <div className="text-[11px] text-stone-500 mt-1">
                Distributed to verified community feeding centers
              </div>
            </div>

            <div className="border border-stone-200 p-4 rounded-2xl bg-stone-50/50">
              <div className="text-[10px] uppercase font-bold text-stone-400 tracking-wider">
                CO₂e Emissions Prevented
              </div>
              <div className="text-2xl sm:text-3xl font-black text-teal-900 mt-1">
                {co2AvoidedKg.toLocaleString()} <span className="text-sm font-bold text-stone-500">kg CO₂e</span>
              </div>
              <div className="text-[11px] text-stone-500 mt-1">
                FAO organic waste offset conversion standard
              </div>
            </div>

            <div className="border border-stone-200 p-4 rounded-2xl bg-stone-50/50">
              <div className="text-[10px] uppercase font-bold text-stone-400 tracking-wider">
                Freshwater Conserved
              </div>
              <div className="text-2xl sm:text-3xl font-black text-blue-900 mt-1">
                {waterSavedLiters.toLocaleString()} <span className="text-sm font-bold text-stone-500">L</span>
              </div>
              <div className="text-[11px] text-stone-500 mt-1">
                Embodied agricultural irrigation water protected
              </div>
            </div>
          </div>

          {/* Operational Network Summary */}
          <div className="border border-stone-200 rounded-2xl p-5 space-y-3 bg-stone-50/30">
            <h4 className="text-xs font-bold uppercase tracking-wider text-stone-600 flex items-center gap-2">
              <CheckCircle2 className="w-4 h-4 text-emerald-700" />
              Logistical Delivery & Partner Participation Audit
            </h4>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 text-xs">
              <div>
                <span className="text-stone-400 text-[11px] block">Rescue Success Rate</span>
                <span className="text-lg font-bold text-stone-900">{successRate}%</span>
                <span className="text-[10px] text-stone-400 block">{totalDelivered} of {totalCreated} fulfilled</span>
              </div>
              <div>
                <span className="text-stone-400 text-[11px] block">Active Food Donors</span>
                <span className="text-lg font-bold text-stone-900">{uniqueDonors}</span>
                <span className="text-[10px] text-stone-400 block">Commercial & catering</span>
              </div>
              <div>
                <span className="text-stone-400 text-[11px] block">Partner Shelters / NGOs</span>
                <span className="text-lg font-bold text-stone-900">{uniqueNgos}</span>
                <span className="text-[10px] text-stone-400 block">Verified meal recipients</span>
              </div>
              <div>
                <span className="text-stone-400 text-[11px] block">Volunteer Couriers</span>
                <span className="text-lg font-bold text-stone-900">{uniqueVolunteers}</span>
                <span className="text-[10px] text-stone-400 block">GPS tracked couriers</span>
              </div>
            </div>
          </div>

          {/* 6-Month Category Rescued Summary Table */}
          <div className="space-y-3">
            <h4 className="text-xs font-bold uppercase tracking-wider text-stone-700 flex items-center justify-between">
              <span>6-Month Surplus Distribution by Category</span>
              <span className="text-[11px] font-normal text-stone-500">Unit: Servings / Meal Equivalents</span>
            </h4>
            <div className="border border-stone-200 rounded-2xl overflow-hidden">
              <table className="w-full text-left border-collapse text-xs">
                <thead>
                  <tr className="bg-stone-100 text-stone-700 font-bold border-b border-stone-200 text-[11px]">
                    <th className="py-2.5 px-3">Month</th>
                    <th className="py-2.5 px-3">Cooked Meals</th>
                    <th className="py-2.5 px-3">Produce</th>
                    <th className="py-2.5 px-3">Bakery</th>
                    <th className="py-2.5 px-3">Dairy & Eggs</th>
                    <th className="py-2.5 px-3">Packaged</th>
                    <th className="py-2.5 px-3">Other</th>
                    <th className="py-2.5 px-3 text-right">Total Rescued</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-stone-100 text-stone-800">
                  {monthlyData.map((m, idx) => (
                    <tr key={idx} className={idx % 2 === 0 ? 'bg-white' : 'bg-stone-50/50'}>
                      <td className="py-2 px-3 font-semibold text-stone-900">{m.monthLabel}</td>
                      <td className="py-2 px-3">{m.cookedMeals.toLocaleString()}</td>
                      <td className="py-2 px-3">{m.produce.toLocaleString()}</td>
                      <td className="py-2 px-3">{m.bakery.toLocaleString()}</td>
                      <td className="py-2 px-3">{m.dairy.toLocaleString()}</td>
                      <td className="py-2 px-3">{m.packagedGoods.toLocaleString()}</td>
                      <td className="py-2 px-3">{m.other.toLocaleString()}</td>
                      <td className="py-2 px-3 text-right font-bold text-emerald-800">
                        {m.total.toLocaleString()}
                      </td>
                    </tr>
                  ))}
                </tbody>
                <tfoot>
                  <tr className="bg-emerald-50/60 font-bold text-stone-900 border-t border-stone-200">
                    <td className="py-2.5 px-3">6-Month Aggregate</td>
                    <td className="py-2.5 px-3">{monthlyData.reduce((acc, x) => acc + x.cookedMeals, 0).toLocaleString()}</td>
                    <td className="py-2.5 px-3">{monthlyData.reduce((acc, x) => acc + x.produce, 0).toLocaleString()}</td>
                    <td className="py-2.5 px-3">{monthlyData.reduce((acc, x) => acc + x.bakery, 0).toLocaleString()}</td>
                    <td className="py-2.5 px-3">{monthlyData.reduce((acc, x) => acc + x.dairy, 0).toLocaleString()}</td>
                    <td className="py-2.5 px-3">{monthlyData.reduce((acc, x) => acc + x.packagedGoods, 0).toLocaleString()}</td>
                    <td className="py-2.5 px-3">{monthlyData.reduce((acc, x) => acc + x.other, 0).toLocaleString()}</td>
                    <td className="py-2.5 px-3 text-right text-emerald-900 font-extrabold">
                      {sixMonthTotal.toLocaleString()}
                    </td>
                  </tr>
                </tfoot>
              </table>
            </div>
          </div>

          {/* UN SDG Alignment & Official Endorsement */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 pt-2">
            <div className="p-3 bg-amber-50/80 border border-amber-200 rounded-2xl text-[11px] text-amber-950">
              <div className="font-bold text-amber-900 mb-0.5">UN SDG 2: Zero Hunger</div>
              Directly diverted surplus nutrition to marginalized populations and emergency shelters.
            </div>
            <div className="p-3 bg-emerald-50/80 border border-emerald-200 rounded-2xl text-[11px] text-emerald-950">
              <div className="font-bold text-emerald-900 mb-0.5">UN SDG 12: Responsible Consumption</div>
              Reduced edible food losses along supply chains through real-time logistics matching.
            </div>
            <div className="p-3 bg-teal-50/80 border border-teal-200 rounded-2xl text-[11px] text-teal-950">
              <div className="font-bold text-teal-900 mb-0.5">UN SDG 13: Climate Action</div>
              Prevented anaerobic landfill methane output and conserved embodied water resources.
            </div>
          </div>

          {/* Footer Sign-off Block */}
          <div className="pt-6 border-t border-stone-200 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 text-xs text-stone-500">
            <div>
              <p className="font-bold text-stone-700">ResQBite Verified Algorithmic Operations</p>
              <p className="text-[11px]">Certified through Google Maps Geolocation & recipient QR handover verification.</p>
            </div>
            <div className="text-right text-[11px]">
              <p className="font-mono text-stone-400">DOC-ID: RQB-IMP-{new Date().getFullYear()}-{filteredDonations.length}</p>
              <p className="text-emerald-700 font-bold">100% Zero-Waste Certified</p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
