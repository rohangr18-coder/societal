import React, { useState } from 'react';
import {
  Utensils,
  Building2,
  Bike,
  Clock,
  MapPin,
  CheckCircle2,
  AlertCircle,
  PlusCircle,
  ArrowRight,
  TrendingUp,
  Package,
  Calendar,
  AlertTriangle,
} from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { Donation, DonationStatus, UserRole } from '../types';
import { updateDonationStatus } from '../services/dbService';

interface DashboardViewProps {
  donations: Donation[];
  onSelectDonation: (donation: Donation) => void;
  onOpenCreate: () => void;
  onNavigate: (tab: string) => void;
}

export const DashboardView: React.FC<DashboardViewProps> = ({
  donations,
  onSelectDonation,
  onOpenCreate,
  onNavigate,
}) => {
  const { currentUser, userProfile, updateRole } = useAuth();

  // Active subtab depending on active view
  const currentRole: UserRole = userProfile?.role || 'donor';
  const [activeRoleView, setActiveRoleView] = useState<UserRole>(currentRole);
  const [actionLoading, setActionLoading] = useState(false);

  // Filter donations for each perspective
  const donorDonations = donations.filter((d) => d.donorId === currentUser?.uid);
  const pendingRequestsForDonor = donorDonations.filter((d) => d.status === 'requested');
  const activeDonorRescues = donorDonations.filter((d) =>
    ['available', 'requested', 'accepted', 'scheduled', 'picked_up'].includes(d.status)
  );

  const ngoClaimedDonations = donations.filter((d) => d.assignedNgoId === currentUser?.uid);
  const volunteerAssignedDonations = donations.filter((d) => d.assignedVolunteerId === currentUser?.uid);

  // Quick accept or reject from dashboard
  const handleQuickStatus = async (donation: Donation, newStatus: DonationStatus, note: string) => {
    if (!currentUser) return;
    setActionLoading(true);
    try {
      const actorName = userProfile?.displayName || 'User';
      const extra = newStatus === 'available' ? { assignedNgoId: '', assignedNgoName: '', claimLock: '' } : undefined;
      await updateDonationStatus(donation.id, newStatus, actorName, currentUser.uid, note, extra);
    } catch (err: any) {
      alert(`Error updating status: ${err.message}`);
    } finally {
      setActionLoading(false);
    }
  };

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 space-y-8">
      {/* Top Greeting & Role Switcher */}
      <div className="bg-gradient-to-r from-emerald-800 to-teal-900 rounded-3xl p-6 sm:p-8 text-white flex flex-col md:flex-row items-start md:items-center justify-between gap-6 shadow-md">
        <div className="space-y-1">
          <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-emerald-700/60 text-emerald-200 text-xs font-semibold">
            Role: <span className="uppercase font-bold text-white">{userProfile?.role || 'Donor'}</span>
          </div>
          <h1 className="text-2xl sm:text-3xl font-extrabold tracking-tight">
            Welcome back, {userProfile?.displayName || currentUser?.email?.split('@')[0]}
          </h1>
          <p className="text-emerald-100/80 text-xs sm:text-sm">
            Manage your food donations, dispatch operations, and real-time delivery logs.
          </p>
        </div>

        {/* Perspective Switcher for evaluation / testing */}
        <div className="bg-emerald-950/60 p-1.5 rounded-2xl border border-emerald-700/50 flex items-center gap-1">
          <button
            onClick={() => setActiveRoleView('donor')}
            className={`px-3.5 py-2 rounded-xl text-xs font-bold transition-all flex items-center gap-1.5 ${
              activeRoleView === 'donor'
                ? 'bg-amber-500 text-stone-950 shadow-xs'
                : 'text-emerald-200 hover:text-white'
            }`}
          >
            <Utensils className="w-3.5 h-3.5" />
            Donor View
          </button>
          <button
            onClick={() => setActiveRoleView('ngo')}
            className={`px-3.5 py-2 rounded-xl text-xs font-bold transition-all flex items-center gap-1.5 ${
              activeRoleView === 'ngo'
                ? 'bg-amber-500 text-stone-950 shadow-xs'
                : 'text-emerald-200 hover:text-white'
            }`}
          >
            <Building2 className="w-3.5 h-3.5" />
            NGO View
          </button>
          <button
            onClick={() => setActiveRoleView('volunteer')}
            className={`px-3.5 py-2 rounded-xl text-xs font-bold transition-all flex items-center gap-1.5 ${
              activeRoleView === 'volunteer'
                ? 'bg-amber-500 text-stone-950 shadow-xs'
                : 'text-emerald-200 hover:text-white'
            }`}
          >
            <Bike className="w-3.5 h-3.5" />
            Volunteer View
          </button>
        </div>
      </div>

      {/* ========================================================= */}
      {/* DONOR DASHBOARD VIEW */}
      {/* ========================================================= */}
      {activeRoleView === 'donor' && (
        <div className="space-y-6">
          {/* Quick Metrics */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <div className="bg-white p-5 rounded-2xl border border-stone-200 shadow-2xs">
              <span className="text-xs text-stone-500 font-medium block">Total Donations Created</span>
              <span className="text-3xl font-extrabold text-stone-900 mt-1 block">
                {donorDonations.length}
              </span>
            </div>
            <div className="bg-white p-5 rounded-2xl border border-stone-200 shadow-2xs">
              <span className="text-xs text-stone-500 font-medium block">Pending NGO Requests</span>
              <span className="text-3xl font-extrabold text-orange-600 mt-1 block">
                {pendingRequestsForDonor.length}
              </span>
            </div>
            <div className="bg-white p-5 rounded-2xl border border-stone-200 shadow-2xs">
              <span className="text-xs text-stone-500 font-medium block">Successfully Delivered</span>
              <span className="text-3xl font-extrabold text-emerald-700 mt-1 block">
                {donorDonations.filter((d) => d.status === 'delivered').length}
              </span>
            </div>
          </div>

          {/* Incoming NGO Requests Alert Box */}
          {pendingRequestsForDonor.length > 0 && (
            <div className="bg-amber-50 border border-amber-200 rounded-3xl p-6 space-y-4">
              <div className="flex items-center gap-2 text-amber-900 font-bold text-sm">
                <AlertTriangle className="w-5 h-5 text-amber-600" />
                Action Required: NGO Claim Requests Awaiting Your Acceptance
              </div>
              <div className="divide-y divide-amber-200/60">
                {pendingRequestsForDonor.map((d) => (
                  <div key={d.id} className="pt-3 pb-3 first:pt-0 last:pb-0 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                    <div>
                      <h4 className="font-bold text-stone-900 text-sm">{d.foodName}</h4>
                      <p className="text-xs text-stone-600">
                        Requested by: <strong>{d.assignedNgoName || 'Verified NGO Partner'}</strong> ({d.quantity} {d.unit})
                      </p>
                    </div>
                    <div className="flex items-center gap-2">
                      <button
                        onClick={() =>
                          handleQuickStatus(d, 'accepted', 'Donor confirmed NGO request.')
                        }
                        disabled={actionLoading}
                        className="bg-emerald-700 hover:bg-emerald-800 text-white font-bold text-xs px-4 py-2 rounded-xl cursor-pointer"
                      >
                        Accept Request
                      </button>
                      <button
                        onClick={() =>
                          handleQuickStatus(d, 'available', 'Donor declined NGO claim.')
                        }
                        disabled={actionLoading}
                        className="bg-stone-200 hover:bg-stone-300 text-stone-700 font-bold text-xs px-3.5 py-2 rounded-xl cursor-pointer"
                      >
                        Decline
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Active Donations Section */}
          <div className="bg-white rounded-3xl border border-stone-200 p-6 space-y-4 shadow-2xs">
            <div className="flex items-center justify-between">
              <div>
                <h2 className="text-lg font-bold text-stone-900">My Surplus Food Listings</h2>
                <p className="text-xs text-stone-500">Track real-time status from listing to verified delivery</p>
              </div>
              <button
                onClick={onOpenCreate}
                className="bg-emerald-600 hover:bg-emerald-700 text-white font-semibold text-xs px-4 py-2 rounded-xl shadow-xs transition-colors flex items-center gap-1.5 cursor-pointer"
              >
                <PlusCircle className="w-4 h-4" />
                New Donation
              </button>
            </div>

            {donorDonations.length === 0 ? (
              <div className="py-12 text-center text-stone-400 space-y-2">
                <Utensils className="w-10 h-10 mx-auto text-stone-300" />
                <p className="text-sm font-medium">You haven't posted any food donations yet.</p>
                <button
                  onClick={onOpenCreate}
                  className="text-xs font-bold text-emerald-700 hover:underline"
                >
                  Create your first surplus listing →
                </button>
              </div>
            ) : (
              <div className="divide-y divide-stone-100">
                {donorDonations.map((d) => (
                  <div
                    key={d.id}
                    onClick={() => onSelectDonation(d)}
                    className="py-4 hover:bg-stone-50/70 rounded-xl px-2 transition-colors cursor-pointer flex flex-col sm:flex-row sm:items-center justify-between gap-3"
                  >
                    <div className="space-y-1">
                      <div className="flex items-center gap-2">
                        <span className="font-bold text-stone-900 text-sm">{d.foodName}</span>
                        <span className="text-xs text-stone-500">({d.quantity} {d.unit})</span>
                        <span className="text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-full bg-emerald-50 text-emerald-800">
                          {d.status.replace('_', ' ')}
                        </span>
                      </div>
                      <div className="text-xs text-stone-500 flex items-center gap-3">
                        <span className="flex items-center gap-1">
                          <Clock className="w-3.5 h-3.5" /> Deadline: {d.pickupDeadline}
                        </span>
                        <span className="flex items-center gap-1 truncate max-w-[200px]">
                          <MapPin className="w-3.5 h-3.5" /> {d.pickupAddress}
                        </span>
                      </div>
                    </div>

                    <div className="text-right shrink-0">
                      <span className="text-xs font-semibold text-emerald-700">
                        View Timeline →
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}

      {/* ========================================================= */}
      {/* NGO / SHELTER DASHBOARD VIEW */}
      {/* ========================================================= */}
      {activeRoleView === 'ngo' && (
        <div className="space-y-6">
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <div className="bg-white p-5 rounded-2xl border border-stone-200 shadow-2xs">
              <span className="text-xs text-stone-500 font-medium block">Claimed Rescues</span>
              <span className="text-3xl font-extrabold text-stone-900 mt-1 block">
                {ngoClaimedDonations.length}
              </span>
            </div>
            <div className="bg-white p-5 rounded-2xl border border-stone-200 shadow-2xs">
              <span className="text-xs text-stone-500 font-medium block">Available in City</span>
              <span className="text-3xl font-extrabold text-emerald-700 mt-1 block">
                {donations.filter((d) => d.status === 'available').length}
              </span>
            </div>
            <div className="bg-white p-5 rounded-2xl border border-stone-200 shadow-2xs">
              <span className="text-xs text-stone-500 font-medium block">Verified Partner Status</span>
              <span className="text-sm font-bold text-emerald-700 bg-emerald-50 px-3 py-1 rounded-full inline-block mt-2">
                Verified Organization
              </span>
            </div>
          </div>

          {/* Claimed food in progress */}
          <div className="bg-white rounded-3xl border border-stone-200 p-6 space-y-4 shadow-2xs">
            <div className="flex items-center justify-between">
              <div>
                <h2 className="text-lg font-bold text-stone-900">Our Organization's Rescues</h2>
                <p className="text-xs text-stone-500">Track shipments assigned to your receiving shelter kitchen</p>
              </div>
              <button
                onClick={() => onNavigate('browse')}
                className="text-xs font-bold text-emerald-700 hover:underline"
              >
                Browse & Claim More Surplus →
              </button>
            </div>

            {ngoClaimedDonations.length === 0 ? (
              <div className="py-12 text-center text-stone-400 space-y-2">
                <Building2 className="w-10 h-10 mx-auto text-stone-300" />
                <p className="text-sm font-medium">No food donations currently claimed by your organization.</p>
                <button
                  onClick={() => onNavigate('browse')}
                  className="bg-emerald-600 text-white font-semibold text-xs px-4 py-2 rounded-xl mt-2 cursor-pointer"
                >
                  Explore Surplus Radar
                </button>
              </div>
            ) : (
              <div className="divide-y divide-stone-100">
                {ngoClaimedDonations.map((d) => (
                  <div
                    key={d.id}
                    onClick={() => onSelectDonation(d)}
                    className="py-4 hover:bg-stone-50/70 rounded-xl px-2 transition-colors cursor-pointer flex flex-col sm:flex-row sm:items-center justify-between gap-3"
                  >
                    <div>
                      <h4 className="font-bold text-stone-900 text-sm">{d.foodName}</h4>
                      <p className="text-xs text-stone-500">
                        {d.quantity} {d.unit} | Donor: {d.donorName}
                      </p>
                    </div>
                    <div className="flex items-center gap-3">
                      <span className="text-xs font-bold uppercase tracking-wider text-orange-700 bg-orange-50 px-2.5 py-1 rounded-full">
                        {d.status.replace('_', ' ')}
                      </span>
                      <span className="text-xs font-bold text-emerald-700">Track Progress →</span>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}

      {/* ========================================================= */}
      {/* VOLUNTEER DASHBOARD VIEW */}
      {/* ========================================================= */}
      {activeRoleView === 'volunteer' && (
        <div className="space-y-6">
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <div className="bg-white p-5 rounded-2xl border border-stone-200 shadow-2xs">
              <span className="text-xs text-stone-500 font-medium block">Active Courier Tasks</span>
              <span className="text-3xl font-extrabold text-blue-600 mt-1 block">
                {volunteerAssignedDonations.filter((d) => ['scheduled', 'picked_up'].includes(d.status)).length}
              </span>
            </div>
            <div className="bg-white p-5 rounded-2xl border border-stone-200 shadow-2xs">
              <span className="text-xs text-stone-500 font-medium block">Completed Pickups</span>
              <span className="text-3xl font-extrabold text-emerald-700 mt-1 block">
                {volunteerAssignedDonations.filter((d) => d.status === 'delivered').length}
              </span>
            </div>
            <div className="bg-white p-5 rounded-2xl border border-stone-200 shadow-2xs">
              <span className="text-xs text-stone-500 font-medium block">Duty Readiness</span>
              <span className="text-sm font-bold text-emerald-700 bg-emerald-50 px-3 py-1 rounded-full inline-block mt-2">
                Available on Radar
              </span>
            </div>
          </div>

          {/* Active Missions */}
          <div className="bg-white rounded-3xl border border-stone-200 p-6 space-y-4 shadow-2xs">
            <h2 className="text-lg font-bold text-stone-900">My Courier Assignments</h2>
            {volunteerAssignedDonations.length === 0 ? (
              <div className="py-12 text-center text-stone-400 space-y-2">
                <Bike className="w-10 h-10 mx-auto text-stone-300" />
                <p className="text-sm font-medium">No pickup missions currently assigned to you.</p>
                <p className="text-xs text-stone-500 max-w-sm mx-auto">
                  Browse accepted donations waiting for courier dispatch to claim a run.
                </p>
                <button
                  onClick={() => onNavigate('browse')}
                  className="bg-blue-600 hover:bg-blue-700 text-white font-semibold text-xs px-4 py-2 rounded-xl mt-2 cursor-pointer"
                >
                  Find Open Pickups
                </button>
              </div>
            ) : (
              <div className="divide-y divide-stone-100">
                {volunteerAssignedDonations.map((d) => (
                  <div
                    key={d.id}
                    onClick={() => onSelectDonation(d)}
                    className="py-4 hover:bg-stone-50/70 rounded-xl px-2 transition-colors cursor-pointer flex flex-col sm:flex-row sm:items-center justify-between gap-3"
                  >
                    <div>
                      <h4 className="font-bold text-stone-900 text-sm">{d.foodName}</h4>
                      <p className="text-xs text-stone-500">
                        📍 Pickup: {d.pickupAddress} | Deliver to: {d.assignedNgoName || 'Shelter'}
                      </p>
                    </div>
                    <div className="flex items-center gap-2">
                      <span className="text-xs font-bold text-blue-700 bg-blue-50 px-3 py-1 rounded-full uppercase">
                        {d.status.replace('_', ' ')}
                      </span>
                      <span className="text-xs font-bold text-emerald-700">Open Mission →</span>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
};
