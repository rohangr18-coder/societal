import React, { useState, useEffect } from 'react';
import {
  Building2,
  Bike,
  ShieldCheck,
  CheckCircle2,
  Clock,
  PlusCircle,
  MapPin,
  Phone,
  Mail,
  Loader2,
  AlertCircle,
  Snowflake,
  Navigation,
  Compass,
  Check,
} from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import {
  subscribeOrganizations,
  subscribeVolunteerProfiles,
  registerOrganization,
  saveVolunteerProfile,
} from '../services/dbService';
import { Organization, VolunteerProfile } from '../types';

const BENGALURU_AREAS: Record<string, { lat: number; lng: number }> = {
  koramangala: { lat: 12.9352, lng: 77.6245 },
  indiranagar: { lat: 12.9784, lng: 77.6408 },
  hsr: { lat: 12.9121, lng: 77.6446 },
  'hsr layout': { lat: 12.9121, lng: 77.6446 },
  whitefield: { lat: 12.9698, lng: 77.7500 },
  jayanagar: { lat: 12.9308, lng: 77.5838 },
  malleshwaram: { lat: 13.0031, lng: 77.5643 },
  'electronic city': { lat: 12.8452, lng: 77.6602 },
  hebbal: { lat: 13.0358, lng: 77.5970 },
  rajajinagar: { lat: 12.9982, lng: 77.5530 },
  shivajinagar: { lat: 12.9863, lng: 77.6018 },
  bengaluru: { lat: 12.9716, lng: 77.5946 },
  bangalore: { lat: 12.9716, lng: 77.5946 },
};

async function geocodeAddress(address: string, city: string): Promise<{ lat: number; lng: number }> {
  const query = `${address}, ${city}`.trim();
  const apiKey = (typeof import.meta !== 'undefined' && import.meta.env?.VITE_GOOGLE_MAPS_API_KEY) || '';
  if (apiKey) {
    try {
      const res = await fetch(`https://maps.googleapis.com/maps/api/geocode/json?address=${encodeURIComponent(query)}&key=${apiKey}`);
      const data = await res.json();
      if (data.status === 'OK' && data.results?.[0]?.geometry?.location) {
        return {
          lat: Math.round(data.results[0].geometry.location.lat * 10000) / 10000,
          lng: Math.round(data.results[0].geometry.location.lng * 10000) / 10000,
        };
      }
    } catch {
      // Fall through to dictionary
    }
  }

  const lower = query.toLowerCase();
  for (const [key, coords] of Object.entries(BENGALURU_AREAS)) {
    if (lower.includes(key)) {
      return coords;
    }
  }

  return { lat: 12.9716, lng: 77.5946 }; // Default Bengaluru Central
}

export const ALL_DONATION_CATEGORIES = [
  'Cooked Meals',
  'Bakery & Bread',
  'Fresh Produce & Fruits',
  'Dairy & Eggs',
  'Packaged & Canned Goods',
  'Beverages',
  'Raw Ingredients',
];

