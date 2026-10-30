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
  Flame,
  Calendar,
  SlidersHorizontal,
  X,
  RotateCcw,
  Navigation,
  Check,
  ChevronDown,
  ChevronUp,
  LocateFixed,
  AlertCircle,
  Utensils,
  Apple,
  Wheat,
  Milk,
  Coffee,
  ShoppingBag,
} from 'lucide-react';
import { Donation } from '../types';
import { GoogleRescueMap } from './GoogleRescueMap';
import { calculateDistanceKm } from '../utils/geo';
import { getPickupWindowInfo } from '../utils/clustering';
import { useDeviceLocation, DeviceLocation } from '../hooks/useDeviceLocation';

export interface BrowseDonationsViewProps {
  donations: Donation[];
  onSelectDonation: (donation: Donation) => void;
  onOpenCreate: () => void;
}

export const CATEGORIES = [
  'All Categories',
  'Cooked Meals',
  'Produce',
  'Bakery & Bread',
  'Dairy & Eggs',
  'Packaged & Canned Goods',
  'Beverages',
  'Raw Ingredients',
] as const;

export type UrgencyFilter = 'all' | 'urgent' | 'pending' | 'flexible';
export type DistanceRange = 'all' | 5 | 10 | 25 | 50;

// Default reference locations when GPS is unavailable
const REFERENCE_CITIES: { name: string; lat: number; lng: number }[] = [
  { name: 'Bangalore Central', lat: 12.9716, lng: 77.5946 },
  { name: 'Delhi NCR', lat: 28.6139, lng: 77.209 },
  { name: 'Mumbai Metro', lat: 19.076, lng: 72.8777 },
];

/**
 * Robust category matching helper
 */
export function matchesCategory(donationCategory: string, filterCategory: string): boolean {
  if (filterCategory === 'All Categories') return true;
  const dCat = (donationCategory || '').toLowerCase();
  const fCat = filterCategory.toLowerCase();

  if (fCat === 'produce') {
    return dCat.includes('produce') || dCat.includes('fruit') || dCat.includes('vegetable');
  }
  if (fCat === 'cooked meals') {
    return dCat.includes('cooked') || dCat.includes('meal') || dCat.includes('prepared');
  }
  return dCat.includes(fCat) || fCat.includes(dCat);
}

/**
 * Pickup urgency matching helper
 */
export function matchesUrgency(donation: Donation, filter: UrgencyFilter): boolean {
  if (filter === 'all') return true;
  const info = getPickupWindowInfo(donation);

  if (filter === 'urgent') {
    // Urgent: window expiring in <= 2 hours (or info.isUrgent)
    return info.isUrgent || (info.minutesRemaining > 0 && info.minutesRemaining <= 120);
  }
  if (filter === 'pending') {
    // Expedited / today: between 2 and 12 hours
    return (
      (info.minutesRemaining > 120 && info.minutesRemaining <= 720) ||
      (info.isPending && info.minutesRemaining > 120)
    );
  }
  if (filter === 'flexible') {
    // Flexible / tomorrow / > 12 hours or no strict deadline
    return info.minutesRemaining > 720 || (!donation.collectionDeadline && !donation.pickupDeadline);
  }
  return true;
}

