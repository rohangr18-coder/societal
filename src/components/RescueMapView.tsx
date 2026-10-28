import React, { useState } from 'react';
import {
  MapPin,
  Filter,
  Layers,
  Clock,
  Compass,
  ArrowRight,
} from 'lucide-react';
import { Donation } from '../types';
import { GoogleRescueMap } from './GoogleRescueMap';
import { calculateDistanceKm } from '../utils/geo';
import { DeviceLocation } from '../hooks/useDeviceLocation';
import { Navigation, ExternalLink } from 'lucide-react';

interface RescueMapViewProps {
  donations: Donation[];
  onSelectDonation: (donation: Donation) => void;
  onOpenCreate: () => void;
}

export const RescueMapView: React.FC<RescueMapViewProps> = ({
  donations,
  onSelectDonation,
  onOpenCreate,
}) => {
  const [filter, setFilter] = useState<'all' | 'available' | 'active'>('available');
  const [selectedDonation, setSelectedDonation] = useState<Donation | null>(null);
  const [userLocation, setUserLocation] = useState<DeviceLocation | null>(null);

  const visibleDonations = donations.filter((d) => {
    if (filter === 'available') return d.status === 'available';
    if (filter === 'active') return ['available', 'requested', 'accepted', 'scheduled', 'picked_up'].includes(d.status);
    return true;
  });

  const openDirections = (lat: number, lng: number) => {
    const originParam = userLocation ? `${userLocation.lat},${userLocation.lng}` : '';
    const url = originParam
      ? `https://www.google.com/maps/dir/?api=1&origin=${originParam}&destination=${lat},${lng}&travelmode=driving`
      : `https://www.google.com/maps/dir/?api=1&destination=${lat},${lng}&travelmode=driving`;
    window.open(url, '_blank', 'noopener,noreferrer');
  };

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6 space-y-4">
      {/* Header & Controls */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 bg-white p-4 rounded-2xl border border-stone-200 shadow-2xs">
        <div>
          <h1 className="text-xl font-bold text-stone-900 flex items-center gap-2">
            <Compass className="w-5 h-5 text-emerald-600" />
            Live Food Rescue Google Maps Surveillance
          </h1>
          <p className="text-xs text-stone-500">
            Interactive real-time map with live GPS tracking, food surplus locations, and turn-by-turn routing.
          </p>
        </div>

        <div className="flex items-center gap-2">
          <div className="flex items-center bg-stone-100 p-1 rounded-xl text-xs font-semibold">
            <button
              onClick={() => setFilter('available')}
              className={`px-3 py-1.5 rounded-lg transition-colors ${
                filter === 'available' ? 'bg-white text-emerald-800 shadow-2xs font-bold' : 'text-stone-600'
              }`}
            >
              Available ({donations.filter((d) => d.status === 'available').length})
            </button>
            <button
              onClick={() => setFilter('active')}
              className={`px-3 py-1.5 rounded-lg transition-colors ${
                filter === 'active' ? 'bg-white text-emerald-800 shadow-2xs font-bold' : 'text-stone-600'
              }`}
            >
              In Motion ({donations.filter((d) => ['requested', 'accepted', 'scheduled', 'picked_up'].includes(d.status)).length})
            </button>
            <button
              onClick={() => setFilter('all')}
              className={`px-3 py-1.5 rounded-lg transition-colors ${
                filter === 'all' ? 'bg-white text-emerald-800 shadow-2xs font-bold' : 'text-stone-600'
              }`}
            >
              All ({donations.length})
            </button>
          </div>

          <button
            onClick={onOpenCreate}
            className="bg-emerald-600 hover:bg-emerald-700 text-white font-semibold text-xs px-3.5 py-2 rounded-xl transition-colors cursor-pointer"
          >
            + Post Food
          </button>
        </div>
      </div>

      {/* Map & Detail Sidebar Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-4 gap-4">
        {/* Main Map */}
        <div className="lg:col-span-3 bg-white p-2 rounded-3xl border border-stone-200 shadow-sm overflow-hidden">
          <GoogleRescueMap
            donations={visibleDonations}
            height="620px"
            zoom={13}
            selectedDonationId={selectedDonation?.id}
            onSelectDonation={(d) => setSelectedDonation(d)}
            onLocationUpdate={(loc) => setUserLocation(loc)}
            showControls={true}
          />
        </div>

        {/* Selected Donation Sidebar */}
        <div className="lg:col-span-1 space-y-3">
          {selectedDonation ? (
            <div className="bg-white p-5 rounded-3xl border border-stone-200 shadow-sm space-y-4 animate-in fade-in">
              <div className="flex items-start justify-between">
                <span className="text-[11px] font-bold text-emerald-800 bg-emerald-50 px-2.5 py-0.5 rounded-full uppercase">
                  {selectedDonation.category}
                </span>
                <span className="text-[10px] font-bold uppercase tracking-wider text-orange-600">
                  {selectedDonation.status.replace('_', ' ')}
                </span>
              </div>

              <div>
                <h3 className="font-bold text-stone-900 text-base">{selectedDonation.foodName}</h3>
                <p className="text-xs text-stone-500 mt-1 line-clamp-3 leading-relaxed">
                  {selectedDonation.description || 'Surplus food ready for collection.'}
                </p>
              </div>

              <div className="bg-stone-50 p-3 rounded-2xl text-xs space-y-1.5 text-stone-700">
                <div className="flex justify-between">
                  <span className="text-stone-400">Volume:</span>
                  <span className="font-bold text-stone-900">{selectedDonation.quantity} {selectedDonation.unit}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-stone-400">Deadline:</span>
                  <span className="font-bold text-orange-600">{selectedDonation.pickupDeadline}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-stone-400">Storage:</span>
                  <span className="font-medium text-stone-800">{selectedDonation.storageType || 'Standard'}</span>
                </div>
                {userLocation && selectedDonation.latitude && selectedDonation.longitude && (
                  <div className="flex justify-between pt-1 border-t border-stone-200 text-emerald-800 font-semibold">
                    <span>GPS Proximity:</span>
                    <span>
                      {calculateDistanceKm(
                        userLocation.lat,
                        userLocation.lng,
                        selectedDonation.latitude,
                        selectedDonation.longitude
                      )}{' '}
                      km away
                    </span>
                  </div>
                )}
              </div>

              <div className="text-xs text-stone-500 flex items-start gap-1.5">
                <MapPin className="w-3.5 h-3.5 text-stone-400 shrink-0 mt-0.5" />
                <span className="line-clamp-2">{selectedDonation.pickupAddress}</span>
              </div>

              <div className="space-y-2">
                <button
                  type="button"
                  onClick={() => openDirections(selectedDonation.latitude, selectedDonation.longitude)}
                  className="w-full bg-emerald-50 hover:bg-emerald-100 text-emerald-800 border border-emerald-200 font-bold text-xs py-2 px-3 rounded-xl transition-colors flex items-center justify-center gap-1.5 cursor-pointer"
                >
                  <Navigation className="w-3.5 h-3.5 text-emerald-600" />
                  Google Maps Directions
                  <ExternalLink className="w-3 h-3" />
                </button>

                <button
                  onClick={() => onSelectDonation(selectedDonation)}
                  className="w-full bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-xs py-2.5 rounded-xl transition-colors cursor-pointer"
                >
                  Inspect & Claim Listing →
                </button>
              </div>
            </div>
          ) : (
            <div className="bg-white p-6 rounded-3xl border border-stone-200 shadow-2xs text-center space-y-2 text-stone-500">
              <MapPin className="w-8 h-8 text-stone-300 mx-auto" />
              <h4 className="font-bold text-stone-800 text-sm">Select Any Marker</h4>
              <p className="text-xs leading-relaxed">
                Click any colored pin on the map to preview surplus food details, quantity, and pickup deadlines.
              </p>
            </div>
          )}

          {/* Map Legend */}
          <div className="bg-white p-4 rounded-2xl border border-stone-200 text-xs space-y-2 text-stone-600 shadow-2xs">
            <span className="font-bold text-stone-800 text-[11px] uppercase tracking-wider block">
              Marker Color Code
            </span>
            <div className="flex items-center gap-2">
              <span className="w-3 h-3 rounded-full bg-emerald-600 shrink-0" />
              <span>Green: Available for Claim</span>
            </div>
            <div className="flex items-center gap-2">
              <span className="w-3 h-3 rounded-full bg-orange-600 shrink-0" />
              <span>Orange: Claimed by NGO</span>
            </div>
            <div className="flex items-center gap-2">
              <span className="w-3 h-3 rounded-full bg-blue-600 shrink-0" />
              <span>Blue: Courier Scheduled</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
