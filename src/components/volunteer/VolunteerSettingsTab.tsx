import React from 'react';
import {
  Bike,
  Car,
  Truck,
  Navigation,
  Loader2,
  BellRing,
  Check,
  AlertCircle,
  Bell,
  Send,
  Copy,
  CheckCircle2,
} from 'lucide-react';
import { UserProfile } from '../../types';

export interface VolunteerSettingsTabProps {
  isAvailable: boolean;
  setIsAvailable: (val: boolean) => void;
  radiusKm: number;
  setRadiusKm: (val: number) => void;
  vehicleType: string;
  setVehicleType: (val: string) => void;
  handleDetectLocation: () => void;
  gpsDetecting: boolean;
  volunteerCoords: { lat: number; lng: number } | null;
  optInNotifs: boolean;
  setOptInNotifs: (val: boolean) => void;
  fcmEnabled: boolean;
  fcmPermission: NotificationPermission;
  fcmLoading: boolean;
  handleTogglePushNotifications: () => void;
  testingFcm: boolean;
  handleTestPushNotification: () => void;
  fcmToken: string | null;
  copiedToken: boolean;
  handleCopyFcmToken: () => void;
  savingSettings: boolean;
  handleSaveSettings: () => void;
  userProfile: UserProfile | null;
  handleActivateVolunteerRole: () => void;
}

