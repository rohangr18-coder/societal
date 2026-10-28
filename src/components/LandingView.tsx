import React from 'react';
import {
  HeartHandshake,
  ShieldCheck,
  TrendingUp,
  MapPin,
  Clock,
  Sparkles,
  ArrowRight,
  CheckCircle2,
  Building2,
  Bike,
  Utensils,
  Award,
} from 'lucide-react';
import { Donation } from '../types';
import { GoogleRescueMap } from './GoogleRescueMap';

interface LandingViewProps {
  donations: Donation[];
  onNavigate: (tab: string) => void;
  onOpenCreate: () => void;
  onSelectDonation: (donation: Donation) => void;
}

export const LandingView: React.FC<LandingViewProps> = ({
  donations,
  onNavigate,
  onOpenCreate,
  onSelectDonation,
}) => {
  const availableDonations = donations.filter((d) => d.status === 'available');
  const deliveredDonations = donations.filter((d) => d.status === 'delivered');

  const totalKgRescued = deliveredDonations.reduce((acc, curr) => {
    const val = curr.unit.toLowerCase() === 'kg' ? curr.quantity : (curr.servings || curr.quantity) * 0.4;
    return acc + val;
  }, 0);

  const totalMealsSaved = deliveredDonations.reduce((acc, curr) => {
    return acc + (curr.servings || Math.round(curr.quantity * 2.5));
  }, 0);

  return (
    <div className="space-y-16 pb-16">
      {/* Hero Section */}
      <section className="relative overflow-hidden bg-gradient-to-b from-emerald-900 via-emerald-800 to-teal-900 text-white pt-16 pb-20 px-4 sm:px-6 lg:px-8 rounded-b-[2.5rem] shadow-xl">
        <div className="absolute inset-0 opacity-10 bg-[radial-gradient(#fff_1px,transparent_1px)] [background-size:16px_16px] pointer-events-none" />

        <div className="max-w-6xl mx-auto relative z-10 text-center space-y-6">
          <div className="inline-flex items-center gap-2 px-4 py-1.5 rounded-full bg-emerald-700/80 border border-emerald-500/40 text-emerald-200 text-xs font-semibold backdrop-blur-xs">
            <Sparkles className="w-4 h-4 text-amber-400" />
            Smart India Hackathon & Societal Impact Initiative
          </div>

          <h1 className="text-4xl sm:text-6xl font-extrabold tracking-tight max-w-4xl mx-auto leading-tight">
            Bridging Surplus Food to Hungry Hearts,{' '}
            <span className="text-transparent bg-clip-text bg-gradient-to-r from-emerald-300 to-amber-300">
              In Real Time.
            </span>
          </h1>

          <p className="text-base sm:text-xl text-emerald-100/90 max-w-2xl mx-auto font-normal leading-relaxed">
            Connecting restaurants, banquet halls, canteens, and households with verified NGOs, shelters, and volunteer couriers to eliminate edible food waste.
          </p>

          {/* Call to Actions */}
          <div className="flex flex-wrap items-center justify-center gap-4 pt-4">
            <button
              onClick={onOpenCreate}
              className="bg-amber-500 hover:bg-amber-400 text-stone-950 font-bold px-7 py-3.5 rounded-2xl shadow-lg transition-transform hover:-translate-y-0.5 flex items-center gap-2 text-base cursor-pointer"
            >
              <Utensils className="w-5 h-5" />
              List Food Donation Now
            </button>

            <button
              onClick={() => onNavigate('browse')}
              className="bg-emerald-700/80 hover:bg-emerald-600 text-white font-semibold px-6 py-3.5 rounded-2xl border border-emerald-500/40 backdrop-blur-xs transition-colors flex items-center gap-2 text-base cursor-pointer"
            >
              Browse Surplus ({availableDonations.length} Active)
              <ArrowRight className="w-4 h-4" />
            </button>
          </div>

          {/* Real Live Metrics counter */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4 max-w-4xl mx-auto pt-10 border-t border-emerald-700/50">
            <div className="p-4 bg-emerald-950/40 rounded-2xl border border-emerald-700/30">
              <div className="text-3xl font-extrabold text-white">{availableDonations.length}</div>
              <div className="text-xs text-emerald-300 font-medium mt-1">Available Rescues</div>
            </div>
            <div className="p-4 bg-emerald-950/40 rounded-2xl border border-emerald-700/30">
              <div className="text-3xl font-extrabold text-white">{deliveredDonations.length}</div>
              <div className="text-xs text-emerald-300 font-medium mt-1">Completed Deliveries</div>
            </div>
            <div className="p-4 bg-emerald-950/40 rounded-2xl border border-emerald-700/30">
              <div className="text-3xl font-extrabold text-amber-300">{Math.round(totalKgRescued)} kg</div>
              <div className="text-xs text-emerald-300 font-medium mt-1">Food Rescued</div>
            </div>
            <div className="p-4 bg-emerald-950/40 rounded-2xl border border-emerald-700/30">
              <div className="text-3xl font-extrabold text-amber-300">{totalMealsSaved}</div>
              <div className="text-xs text-emerald-300 font-medium mt-1">Meals Served</div>
            </div>
          </div>
        </div>
      </section>

      {/* Live Map Preview Section */}
      <section className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="bg-white rounded-3xl p-6 sm:p-8 border border-emerald-100 shadow-sm space-y-6">
          <div className="flex flex-col sm:flex-row justify-between sm:items-center gap-4">
            <div>
              <span className="text-xs font-bold uppercase tracking-wider text-emerald-700">Live Surveillance</span>
              <h2 className="text-2xl font-bold text-stone-900">Active Food Rescue Radar</h2>
              <p className="text-stone-500 text-sm">
                Interactive real-time map displaying surplus edible food waiting for NGO pickup across the city.
              </p>
            </div>
            <button
              onClick={() => onNavigate('map')}
              className="self-start sm:self-auto text-sm font-semibold text-emerald-700 hover:text-emerald-900 bg-emerald-50 px-4 py-2 rounded-xl border border-emerald-200 transition-colors flex items-center gap-1.5"
            >
              <MapPin className="w-4 h-4" />
              Open Fullscreen Map
            </button>
          </div>

          <GoogleRescueMap
            donations={availableDonations}
            height="380px"
            onSelectDonation={onSelectDonation}
            showControls={true}
          />
        </div>
      </section>

      {/* How It Works - 3 Pillars */}
      <section className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 space-y-10">
        <div className="text-center max-w-2xl mx-auto space-y-2">
          <span className="text-xs font-bold uppercase tracking-wider text-emerald-700">Seamless Collaboration</span>
          <h2 className="text-3xl font-bold text-stone-900">How the Rescue Network Operates</h2>
          <p className="text-stone-500 text-sm">
            A transparent, audit-ready workflow built for speed, safety, and zero food waste.
          </p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          {/* Card 1: Donors */}
          <div className="bg-white p-7 rounded-3xl border border-stone-200/80 shadow-2xs hover:shadow-md transition-shadow space-y-4">
            <div className="w-12 h-12 rounded-2xl bg-emerald-100 text-emerald-800 flex items-center justify-center font-bold text-xl">
              <Utensils className="w-6 h-6" />
            </div>
            <h3 className="text-xl font-bold text-stone-900">1. Donors Post Surplus</h3>
            <p className="text-stone-600 text-sm leading-relaxed">
              Caterers, hotels, and households post surplus food details in under 60 seconds with AI-assisted categorization, temperature checks, and deadline timers.
            </p>
            <ul className="text-xs text-stone-500 space-y-2 pt-2 border-t border-stone-100">
              <li className="flex items-center gap-2">
                <CheckCircle2 className="w-4 h-4 text-emerald-600" />
                Zero-charge listing
              </li>
              <li className="flex items-center gap-2">
                <CheckCircle2 className="w-4 h-4 text-emerald-600" />
                AI packaging suggestions
              </li>
              <li className="flex items-center gap-2">
                <CheckCircle2 className="w-4 h-4 text-emerald-600" />
                Good Samaritan legal safety
              </li>
            </ul>
          </div>

          {/* Card 2: NGOs */}
          <div className="bg-white p-7 rounded-3xl border border-stone-200/80 shadow-2xs hover:shadow-md transition-shadow space-y-4">
            <div className="w-12 h-12 rounded-2xl bg-orange-100 text-orange-800 flex items-center justify-center font-bold text-xl">
              <Building2 className="w-6 h-6" />
            </div>
            <h3 className="text-xl font-bold text-stone-900">2. Verified NGOs Claim</h3>
            <p className="text-stone-600 text-sm leading-relaxed">
              Verified shelters and community kitchens receive instant notifications for matched volume and claim meals through atomic transaction locks to avoid double claims.
            </p>
            <ul className="text-xs text-stone-500 space-y-2 pt-2 border-t border-stone-100">
              <li className="flex items-center gap-2">
                <CheckCircle2 className="w-4 h-4 text-orange-600" />
                Admin-verified organizations
              </li>
              <li className="flex items-center gap-2">
                <CheckCircle2 className="w-4 h-4 text-orange-600" />
                Capacity & intake matching
              </li>
              <li className="flex items-center gap-2">
                <CheckCircle2 className="w-4 h-4 text-orange-600" />
                Direct donor communication
              </li>
            </ul>
          </div>

          {/* Card 3: Volunteers */}
          <div className="bg-white p-7 rounded-3xl border border-stone-200/80 shadow-2xs hover:shadow-md transition-shadow space-y-4">
            <div className="w-12 h-12 rounded-2xl bg-blue-100 text-blue-800 flex items-center justify-center font-bold text-xl">
              <Bike className="w-6 h-6" />
            </div>
            <h3 className="text-xl font-bold text-stone-900">3. Volunteers Transport</h3>
            <p className="text-stone-600 text-sm leading-relaxed">
              Nearby student and civic volunteers accept pickup routes, verify hygienic packaging, and transport food in thermal bags to the receiving community kitchen.
            </p>
            <ul className="text-xs text-stone-500 space-y-2 pt-2 border-t border-stone-100">
              <li className="flex items-center gap-2">
                <CheckCircle2 className="w-4 h-4 text-blue-600" />
                Optimized GPS map routes
              </li>
              <li className="flex items-center gap-2">
                <CheckCircle2 className="w-4 h-4 text-blue-600" />
                Real-time tracking status
              </li>
              <li className="flex items-center gap-2">
                <CheckCircle2 className="w-4 h-4 text-blue-600" />
                Verified impact records
              </li>
            </ul>
          </div>
        </div>
      </section>

      {/* Recent Available Surplus Carousel/Grid */}
      <section className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <span className="text-xs font-bold uppercase tracking-wider text-emerald-700">Urgent Opportunities</span>
            <h2 className="text-2xl font-bold text-stone-900">Currently Available Surplus</h2>
          </div>
          <button
            onClick={() => onNavigate('browse')}
            className="text-xs font-bold text-emerald-700 hover:text-emerald-900 flex items-center gap-1"
          >
            View All ({availableDonations.length})
            <ArrowRight className="w-4 h-4" />
          </button>
        </div>

        {availableDonations.length === 0 ? (
          <div className="bg-white p-12 text-center rounded-3xl border border-stone-200 space-y-3">
            <div className="text-4xl">🍲</div>
            <h3 className="text-base font-bold text-stone-800">No active surplus donations at this moment</h3>
            <p className="text-xs text-stone-500 max-w-sm mx-auto">
              All reported surplus has been matched and rescued! Be the first to list surplus food from your kitchen or event.
            </p>
            <button
              onClick={onOpenCreate}
              className="bg-emerald-600 hover:bg-emerald-700 text-white font-semibold text-xs px-5 py-2.5 rounded-xl cursor-pointer"
            >
              List Surplus Food
            </button>
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5">
            {availableDonations.slice(0, 6).map((item) => (
              <div
                key={item.id}
                onClick={() => onSelectDonation(item)}
                className="bg-white rounded-2xl border border-stone-200/80 p-5 shadow-2xs hover:shadow-md transition-all cursor-pointer space-y-3 group"
              >
                <div className="flex items-start justify-between gap-2">
                  <span className="text-[11px] font-bold text-emerald-800 bg-emerald-50 px-2.5 py-1 rounded-full uppercase">
                    {item.category}
                  </span>
                  <span className="text-xs font-bold text-orange-600 flex items-center gap-1">
                    <Clock className="w-3.5 h-3.5" />
                    {item.pickupDeadline}
                  </span>
                </div>

                <div>
                  <h3 className="font-bold text-stone-900 group-hover:text-emerald-700 transition-colors line-clamp-1">
                    {item.foodName}
                  </h3>
                  <p className="text-xs text-stone-500 line-clamp-2 mt-1 leading-relaxed">
                    {item.description || 'Fresh surplus food ready for immediate pickup.'}
                  </p>
                </div>

                <div className="flex items-center justify-between pt-2 border-t border-stone-100 text-xs">
                  <div>
                    <span className="text-stone-400 block text-[10px]">Quantity</span>
                    <span className="font-bold text-stone-800">
                      {item.quantity} {item.unit}
                    </span>
                  </div>
                  <div className="text-right">
                    <span className="text-stone-400 block text-[10px]">Location</span>
                    <span className="font-medium text-stone-700 line-clamp-1 max-w-[140px]">
                      {item.pickupAddress}
                    </span>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </section>

      {/* Safety & Good Samaritan Banner */}
      <section className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="bg-gradient-to-r from-stone-900 to-emerald-950 text-white rounded-3xl p-8 sm:p-10 flex flex-col md:flex-row items-center justify-between gap-6 shadow-xl">
          <div className="space-y-3 max-w-2xl">
            <div className="inline-flex items-center gap-2 text-emerald-400 text-xs font-bold uppercase tracking-wider">
              <ShieldCheck className="w-4 h-4" />
              Legal & Food Safety Compliance
            </div>
            <h2 className="text-2xl sm:text-3xl font-extrabold">
              Protected by Good Samaritan Food Donation Standards
            </h2>
            <p className="text-stone-300 text-sm leading-relaxed">
              Donors acting in good faith are legally protected under national food safety guidelines. Our cold-chain and packaging protocols ensure maximum safety for vulnerable communities.
            </p>
          </div>
          <button
            onClick={() => onNavigate('about')}
            className="shrink-0 bg-white text-stone-900 hover:bg-stone-100 font-bold px-6 py-3 rounded-2xl text-sm transition-colors cursor-pointer"
          >
            Review Safety Protocols
          </button>
        </div>
      </section>
    </div>
  );
};
