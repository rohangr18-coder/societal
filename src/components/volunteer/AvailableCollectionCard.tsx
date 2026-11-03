import React from 'react';
import {
  Compass,
  Clock,
  Calendar,
  MapPin,
  CheckCircle2,
  Loader2,
} from 'lucide-react';
import { Donation } from '../../types';

export interface AvailableCollectionCardProps {
  donation: Donation & { distanceKm?: number };
  claimingDonationId: string | null;
  onAccept: (donation: Donation) => void;
  getRemainingTimeInfo: (d: Donation) => { label: string; isUrgent: boolean };
  formatPickupWindow: (d: Donation) => string;
}

export const AvailableCollectionCard: React.FC<AvailableCollectionCardProps> = ({
  donation,
  claimingDonationId,
  onAccept,
  getRemainingTimeInfo,
  formatPickupWindow,
}) => {
  const timeInfo = getRemainingTimeInfo(donation);

  return (
    <div className="bg-white rounded-2xl border border-stone-200 hover:border-emerald-300 transition-all shadow-sm hover:shadow-md overflow-hidden flex flex-col justify-between">
      <div>
        {/* Image / Header */}
        <div className="relative h-44 bg-stone-100 overflow-hidden">
          {donation.imageUrl ? (
            <img
              src={donation.imageUrl}
              alt={donation.foodName}
              className="w-full h-full object-cover"
            />
          ) : (
            <div className="w-full h-full flex items-center justify-center text-stone-400 font-bold text-xs">
              Food Surplus Listing
            </div>
          )}

          {/* Urgency Badge & Distance */}
          <div className="absolute top-3 left-3 flex flex-wrap gap-1.5">
            <span className="px-2.5 py-1 rounded-full text-[11px] font-black bg-stone-900/80 text-white backdrop-blur-xs flex items-center gap-1">
              <Compass className="w-3 h-3 text-emerald-400" />
              <span>{donation.distanceKm ? `${donation.distanceKm.toFixed(1)} km away` : '< 1 km'}</span>
            </span>
            <span
              className={`px-2.5 py-1 rounded-full text-[11px] font-black shadow-xs flex items-center gap-1 ${
                timeInfo.isUrgent
                  ? 'bg-rose-500 text-white animate-pulse'
                  : 'bg-amber-500 text-stone-950'
              }`}
            >
              <Clock className="w-3 h-3" />
              <span>{timeInfo.isUrgent ? `⚠️ Urgent: ${timeInfo.label}` : timeInfo.label}</span>
            </span>
          </div>

          <div className="absolute top-3 right-3">
            <span className="px-2.5 py-1 rounded-full text-[11px] font-black bg-emerald-600 text-white shadow-xs">
              {donation.category}
            </span>
          </div>
        </div>

        {/* Body */}
        <div className="p-5 space-y-3">
          <div>
            <h3 className="font-bold text-stone-900 text-base leading-snug line-clamp-1">
              {donation.foodName}
            </h3>
            <p className="text-xs text-stone-500 mt-1 line-clamp-2">
              {donation.description || 'Nutritious surplus ready for volunteer collection and shelter transport.'}
            </p>
          </div>

          {/* Scheduled Pickup Window */}
          <div className="bg-emerald-50/70 border border-emerald-100 rounded-xl p-2.5 text-xs text-emerald-950 flex items-start gap-2">
            <Calendar className="w-4 h-4 text-emerald-700 shrink-0 mt-0.5" />
            <div>
              <div className="font-bold text-[11px] uppercase tracking-wider text-emerald-800">
                Scheduled Pickup Window
              </div>
              <div className="font-semibold text-xs mt-0.5">
                {formatPickupWindow(donation)}
              </div>
              {donation.preferredPickupTime && (
                <div className="text-[11px] text-emerald-700 mt-0.5">
                  Preferred time: <strong>{donation.preferredPickupTime}</strong>
                </div>
              )}
            </div>
          </div>

          <div className="space-y-1.5 pt-2 border-t border-stone-100 text-xs text-stone-600">
            <div className="flex items-center justify-between">
              <span className="text-stone-400">Quantity:</span>
              <span className="font-bold text-stone-800">
                {donation.quantity} {donation.unit} ({donation.servings || donation.quantity * 2} servings)
              </span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-stone-400">Donor:</span>
              <span className="font-semibold text-stone-800 truncate max-w-[180px]">
                {donation.donorName}
              </span>
            </div>
            <div className="flex items-center gap-1.5 text-stone-500 pt-1">
              <MapPin className="w-3.5 h-3.5 text-emerald-600 shrink-0" />
              <span className="truncate">{donation.pickupAddress}</span>
            </div>
            {donation.storageType && (
              <div className="text-[11px] text-amber-800 bg-amber-50 px-2.5 py-1 rounded-lg">
                Storage: {donation.storageType}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Accept CTA */}
      <div className="p-5 pt-0">
        <button
          onClick={() => onAccept(donation)}
          disabled={claimingDonationId === donation.id}
          className="w-full bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-xs sm:text-sm py-3 rounded-xl transition-all shadow-xs flex items-center justify-center gap-2 cursor-pointer disabled:opacity-50"
        >
          {claimingDonationId === donation.id ? (
            <>
              <Loader2 className="w-4 h-4 animate-spin" />
              <span>Reserving Collection...</span>
            </>
          ) : (
            <>
              <CheckCircle2 className="w-4 h-4" />
              <span>Accept Collection Request</span>
            </>
          )}
        </button>
      </div>
    </div>
  );
};
