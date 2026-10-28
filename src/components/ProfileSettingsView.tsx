import React, { useState } from 'react';
import {
  User,
  Mail,
  Shield,
  Phone,
  Building2,
  Bike,
  Utensils,
  LogOut,
  Save,
  CheckCircle2,
} from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { UserRole } from '../types';
import { createOrUpdateUserProfile } from '../services/dbService';

export const ProfileSettingsView: React.FC = () => {
  const { currentUser, userProfile, logout, refreshProfile, isAdmin } = useAuth();

  const [displayName, setDisplayName] = useState(userProfile?.displayName || '');
  const [phoneNumber, setPhoneNumber] = useState(userProfile?.phoneNumber || '');
  const [role, setRole] = useState<UserRole>(userProfile?.role || 'donor');
  const [saving, setSaving] = useState(false);
  const [savedMessage, setSavedMessage] = useState(false);

  if (!currentUser) return null;

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    setSavedMessage(false);
    try {
      await createOrUpdateUserProfile({
        uid: currentUser.uid,
        email: currentUser.email || '',
        displayName: displayName.trim(),
        phoneNumber: phoneNumber.trim(),
        role: isAdmin ? 'admin' : role,
      });
      await refreshProfile();
      setSavedMessage(true);
      setTimeout(() => setSavedMessage(false), 2500);
    } catch (err: any) {
      alert(`Error updating profile: ${err.message}`);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="max-w-2xl mx-auto px-4 sm:px-6 lg:px-8 py-10 space-y-8">
      <div className="space-y-1">
        <h1 className="text-2xl font-extrabold text-stone-900">User Profile & Account Settings</h1>
        <p className="text-xs sm:text-sm text-stone-500">
          Manage your account information, notification telephone, and network role.
        </p>
      </div>

      <div className="bg-white rounded-3xl border border-stone-200 shadow-2xs p-6 sm:p-8 space-y-6">
        {/* User Card */}
        <div className="flex items-center gap-4 pb-6 border-b border-stone-100">
          <div className="w-16 h-16 rounded-2xl bg-emerald-100 text-emerald-800 flex items-center justify-center font-extrabold text-2xl uppercase border-2 border-emerald-200">
            {userProfile?.displayName ? userProfile.displayName.charAt(0) : 'U'}
          </div>
          <div>
            <h2 className="text-lg font-bold text-stone-900">{userProfile?.displayName}</h2>
            <p className="text-xs text-stone-500 flex items-center gap-1.5 mt-0.5">
              <Mail className="w-3.5 h-3.5" />
              {currentUser.email}
            </p>
            <div className="inline-flex items-center gap-1.5 mt-2 px-2.5 py-0.5 rounded-full bg-emerald-50 text-emerald-800 text-[11px] font-bold uppercase tracking-wider">
              <Shield className="w-3.5 h-3.5 text-emerald-600" />
              Role: {userProfile?.role || 'Member'}
            </div>
          </div>
        </div>

        {savedMessage && (
          <div className="p-3 bg-emerald-50 border border-emerald-200 rounded-xl text-emerald-800 text-xs flex items-center gap-2">
            <CheckCircle2 className="w-4 h-4 shrink-0" />
            <span>Profile details saved successfully!</span>
          </div>
        )}

        <form onSubmit={handleSave} className="space-y-4 text-xs">
          <div>
            <label className="font-semibold text-stone-700 block mb-1">Display Name</label>
            <input
              type="text"
              required
              value={displayName}
              onChange={(e) => setDisplayName(e.target.value)}
              className="w-full px-3.5 py-2.5 rounded-xl border border-stone-200 focus:border-emerald-500 outline-hidden font-medium"
            />
          </div>

          <div>
            <label className="font-semibold text-stone-700 block mb-1">Mobile Contact Phone</label>
            <input
              type="tel"
              placeholder="+91 98765 43210"
              value={phoneNumber}
              onChange={(e) => setPhoneNumber(e.target.value)}
              className="w-full px-3.5 py-2.5 rounded-xl border border-stone-200 focus:border-emerald-500 outline-hidden"
            />
            <span className="text-[11px] text-stone-400 mt-1 block">
              Shared only with verified couriers when completing an active pickup.
            </span>
          </div>

          {!isAdmin && (
            <div>
              <label className="font-semibold text-stone-700 block mb-2">Switch Active Role</label>
              <div className="grid grid-cols-3 gap-3">
                <button
                  type="button"
                  onClick={() => setRole('donor')}
                  className={`p-3 rounded-xl border text-center transition-all cursor-pointer ${
                    role === 'donor'
                      ? 'border-emerald-600 bg-emerald-50 text-emerald-950 font-bold'
                      : 'border-stone-200 text-stone-600'
                  }`}
                >
                  <Utensils className="w-4 h-4 mx-auto text-emerald-600 mb-1" />
                  <span className="block text-[11px]">Food Donor</span>
                </button>

                <button
                  type="button"
                  onClick={() => setRole('ngo')}
                  className={`p-3 rounded-xl border text-center transition-all cursor-pointer ${
                    role === 'ngo'
                      ? 'border-orange-600 bg-orange-50 text-orange-950 font-bold'
                      : 'border-stone-200 text-stone-600'
                  }`}
                >
                  <Building2 className="w-4 h-4 mx-auto text-orange-600 mb-1" />
                  <span className="block text-[11px]">NGO / Shelter</span>
                </button>

                <button
                  type="button"
                  onClick={() => setRole('volunteer')}
                  className={`p-3 rounded-xl border text-center transition-all cursor-pointer ${
                    role === 'volunteer'
                      ? 'border-blue-600 bg-blue-50 text-blue-950 font-bold'
                      : 'border-stone-200 text-stone-600'
                  }`}
                >
                  <Bike className="w-4 h-4 mx-auto text-blue-600 mb-1" />
                  <span className="block text-[11px]">Volunteer</span>
                </button>
              </div>
            </div>
          )}

          <div className="flex items-center justify-between pt-4 border-t border-stone-100">
            <button
              type="button"
              onClick={logout}
              className="text-red-600 hover:text-red-700 font-semibold flex items-center gap-1.5 cursor-pointer"
            >
              <LogOut className="w-4 h-4" />
              Sign Out
            </button>

            <button
              type="submit"
              disabled={saving}
              className="bg-emerald-600 hover:bg-emerald-700 text-white font-bold px-5 py-2.5 rounded-xl shadow-xs transition-colors flex items-center gap-2 cursor-pointer"
            >
              <Save className="w-4 h-4" />
              {saving ? 'Saving...' : 'Save Profile Changes'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