export const VolunteerSettingsTab: React.FC<VolunteerSettingsTabProps> = ({
  isAvailable,
  setIsAvailable,
  radiusKm,
  setRadiusKm,
  vehicleType,
  setVehicleType,
  handleDetectLocation,
  gpsDetecting,
  volunteerCoords,
  optInNotifs,
  setOptInNotifs,
  fcmEnabled,
  fcmPermission,
  fcmLoading,
  handleTogglePushNotifications,
  testingFcm,
  handleTestPushNotification,
  fcmToken,
  copiedToken,
  handleCopyFcmToken,
  savingSettings,
  handleSaveSettings,
  userProfile,
  handleActivateVolunteerRole,
}) => {
  return (
    <div className="max-w-3xl mx-auto bg-white rounded-3xl p-6 sm:p-8 border border-stone-200 shadow-sm space-y-6">
      <div>
        <h3 className="text-xl font-black text-stone-900">Volunteer Logistics Preferences</h3>
        <p className="text-xs text-stone-500">
          Customize your operational radius, notification alerts, and transport vehicle.
        </p>
      </div>

      <div className="space-y-6 pt-4 border-t border-stone-100">
        {/* Availability Duty Switch */}
        <div className="flex items-center justify-between p-4 rounded-2xl bg-stone-50 border border-stone-200">
          <div>
            <div className="font-bold text-sm text-stone-900">On-Duty Availability</div>
            <div className="text-xs text-stone-500">
              When enabled, you appear on nearby donors' radars and receive collection requests.
            </div>
          </div>
          <button
            onClick={() => setIsAvailable(!isAvailable)}
            className={`relative inline-flex h-6 w-11 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-hidden ${
              isAvailable ? 'bg-emerald-600' : 'bg-stone-300'
            }`}
          >
            <span
              className={`pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow-sm ring-0 transition duration-200 ease-in-out ${
                isAvailable ? 'translate-x-5' : 'translate-x-0'
              }`}
            />
          </button>
        </div>

        {/* Notification Radius Slider */}
        <div className="p-4 rounded-2xl bg-stone-50 border border-stone-200 space-y-3">
          <div className="flex items-center justify-between">
            <div>
              <div className="font-bold text-sm text-stone-900">Collection Notification Radius</div>
              <div className="text-xs text-stone-500">
                Only receive surplus food alerts within this radius from your base location.
              </div>
            </div>
            <div className="text-lg font-black text-emerald-700 bg-white px-3 py-1 rounded-xl border border-emerald-200">
              {radiusKm} km
            </div>
          </div>
          <input
            type="range"
            min="1"
            max="30"
            step="1"
            value={radiusKm}
            onChange={(e) => setRadiusKm(Number(e.target.value))}
            className="w-full accent-emerald-600 cursor-pointer"
          />
          <div className="flex justify-between text-[11px] text-stone-400 font-bold">
            <span>1 km (Local neighborhood)</span>
            <span>10 km (Recommended default)</span>
            <span>30 km (Metropolitan)</span>
          </div>
        </div>

        {/* Vehicle Type */}
        <div className="p-4 rounded-2xl bg-stone-50 border border-stone-200 space-y-3">
          <div className="font-bold text-sm text-stone-900">Transport Vehicle</div>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5">
            {[
              { type: 'Bicycle', icon: Bike },
              { type: 'Two Wheeler', icon: Bike },
              { type: 'Car', icon: Car },
              { type: 'Van / EV', icon: Truck },
            ].map((v) => (
              <button
                key={v.type}
                onClick={() => setVehicleType(v.type)}
                className={`p-3 rounded-xl border text-xs font-bold flex flex-col items-center gap-1.5 transition-all cursor-pointer ${
                  vehicleType === v.type
                    ? 'bg-emerald-600 text-white border-emerald-600 shadow-xs'
                    : 'bg-white text-stone-700 border-stone-200 hover:bg-stone-100'
                }`}
              >
                <v.icon className="w-5 h-5" />
                <span>{v.type}</span>
              </button>
            ))}
          </div>
        </div>

        {/* Base Coordinates & Auto Detect */}
        <div className="p-4 rounded-2xl bg-stone-50 border border-stone-200 space-y-3">
          <div className="flex items-center justify-between">
            <div>
              <div className="font-bold text-sm text-stone-900">Base Location Coordinates</div>
              <div className="text-xs text-stone-500">
                Used to calculate proximity to nearby donor pickups.
              </div>
            </div>
            <button
              onClick={handleDetectLocation}
              disabled={gpsDetecting}
              className="bg-white hover:bg-emerald-50 text-emerald-700 border border-emerald-200 px-3 py-1.5 rounded-xl text-xs font-bold flex items-center gap-1.5 transition-colors cursor-pointer disabled:opacity-50"
            >
              {gpsDetecting ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Navigation className="w-3.5 h-3.5" />}
              <span>Auto-detect via GPS</span>
            </button>
          </div>

          {volunteerCoords && (
            <div className="text-xs text-stone-600 font-mono bg-white p-2.5 rounded-xl border border-stone-200">
              Lat: {volunteerCoords.lat.toFixed(4)}, Lng: {volunteerCoords.lng.toFixed(4)}
            </div>
          )}
        </div>

        {/* Notification Opt-in Switch */}
        <div className="flex items-center justify-between p-4 rounded-2xl bg-stone-50 border border-stone-200">
          <div>
            <div className="font-bold text-sm text-stone-900">Receive In-App Food Rescue Alerts</div>
            <div className="text-xs text-stone-500">
              Get instant real-time sound and banner alerts when donors post surplus food.
            </div>
          </div>
          <button
            onClick={() => setOptInNotifs(!optInNotifs)}
            className={`relative inline-flex h-6 w-11 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-hidden ${
              optInNotifs ? 'bg-emerald-600' : 'bg-stone-300'
            }`}
          >
            <span
              className={`pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow-sm ring-0 transition duration-200 ease-in-out ${
                optInNotifs ? 'translate-x-5' : 'translate-x-0'
              }`}
            />
          </button>
        </div>

        {/* DEDICATED SECTION: Firebase Cloud Messaging Browser Push Notifications */}
        <div className="p-5 rounded-2xl bg-gradient-to-br from-emerald-50/70 to-teal-50/70 border border-emerald-200 space-y-4">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div className="flex items-start gap-3">
              <div className="w-10 h-10 rounded-xl bg-emerald-600 text-white flex items-center justify-center shrink-0 shadow-xs">
                <BellRing className="w-5 h-5" />
              </div>
              <div>
                <div className="flex items-center gap-2">
                  <h4 className="font-bold text-sm text-stone-900">Browser Push Notifications</h4>
                  <span className="text-[10px] uppercase font-black px-2 py-0.5 rounded-full bg-emerald-700 text-white tracking-wider">
                    FCM Web Push
                  </span>
                </div>
                <p className="text-xs text-stone-600 mt-0.5">
                  Receive immediate desktop and mobile lock-screen alerts whenever new donations are submitted within {radiusKm} km of your base.
                </p>
              </div>
            </div>

            <div className="shrink-0">
              {fcmEnabled && fcmPermission === 'granted' ? (
                <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-bold bg-emerald-100 text-emerald-800 border border-emerald-200">
                  <Check className="w-3.5 h-3.5 text-emerald-600" />
                  <span>Active & Subscribed</span>
                </span>
              ) : fcmPermission === 'denied' ? (
                <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-bold bg-rose-100 text-rose-800 border border-rose-200">
                  <AlertCircle className="w-3.5 h-3.5 text-rose-600" />
                  <span>Blocked in Browser</span>
                </span>
              ) : (
                <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-bold bg-stone-100 text-stone-600 border border-stone-200">
                  <span>Not Enabled</span>
                </span>
              )}
            </div>
          </div>

          {/* Action Buttons & Test Trigger */}
          <div className="flex flex-wrap items-center gap-2.5 pt-2 border-t border-emerald-100">
            <button
              onClick={handleTogglePushNotifications}
              disabled={fcmLoading}
              className={`px-4 py-2.5 rounded-xl font-bold text-xs transition-colors flex items-center gap-2 cursor-pointer disabled:opacity-50 ${
                fcmEnabled
                  ? 'bg-stone-200 hover:bg-stone-300 text-stone-800'
                  : 'bg-emerald-600 hover:bg-emerald-700 text-white shadow-xs'
              }`}
            >
              {fcmLoading ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : (
                <Bell className="w-4 h-4" />
              )}
              <span>{fcmEnabled ? 'Pause Push Notifications' : 'Enable Browser Push Notifications'}</span>
            </button>

            <button
              onClick={handleTestPushNotification}
              disabled={testingFcm}
              className="bg-white hover:bg-stone-50 text-stone-700 border border-stone-200 px-4 py-2.5 rounded-xl font-bold text-xs transition-colors flex items-center gap-2 cursor-pointer disabled:opacity-50"
            >
              {testingFcm ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : (
                <Send className="w-4 h-4 text-emerald-600" />
              )}
              <span>Send Test Push Alert</span>
            </button>
          </div>

          {/* FCM Device Token & Status Diagnostics */}
          <div className="pt-2 text-[11px] text-stone-500 space-y-1.5">
            <div className="flex items-center justify-between">
              <span>Service Worker Handler:</span>
              <span className="font-mono text-emerald-800 font-semibold">/firebase-messaging-sw.js</span>
            </div>
            {fcmToken && (
              <div className="flex items-center justify-between bg-white/80 p-2 rounded-xl border border-emerald-100">
                <span className="truncate max-w-[280px] font-mono text-[10px] text-stone-600">
                  FCM Token: {fcmToken.slice(0, 24)}...{fcmToken.slice(-12)}
                </span>
                <button
                  onClick={handleCopyFcmToken}
                  className="text-emerald-700 font-bold hover:text-emerald-850 flex items-center gap-1 cursor-pointer ml-2 shrink-0"
                >
                  {copiedToken ? (
                    <>
                      <Check className="w-3.5 h-3.5 text-emerald-600" />
                      <span>Copied</span>
                    </>
                  ) : (
                    <>
                      <Copy className="w-3.5 h-3.5" />
                      <span>Copy Token</span>
                    </>
                  )}
                </button>
              </div>
            )}
          </div>
        </div>

        {/* Save Button */}
        <button
          onClick={handleSaveSettings}
          disabled={savingSettings}
          className="w-full bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-sm py-3.5 rounded-2xl shadow-sm transition-colors flex items-center justify-center gap-2 cursor-pointer disabled:opacity-50"
        >
          {savingSettings ? <Loader2 className="w-4 h-4 animate-spin" /> : <CheckCircle2 className="w-4 h-4" />}
          <span>Save Logistics Preferences</span>
        </button>
      </div>
    </div>
  );
};
