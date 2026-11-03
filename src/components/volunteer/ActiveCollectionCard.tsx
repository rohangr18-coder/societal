import React from 'react';
import {
  Radio,
  CheckCircle2,
  PackageCheck,
  Bike,
  Award,
  QrCode,
  MapPin,
  Building2,
  ExternalLink,
} from 'lucide-react';
import { Donation, DonationStatus } from '../../types';
import { LiveTrackingMap } from '../LiveTrackingMap';

export interface ActiveCollectionCardProps {
  donation: Donation;
  statusUpdating: boolean;
  onCancel: (donation: Donation) => void;
  onScanPickup: (donation: Donation) => void;
  onScanDelivery: (donation: Donation) => void;
  onTransitionStatus: (donation: Donation, nextStatus: DonationStatus) => void;
}

export const ActiveCollectionCard: React.FC<ActiveCollectionCardProps> = ({
  donation,
  statusUpdating,
  onCancel,
  onScanPickup,
  onScanDelivery,
  onTransitionStatus,
}) => {
  return (
    <div className="bg-white rounded-3xl border border-emerald-200 shadow-md p-6 sm:p-8 space-y-6">
      {/* Active Header & Stepper */}
      <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4 pb-6 border-b border-stone-100">
        <div>
          <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full text-xs font-bold bg-emerald-100 text-emerald-800 mb-2">
            <Radio className="w-3.5 h-3.5 text-emerald-600 animate-pulse" />
            <span>Collection Mission in Progress</span>
          </div>
          <h2 className="text-xl sm:text-2xl font-black text-stone-900">
            {donation.foodName}
          </h2>
          <p className="text-xs text-stone-500">
            {donation.quantity} {donation.unit} • Donor: {donation.donorName}
          </p>
        </div>

        {/* Actions / Pre-pickup cancellation */}
        <div className="flex items-center gap-3">
          {['accepted', 'scheduled'].includes(donation.status) && (
            <button
              onClick={() => onCancel(donation)}
              className="px-4 py-2 rounded-xl border border-rose-200 hover:bg-rose-50 text-rose-700 text-xs font-bold transition-colors cursor-pointer"
            >
              Cancel Collection
            </button>
          )}
        </div>
      </div>

      {/* Visual Status Progression Stepper */}
      <div className="py-2">
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          {[
            { status: 'accepted', label: '1. Request Accepted', icon: CheckCircle2 },
            { status: 'picked_up', label: '2. Food Picked Up', icon: PackageCheck },
            { status: 'in_transit', label: '3. In Transit to Shelter', icon: Bike },
            { status: 'delivered', label: '4. Delivered to Shelter', icon: Award },
          ].map((step) => {
            const isPast =
              (step.status === 'accepted' && ['accepted', 'picked_up', 'in_transit', 'delivered', 'completed'].includes(donation.status)) ||
              (step.status === 'picked_up' && ['picked_up', 'in_transit', 'delivered', 'completed'].includes(donation.status)) ||
              (step.status === 'in_transit' && ['in_transit', 'delivered', 'completed'].includes(donation.status)) ||
              (step.status === 'delivered' && ['delivered', 'completed'].includes(donation.status));

            const isCurrent = donation.status === step.status;

            return (
              <div
                key={step.status}
                className={`p-3.5 rounded-2xl border transition-all ${
                  isCurrent
                    ? 'bg-emerald-50 border-emerald-400 shadow-xs'
                    : isPast
                    ? 'bg-stone-50 border-stone-200 text-emerald-800'
                    : 'bg-stone-50/50 border-stone-200 opacity-50'
                }`}
              >
                <div className="flex items-center gap-2">
                  <step.icon
                    className={`w-4 h-4 ${
                      isPast || isCurrent ? 'text-emerald-600' : 'text-stone-400'
                    }`}
                  />
                  <span className="text-xs font-bold text-stone-900">{step.label}</span>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Transition Action Buttons */}
      <div className="bg-stone-50 p-4 rounded-2xl border border-stone-200 flex flex-wrap items-center justify-between gap-4">
        <div className="text-xs text-stone-600">
          <span className="font-bold text-stone-900">Current Status:</span>{' '}
          <span className="uppercase text-emerald-700 font-bold">{donation.status.replace('_', ' ')}</span>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {['accepted', 'scheduled'].includes(donation.status) && (
            <>
              <button
                onClick={() => onScanPickup(donation)}
                className="bg-emerald-700 hover:bg-emerald-800 text-white font-bold text-xs px-4 py-2.5 rounded-xl shadow-xs transition-colors flex items-center gap-2 cursor-pointer"
                title="Scan Donor's Display Screen to verify pickup handover"
              >
                <QrCode className="w-4 h-4" />
                <span>Scan Donor Screen to Verify</span>
              </button>
              <button
                onClick={() => onScanPickup(donation)}
                disabled={statusUpdating}
                className="bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-xs px-4 py-2.5 rounded-xl shadow-xs transition-colors flex items-center gap-2 cursor-pointer disabled:opacity-50"
              >
                <PackageCheck className="w-4 h-4" />
                <span>Confirm Food Picked Up</span>
              </button>
            </>
          )}

          {donation.status === 'picked_up' && (
            <button
              onClick={() => onTransitionStatus(donation, 'in_transit')}
              disabled={statusUpdating}
              className="bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-xs px-4 py-2.5 rounded-xl shadow-xs transition-colors flex items-center gap-2 cursor-pointer disabled:opacity-50"
            >
              <Bike className="w-4 h-4" />
              <span>Depart to Shelter (In Transit)</span>
            </button>
          )}

          {donation.status === 'in_transit' && (
            <button
              onClick={() => onScanDelivery(donation)}
              disabled={statusUpdating}
              className="bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-xs px-4 py-2.5 rounded-xl shadow-xs transition-colors flex items-center gap-2 cursor-pointer disabled:opacity-50"
            >
              <Award className="w-4 h-4" />
              <span>Confirm Delivery at Shelter</span>
            </button>
          )}

          {donation.status === 'delivered' && (
            <button
              onClick={() => onTransitionStatus(donation, 'completed')}
              disabled={statusUpdating}
              className="bg-stone-900 hover:bg-stone-800 text-white font-bold text-xs px-4 py-2.5 rounded-xl shadow-xs transition-colors flex items-center gap-2 cursor-pointer disabled:opacity-50"
            >
              <CheckCircle2 className="w-4 h-4 text-emerald-400" />
              <span>Finalize Mission & Archive</span>
            </button>
          )}
        </div>
      </div>

      {/* Live GPS & Route Tracking Map */}
      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <h3 className="text-sm font-bold text-stone-900 flex items-center gap-2">
            <Radio className="w-4 h-4 text-emerald-600" />
            <span>Live Courier Navigation & Radar</span>
          </h3>
          <span className="text-xs text-stone-500">
            Donor and Shelter can view your pulse position in real time
          </span>
        </div>

        <LiveTrackingMap donation={donation} height="400px" allowBroadcast={true} />
      </div>

      {/* Pickup and Shelter Address Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-xs">
        <div className="p-4 rounded-2xl bg-stone-50 border border-stone-200 space-y-2">
          <div className="font-bold text-emerald-800 flex items-center gap-1.5 uppercase tracking-wider text-[11px]">
            <MapPin className="w-3.5 h-3.5" />
            <span>Pickup: Donor Facility</span>
          </div>
          <div className="font-bold text-stone-900 text-sm">{donation.donorName}</div>
          <div className="text-stone-600">{donation.pickupAddress}</div>
          <div className="pt-2 flex items-center gap-3">
            <a
              href={`https://www.google.com/maps/dir/?api=1&destination=${donation.latitude || 28.6139},${donation.longitude || 77.209}`}
              target="_blank"
              rel="noopener noreferrer"
              className="text-emerald-700 font-bold flex items-center gap-1 hover:underline"
            >
              <span>Get Directions</span>
              <ExternalLink className="w-3 h-3" />
            </a>
          </div>
        </div>

        <div className="p-4 rounded-2xl bg-stone-50 border border-stone-200 space-y-2">
          <div className="font-bold text-blue-800 flex items-center gap-1.5 uppercase tracking-wider text-[11px]">
            <Building2 className="w-3.5 h-3.5" />
            <span>Dropoff: Recipient Shelter</span>
          </div>
          <div className="font-bold text-stone-900 text-sm">
            {donation.assignedNgoName || 'Verified Community Shelter'}
          </div>
          <div className="text-stone-600">
            {donation.dropoffAddress || 'Shelter Central Hub, Food Rescue Network'}
          </div>
          <div className="pt-2 flex items-center gap-3">
            <a
              href={`https://www.google.com/maps/dir/?api=1&destination=${donation.dropoffLatitude || 28.5729},${donation.dropoffLongitude || 77.2215}`}
              target="_blank"
              rel="noopener noreferrer"
              className="text-blue-700 font-bold flex items-center gap-1 hover:underline"
            >
              <span>Get Directions</span>
              <ExternalLink className="w-3 h-3" />
            </a>
          </div>
        </div>
      </div>
    </div>
  );
};