export const BrowseDonationsView: React.FC<BrowseDonationsViewProps> = ({
  donations,
  onSelectDonation,
  onOpenCreate,
}) => {
  // Filter States
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedCategory, setSelectedCategory] = useState<string>('All Categories');
  const [urgencyFilter, setUrgencyFilter] = useState<UrgencyFilter>('all');
  const [distanceRadius, setDistanceRadius] = useState<DistanceRange>('all');
  const [statusFilter, setStatusFilter] = useState<'available' | 'all'>('available');
  const [storageFilter, setStorageFilter] = useState<string>('all');
  const [viewMode, setViewMode] = useState<'grid' | 'map'>('grid');

  // Mobile sidebar collapse toggle
  const [mobileFiltersOpen, setMobileFiltersOpen] = useState(false);

  // Device location
  const {
    location: gpsLocation,
    isLoading: gpsLoading,
    getCurrentLocation,
  } = useDeviceLocation();

  // Selected reference or GPS location
  const [customLocation, setCustomLocation] = useState<DeviceLocation | null>(null);

  // Active coordinates used for distance calculations
  const activeLocation = customLocation || gpsLocation;

  // Handler for GPS trigger
  const handleRequestLocation = async () => {
    try {
      const loc = await getCurrentLocation();
      setCustomLocation(loc);
    } catch {
      // Fallback to Bangalore if GPS denied
      if (!customLocation) {
        setCustomLocation({
          lat: REFERENCE_CITIES[0].lat,
          lng: REFERENCE_CITIES[0].lng,
          accuracy: 500,
          timestamp: Date.now(),
        });
      }
    }
  };

  // Reset all filters
  const handleResetFilters = () => {
    setSearchTerm('');
    setSelectedCategory('All Categories');
    setUrgencyFilter('all');
    setDistanceRadius('all');
    setStatusFilter('available');
    setStorageFilter('all');
  };

  // Check if any filter is active
  const hasActiveFilters =
    searchTerm.trim() !== '' ||
    selectedCategory !== 'All Categories' ||
    urgencyFilter !== 'all' ||
    distanceRadius !== 'all' ||
    statusFilter !== 'available' ||
    storageFilter !== 'all';

  // Count active filters
  const activeFiltersCount = useMemo(() => {
    let count = 0;
    if (searchTerm.trim() !== '') count++;
    if (selectedCategory !== 'All Categories') count++;
    if (urgencyFilter !== 'all') count++;
    if (distanceRadius !== 'all') count++;
    if (statusFilter !== 'available') count++;
    if (storageFilter !== 'all') count++;
    return count;
  }, [searchTerm, selectedCategory, urgencyFilter, distanceRadius, statusFilter, storageFilter]);

  // Compute category counts
  const categoryCounts = useMemo(() => {
    const counts: Record<string, number> = { 'All Categories': donations.length };
    CATEGORIES.forEach((cat) => {
      if (cat !== 'All Categories') {
        counts[cat] = donations.filter((d) => matchesCategory(d.category, cat)).length;
      }
    });
    return counts;
  }, [donations]);

  // Compute urgency counts
  const urgencyCounts = useMemo(() => {
    return {
      all: donations.length,
      urgent: donations.filter((d) => matchesUrgency(d, 'urgent')).length,
      pending: donations.filter((d) => matchesUrgency(d, 'pending')).length,
      flexible: donations.filter((d) => matchesUrgency(d, 'flexible')).length,
    };
  }, [donations]);

  // Filtered donations list
  const filteredDonations = useMemo(() => {
    return donations.filter((d) => {
      // 1. Status Filter
      if (statusFilter === 'available' && d.status !== 'available') {
        return false;
      }

      // 2. Category Filter
      if (selectedCategory !== 'All Categories' && !matchesCategory(d.category, selectedCategory)) {
        return false;
      }

      // 3. Urgency Filter
      if (urgencyFilter !== 'all' && !matchesUrgency(d, urgencyFilter)) {
        return false;
      }

      // 4. Distance Radius Filter
      if (distanceRadius !== 'all' && activeLocation && d.latitude && d.longitude) {
        const dist = calculateDistanceKm(
          activeLocation.lat,
          activeLocation.lng,
          d.latitude,
          d.longitude
        );
        if (dist > distanceRadius) {
          return false;
        }
      }

      // 5. Storage Filter
      if (storageFilter !== 'all' && d.storageType && !d.storageType.toLowerCase().includes(storageFilter.toLowerCase())) {
        return false;
      }

      // 6. Search Term
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

      return true;
    });
  }, [
    donations,
    searchTerm,
    selectedCategory,
    urgencyFilter,
    distanceRadius,
    statusFilter,
    storageFilter,
    activeLocation,
  ]);

  // Get category icon
  const getCategoryIcon = (category: string) => {
    switch (category) {
      case 'Cooked Meals':
        return <Utensils className="w-4 h-4" />;
      case 'Produce':
        return <Apple className="w-4 h-4" />;
      case 'Bakery & Bread':
        return <Wheat className="w-4 h-4" />;
      case 'Dairy & Eggs':
        return <Milk className="w-4 h-4" />;
      case 'Beverages':
        return <Coffee className="w-4 h-4" />;
      case 'Packaged & Canned Goods':
        return <Package className="w-4 h-4" />;
      default:
        return <ShoppingBag className="w-4 h-4" />;
    }
  };

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 space-y-6">
      {/* Top Banner & Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-2xl sm:text-3xl font-extrabold text-stone-900 tracking-tight">
              Browse Food Surplus Listings
            </h1>
            <span className="bg-emerald-100 text-emerald-800 text-xs font-bold px-2.5 py-0.5 rounded-full">
              Live Network
            </span>
          </div>
          <p className="text-xs sm:text-sm text-stone-500 mt-1">
            Real-time surplus listings ready for immediate claim and distribution by verified volunteers and NGOs.
          </p>
        </div>

        <div className="flex items-center gap-3">
          {/* View mode toggle */}
          <div className="flex items-center bg-stone-100 p-1 rounded-xl border border-stone-200">
            <button
              onClick={() => setViewMode('grid')}
              className={`px-3 py-1.5 rounded-lg text-xs font-semibold flex items-center gap-1.5 transition-all cursor-pointer ${
                viewMode === 'grid'
                  ? 'bg-white text-emerald-800 shadow-2xs'
                  : 'text-stone-500 hover:text-stone-800'
              }`}
            >
              <Layers className="w-3.5 h-3.5" />
              Grid View
            </button>
            <button
              onClick={() => setViewMode('map')}
              className={`px-3 py-1.5 rounded-lg text-xs font-semibold flex items-center gap-1.5 transition-all cursor-pointer ${
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

      {/* Mobile Filters Toggle Button & Search Row */}
      <div className="flex items-center gap-3 lg:hidden">
        <div className="relative flex-1">
          <Search className="w-4 h-4 text-stone-400 absolute left-3.5 top-3" />
          <input
            type="text"
            placeholder="Search food, location, donor..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="w-full pl-10 pr-4 py-2.5 rounded-xl border border-stone-200 bg-white text-xs focus:border-emerald-500 outline-hidden font-medium"
          />
          {searchTerm && (
            <button
              onClick={() => setSearchTerm('')}
              className="absolute right-3 top-3 text-stone-400 hover:text-stone-600"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          )}
        </div>

        <button
          onClick={() => setMobileFiltersOpen(!mobileFiltersOpen)}
          className={`flex items-center gap-2 px-4 py-2.5 rounded-xl border text-xs font-bold transition-all cursor-pointer ${
            mobileFiltersOpen || hasActiveFilters
              ? 'bg-emerald-50 border-emerald-300 text-emerald-900'
              : 'bg-white border-stone-200 text-stone-700 hover:bg-stone-50'
          }`}
        >
          <SlidersHorizontal className="w-4 h-4 text-emerald-700" />
          <span>Filters</span>
          {activeFiltersCount > 0 && (
            <span className="w-5 h-5 rounded-full bg-emerald-600 text-white text-[10px] font-bold flex items-center justify-center">
              {activeFiltersCount}
            </span>
          )}
          {mobileFiltersOpen ? (
            <ChevronUp className="w-3.5 h-3.5 text-stone-400" />
          ) : (
            <ChevronDown className="w-3.5 h-3.5 text-stone-400" />
          )}
        </button>
      </div>

      {/* Main Layout: Responsive Sidebar + Content Area */}
      <div className="flex flex-col lg:flex-row gap-8 items-start">
        {/* ========================================================= */}
        {/* FILTERING SIDEBAR                                         */}
        {/* ========================================================= */}
        <aside
          className={`w-full lg:w-72 xl:w-80 shrink-0 space-y-6 ${
            mobileFiltersOpen ? 'block' : 'hidden lg:block'
          }`}
        >
          <div className="bg-white rounded-3xl border border-stone-200 p-5 shadow-sm space-y-6">
            {/* Sidebar Header */}
            <div className="flex items-center justify-between pb-4 border-b border-stone-100">
              <div className="flex items-center gap-2">
                <div className="p-1.5 rounded-lg bg-emerald-50 text-emerald-700">
                  <Filter className="w-4 h-4" />
                </div>
                <h2 className="text-sm font-bold text-stone-900 tracking-tight">Filter Surplus</h2>
                {activeFiltersCount > 0 && (
                  <span className="bg-emerald-100 text-emerald-800 text-[10px] font-bold px-2 py-0.5 rounded-full">
                    {activeFiltersCount} active
                  </span>
                )}
              </div>

              {hasActiveFilters && (
                <button
                  onClick={handleResetFilters}
                  className="text-stone-400 hover:text-emerald-700 text-xs font-semibold flex items-center gap-1 transition-colors cursor-pointer"
                  title="Reset all filters"
                >
                  <RotateCcw className="w-3 h-3" />
                  <span>Reset</span>
                </button>
              )}
            </div>

            {/* 1. Category Filter */}
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <span className="text-xs font-bold text-stone-700 uppercase tracking-wider">
                  Food Category
                </span>
                <span className="text-[11px] text-stone-400">
                  {selectedCategory === 'All Categories' ? 'All' : selectedCategory}
                </span>
              </div>

              <div className="space-y-1 max-h-56 overflow-y-auto pr-1">
                {CATEGORIES.map((cat) => {
                  const isSelected = selectedCategory === cat;
                  const count = categoryCounts[cat] || 0;
                  return (
                    <button
                      key={cat}
                      type="button"
                      onClick={() => setSelectedCategory(cat)}
                      className={`w-full flex items-center justify-between px-3 py-2 rounded-xl text-xs font-medium transition-all text-left cursor-pointer ${
                        isSelected
                          ? 'bg-emerald-50 text-emerald-900 font-bold border border-emerald-200 shadow-2xs'
                          : 'text-stone-600 hover:bg-stone-50 border border-transparent'
                      }`}
                    >
                      <div className="flex items-center gap-2.5 truncate">
                        <span
                          className={`${
                            isSelected ? 'text-emerald-700' : 'text-stone-400'
                          }`}
                        >
                          {getCategoryIcon(cat)}
                        </span>
                        <span className="truncate">{cat}</span>
                      </div>
                      <span
                        className={`text-[10px] px-1.5 py-0.5 rounded-full ml-1 ${
                          isSelected
                            ? 'bg-emerald-200/80 text-emerald-950 font-extrabold'
                            : 'bg-stone-100 text-stone-500'
                        }`}
                      >
                        {count}
                      </span>
                    </button>
                  );
                })}
              </div>
            </div>

            {/* 2. Pickup Urgency Filter */}
            <div className="space-y-3 pt-4 border-t border-stone-100">
              <div className="flex items-center justify-between">
                <span className="text-xs font-bold text-stone-700 uppercase tracking-wider flex items-center gap-1.5">
                  <Flame className="w-3.5 h-3.5 text-orange-500" />
                  Pickup Urgency
                </span>
              </div>

              <div className="grid grid-cols-1 gap-1.5">
                {[
                  {
                    id: 'all' as UrgencyFilter,
                    label: 'All Urgencies',
                    desc: 'Any pickup window',
                    icon: Clock,
                    count: urgencyCounts.all,
                    color: 'text-stone-600',
                  },
                  {
                    id: 'urgent' as UrgencyFilter,
                    label: 'Urgent (< 2 hours)',
                    desc: 'Expiring very soon',
                    icon: Flame,
                    count: urgencyCounts.urgent,
                    color: 'text-rose-600',
                  },
                  {
                    id: 'pending' as UrgencyFilter,
                    label: 'Pickup Today (< 12 hours)',
                    desc: 'Pending action today',
                    icon: Clock,
                    count: urgencyCounts.pending,
                    color: 'text-amber-600',
                  },
                  {
                    id: 'flexible' as UrgencyFilter,
                    label: 'Flexible Window (> 12 hours)',
                    desc: 'Scheduled or tomorrow',
                    icon: Calendar,
                    count: urgencyCounts.flexible,
                    color: 'text-emerald-600',
                  },
                ].map((urg) => {
                  const isSelected = urgencyFilter === urg.id;
                  const Icon = urg.icon;
                  return (
                    <button
                      key={urg.id}
                      type="button"
                      onClick={() => setUrgencyFilter(urg.id)}
                      className={`w-full flex items-center justify-between px-3 py-2 rounded-xl text-xs font-medium transition-all text-left cursor-pointer ${
                        isSelected
                          ? 'bg-emerald-50 text-emerald-900 font-bold border border-emerald-200 shadow-2xs'
                          : 'text-stone-600 hover:bg-stone-50 border border-transparent'
                      }`}
                    >
                      <div className="flex items-center gap-2">
                        <Icon className={`w-3.5 h-3.5 ${urg.color}`} />
                        <div>
                          <div className="font-semibold">{urg.label}</div>
                          <div className="text-[10px] text-stone-400 font-normal">
                            {urg.desc}
                          </div>
                        </div>
                      </div>
                      <span
                        className={`text-[10px] px-1.5 py-0.5 rounded-full ml-1 ${
                          isSelected
                            ? 'bg-emerald-200/80 text-emerald-950 font-extrabold'
                            : 'bg-stone-100 text-stone-500'
                        }`}
                      >
                        {urg.count}
                      </span>
                    </button>
                  );
                })}
              </div>
            </div>

            {/* 3. Distance Range Filter */}
            <div className="space-y-3 pt-4 border-t border-stone-100">
              <div className="flex items-center justify-between">
                <span className="text-xs font-bold text-stone-700 uppercase tracking-wider flex items-center gap-1.5">
                  <Navigation className="w-3.5 h-3.5 text-emerald-600" />
                  Distance Radius
                </span>
                <span className="text-xs font-extrabold text-emerald-700">
                  {distanceRadius === 'all' ? 'Any Distance' : `≤ ${distanceRadius} km`}
                </span>
              </div>

              {/* Quick Distance Presets */}
              <div className="grid grid-cols-4 gap-1.5">
                {[
                  { label: 'Any', value: 'all' as DistanceRange },
                  { label: '5 km', value: 5 as DistanceRange },
                  { label: '10 km', value: 10 as DistanceRange },
                  { label: '25 km', value: 25 as DistanceRange },
                ].map((d) => (
                  <button
                    key={d.label}
                    type="button"
                    onClick={() => setDistanceRadius(d.value)}
                    className={`py-1.5 text-center rounded-lg text-xs font-medium transition-all cursor-pointer ${
                      distanceRadius === d.value
                        ? 'bg-emerald-700 text-white font-bold shadow-2xs'
                        : 'bg-stone-100 text-stone-600 hover:bg-stone-200'
                    }`}
                  >
                    {d.label}
                  </button>
                ))}
              </div>

              {/* Proximity Slider */}
              <div className="space-y-1 pt-1">
                <input
                  type="range"
                  min="5"
                  max="50"
                  step="5"
                  value={distanceRadius === 'all' ? 50 : distanceRadius}
                  onChange={(e) => {
                    const val = Number(e.target.value);
                    setDistanceRadius(val >= 50 ? 'all' : (val as DistanceRange));
                  }}
                  className="w-full accent-emerald-600 h-1.5 bg-stone-200 rounded-lg cursor-pointer"
                />
                <div className="flex justify-between text-[10px] text-stone-400 font-medium">
                  <span>5 km</span>
                  <span>25 km</span>
                  <span>50+ km (All)</span>
                </div>
              </div>

              {/* Location Status & GPS Detector */}
              <div className="bg-stone-50 p-2.5 rounded-2xl border border-stone-200/70 text-xs space-y-2">
                <div className="flex items-center justify-between">
                  <span className="text-[10px] font-semibold text-stone-500 uppercase tracking-wider flex items-center gap-1">
                    <MapPin className="w-3 h-3 text-stone-400" />
                    Reference Location:
                  </span>
                  <button
                    type="button"
                    onClick={handleRequestLocation}
                    disabled={gpsLoading}
                    className="text-[11px] font-bold text-emerald-700 hover:text-emerald-900 flex items-center gap-1 cursor-pointer"
                  >
                    <LocateFixed className="w-3 h-3" />
                    {gpsLoading ? 'Detecting...' : 'Use My GPS'}
                  </button>
                </div>

                {activeLocation ? (
                  <div className="text-[11px] text-emerald-800 bg-emerald-50 px-2.5 py-1.5 rounded-xl border border-emerald-200/60 font-medium flex items-center justify-between">
                    <span className="truncate">
                      📍 {activeLocation.lat.toFixed(4)}, {activeLocation.lng.toFixed(4)}
                    </span>
                    <span className="text-[10px] text-emerald-600 font-semibold ml-1 shrink-0">
                      Active
                    </span>
                  </div>
                ) : (
                  <div className="text-[11px] text-stone-500">
                    <div className="text-[10px] text-stone-400 mb-1">
                      Choose reference city hub:
                    </div>
                    <div className="flex flex-wrap gap-1">
                      {REFERENCE_CITIES.map((city) => (
                        <button
                          key={city.name}
                          type="button"
                          onClick={() =>
                            setCustomLocation({
                              lat: city.lat,
                              lng: city.lng,
                              accuracy: 100,
                              timestamp: Date.now(),
                            })
                          }
                          className="px-2 py-0.5 rounded-md text-[10px] bg-white border border-stone-200 text-stone-600 hover:border-emerald-500 hover:text-emerald-800 font-medium cursor-pointer"
                        >
                          {city.name}
                        </button>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            </div>

            {/* 4. Status & Storage Filter */}
            <div className="space-y-3 pt-4 border-t border-stone-100">
              <div className="flex items-center justify-between">
                <span className="text-xs font-bold text-stone-700 uppercase tracking-wider flex items-center gap-1.5">
                  <Thermometer className="w-3.5 h-3.5 text-stone-500" />
                  Storage & Status
                </span>
              </div>

              {/* Status Selector */}
              <div className="grid grid-cols-2 gap-1.5">
                <button
                  type="button"
                  onClick={() => setStatusFilter('available')}
                  className={`py-1.5 px-2 rounded-xl text-xs font-semibold text-center transition-all cursor-pointer ${
                    statusFilter === 'available'
                      ? 'bg-emerald-100 text-emerald-900 border border-emerald-300'
                      : 'bg-stone-50 text-stone-600 border border-stone-200'
                  }`}
                >
                  Available Only
                </button>
                <button
                  type="button"
                  onClick={() => setStatusFilter('all')}
                  className={`py-1.5 px-2 rounded-xl text-xs font-semibold text-center transition-all cursor-pointer ${
                    statusFilter === 'all'
                      ? 'bg-stone-800 text-white shadow-2xs'
                      : 'bg-stone-50 text-stone-600 border border-stone-200'
                  }`}
                >
                  All Statuses
                </button>
              </div>

              {/* Storage Types */}
              <div className="flex flex-wrap gap-1 pt-1">
                {[
                  { label: 'All Storage', value: 'all' },
                  { label: 'Ambient', value: 'ambient' },
                  { label: 'Refrigerated', value: 'refrigerated' },
                  { label: 'Frozen', value: 'frozen' },
                  { label: 'Hot / Warm', value: 'hot' },
                ].map((st) => (
                  <button
                    key={st.value}
                    type="button"
                    onClick={() => setStorageFilter(st.value)}
                    className={`px-2.5 py-1 rounded-lg text-[11px] font-medium transition-all cursor-pointer ${
                      storageFilter === st.value
                        ? 'bg-emerald-600 text-white font-bold'
                        : 'bg-stone-100 text-stone-600 hover:bg-stone-200'
                    }`}
                  >
                    {st.label}
                  </button>
                ))}
              </div>
            </div>
          </div>
        </aside>

        {/* ========================================================= */}
        {/* MAIN CONTENT AREA: Search, Chips, Grid / Map              */}
        {/* ========================================================= */}
        <main className="flex-1 min-w-0 space-y-5 w-full">
          {/* Desktop Search Bar & Summary */}
          <div className="bg-white p-4 rounded-3xl border border-stone-200 shadow-2xs space-y-3">
            <div className="flex flex-col sm:flex-row gap-3">
              {/* Search Bar */}
              <div className="relative flex-1">
                <Search className="w-4 h-4 text-stone-400 absolute left-3.5 top-3" />
                <input
                  type="text"
                  placeholder="Search by food name, description, address, or donor..."
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  className="w-full pl-10 pr-10 py-2 rounded-xl border border-stone-200 text-xs focus:border-emerald-500 outline-hidden font-medium"
                />
                {searchTerm && (
                  <button
                    onClick={() => setSearchTerm('')}
                    className="absolute right-3 top-2.5 text-stone-400 hover:text-stone-600 cursor-pointer"
                  >
                    <X className="w-3.5 h-3.5" />
                  </button>
                )}
              </div>

              {/* Proximity / GPS badge */}
              <div className="flex items-center gap-2">
                {activeLocation ? (
                  <span className="text-[11px] text-emerald-800 bg-emerald-50 border border-emerald-200 px-3 py-1.5 rounded-xl font-medium flex items-center gap-1.5 shrink-0">
                    <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
                    Proximity Active
                  </span>
                ) : (
                  <button
                    type="button"
                    onClick={handleRequestLocation}
                    className="text-[11px] text-stone-600 hover:text-emerald-700 bg-stone-50 border border-stone-200 px-3 py-1.5 rounded-xl font-medium flex items-center gap-1.5 shrink-0 cursor-pointer"
                  >
                    <Navigation className="w-3.5 h-3.5" />
                    Enable Proximity
                  </button>
                )}
              </div>
            </div>

            {/* Active Filter Chips */}
            {hasActiveFilters && (
              <div className="flex flex-wrap items-center gap-2 pt-2 border-t border-stone-100 text-xs">
                <span className="text-stone-400 text-[11px] font-semibold uppercase tracking-wider">
                  Active Filters:
                </span>

                {selectedCategory !== 'All Categories' && (
                  <span className="inline-flex items-center gap-1 bg-emerald-100 text-emerald-900 px-2.5 py-1 rounded-full font-medium text-xs">
                    Category: {selectedCategory}
                    <button
                      onClick={() => setSelectedCategory('All Categories')}
                      className="hover:text-emerald-700 cursor-pointer"
                    >
                      <X className="w-3 h-3" />
                    </button>
                  </span>
                )}

                {urgencyFilter !== 'all' && (
                  <span className="inline-flex items-center gap-1 bg-amber-100 text-amber-900 px-2.5 py-1 rounded-full font-medium text-xs">
                    Urgency:{' '}
                    {urgencyFilter === 'urgent'
                      ? '< 2 hrs'
                      : urgencyFilter === 'pending'
                      ? 'Today (< 12 hrs)'
                      : 'Flexible'}
                    <button
                      onClick={() => setUrgencyFilter('all')}
                      className="hover:text-amber-700 cursor-pointer"
                    >
                      <X className="w-3 h-3" />
                    </button>
                  </span>
                )}

                {distanceRadius !== 'all' && (
                  <span className="inline-flex items-center gap-1 bg-blue-100 text-blue-900 px-2.5 py-1 rounded-full font-medium text-xs">
                    Distance: ≤ {distanceRadius} km
                    <button
                      onClick={() => setDistanceRadius('all')}
                      className="hover:text-blue-700 cursor-pointer"
                    >
                      <X className="w-3 h-3" />
                    </button>
                  </span>
                )}

                {statusFilter !== 'available' && (
                  <span className="inline-flex items-center gap-1 bg-stone-200 text-stone-800 px-2.5 py-1 rounded-full font-medium text-xs">
                    All Statuses
                    <button
                      onClick={() => setStatusFilter('available')}
                      className="hover:text-stone-900 cursor-pointer"
                    >
                      <X className="w-3 h-3" />
                    </button>
                  </span>
                )}

                {storageFilter !== 'all' && (
                  <span className="inline-flex items-center gap-1 bg-stone-100 text-stone-700 px-2.5 py-1 rounded-full font-medium text-xs">
                    Storage: {storageFilter}
                    <button
                      onClick={() => setStorageFilter('all')}
                      className="hover:text-stone-900 cursor-pointer"
                    >
                      <X className="w-3 h-3" />
                    </button>
                  </span>
                )}

                {searchTerm.trim() && (
                  <span className="inline-flex items-center gap-1 bg-stone-100 text-stone-800 px-2.5 py-1 rounded-full font-medium text-xs">
                    "{searchTerm}"
                    <button
                      onClick={() => setSearchTerm('')}
                      className="hover:text-stone-900 cursor-pointer"
                    >
                      <X className="w-3 h-3" />
                    </button>
                  </span>
                )}

                <button
                  onClick={handleResetFilters}
                  className="text-emerald-700 hover:text-emerald-900 font-bold text-xs underline cursor-pointer ml-1"
                >
                  Clear All
                </button>
              </div>
            )}

            {/* Results Count Summary */}
            <div className="flex items-center justify-between text-xs text-stone-500 pt-1">
              <span>
                Showing <strong className="text-stone-800">{filteredDonations.length}</strong>{' '}
                {filteredDonations.length === 1 ? 'surplus donation' : 'surplus donations'}
                {donations.length > 0 && ` (of ${donations.length} total)`}
              </span>

              {viewMode === 'map' && (
                <span className="flex items-center gap-2 text-[11px]">
                  <span className="inline-block w-2 h-2 rounded-full bg-emerald-600" /> Available
                  <span className="inline-block w-2 h-2 rounded-full bg-orange-500 ml-1.5" /> Claimed
                </span>
              )}
            </div>
          </div>

          {/* View Mode: Map View vs Grid Cards */}
          {viewMode === 'map' ? (
            <div className="bg-white p-4 rounded-3xl border border-stone-200 shadow-sm space-y-3">
              <GoogleRescueMap
                donations={filteredDonations}
                height="580px"
                onSelectDonation={onSelectDonation}
                onLocationUpdate={(loc) => setCustomLocation(loc)}
                showControls={true}
              />
            </div>
          ) : (
            <>
              {filteredDonations.length === 0 ? (
                <div className="bg-white p-12 text-center rounded-3xl border border-stone-200 space-y-3 shadow-2xs">
                  <div className="text-4xl">🔍</div>
                  <h3 className="text-base font-bold text-stone-800">
                    No matching surplus listings found
                  </h3>
                  <p className="text-xs text-stone-500 max-w-sm mx-auto">
                    Try loosening your sidebar filters, increasing the distance radius, or clearing search keywords.
                  </p>
                  <button
                    onClick={handleResetFilters}
                    className="text-xs font-bold text-emerald-700 hover:text-emerald-900 underline cursor-pointer"
                  >
                    Reset All Filters
                  </button>
                </div>
              ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-5">
                  {filteredDonations.map((item) => {
                    const pickupInfo = getPickupWindowInfo(item);
                    const distanceKm =
                      activeLocation && item.latitude && item.longitude
                        ? calculateDistanceKm(
                            activeLocation.lat,
                            activeLocation.lng,
                            item.latitude,
                            item.longitude
                          )
                        : null;

                    return (
                      <div
                        key={item.id}
                        onClick={() => onSelectDonation(item)}
                        className="bg-white rounded-3xl border border-stone-200/90 p-5 shadow-2xs hover:shadow-md transition-all cursor-pointer flex flex-col justify-between group space-y-4 hover:border-emerald-300"
                      >
                        <div className="space-y-3">
                          {/* Top Badges */}
                          <div className="flex items-start justify-between gap-2">
                            <span className="text-[11px] font-bold text-emerald-800 bg-emerald-50 px-2.5 py-1 rounded-full uppercase flex items-center gap-1.5">
                              {getCategoryIcon(item.category)}
                              {item.category}
                            </span>

                            <div className="flex items-center gap-1.5">
                              {pickupInfo.isUrgent && (
                                <span className="text-[10px] font-extrabold uppercase tracking-wider px-2 py-0.5 rounded-md bg-rose-100 text-rose-800 flex items-center gap-1">
                                  <Flame className="w-3 h-3 text-rose-600" />
                                  Urgent
                                </span>
                              )}
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
                          </div>

                          {/* Food Title & Description */}
                          <div>
                            <h3 className="font-bold text-stone-900 group-hover:text-emerald-700 transition-colors line-clamp-1 text-base">
                              {item.foodName}
                            </h3>
                            <p className="text-xs text-stone-500 line-clamp-2 mt-1 leading-relaxed">
                              {item.description ||
                                'Surplus edible food ready for authorized NGO / Volunteer pickup.'}
                            </p>
                          </div>

                          {/* Key Specs Card */}
                          <div className="grid grid-cols-2 gap-2 text-xs bg-stone-50 p-2.5 rounded-2xl text-stone-600 border border-stone-100">
                            <div>
                              <span className="text-[10px] text-stone-400 block font-medium">Quantity</span>
                              <span className="font-bold text-stone-900">
                                {item.quantity} {item.unit}
                              </span>
                            </div>
                            <div>
                              <span className="text-[10px] text-stone-400 block font-medium">Pickup Window</span>
                              <span
                                className={`font-bold truncate block ${
                                  pickupInfo.isUrgent
                                    ? 'text-rose-600'
                                    : pickupInfo.isPending
                                    ? 'text-amber-700'
                                    : 'text-stone-700'
                                }`}
                              >
                                {pickupInfo.label}
                              </span>
                            </div>
                          </div>

                          {/* Distance indicator when location available */}
                          {distanceKm !== null && (
                            <div className="flex items-center gap-1 text-[11px] text-emerald-700 font-semibold bg-emerald-50/70 px-2.5 py-1 rounded-xl">
                              <Navigation className="w-3 h-3 shrink-0" />
                              <span>{distanceKm.toFixed(1)} km away from reference point</span>
                            </div>
                          )}
                        </div>

                        {/* Card Footer */}
                        <div className="pt-3 border-t border-stone-100 flex items-center justify-between text-xs text-stone-500">
                          <span className="flex items-center gap-1 line-clamp-1 max-w-[170px]">
                            <MapPin className="w-3.5 h-3.5 text-stone-400 shrink-0" />
                            {item.pickupAddress}
                          </span>
                          <span className="font-bold text-emerald-700 group-hover:translate-x-0.5 transition-transform">
                            View Details →
                          </span>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </>
          )}
        </main>
      </div>
    </div>
  );
};
