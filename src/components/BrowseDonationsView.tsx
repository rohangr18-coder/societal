import React, { useState, useMemo } from 'react';
import {
  Search,
  Filter,
  Clock,
  MapPin,
  Package,
  Thermometer,
  Layers,
  Map,
  PlusCircle,
  Sparkles,
} from 'lucide-react';
import { Donation, DonationStatus } from '../types';
import { GoogleRescueMap } from './GoogleRescueMap';
import { calculateDistanceKm } from '../utils/geo';
import { DeviceLocation } from '../hooks/useDeviceLocation';

interface BrowseDonationsViewProps {
  donations: Donation[];
  onSelectDonation: (donation: Donation) => void;
  onOpenCreate: () => void;
}

const CATEGORIES = [
  'All Categories',
  'Cooked Meals',
  'Bakery & Bread',
  'Fresh Produce & Fruits',
  'Dairy & Eggs',
  'Packaged & Canned Goods',
  'Beverages',
  'Raw Ingredients',
];

export const BrowseDonationsView: React.FC<BrowseDonationsViewProps> = ({
  donations,
  onSelectDonation,
  onOpenCreate,
}) => {
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedCategory, setSelectedCategory] = useState('All Categories');
  const [statusFilter, setStatusFilter] = useState<'available' | 'all'>('available');
  const [viewMode, setViewMode] = useState<'grid' | 'map'>('grid');
  const [userLocation, setUserLocation] = useState<DeviceLocation | null>(null);
  const [maxRadiusKm, setMaxRadiusKm] = useState<number | 'all'>('all');

  const filteredDonations = useMemo(() => {
    return donations.filter((d) => {
      // Status filter
      if (statusFilter === 'available' && d.status !== 'available') {
        return false;
      }

      // Category filter
      if (selectedCategory !== 'All Categories' && d.category !== selectedCategory) {
        return false;
      }

      // Search term
      if (searchTerm.trim()) {
        const query = searchTerm.toLowerCase();
        const matchName = d.foodName.toLowerCase().includes(query);
        const matchDesc = d.description?.toLowerCase().includes(query);
        const matchAddr = d.pickupAddress.toLowerCase().includes(query);
        const matchDonor = d.donorName.toLowerCase().includes(query);
        if (!matchName && !matchDesc && !matchAddr && !matchDonor) {
          return false;
        }
      }

      // Radius filter from user device GPS
      if (maxRadiusKm !== 'all' && userLocation && d.latitude && d.longitude) {
        const dist = calculateDistanceKm(userLocation.lat, userLocation.lng, d.latitude, d.longitude);
        if (dist > maxRadiusKm) {
          return false;
        }
      }

      return true;
    });
  }, [donations, searchTerm, selectedCategory, statusFilter, maxRadiusKm, userLocation]);

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 space-y-6">
      {/* Header & Controls */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-extrabold text-stone-900">Browse Food Surplus Listings</h1>
          <p className="text-xs sm:text-sm text-stone-500 mt-1">
            Real-time surplus listings ready for immediate claim and distribution by verified NGOs.
          </p>
        </div>

        <div className="flex items-center gap-3">
          {/* View mode toggle */}
          <div className="flex items-center bg-stone-100 p-1 rounded-xl border border-stone-200">
            <button
              onClick={() => setViewMode('grid')}
              className={`px-3 py-1.5 rounded-lg text-xs font-semibold flex items-center gap-1.5 transition-all ${
                viewMode === 'grid'
                  ? 'bg-white text-emerald-800 shadow-2xs'
                  : 'text-stone-500 hover:text-stone-800'
              }`}
            >
              <Layers className="w-3.5 h-3.5" />
              Grid
            </button>
            <button
              onClick={() => setViewMode('map')}
              className={`px-3 py-1.5 rounded-lg text-xs font-semibold flex items-center gap-1.5 transition-all ${
                viewMode === 'map'
                  ? 'bg-white text-emerald-800 shadow-2xs'
                  : 'text-stone-500 hover:text-stone-800'
              }`}
            >
              <Map className="w-3.5 h-3.5" />
              Live Map
            </button>
          </div>

          <button
            onClick={onOpenCreate}
            className="bg-emerald-600 hover:bg-emerald-700 text-white font-semibold text-xs px-4 py-2 rounded-xl shadow-xs transition-colors flex items-center gap-1.5 cursor-pointer"
          >
            <PlusCircle className="w-4 h-4" />
            Post Surplus
          </button>
        </div>
      </div>

      {/* Filter Bar */}
      <div className="bg-white p-4 rounded-2xl border border-stone-200 shadow-2xs space-y-4">
        <div className="flex flex-col sm:flex-row gap-3">
          {/* Search Bar */}
          <div className="relative flex-1">
            <Search className="w-4 h-4 text-stone-400 absolute left-3.5 top-3" />
            <input
              type="text"
              placeholder="Search by food name, location, or donor..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="w-full pl-10 pr-4 py-2 rounded-xl border border-stone-200 text-xs focus:border-emerald-500 outline-hidden font-medium"
            />
          </div>

          {/* Status selector */}
          <div className="flex items-center gap-2">
            <button
              onClick={() => setStatusFilter('available')}
              className={`px-3 py-2 rounded-xl text-xs font-bold transition-colors ${
                statusFilter === 'available'
                  ? 'bg-emerald-100 text-emerald-900 border border-emerald-300'
                  : 'bg-stone-50 text-stone-600 border border-stone-200'
              }`}
            >
              Available Only ({donations.filter((d) => d.status === 'available').length})
            </button>
            <button
              onClick={() => setStatusFilter('all')}
              className={`px-3 py-2 rounded-xl text-xs font-bold transition-colors ${
                statusFilter === 'all'
                  ? 'bg-stone-800 text-white'
                  : 'bg-stone-50 text-stone-600 border border-stone-200'
              }`}
            >
              All Records ({donations.length})
            </button>
          </div>
        </div>

        {/* Category Filter Pills */}
        <div className="flex items-center gap-2 overflow-x-auto pb-1 text-xs">
          {CATEGORIES.map((cat) => (
            <button
              key={cat}
              onClick={() => setSelectedCategory(cat)}
              className={`px-3 py-1.5 rounded-full whitespace-nowrap transition-colors font-medium ${
                selectedCategory === cat
                  ? 'bg-emerald-700 text-white font-bold'
                  : 'bg-stone-100 text-stone-600 hover:bg-stone-200'
              }`}
            >
              {cat}
            </button>
          ))}
        </div>

        {/* Real GPS Radius Filter (When user location is active) */}
        <div className="pt-2 border-t border-stone-100 flex flex-wrap items-center justify-between gap-2 text-xs">
          <div className="flex items-center gap-2">
            <span className="text-stone-500 font-semibold text-[11px] uppercase tracking-wider">
              Distance Radius:
            </span>
            <div className="flex items-center gap-1">
              {[
                { label: 'Any Distance', val: 'all' as const },
                { label: 'Within 5 km', val: 5 },
                { label: 'Within 10 km', val: 10 },
                { label: 'Within 25 km', val: 25 },
              ].map((r) => (
                <button
                  key={r.label}
                  type="button"
                  onClick={() => setMaxRadiusKm(r.val)}
                  className={`px-2.5 py-1 rounded-lg text-xs font-medium transition-colors ${
                    maxRadiusKm === r.val
                      ? 'bg-emerald-100 text-emerald-900 font-bold border border-emerald-300'
                      : 'bg-stone-50 text-stone-600 hover:bg-stone-100'
                  }`}
                >
                  {r.label}
                </button>
              ))}
            </div>
          </div>

          {userLocation ? (
            <span className="text-[11px] text-emerald-700 font-medium">
              GPS Active: ±{userLocation.accuracy}m accuracy
            </span>
          ) : (
            <span className="text-[11px] text-stone-400">
              (Enable GPS on map to filter by proximity)
            </span>
          )}
        </div>
      </div>

      {/* Content Rendering: Grid vs Map */}
      {viewMode === 'map' ? (
        <div className="bg-white p-4 rounded-3xl border border-stone-200 shadow-sm space-y-3">
          <div className="text-xs text-stone-500 font-medium flex items-center justify-between px-1">
            <span>Showing {filteredDonations.length} surplus locations on Google Map</span>
            <span className="flex items-center gap-2">
              <span className="inline-block w-2.5 h-2.5 rounded-full bg-emerald-600" /> Available
              <span className="inline-block w-2.5 h-2.5 rounded-full bg-orange-500 ml-2" /> Claimed
            </span>
          </div>
          <GoogleRescueMap
            donations={filteredDonations}
            height="550px"
            onSelectDonation={onSelectDonation}
            onLocationUpdate={(loc) => setUserLocation(loc)}
            showControls={true}
          />
        </div>
      ) : (
        <>
          {filteredDonations.length === 0 ? (
            <div className="bg-white p-12 text-center rounded-3xl border border-stone-200 space-y-3">
              <div className="text-4xl">🔍</div>
              <h3 className="text-base font-bold text-stone-800">No matching surplus listings found</h3>
              <p className="text-xs text-stone-500 max-w-sm mx-auto">
                Try clearing your search query or switching categories to see other listings.
              </p>
              <button
                onClick={() => {
                  setSearchTerm('');
                  setSelectedCategory('All Categories');
                  setStatusFilter('available');
                }}
                className="text-xs font-bold text-emerald-700 hover:text-emerald-900 underline cursor-pointer"
              >
                Reset All Filters
              </button>
            </div>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5">
              {filteredDonations.map((item) => (
                <div
                  key={item.id}
                  onClick={() => onSelectDonation(item)}
                  className="bg-white rounded-2xl border border-stone-200/90 p-5 shadow-2xs hover:shadow-md transition-all cursor-pointer flex flex-col justify-between group space-y-4"
                >
                  <div className="space-y-3">
                    <div className="flex items-start justify-between gap-2">
                      <span className="text-[11px] font-bold text-emerald-800 bg-emerald-50 px-2.5 py-1 rounded-full uppercase">
                        {item.category}
                      </span>
                      <span
                        className={`text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-md ${
                          item.status === 'available'
                            ? 'bg-emerald-100 text-emerald-800'
                            : item.status === 'requested' || item.status === 'accepted'
                            ? 'bg-amber-100 text-amber-800'
                            : 'bg-stone-100 text-stone-700'
                        }`}
                      >
                        {item.status.replace('_', ' ')}
                      </span>
                    </div>

                    <div>
                      <h3 className="font-bold text-stone-900 group-hover:text-emerald-700 transition-colors line-clamp-1 text-base">
                        {item.foodName}
                      </h3>
                      <p className="text-xs text-stone-500 line-clamp-2 mt-1 leading-relaxed">
                        {item.description || 'Surplus edible food ready for authorized NGO pickup.'}
                      </p>
                    </div>

                    <div className="grid grid-cols-2 gap-2 text-xs bg-stone-50 p-2.5 rounded-xl text-stone-600">
                      <div>
                        <span className="text-[10px] text-stone-400 block">Quantity</span>
                        <span className="font-bold text-emerald-950">
                          {item.quantity} {item.unit}
                        </span>
                      </div>
                      <div>
                        <span className="text-[10px] text-stone-400 block">Deadline</span>
                        <span className="font-bold text-orange-600 truncate block">
                          {item.pickupDeadline}
                        </span>
                      </div>
                    </div>
                  </div>

                  <div className="pt-3 border-t border-stone-100 flex items-center justify-between text-xs text-stone-500">
                    <span className="flex items-center gap-1 line-clamp-1 max-w-[170px]">
                      <MapPin className="w-3.5 h-3.5 text-stone-400 shrink-0" />
                      {item.pickupAddress}
                    </span>
                    <span className="font-semibold text-emerald-700 group-hover:translate-x-0.5 transition-transform">
                      View Details →
                    </span>
                  </div>
                </div>
              ))}
            </div>
          )}
        </>
      )}
    </div>
  );
};
