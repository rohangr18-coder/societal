import React from 'react';
import {
  Bike,
  Sparkles,
  UserCheck,
  MapPin,
  Navigation,
  Bell,
} from 'lucide-react';

export interface VolunteerStatsHeaderProps {
  showRoleBanner: boolean;
  userRole?: string;
  isAvailable: boolean;
  radiusKm: number;
  vehicleType: string;
  optInNotifs: boolean;
  unreadNotifCount: number;
  activeCount: number;
  completedCount: number;
  totalMealsDelivered: number;
  onActivateRole: () => void;
  onOpenNotifications: () => void;
  children?: React.ReactNode;
}

export const VolunteerStatsHeader: React.FC<VolunteerStatsHeaderProps> = ({
  showRoleBanner,
  userRole,
  isAvailable,
  radiusKm,
  vehicleType,
  optInNotifs,
  unreadNotifCount,
  activeCount,
  completedCount,
  totalMealsDelivered,
  onActivateRole,
  onOpenNotifications,
  children,
}) => {
  return (
    <>
      {/* Role Activation Banner if user is not currently in volunteer mode */}
      {showRoleBanner && (
        <div className="mb-8 p-6 bg-gradient-to-r from-emerald-900 via-teal-900 to-stone-900 rounded-3xl text-white shadow-xl flex flex-col md:flex-row items-start md:items-center justify-between gap-6">
          <div className="space-y-2 max-w-2xl">
            <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-emerald-500/20 text-emerald-300 text-xs font-bold uppercase tracking-wider">
              <Sparkles className="w-3.5 h-3.5" />
              <span>Join the Food Rescue Fleet</span>
            </div>
            <h2 className="text-xl sm:text-2xl font-black tracking-tight">
              Collect Donated Food & Feed Your Community
            </h2>
            <p className="text-stone-300 text-xs sm:text-sm leading-relaxed">
              You are currently signed in as a <span className="font-bold text-white capitalize">{userRole || 'Guest'}</span>.
              Switch to the <span className="text-emerald-400 font-bold">Volunteer Courier</span> role to accept surplus food pickups,
              track collections with live GPS, and deliver meals to partner shelters.
            </p>
          </div>
          <button
            onClick={onActivateRole}
            className="bg-emerald-500 hover:bg-emerald-400 text-stone-950 font-black text-sm px-6 py-3 rounded-2xl shadow-lg transition-transform hover:scale-105 shrink-0 flex items-center gap-2 cursor-pointer"
          >
            <UserCheck className="w-5 h-5" />
            <span>Enable Volunteer Courier Mode</span>
          </button>
        </div>
      )}

      {/* Hero Volunteer Command Center Header */}
      <div className="bg-white rounded-3xl p-6 sm:p-8 border border-emerald-100 shadow-sm mb-8">
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-6">
          <div className="space-y-3">
            <div className="flex items-center gap-3">
              <div className="w-12 h-12 rounded-2xl bg-gradient-to-br from-emerald-600 to-teal-700 text-white flex items-center justify-center shadow-md">
                <Bike className="w-6 h-6" />
              </div>
              <div>
                <h1 className="text-2xl sm:text-3xl font-black text-stone-900 tracking-tight flex items-center gap-2">
                  Volunteer Rescue Center
                  {isAvailable ? (
                    <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-bold bg-emerald-100 text-emerald-800">
                      <span className="w-2 h-2 rounded-full bg-emerald-600 animate-pulse"></span>
                      On-Duty
                    </span>
                  ) : (
                    <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-bold bg-stone-200 text-stone-700">
                      Off-Duty
                    </span>
                  )}
                </h1>
                <p className="text-xs sm:text-sm text-stone-500">
                  Accept nearby surplus donations, navigate routes, and deliver nutrition directly to hungry families.
                </p>
              </div>
            </div>

            {/* Quick telemetry pills */}
            <div className="flex flex-wrap items-center gap-2.5 text-xs text-stone-600 pt-1">
              <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-xl bg-stone-100 font-semibold">
                <MapPin className="w-3.5 h-3.5 text-emerald-600" />
                <span>Base Radius: {radiusKm} km</span>
              </span>
              <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-xl bg-stone-100 font-semibold">
                <Navigation className="w-3.5 h-3.5 text-blue-600" />
                <span>Vehicle: {vehicleType}</span>
              </span>
              <button
                onClick={onOpenNotifications}
                className="inline-flex items-center gap-1.5 px-3 py-1 rounded-xl bg-stone-100 hover:bg-stone-200 text-stone-700 font-semibold cursor-pointer transition-colors"
                title="Open Recent Notifications Slide-over"
              >
                <Bell className={`w-3.5 h-3.5 ${unreadNotifCount > 0 ? 'text-emerald-600' : 'text-amber-600'}`} />
                <span>Alerts: {optInNotifs ? 'Active' : 'Muted'}</span>
                {unreadNotifCount > 0 && (
                  <span className="px-1.5 py-0.2 rounded-full text-[10px] font-black bg-emerald-600 text-white">
                    {unreadNotifCount}
                  </span>
                )}
              </button>
            </div>
          </div>

          {/* Quick Stats Grid */}
          <div className="grid grid-cols-3 gap-3 sm:gap-4 shrink-0">
            <div className="p-4 rounded-2xl bg-emerald-50/70 border border-emerald-100 text-center">
              <div className="text-2xl sm:text-3xl font-black text-emerald-800">
                {activeCount}
              </div>
              <div className="text-[11px] font-bold text-emerald-700 uppercase tracking-wider mt-0.5">
                Active Run
              </div>
            </div>
            <div className="p-4 rounded-2xl bg-teal-50/70 border border-teal-100 text-center">
              <div className="text-2xl sm:text-3xl font-black text-teal-800">
                {completedCount}
              </div>
              <div className="text-[11px] font-bold text-teal-700 uppercase tracking-wider mt-0.5">
                Completed
              </div>
            </div>
            <div className="p-4 rounded-2xl bg-amber-50/70 border border-amber-100 text-center">
              <div className="text-2xl sm:text-3xl font-black text-amber-800">
                {totalMealsDelivered}
              </div>
              <div className="text-[11px] font-bold text-amber-700 uppercase tracking-wider mt-0.5">
                Meals Saved
              </div>
            </div>
          </div>
        </div>

        {children && (
          <div className="mt-8 pt-6 border-t border-stone-100 flex flex-wrap items-center gap-2">
            {children}
          </div>
        )}
      </div>
    </>
  );
};