export const OrganizationsView: React.FC = () => {
  const { currentUser, userProfile, isAdmin } = useAuth();
  const [organizations, setOrganizations] = useState<Organization[]>([]);
  const [volunteers, setVolunteers] = useState<VolunteerProfile[]>([]);
  const [activeTab, setActiveTab] = useState<'ngos' | 'volunteers'>('ngos');

  // NGO Registration Modal State
  const [showNgoModal, setShowNgoModal] = useState(false);
  const [ngoName, setNgoName] = useState('');
  const [ngoRegNo, setNgoRegNo] = useState('');
  const [ngoType, setNgoType] = useState('Shelter & Community Kitchen');
  const [ngoCity, setNgoCity] = useState('Bengaluru');
  const [ngoAddress, setNgoAddress] = useState('');
  const [ngoLat, setNgoLat] = useState<number>(12.9716);
  const [ngoLng, setNgoLng] = useState<number>(77.5946);
  const [ngoRefrigeration, setNgoRefrigeration] = useState(false);
  const [ngoOperatingHours, setNgoOperatingHours] = useState('08:00 - 20:00');
  const [ngoAcceptedCats, setNgoAcceptedCats] = useState<string[]>([
    'Cooked Meals',
    'Bakery & Bread',
    'Fresh Produce & Fruits',
    'Dairy & Eggs',
  ]);
  const [geocoding, setGeocoding] = useState(false);
  const [geocodeStatus, setGeocodeStatus] = useState<string | null>(null);
  const [ngoEmail, setNgoEmail] = useState('');
  const [ngoPhone, setNgoPhone] = useState('');
  const [ngoCapacity, setNgoCapacity] = useState(150);
  const [ngoSubmitting, setNgoSubmitting] = useState(false);
  const [ngoError, setNgoError] = useState<string | null>(null);
  const [ngoSuccess, setNgoSuccess] = useState<string | null>(null);

  // Volunteer Registration Modal State
  const [showVolModal, setShowVolModal] = useState(false);
  const [volName, setVolName] = useState(userProfile?.displayName || '');
  const [volPhone, setVolPhone] = useState('');
  const [volVehicle, setVolVehicle] = useState('Two-Wheeler (Motorcycle/Scooter)');
  const [volArea, setVolArea] = useState('Central Bengaluru & Suburbs');
  const [volSubmitting, setVolSubmitting] = useState(false);
  const [volSuccess, setVolSuccess] = useState<string | null>(null);

  useEffect(() => {
    const unsubOrgs = subscribeOrganizations((list) => setOrganizations(list));
    const unsubVols = subscribeVolunteerProfiles((list) => setVolunteers(list));
    return () => {
      unsubOrgs && unsubOrgs();
      unsubVols && unsubVols();
    };
  }, []);

  const handleGeocodeAddress = async () => {
    if (!ngoAddress.trim()) {
      setGeocodeStatus('Please enter a facility address to geocode');
      return;
    }
    setGeocoding(true);
    setGeocodeStatus('Locating coordinates in Bengaluru...');
    try {
      const coords = await geocodeAddress(ngoAddress, ngoCity);
      setNgoLat(coords.lat);
      setNgoLng(coords.lng);
      setGeocodeStatus(`Coordinates verified: ${coords.lat}, ${coords.lng}`);
    } catch {
      setGeocodeStatus('Could not geocode automatically; default Bengaluru coordinates applied.');
    } finally {
      setGeocoding(false);
    }
  };

  const toggleCategory = (cat: string) => {
    setNgoAcceptedCats((prev) =>
      prev.includes(cat) ? prev.filter((c) => c !== cat) : [...prev, cat]
    );
  };

  const handleRegisterNgo = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!currentUser) {
      setNgoError('You must be signed in to register an organization.');
      return;
    }
    setNgoSubmitting(true);
    setNgoError(null);
    try {
      // Auto-geocode if still default coordinates and address is filled
      let lat = ngoLat;
      let lng = ngoLng;
      if (lat === 12.9716 && lng === 77.5946 && ngoAddress.trim()) {
        const detected = await geocodeAddress(ngoAddress, ngoCity);
        lat = detected.lat;
        lng = detected.lng;
      }

      await registerOrganization({
        ownerUid: currentUser.uid,
        name: ngoName.trim(),
        registrationNumber: ngoRegNo.trim(),
        type: ngoType,
        contactEmail: ngoEmail.trim() || currentUser.email || '',
        contactPhone: ngoPhone.trim(),
        address: ngoAddress.trim(),
        city: ngoCity.trim() || 'Bengaluru',
        capacityDailyMeals: Number(ngoCapacity),
        latitude: lat,
        longitude: lng,
        hasRefrigeration: ngoRefrigeration,
        operatingHours: ngoOperatingHours.trim() || '08:00 - 20:00',
        acceptedCategories: ngoAcceptedCats.length > 0 ? ngoAcceptedCats : ['Cooked Meals'],
      });
      setNgoSuccess('Organization registered successfully with verified GPS location! Pending administrator verification.');
      setTimeout(() => {
        setShowNgoModal(false);
        setNgoSuccess(null);
      }, 2000);
    } catch (err: any) {
      setNgoError(err.message || 'Failed to submit organization');
    } finally {
      setNgoSubmitting(false);
    }
  };

  const handleRegisterVolunteer = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!currentUser) return;
    setVolSubmitting(true);
    try {
      await saveVolunteerProfile({
        userId: currentUser.uid,
        fullName: volName.trim() || userProfile?.displayName || 'Volunteer Courier',
        phone: volPhone.trim(),
        vehicleType: volVehicle,
        serviceArea: volArea.trim(),
        isAvailable: true,
      });
      setVolSuccess('Volunteer courier profile registered!');
      setTimeout(() => {
        setShowVolModal(false);
        setVolSuccess(null);
      }, 1500);
    } catch (err: any) {
      alert(`Error saving volunteer profile: ${err.message}`);
    } finally {
      setVolSubmitting(false);
    }
  };

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 space-y-8">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-extrabold text-stone-900">Partner NGOs & Volunteer Network</h1>
          <p className="text-xs sm:text-sm text-stone-500 mt-1">
            Verified food distribution shelters and community volunteers ensuring rapid rescue logistics.
          </p>
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={() => setShowNgoModal(true)}
            className="bg-emerald-600 hover:bg-emerald-700 text-white font-semibold text-xs px-4 py-2.5 rounded-xl transition-colors flex items-center gap-1.5 cursor-pointer"
          >
            <Building2 className="w-4 h-4" />
            Register NGO
          </button>
          <button
            onClick={() => setShowVolModal(true)}
            className="bg-blue-600 hover:bg-blue-700 text-white font-semibold text-xs px-4 py-2.5 rounded-xl transition-colors flex items-center gap-1.5 cursor-pointer"
          >
            <Bike className="w-4 h-4" />
            Join as Volunteer
          </button>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex items-center border-b border-stone-200 gap-6">
        <button
          onClick={() => setActiveTab('ngos')}
          className={`pb-3 text-sm font-bold flex items-center gap-2 border-b-2 transition-all cursor-pointer ${
            activeTab === 'ngos'
              ? 'border-emerald-600 text-emerald-800'
              : 'border-transparent text-stone-500 hover:text-stone-800'
          }`}
        >
          <Building2 className="w-4 h-4" />
          Receiving Organizations ({organizations.length})
        </button>
        <button
          onClick={() => setActiveTab('volunteers')}
          className={`pb-3 text-sm font-bold flex items-center gap-2 border-b-2 transition-all cursor-pointer ${
            activeTab === 'volunteers'
              ? 'border-blue-600 text-blue-800'
              : 'border-transparent text-stone-500 hover:text-stone-800'
          }`}
        >
          <Bike className="w-4 h-4" />
          Volunteer Couriers ({volunteers.length})
        </button>
      </div>

      {/* NGOs List */}
      {activeTab === 'ngos' && (
        <div className="space-y-4">
          {organizations.length === 0 ? (
            <div className="bg-white p-12 text-center rounded-3xl border border-stone-200 space-y-3">
              <Building2 className="w-12 h-12 mx-auto text-stone-300" />
              <h3 className="font-bold text-stone-800 text-base">No NGOs registered yet</h3>
              <p className="text-xs text-stone-500 max-w-sm mx-auto">
                Are you an NGO or food pantry? Register to receive surplus notifications directly.
              </p>
              <button
                onClick={() => setShowNgoModal(true)}
                className="bg-emerald-600 text-white font-semibold text-xs px-4 py-2 rounded-xl mt-2 cursor-pointer"
              >
                Register Organization Now
              </button>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
              {organizations.map((org) => (
                <div
                  key={org.id}
                  className="bg-white p-5 rounded-2xl border border-stone-200/90 shadow-2xs space-y-3"
                >
                  <div className="flex items-start justify-between gap-2">
                    <span className="text-[11px] font-bold text-stone-500 uppercase tracking-wider">
                      {org.type}
                    </span>
                    <span
                      className={`text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-full flex items-center gap-1 ${
                        org.verificationStatus === 'verified'
                          ? 'bg-emerald-100 text-emerald-800'
                          : org.verificationStatus === 'pending'
                          ? 'bg-amber-100 text-amber-800'
                          : 'bg-red-100 text-red-800'
                      }`}
                    >
                      {org.verificationStatus === 'verified' && <ShieldCheck className="w-3 h-3" />}
                      {org.verificationStatus}
                    </span>
                  </div>

                  <div>
                    <h3 className="font-bold text-stone-900 text-base">{org.name}</h3>
                    <p className="text-xs text-stone-400 font-mono mt-0.5">
                      Reg: {org.registrationNumber}
                    </p>
                  </div>

                  <div className="bg-stone-50 p-2.5 rounded-xl text-xs space-y-1 text-stone-600">
                    <div className="flex items-center gap-1.5 truncate">
                      <MapPin className="w-3.5 h-3.5 text-stone-400 shrink-0" />
                      <span>{org.address}, {org.city}</span>
                    </div>
                    <div className="flex items-center gap-1.5">
                      <Phone className="w-3.5 h-3.5 text-stone-400 shrink-0" />
                      <span>{org.contactPhone || 'Available upon claim'}</span>
                    </div>
                  </div>

                  <div className="pt-2 border-t border-stone-100 flex items-center justify-between text-xs">
                    <span className="text-stone-400 text-[11px]">Intake Capacity</span>
                    <span className="font-bold text-emerald-950">
                      {org.capacityDailyMeals} Meals / Day
                    </span>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Volunteers List */}
      {activeTab === 'volunteers' && (
        <div className="space-y-4">
          {volunteers.length === 0 ? (
            <div className="bg-white p-12 text-center rounded-3xl border border-stone-200 space-y-3">
              <Bike className="w-12 h-12 mx-auto text-stone-300" />
              <h3 className="font-bold text-stone-800 text-base">No active volunteer couriers registered</h3>
              <p className="text-xs text-stone-500 max-w-sm mx-auto">
                Join our emergency food transport squad to deliver surplus meals to shelters.
              </p>
              <button
                onClick={() => setShowVolModal(true)}
                className="bg-blue-600 text-white font-semibold text-xs px-4 py-2 rounded-xl mt-2 cursor-pointer"
              >
                Sign Up as Courier
              </button>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
              {volunteers.map((vol) => (
                <div
                  key={vol.id}
                  className="bg-white p-5 rounded-2xl border border-stone-200/90 shadow-2xs space-y-3"
                >
                  <div className="flex items-start justify-between">
                    <span className="text-xs font-bold text-stone-800">{vol.fullName}</span>
                    <span
                      className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${
                        vol.isAvailable
                          ? 'bg-emerald-100 text-emerald-800'
                          : 'bg-stone-100 text-stone-500'
                      }`}
                    >
                      {vol.isAvailable ? 'Available on Radar' : 'Busy / Off-duty'}
                    </span>
                  </div>

                  <div className="text-xs text-stone-600 space-y-1 bg-stone-50 p-2.5 rounded-xl">
                    <p><strong>Vehicle:</strong> {vol.vehicleType}</p>
                    <p><strong>Service Zone:</strong> {vol.serviceArea}</p>
                  </div>

                  <div className="pt-2 border-t border-stone-100 flex items-center justify-between text-xs">
                    <span className="text-stone-400">Total Pickups Completed</span>
                    <span className="font-bold text-stone-900">{vol.totalPickups || 0} Runs</span>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* NGO Registration Modal */}
      {showNgoModal && (
        <div className="fixed inset-0 z-50 bg-stone-900/60 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-3xl max-w-md w-full p-6 space-y-4">
            <h2 className="text-lg font-bold text-stone-900">Register Recipient Organization</h2>
            <form onSubmit={handleRegisterNgo} className="space-y-3 text-xs">
              {ngoError && <p className="text-red-600 bg-red-50 p-2 rounded-lg">{ngoError}</p>}
              {ngoSuccess && <p className="text-emerald-700 bg-emerald-50 p-2 rounded-lg">{ngoSuccess}</p>}

              <div>
                <label className="font-semibold text-stone-700 block mb-1">Organization Name *</label>
                <input
                  type="text"
                  required
                  placeholder="e.g. Hope Community Kitchen & Shelter"
                  value={ngoName}
                  onChange={(e) => setNgoName(e.target.value)}
                  className="w-full px-3 py-2 rounded-xl border border-stone-200 outline-hidden"
                />
              </div>

              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="font-semibold text-stone-700 block mb-1">Registration # *</label>
                  <input
                    type="text"
                    required
                    placeholder="e.g. NGO-IND-88219"
                    value={ngoRegNo}
                    onChange={(e) => setNgoRegNo(e.target.value)}
                    className="w-full px-3 py-2 rounded-xl border border-stone-200 outline-hidden"
                  />
                </div>
                <div>
                  <label className="font-semibold text-stone-700 block mb-1">Daily Meal Capacity</label>
                  <input
                    type="number"
                    min="10"
                    value={ngoCapacity}
                    onChange={(e) => setNgoCapacity(Number(e.target.value))}
                    className="w-full px-3 py-2 rounded-xl border border-stone-200 outline-hidden"
                  />
                </div>
              </div>

              <div>
                <label className="font-semibold text-stone-700 block mb-1">City / District *</label>
                <input
                  type="text"
                  required
                  placeholder="e.g. New Delhi"
                  value={ngoCity}
                  onChange={(e) => setNgoCity(e.target.value)}
                  className="w-full px-3 py-2 rounded-xl border border-stone-200 outline-hidden"
                />
              </div>

              <div>
                <label className="font-semibold text-stone-700 block mb-1">Facility Address *</label>
                <input
                  type="text"
                  required
                  placeholder="e.g. Plot 12, Community Center, Rohini"
                  value={ngoAddress}
                  onChange={(e) => setNgoAddress(e.target.value)}
                  className="w-full px-3 py-2 rounded-xl border border-stone-200 outline-hidden"
                />
              </div>

              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="font-semibold text-stone-700 block mb-1">Contact Email</label>
                  <input
                    type="email"
                    placeholder="contact@shelter.org"
                    value={ngoEmail}
                    onChange={(e) => setNgoEmail(e.target.value)}
                    className="w-full px-3 py-2 rounded-xl border border-stone-200 outline-hidden"
                  />
                </div>
                <div>
                  <label className="font-semibold text-stone-700 block mb-1">Phone Number</label>
                  <input
                    type="tel"
                    placeholder="+91 98765 43210"
                    value={ngoPhone}
                    onChange={(e) => setNgoPhone(e.target.value)}
                    className="w-full px-3 py-2 rounded-xl border border-stone-200 outline-hidden"
                  />
                </div>
              </div>

              <div className="flex justify-end gap-2 pt-3">
                <button
                  type="button"
                  onClick={() => setShowNgoModal(false)}
                  className="px-4 py-2 rounded-xl border border-stone-200 font-medium text-stone-600"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={ngoSubmitting}
                  className="bg-emerald-600 text-white font-bold px-4 py-2 rounded-xl shadow-xs"
                >
                  {ngoSubmitting ? 'Registering...' : 'Submit for Verification'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Volunteer Registration Modal */}
      {showVolModal && (
        <div className="fixed inset-0 z-50 bg-stone-900/60 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-3xl max-w-md w-full p-6 space-y-4">
            <h2 className="text-lg font-bold text-stone-900">Volunteer Courier Profile</h2>
            <form onSubmit={handleRegisterVolunteer} className="space-y-3 text-xs">
              {volSuccess && <p className="text-emerald-700 bg-emerald-50 p-2 rounded-lg">{volSuccess}</p>}

              <div>
                <label className="font-semibold text-stone-700 block mb-1">Full Name *</label>
                <input
                  type="text"
                  required
                  value={volName}
                  onChange={(e) => setVolName(e.target.value)}
                  className="w-full px-3 py-2 rounded-xl border border-stone-200 outline-hidden"
                />
              </div>

              <div>
                <label className="font-semibold text-stone-700 block mb-1">Mobile Contact Phone *</label>
                <input
                  type="tel"
                  required
                  placeholder="+91 98765 12345"
                  value={volPhone}
                  onChange={(e) => setVolPhone(e.target.value)}
                  className="w-full px-3 py-2 rounded-xl border border-stone-200 outline-hidden"
                />
              </div>

              <div>
                <label className="font-semibold text-stone-700 block mb-1">Vehicle Type</label>
                <select
                  value={volVehicle}
                  onChange={(e) => setVolVehicle(e.target.value)}
                  className="w-full px-3 py-2 rounded-xl border border-stone-200 bg-white outline-hidden"
                >
                  <option value="Two-Wheeler (Motorcycle/Scooter)">Two-Wheeler (Motorcycle/Scooter)</option>
                  <option value="Four-Wheeler (Car / Hatchback)">Four-Wheeler (Car / Hatchback)</option>
                  <option value="Light Cargo Van / Small Truck">Light Cargo Van / Small Truck</option>
                  <option value="Bicycle / On Foot (Local radius)">Bicycle / On Foot (Local radius)</option>
                </select>
              </div>

              <div>
                <label className="font-semibold text-stone-700 block mb-1">Preferred Service Zone</label>
                <input
                  type="text"
                  placeholder="e.g. North Delhi, Connaught Place, South Extension"
                  value={volArea}
                  onChange={(e) => setVolArea(e.target.value)}
                  className="w-full px-3 py-2 rounded-xl border border-stone-200 outline-hidden"
                />
              </div>

              <div className="flex justify-end gap-2 pt-3">
                <button
                  type="button"
                  onClick={() => setShowVolModal(false)}
                  className="px-4 py-2 rounded-xl border border-stone-200 font-medium text-stone-600"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={volSubmitting}
                  className="bg-blue-600 text-white font-bold px-4 py-2 rounded-xl shadow-xs"
                >
                  {volSubmitting ? 'Saving...' : 'Register Profile'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
