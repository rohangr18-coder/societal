import React, { useState } from 'react';
import {
  X,
  Sparkles,
  MapPin,
  Clock,
  Package,
  AlertCircle,
  Thermometer,
  ShieldAlert,
  CheckCircle2,
  Loader2,
  Navigation,
  Calendar,
  Globe,
} from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { createDonation } from '../services/dbService';
import { GoogleRescueMap } from './GoogleRescueMap';

interface CreateDonationModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess: () => void;
}

const CATEGORIES = [
  'Cooked Meals',
  'Bakery & Bread',
  'Fresh Produce & Fruits',
  'Dairy & Eggs',
  'Packaged & Canned Goods',
  'Beverages',
  'Raw Ingredients',
];

const STORAGE_TYPES = [
  'Refrigerated (0-4°C)',
  'Hot Holding (> 60°C)',
  'Room Temperature (Dry)',
  'Frozen (< -18°C)',
];

const PACKAGING_OPTIONS = [
  'Sealed food-grade containers',
  'Aluminium foil trays / wraps',
  'Crates / Boxes with breathable cover',
  'Original sealed commercial packaging',
  'Zip-locked sanitized bags',
];

export const CreateDonationModal: React.FC<CreateDonationModalProps> = ({ isOpen, onClose, onSuccess }) => {
  const { currentUser, userProfile } = useAuth();

  const todayStr = new Date().toISOString().split('T')[0];

  const [foodName, setFoodName] = useState('');
  const [category, setCategory] = useState(CATEGORIES[0]);
  const [description, setDescription] = useState('');
  const [quantity, setQuantity] = useState<number>(10);
  const [unit, setUnit] = useState('servings');
  const [servings, setServings] = useState<number>(10);
  const [prepTime, setPrepTime] = useState('');
  
  // Dedicated Pickup Schedule states
  const [pickupDate, setPickupDate] = useState(todayStr);
  const [availableFrom, setAvailableFrom] = useState('11:00');
  const [availableUntil, setAvailableUntil] = useState('16:00');
  const [collectionDeadline, setCollectionDeadline] = useState('15:00');
  const [preferredPickupTime, setPreferredPickupTime] = useState('');
  const [timeZone] = useState('Asia/Kolkata');
  const [pickupDeadline, setPickupDeadline] = useState('');

  const [pickupAddress, setPickupAddress] = useState('');
  const [latitude, setLatitude] = useState(28.6139);
  const [longitude, setLongitude] = useState(77.2090);
  const [storageType, setStorageType] = useState(STORAGE_TYPES[0]);
  const [packaging, setPackaging] = useState(PACKAGING_OPTIONS[0]);
  const [allergens, setAllergens] = useState('');
  const [imageUrl, setImageUrl] = useState('');

  const [showMapPicker, setShowMapPicker] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [aiLoading, setAiLoading] = useState(false);
  const [aiSuggestion, setAiSuggestion] = useState<any>(null);
  const [error, setError] = useState<string | null>(null);

  if (!isOpen) return null;

  // AI Category & Storage Suggestion using server-side Gemini API
  const handleAiSuggest = async () => {
    if (!foodName.trim()) {
      setError('Please enter a Food Title first to get AI category and packaging suggestions.');
      return;
    }

    setAiLoading(true);
    setError(null);

    try {
      const res = await fetch('/api/gemini/suggest-category', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ foodName, description }),
      });

      const data = await res.json();
      if (data.suggestions) {
        setAiSuggestion(data.suggestions);
      }
    } catch (err: any) {
      console.error('AI suggest error:', err);
      setError('Could not connect to AI suggestion service. You can select options manually.');
    } finally {
      setAiLoading(false);
    }
  };

  const applyAiSuggestions = () => {
    if (!aiSuggestion) return;
    if (aiSuggestion.category && CATEGORIES.includes(aiSuggestion.category)) {
      setCategory(aiSuggestion.category);
    }
    if (aiSuggestion.storageType) {
      setStorageType(aiSuggestion.storageType);
    }
    if (aiSuggestion.packaging) {
      setPackaging(aiSuggestion.packaging);
    }
    if (aiSuggestion.commonAllergens) {
      setAllergens(aiSuggestion.commonAllergens);
    }
    setAiSuggestion(null);
  };

  // Browser GPS detection with high accuracy
  const handleDetectLocation = () => {
    if (!('geolocation' in navigator)) {
      setError('Geolocation is not supported by your browser.');
      return;
    }
    setAiLoading(true);
    setError(null);
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setAiLoading(false);
        const lat = pos.coords.latitude;
        const lng = pos.coords.longitude;
        const acc = Math.round(pos.coords.accuracy);
        setLatitude(lat);
        setLongitude(lng);
        setShowMapPicker(true);
        if (!pickupAddress || pickupAddress.startsWith('GPS:')) {
          setPickupAddress(`GPS Position (±${acc}m): ${lat.toFixed(5)}, ${lng.toFixed(5)}`);
        }
      },
      (err) => {
        setAiLoading(false);
        let msg = 'Location access failed. Please select your location on the map or enter address manually.';
        if (err.code === err.PERMISSION_DENIED) {
          msg = 'Location permission denied by browser. Please enter your address or click on the Google Map.';
        } else if (err.code === err.TIMEOUT) {
          msg = 'GPS location timed out. Please try again.';
        }
        setError(msg);
      },
      {
        enableHighAccuracy: true,
        timeout: 15000,
        maximumAge: 0,
      }
    );
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    if (!currentUser) {
      setError('You must be signed in to create a donation.');
      return;
    }

    if (!foodName.trim()) {
      setError('Food Title is required.');
      return;
    }

    if (quantity <= 0) {
      setError('Quantity must be greater than zero.');
      return;
    }

    // --- Strict Pickup Schedule Validation ---
    if (!pickupDate) {
      setError('Please select an available pickup date.');
      return;
    }

    if (pickupDate < todayStr) {
      setError('Pickup date cannot be in the past. Please select today or a future date.');
      return;
    }

    if (!availableFrom) {
      setError('Please specify Available From start time.');
      return;
    }

    if (!availableUntil) {
      setError('Please specify Available Until end time.');
      return;
    }

    if (availableUntil <= availableFrom) {
      setError('Available Until time must be later than Available From time.');
      return;
    }

    // If scheduled for today, verify start time hasn't already passed
    if (pickupDate === todayStr) {
      const now = new Date();
      const curHours = String(now.getHours()).padStart(2, '0');
      const curMins = String(now.getMinutes()).padStart(2, '0');
      const curTime = `${curHours}:${curMins}`;
      if (availableFrom < curTime) {
        setError(`Start time (${availableFrom}) cannot be in the past for today's pickup (current time: ${curTime}).`);
        return;
      }
    }

    const effectiveDeadline = collectionDeadline || availableUntil;
    if (effectiveDeadline < availableFrom || effectiveDeadline > availableUntil) {
      setError('Collection deadline must be within the available pickup window (between Available From and Available Until).');
      return;
    }

    if (preferredPickupTime) {
      if (preferredPickupTime < availableFrom || preferredPickupTime > availableUntil) {
        setError('Preferred pickup time must fall within the available pickup window.');
        return;
      }
    }

    if (!pickupAddress.trim()) {
      setError('Pickup address is required.');
      return;
    }

    // Normalized ISO collection deadline
    const normalizedDeadline = `${pickupDate}T${effectiveDeadline}:00`;
    const formattedDeadline = pickupDeadline.trim() || `${pickupDate} before ${effectiveDeadline} (${timeZone})`;

    setSubmitting(true);
    try {
      await createDonation({
        donorId: currentUser.uid,
        donorName: userProfile?.displayName || currentUser.displayName || 'Food Donor',
        foodName: foodName.trim(),
        category,
        description: description.trim(),
        quantity: Number(quantity),
        unit,
        servings: Number(servings) || Number(quantity),
        prepTime,
        pickupDeadline: formattedDeadline,
        pickupDate,
        availableFrom,
        availableUntil,
        collectionDeadline: normalizedDeadline,
        preferredPickupTime: preferredPickupTime || undefined,
        timeZone,
        pickupAddress: pickupAddress.trim(),
        latitude,
        longitude,
        storageType,
        packaging,
        allergens: allergens.trim(),
        imageUrl: imageUrl.trim() || 'https://images.unsplash.com/photo-1546069901-ba9599a7e63c?auto=format&fit=crop&w=600&q=80',
        status: 'available',
      });

      onSuccess();
      onClose();
    } catch (err: any) {
      console.error('Create donation error:', err);
      setError(err.message || 'Failed to submit donation. Please check your connection.');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 overflow-y-auto bg-stone-900/60 backdrop-blur-xs flex items-center justify-center p-4">
      <div className="bg-white rounded-3xl shadow-2xl max-w-2xl w-full max-h-[92vh] flex flex-col overflow-hidden animate-in fade-in zoom-in-95 duration-200">
        {/* Header */}
        <div className="px-6 py-4 border-b border-stone-100 flex items-center justify-between bg-emerald-50/50">
          <div className="flex items-center gap-2.5">
            <div className="w-10 h-10 rounded-xl bg-emerald-600 text-white flex items-center justify-center font-bold">
              🍲
            </div>
            <div>
              <h2 className="text-lg font-bold text-emerald-950">List Surplus Food Donation</h2>
              <p className="text-xs text-stone-500">Connect with verified NGOs and volunteer couriers</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-2 text-stone-400 hover:text-stone-700 hover:bg-stone-100 rounded-full transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Content Form */}
        <form onSubmit={handleSubmit} className="p-6 overflow-y-auto space-y-5 text-sm">
          {error && (
            <div className="p-3 bg-red-50 border border-red-200 rounded-xl text-red-700 text-xs flex items-start gap-2">
              <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
              <span>{error}</span>
            </div>
          )}

          {/* Food Title & AI Suggestion Button */}
          <div>
            <div className="flex items-center justify-between mb-1">
              <label className="font-semibold text-stone-800">
                Food Name / Description <span className="text-red-500">*</span>
              </label>
              <button
                type="button"
                onClick={handleAiSuggest}
                disabled={aiLoading}
                className="text-xs font-semibold text-emerald-700 hover:text-emerald-800 bg-emerald-100/70 hover:bg-emerald-100 px-2.5 py-1 rounded-lg flex items-center gap-1.5 transition-colors cursor-pointer"
              >
                {aiLoading ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Sparkles className="w-3.5 h-3.5 text-amber-500" />}
                AI Category & Storage Suggest
              </button>
            </div>
            <input
              type="text"
              required
              placeholder="e.g. 50 Pax Vegetable Biryani with Raita, Fresh Baked Rolls"
              value={foodName}
              onChange={(e) => setFoodName(e.target.value)}
              className="w-full px-3.5 py-2.5 rounded-xl border border-stone-200 focus:border-emerald-500 focus:ring-2 focus:ring-emerald-200 transition-all outline-hidden font-medium"
            />
          </div>

          {/* AI Suggestion Box */}
          {aiSuggestion && (
            <div className="p-3.5 bg-emerald-50 border border-emerald-200 rounded-2xl text-xs space-y-2 animate-in fade-in">
              <div className="flex items-center justify-between font-bold text-emerald-900">
                <span className="flex items-center gap-1.5">
                  <Sparkles className="w-4 h-4 text-amber-500" />
                  Gemini Suggestions (Review & Confirm):
                </span>
                <button
                  type="button"
                  onClick={applyAiSuggestions}
                  className="bg-emerald-700 text-white px-2.5 py-1 rounded-lg hover:bg-emerald-800 font-semibold cursor-pointer"
                >
                  Apply All Suggestions
                </button>
              </div>
              <p className="text-emerald-800 leading-relaxed">
                Category: <strong>{aiSuggestion.category}</strong> | Storage: <strong>{aiSuggestion.storageType}</strong>
              </p>
              {aiSuggestion.handlingTips && (
                <p className="text-stone-600 italic">“{aiSuggestion.handlingTips}”</p>
              )}
            </div>
          )}

          {/* Category & Unit */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="font-semibold text-stone-800 block mb-1">
                Category <span className="text-red-500">*</span>
              </label>
              <select
                value={category}
                onChange={(e) => setCategory(e.target.value)}
                className="w-full px-3 py-2.5 rounded-xl border border-stone-200 bg-white focus:border-emerald-500 focus:ring-2 focus:ring-emerald-200 outline-hidden"
              >
                {CATEGORIES.map((c) => (
                  <option key={c} value={c}>
                    {c}
                  </option>
                ))}
              </select>
            </div>

            <div className="grid grid-cols-2 gap-2">
              <div>
                <label className="font-semibold text-stone-800 block mb-1">
                  Quantity <span className="text-red-500">*</span>
                </label>
                <input
                  type="number"
                  min="1"
                  required
                  value={quantity}
                  onChange={(e) => {
                    const val = Number(e.target.value);
                    setQuantity(val);
                    if (unit === 'servings' || unit === 'meals') {
                      setServings(val);
                    }
                  }}
                  className="w-full px-3 py-2.5 rounded-xl border border-stone-200 focus:border-emerald-500 outline-hidden"
                />
              </div>

              <div>
                <label className="font-semibold text-stone-800 block mb-1">Unit</label>
                <select
                  value={unit}
                  onChange={(e) => setUnit(e.target.value)}
                  className="w-full px-3 py-2.5 rounded-xl border border-stone-200 bg-white focus:border-emerald-500 outline-hidden"
                >
                  <option value="servings">Servings (People)</option>
                  <option value="kg">Kilograms (kg)</option>
                  <option value="boxes">Boxes / Trays</option>
                  <option value="liters">Liters (L)</option>
                </select>
              </div>
            </div>
          </div>

          {/* Description */}
          <div>
            <label className="font-semibold text-stone-800 block mb-1">Detailed Description & Preparation Details</label>
            <textarea
              rows={2}
              placeholder="e.g. Prepared for lunch buffet at 1:30 PM. Kept under warmers. Fully untouched in catering trays."
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              className="w-full px-3 py-2 rounded-xl border border-stone-200 focus:border-emerald-500 outline-hidden text-xs"
            />
          </div>

          {/* DEDICATED SECTION: Accurate Pickup Schedule Selector */}
          <div className="bg-emerald-50/50 border border-emerald-200/80 rounded-2xl p-4 sm:p-5 space-y-4">
            <div className="flex flex-wrap items-center justify-between gap-2 border-b border-emerald-100 pb-3">
              <div className="flex items-center gap-2">
                <Calendar className="w-5 h-5 text-emerald-700" />
                <div>
                  <h3 className="font-bold text-emerald-950 text-sm">Pickup Schedule</h3>
                  <p className="text-[11px] text-emerald-700">Specify precise window and collection deadline for volunteers</p>
                </div>
              </div>
              <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold bg-emerald-100/80 text-emerald-900 border border-emerald-300">
                <Globe className="w-3.5 h-3.5 text-emerald-700" />
                Time Zone: {timeZone} (IST)
              </span>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              {/* Pickup Date */}
              <div>
                <label className="text-xs font-bold text-stone-700 block mb-1">
                  Available Pickup Date <span className="text-red-500">*</span>
                </label>
                <input
                  type="date"
                  min={todayStr}
                  required
                  value={pickupDate}
                  onChange={(e) => setPickupDate(e.target.value)}
                  className="w-full px-3 py-2 rounded-xl border border-stone-200 bg-white focus:border-emerald-500 outline-hidden text-xs font-semibold"
                />
              </div>

              {/* Available From */}
              <div>
                <label className="text-xs font-bold text-stone-700 block mb-1">
                  Available From (Start Time) <span className="text-red-500">*</span>
                </label>
                <input
                  type="time"
                  required
                  value={availableFrom}
                  onChange={(e) => setAvailableFrom(e.target.value)}
                  className="w-full px-3 py-2 rounded-xl border border-stone-200 bg-white focus:border-emerald-500 outline-hidden text-xs font-semibold"
                />
              </div>

              {/* Available Until */}
              <div>
                <label className="text-xs font-bold text-stone-700 block mb-1">
                  Available Until (End Time) <span className="text-red-500">*</span>
                </label>
                <input
                  type="time"
                  required
                  value={availableUntil}
                  onChange={(e) => setAvailableUntil(e.target.value)}
                  className="w-full px-3 py-2 rounded-xl border border-stone-200 bg-white focus:border-emerald-500 outline-hidden text-xs font-semibold"
                />
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-1">
              {/* Collection Deadline */}
              <div>
                <label className="text-xs font-bold text-stone-700 block mb-1 flex items-center justify-between">
                  <span>Collection Deadline <span className="text-red-500">*</span></span>
                  <span className="text-[10px] text-amber-700 font-medium">Latest pickup time</span>
                </label>
                <input
                  type="time"
                  required
                  value={collectionDeadline}
                  onChange={(e) => setCollectionDeadline(e.target.value)}
                  className="w-full px-3 py-2 rounded-xl border border-stone-200 bg-white focus:border-emerald-500 outline-hidden text-xs font-semibold"
                />
              </div>

              {/* Preferred Pickup Time (Optional) */}
              <div>
                <label className="text-xs font-bold text-stone-700 block mb-1 flex items-center justify-between">
                  <span>Preferred Pickup Time</span>
                  <span className="text-[10px] text-stone-400">Optional</span>
                </label>
                <input
                  type="time"
                  value={preferredPickupTime}
                  onChange={(e) => setPreferredPickupTime(e.target.value)}
                  placeholder="Optional"
                  className="w-full px-3 py-2 rounded-xl border border-stone-200 bg-white focus:border-emerald-500 outline-hidden text-xs"
                />
              </div>
            </div>

            {/* Preparation / Cooking Time (Optional note) */}
            <div>
              <label className="text-xs font-semibold text-stone-600 block mb-1">
                Preparation / Cooking Notes (e.g., Prepared at 1:30 PM, ready now)
              </label>
              <input
                type="text"
                placeholder="e.g. Prepared at 1:30 PM, best collected fresh"
                value={prepTime}
                onChange={(e) => setPrepTime(e.target.value)}
                className="w-full px-3 py-1.5 rounded-xl border border-stone-200 bg-white focus:border-emerald-500 outline-hidden text-xs"
              />
            </div>
          </div>

          {/* Storage & Packaging */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="font-semibold text-stone-800 block mb-1 flex items-center gap-1.5">
                <Thermometer className="w-4 h-4 text-teal-600" />
                Storage Temperature Condition
              </label>
              <select
                value={storageType}
                onChange={(e) => setStorageType(e.target.value)}
                className="w-full px-3 py-2 rounded-xl border border-stone-200 bg-white focus:border-emerald-500 outline-hidden"
              >
                {STORAGE_TYPES.map((s) => (
                  <option key={s} value={s}>{s}</option>
                ))}
              </select>
            </div>

            <div>
              <label className="font-semibold text-stone-800 block mb-1 flex items-center gap-1.5">
                <Package className="w-4 h-4 text-amber-600" />
                Packaging Format
              </label>
              <select
                value={packaging}
                onChange={(e) => setPackaging(e.target.value)}
                className="w-full px-3 py-2 rounded-xl border border-stone-200 bg-white focus:border-emerald-500 outline-hidden"
              >
                {PACKAGING_OPTIONS.map((p) => (
                  <option key={p} value={p}>{p}</option>
                ))}
              </select>
            </div>
          </div>

          {/* Allergens & Image URL */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="font-semibold text-stone-800 block mb-1 flex items-center gap-1.5">
                <ShieldAlert className="w-4 h-4 text-red-500" />
                Known Allergens / Dietary Notice
              </label>
              <input
                type="text"
                placeholder="e.g. Contains Dairy, Gluten-Free, Pure Vegetarian"
                value={allergens}
                onChange={(e) => setAllergens(e.target.value)}
                className="w-full px-3 py-2 rounded-xl border border-stone-200 focus:border-emerald-500 outline-hidden"
              />
            </div>

            <div>
              <label className="font-semibold text-stone-800 block mb-1">Food Image URL (Optional)</label>
              <input
                type="url"
                placeholder="https://..."
                value={imageUrl}
                onChange={(e) => setImageUrl(e.target.value)}
                className="w-full px-3 py-2 rounded-xl border border-stone-200 focus:border-emerald-500 outline-hidden"
              />
            </div>
          </div>

          {/* Pickup Address & Map Coordinates */}
          <div className="space-y-2 pt-2 border-t border-stone-100">
            <div className="flex items-center justify-between">
              <label className="font-semibold text-stone-800 flex items-center gap-1.5">
                <MapPin className="w-4 h-4 text-emerald-600" />
                Pickup Location & Address <span className="text-red-500">*</span>
              </label>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={handleDetectLocation}
                  className="text-xs font-semibold text-emerald-700 hover:text-emerald-800 bg-emerald-50 hover:bg-emerald-100 px-2.5 py-1 rounded-lg flex items-center gap-1 transition-colors cursor-pointer"
                >
                  <Navigation className="w-3.5 h-3.5" />
                  Use Current GPS
                </button>
                <button
                  type="button"
                  onClick={() => setShowMapPicker(!showMapPicker)}
                  className="text-xs font-semibold text-stone-600 hover:text-stone-900 bg-stone-100 px-2.5 py-1 rounded-lg cursor-pointer"
                >
                  {showMapPicker ? 'Hide Map Picker' : 'Pin on Map'}
                </button>
              </div>
            </div>

            <input
              type="text"
              required
              placeholder="e.g. Grand Orchid Hotel, Gate 3, Sector 18, Commercial Belt"
              value={pickupAddress}
              onChange={(e) => setPickupAddress(e.target.value)}
              className="w-full px-3 py-2 rounded-xl border border-stone-200 focus:border-emerald-500 outline-hidden"
            />

            {showMapPicker && (
              <div className="mt-2 space-y-2">
                <GoogleRescueMap
                  center={{ lat: latitude, lng: longitude }}
                  zoom={15}
                  height="250px"
                  pickedPosition={{ lat: latitude, lng: longitude }}
                  draggablePin={true}
                  onPickLocation={(lat, lng) => {
                    setLatitude(lat);
                    setLongitude(lng);
                  }}
                  showControls={true}
                />
                <div className="text-[11px] text-stone-500 flex justify-between px-1">
                  <span>Selected Lat: {latitude.toFixed(5)}, Lng: {longitude.toFixed(5)}</span>
                  <span>(Drag green pin or click map to reposition)</span>
                </div>
              </div>
            )}
          </div>

          {/* Quality Disclaimer Notice */}
          <div className="p-3 bg-stone-50 rounded-xl border border-stone-200 text-stone-600 text-xs flex items-start gap-2">
            <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0 mt-0.5" />
            <span>
              By submitting this listing, you confirm that this surplus food was prepared under hygienic conditions, has been kept safely, and is fit for distribution within the specified pickup deadline.
            </span>
          </div>

          {/* Actions */}
          <div className="flex items-center justify-end gap-3 pt-3 border-t border-stone-100">
            <button
              type="button"
              onClick={onClose}
              disabled={submitting}
              className="px-4 py-2.5 rounded-xl border border-stone-200 font-medium text-stone-600 hover:bg-stone-50 cursor-pointer"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={submitting}
              className="bg-emerald-600 hover:bg-emerald-700 text-white font-semibold px-6 py-2.5 rounded-xl shadow-xs transition-colors flex items-center gap-2 cursor-pointer disabled:opacity-50"
            >
              {submitting ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" />
                  Listing Donation...
                </>
              ) : (
                'Publish Food Donation'
              )}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
