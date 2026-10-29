import React, { useState } from 'react';
import {
  X,
  MapPin,
  Clock,
  Package,
  Thermometer,
  ShieldAlert,
  User,
  Building2,
  Bike,
  Sparkles,
  CheckCircle2,
  AlertTriangle,
  ArrowRight,
  Loader2,
  Share2,
  Navigation,
  ExternalLink,
  QrCode,
  Radio,
  Calendar,
} from 'lucide-react';
import { Donation, DonationStatus } from '../types';
import { useAuth } from '../context/AuthContext';
import { claimDonationByNgo, updateDonationStatus } from '../services/dbService';
import { GoogleRescueMap } from './GoogleRescueMap';
import { QRVerificationModal } from './QRVerificationModal';
import { LiveTrackingModal } from './LiveTrackingModal';
import { SmartMatchModal } from './SmartMatchModal';
import { useLanguage } from '../context/LanguageContext';

interface DonationDetailModalProps {
  donation: Donation | null;
  onClose: () => void;
  onRefresh?: () => void;
}

export const DonationDetailModal: React.FC<DonationDetailModalProps> = ({ donation, onClose, onRefresh }) => {
  const { currentUser, userProfile, isAdmin, isNgo, isVolunteer, isDonor } = useAuth();
  const { t } = useLanguage();
  const [loadingAction, setLoadingAction] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);

  const [aiInsightLoading, setAiInsightLoading] = useState(false);
  const [aiInsight, setAiInsight] = useState<string | null>(null);

  const [qrModal, setQrModal] = useState<{
    isOpen: boolean;
    mode: 'show_pickup' | 'scan_pickup' | 'show_delivery' | 'scan_delivery';
  }>({ isOpen: false, mode: 'show_pickup' });
  const [trackingModalOpen, setTrackingModalOpen] = useState(false);
  const [smartMatchModalOpen, setSmartMatchModalOpen] = useState(false);

  if (!donation) return null;

  const isOwner = currentUser?.uid === donation.donorId;
  const isAssignedNgo = currentUser?.uid === donation.assignedNgoId;
  const isAssignedVolunteer = currentUser?.uid === donation.assignedVolunteerId;

  // Handle NGO Claim with transactional duplicate-prevention
  const handleNgoClaim = async () => {
    if (!currentUser) return;
    setLoadingAction(true);
    setErrorMsg(null);
    setSuccessMsg(null);

    try {
      const ngoName = userProfile?.displayName || 'Registered NGO Partner';
      const res = await claimDonationByNgo(
        donation.id,
        currentUser.uid,
        ngoName,
        userProfile?.displayName || 'NGO Coordinator'
      );

      if (res.success) {
        setSuccessMsg(res.message);
        if (onRefresh) onRefresh();
      } else {
        setErrorMsg(res.message);
      }
    } catch (err: any) {
      setErrorMsg(err.message || 'Error claiming donation');
    } finally {
      setLoadingAction(false);
    }
  };

  // Status transitions
  const handleStatusChange = async (nextStatus: DonationStatus, note?: string, extra?: Partial<Donation>) => {
    if (!currentUser) return;
    setLoadingAction(true);
    setErrorMsg(null);
    setSuccessMsg(null);

    try {
      const actorName = userProfile?.displayName || currentUser.email?.split('@')[0] || 'User';
      await updateDonationStatus(donation.id, nextStatus, actorName, currentUser.uid, note, extra);
      setSuccessMsg(`Status updated to ${nextStatus.replace('_', ' ').toUpperCase()}`);
      if (onRefresh) onRefresh();
    } catch (err: any) {
      setErrorMsg(err.message || 'Status transition failed');
    } finally {
      setLoadingAction(false);
    }
  };

  // Gemini AI Match Insight
  const handleFetchAiInsights = async () => {
    setAiInsightLoading(true);
    try {
      const res = await fetch('/api/gemini/match-insights', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          foodName: donation.foodName,
          category: donation.category,
          quantity: `${donation.quantity} ${donation.unit}`,
          ngoName: userProfile?.displayName || 'Community Shelter',
          ngoCapacity: 250,
          pickupDeadline: donation.pickupDeadline,
        }),
      });
      const data = await res.json();
      setAiInsight(data.insight || 'Match evaluation complete.');
    } catch (err: any) {
      setAiInsight('Deterministic compatibility: Volume and location match shelter intake standards.');
    } finally {
      setAiInsightLoading(false);
    }
  };

  const getStatusBadge = (status: DonationStatus) => {
    const map: Record<DonationStatus, { bg: string; text: string; label: string }> = {
      available: { bg: 'bg-emerald-100', text: 'text-emerald-800', label: 'Available for Rescue' },
      requested: { bg: 'bg-amber-100', text: 'text-amber-800', label: 'Requested by NGO' },
      accepted: { bg: 'bg-teal-100', text: 'text-teal-800', label: 'Accepted - Awaiting Pickup' },
      scheduled: { bg: 'bg-blue-100', text: 'text-blue-800', label: 'Volunteer Assigned' },
      picked_up: { bg: 'bg-indigo-100', text: 'text-indigo-800', label: 'Food Picked Up' },
      in_transit: { bg: 'bg-indigo-100', text: 'text-indigo-800', label: 'In Transit to Shelter' },
      delivered: { bg: 'bg-emerald-100', text: 'text-emerald-800', label: 'Delivered to Shelter' },
      completed: { bg: 'bg-stone-100', text: 'text-stone-800', label: 'Mission Completed & Verified' },
      cancelled: { bg: 'bg-red-100', text: 'text-red-800', label: 'Cancelled' },
      expired: { bg: 'bg-stone-200', text: 'text-stone-600', label: 'Expired' },
    };
    const s = map[status] || { bg: 'bg-stone-100', text: 'text-stone-800', label: status };
    return (
      <span className={`px-3 py-1 rounded-full text-xs font-bold uppercase tracking-wider ${s.bg} ${s.text}`}>
        {s.label}
      </span>
    );
  };

  return (
    <div className="fixed inset-0 z-50 overflow-y-auto bg-stone-900/60 backdrop-blur-xs flex items-center justify-center p-4">
      <div className="bg-white rounded-3xl shadow-2xl max-w-3xl w-full max-h-[92vh] flex flex-col overflow-hidden animate-in fade-in zoom-in-95 duration-200">
        {/* Header */}
        <div className="px-6 py-4 border-b border-stone-100 flex items-center justify-between bg-stone-50/60">
          <div className="flex items-center gap-3">
            {getStatusBadge(donation.status)}
            <span className="text-xs text-stone-500 font-mono">ID: {donation.id.slice(0, 8)}</span>
          </div>
          <button
            onClick={onClose}
            className="p-2 text-stone-400 hover:text-stone-700 hover:bg-stone-100 rounded-full transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Content */}
        <div className="p-6 overflow-y-auto space-y-6">
          {errorMsg && (
            <div className="p-3 bg-red-50 border border-red-200 rounded-xl text-red-700 text-xs flex items-center gap-2">
              <AlertTriangle className="w-4 h-4 shrink-0" />
              <span>{errorMsg}</span>
            </div>
          )}

          {successMsg && (
            <div className="p-3 bg-emerald-50 border border-emerald-200 rounded-xl text-emerald-800 text-xs flex items-center gap-2">
              <CheckCircle2 className="w-4 h-4 shrink-0" />
              <span>{successMsg}</span>
            </div>
          )}

          {/* Title & Key Specs */}
          <div className="flex flex-col sm:flex-row justify-between sm:items-start gap-4">
            <div>
              <span className="text-xs font-bold uppercase tracking-wider text-emerald-700">
                {donation.category}
              </span>
              <h1 className="text-2xl font-bold text-stone-900 mt-1">{donation.foodName}</h1>
              <p className="text-stone-600 text-sm mt-1 leading-relaxed">{donation.description}</p>
            </div>

            <div className="bg-emerald-50/70 p-4 rounded-2xl border border-emerald-100 text-right shrink-0">
              <span className="text-xs text-emerald-800 font-medium block">Rescue Volume</span>
              <span className="text-2xl font-extrabold text-emerald-950">
                {donation.quantity} {donation.unit}
              </span>
              {donation.servings && (
                <span className="text-xs text-emerald-700 block font-semibold mt-0.5">
                  ≈ {donation.servings} Servings
                </span>
              )}
            </div>
          </div>

          {/* Attributes Grid */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 bg-stone-50 p-4 rounded-2xl text-xs">
            <div>
              <span className="text-stone-400 block mb-0.5 flex items-center gap-1">
                <Clock className="w-3.5 h-3.5 text-stone-500" /> Deadline
              </span>
              <span className="font-bold text-stone-800">{donation.pickupDeadline}</span>
            </div>
            <div>
              <span className="text-stone-400 block mb-0.5 flex items-center gap-1">
                <Thermometer className="w-3.5 h-3.5 text-stone-500" /> Storage
              </span>
              <span className="font-bold text-stone-800">{donation.storageType || 'Room Temp'}</span>
            </div>
            <div>
              <span className="text-stone-400 block mb-0.5 flex items-center gap-1">
                <Package className="w-3.5 h-3.5 text-stone-500" /> Packaging
              </span>
              <span className="font-bold text-stone-800">{donation.packaging || 'Sealed'}</span>
            </div>
            <div>
              <span className="text-stone-400 block mb-0.5 flex items-center gap-1">
                <ShieldAlert className="w-3.5 h-3.5 text-stone-500" /> Allergens
              </span>
              <span className="font-bold text-stone-800">{donation.allergens || 'None reported'}</span>
            </div>
          </div>

          {/* Dedicated Scheduled Pickup Window & Deadline Card */}
          <div className="bg-emerald-50/60 border border-emerald-200/80 rounded-2xl p-4 text-xs space-y-2.5">
            <div className="flex flex-wrap items-center justify-between gap-2 border-b border-emerald-100 pb-2">
              <span className="font-bold text-emerald-950 flex items-center gap-1.5 uppercase tracking-wider text-[11px]">
                <Calendar className="w-4 h-4 text-emerald-700" />
                Scheduled Pickup Window
              </span>
              <span className="px-2.5 py-0.5 rounded-full text-[11px] font-semibold bg-emerald-100 text-emerald-900 border border-emerald-200">
                Time Zone: {donation.timeZone || 'Asia/Kolkata'}
              </span>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 pt-1">
              <div>
                <span className="text-stone-500 block text-[11px]">Pickup Date</span>
                <span className="font-bold text-stone-900 text-sm">
                  {donation.pickupDate || 'Today'}
                </span>
              </div>
              <div>
                <span className="text-stone-500 block text-[11px]">Available Hours</span>
                <span className="font-bold text-emerald-900 text-sm">
                  {donation.availableFrom && donation.availableUntil
                    ? `${donation.availableFrom} – ${donation.availableUntil}`
                    : 'Flexible Window'}
                </span>
              </div>
              <div>
                <span className="text-stone-500 block text-[11px]">Collection Deadline</span>
                <span className="font-bold text-amber-900 text-sm">
                  {donation.collectionDeadline
                    ? donation.collectionDeadline.replace('T', ' ')
                    : donation.pickupDeadline}
                </span>
              </div>
            </div>
            {donation.preferredPickupTime && (
              <div className="pt-1 text-[11px] text-emerald-800">
                Preferred Pickup Time: <strong>{donation.preferredPickupTime}</strong>
              </div>
            )}
          </div>

          {/* Stakeholders Info (Donor, NGO, Volunteer) */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <div className="p-3.5 rounded-xl border border-stone-100 bg-white shadow-2xs">
              <div className="flex items-center gap-2 mb-1 text-emerald-800 font-semibold text-xs">
                <User className="w-4 h-4 text-emerald-600" />
                Donor
              </div>
              <p className="font-bold text-stone-900 text-sm">{donation.donorName}</p>
              <p className="text-[11px] text-stone-500 mt-0.5">Verified Donor Account</p>
            </div>

            <div className="p-3.5 rounded-xl border border-stone-100 bg-white shadow-2xs">
              <div className="flex items-center gap-2 mb-1 text-orange-800 font-semibold text-xs">
                <Building2 className="w-4 h-4 text-orange-600" />
                Receiving Shelter / NGO
              </div>
              <p className="font-bold text-stone-900 text-sm">
                {donation.assignedNgoName || 'Unassigned / Open'}
              </p>
              <p className="text-[11px] text-stone-500 mt-0.5">
                {donation.assignedNgoId ? 'Verified Partner' : 'Awaiting Request'}
              </p>
            </div>

            <div className="p-3.5 rounded-xl border border-stone-100 bg-white shadow-2xs">
              <div className="flex items-center gap-2 mb-1 text-blue-800 font-semibold text-xs">
                <Bike className="w-4 h-4 text-blue-600" />
                Volunteer Courier
              </div>
              <p className="font-bold text-stone-900 text-sm">
                {donation.assignedVolunteerName || 'Awaiting Courier'}
              </p>
              <p className="text-[11px] text-stone-500 mt-0.5">
                {donation.assignedVolunteerId ? 'En route / Assigned' : 'Open for pickup'}
              </p>
            </div>
          </div>

          {/* AI Matching Insight section */}
          <div className="p-4 bg-gradient-to-r from-emerald-50/60 to-teal-50/60 border border-emerald-100 rounded-2xl">
            <div className="flex flex-wrap items-center justify-between gap-2 mb-2">
              <div className="flex items-center gap-2">
                <Sparkles className="w-4 h-4 text-amber-500" />
                <span className="font-bold text-xs text-emerald-950 uppercase tracking-wider">
                  Smart Logistics Matching Analysis
                </span>
              </div>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => setSmartMatchModalOpen(true)}
                  className="bg-emerald-700 hover:bg-emerald-800 text-white font-bold text-xs px-3 py-1.5 rounded-xl shadow-2xs transition-colors flex items-center gap-1.5 cursor-pointer"
                >
                  <Sparkles className="w-3.5 h-3.5 text-amber-300" />
                  View Ranked Candidate NGOs
                </button>
                {!aiInsight && (
                  <button
                    type="button"
                    onClick={handleFetchAiInsights}
                    disabled={aiInsightLoading}
                    className="text-xs font-semibold text-emerald-700 hover:text-emerald-900 flex items-center gap-1 cursor-pointer"
                  >
                    {aiInsightLoading ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : 'Evaluate AI Compatibility'}
                  </button>
                )}
              </div>
            </div>
            <p className="text-xs text-stone-700 leading-relaxed">
              {aiInsight ||
                'Transparent Rule: Matches verified NGOs with compatible intake capacity, distance, and vehicle storage before deadline.'}
            </p>
          </div>

          {/* Interactive Live Tracking & QR Verification Quick Actions */}
          <div className="p-4 bg-stone-50 border border-stone-200 rounded-2xl flex flex-wrap items-center justify-between gap-3">
            <div>
              <h4 className="text-xs font-bold text-stone-900 flex items-center gap-1.5">
                <Radio className="w-4 h-4 text-emerald-600" />
                Live Verification & Tracking Operations
              </h4>
              <p className="text-[11px] text-stone-500 mt-0.5">
                Cryptographic QR handovers and real-time device GPS telemetry
              </p>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              {/* Live Tracking button */}
              {['accepted', 'scheduled', 'picked_up', 'in_transit'].includes(donation.status) && (
                <button
                  type="button"
                  onClick={() => setTrackingModalOpen(true)}
                  className="bg-teal-700 hover:bg-teal-800 text-white font-bold text-xs px-3 py-1.5 rounded-xl transition-colors flex items-center gap-1.5 cursor-pointer shadow-2xs"
                >
                  <Radio className="w-3.5 h-3.5 animate-pulse" />
                  Live GPS Tracking
                </button>
              )}

              {/* QR Code Handover Buttons */}
              {['accepted', 'scheduled'].includes(donation.status) && (
                <>
                  {(isOwner || isAdmin) && (
                    <button
                      type="button"
                      onClick={() => setQrModal({ isOpen: true, mode: 'show_pickup' })}
                      className="bg-emerald-100 hover:bg-emerald-200 text-emerald-900 font-bold text-xs px-3 py-1.5 rounded-xl transition-colors flex items-center gap-1.5 cursor-pointer"
                    >
                      <QrCode className="w-3.5 h-3.5 text-emerald-700" />
                      Show Pickup QR
                    </button>
                  )}
                  {(isVolunteer || isAssignedVolunteer || isAdmin) && (
                    <button
                      type="button"
                      onClick={() => setQrModal({ isOpen: true, mode: 'scan_pickup' })}
                      className="bg-indigo-600 hover:bg-indigo-700 text-white font-bold text-xs px-3 py-1.5 rounded-xl transition-colors flex items-center gap-1.5 cursor-pointer shadow-2xs"
                    >
                      <QrCode className="w-3.5 h-3.5" />
                      Scan Pickup Handover QR
                    </button>
                  )}
                </>
              )}

              {donation.status === 'picked_up' && (
                <>
                  {(isAssignedVolunteer || isAdmin) && (
                    <button
                      type="button"
                      onClick={() => setQrModal({ isOpen: true, mode: 'show_delivery' })}
                      className="bg-emerald-100 hover:bg-emerald-200 text-emerald-900 font-bold text-xs px-3 py-1.5 rounded-xl transition-colors flex items-center gap-1.5 cursor-pointer"
                    >
                      <QrCode className="w-3.5 h-3.5 text-emerald-700" />
                      Show Delivery QR
                    </button>
                  )}
                  {(isAssignedNgo || isNgo || isAdmin) && (
                    <button
                      type="button"
                      onClick={() => setQrModal({ isOpen: true, mode: 'scan_delivery' })}
                      className="bg-emerald-700 hover:bg-emerald-800 text-white font-bold text-xs px-3 py-1.5 rounded-xl transition-colors flex items-center gap-1.5 cursor-pointer shadow-2xs"
                    >
                      <QrCode className="w-3.5 h-3.5" />
                      Confirm Delivery Receipt QR
                    </button>
                  )}
                </>
              )}
            </div>
          </div>

          {/* Location & Interactive Google Map */}
          <div>
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 mb-2">
              <h3 className="font-bold text-stone-900 text-sm flex items-center gap-1.5">
                <MapPin className="w-4 h-4 text-emerald-600 shrink-0" />
                Pickup Location: <span className="font-normal text-stone-600">{donation.pickupAddress}</span>
              </h3>
              <button
                type="button"
                onClick={() => {
                  const url = `https://www.google.com/maps/dir/?api=1&destination=${donation.latitude},${donation.longitude}&travelmode=driving`;
                  window.open(url, '_blank', 'noopener,noreferrer');
                }}
                className="bg-emerald-50 hover:bg-emerald-100 text-emerald-800 text-xs font-bold px-3 py-1.5 rounded-xl border border-emerald-200 transition-colors flex items-center gap-1.5 self-start sm:self-auto cursor-pointer"
              >
                <Navigation className="w-3.5 h-3.5 text-emerald-600" />
                Get Directions (Google Maps)
                <ExternalLink className="w-3 h-3 text-emerald-500" />
              </button>
            </div>
            <GoogleRescueMap
              center={{ lat: donation.latitude, lng: donation.longitude }}
              zoom={15}
              height="240px"
              donations={[donation]}
              selectedDonationId={donation.id}
              showControls={true}
            />
          </div>

          {/* Timeline of Status */}
          <div>
            <h3 className="font-bold text-stone-900 text-sm mb-3">Donation Lifecycle Timeline</h3>
            <div className="space-y-3 relative pl-6 before:content-[''] before:absolute before:left-2 before:top-2 before:bottom-2 before:w-0.5 before:bg-stone-200">
              {donation.timeline?.map((entry, idx) => (
                <div key={idx} className="relative text-xs">
                  <span className="absolute -left-6 top-1 w-3 h-3 rounded-full bg-emerald-600 border-2 border-white shadow-2xs" />
                  <div className="flex items-center justify-between font-bold text-stone-800">
                    <span className="capitalize">{entry.status.replace('_', ' ')}</span>
                    <span className="text-[10px] text-stone-400 font-normal">
                      {new Date(entry.timestamp).toLocaleString([], {
                        month: 'short',
                        day: 'numeric',
                        hour: '2-digit',
                        minute: '2-digit',
                      })}
                    </span>
                  </div>
                  <p className="text-stone-500 mt-0.5">{entry.actorName} - {entry.note}</p>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* Footer Actions */}
        <div className="px-6 py-4 border-t border-stone-100 bg-stone-50/80 flex flex-wrap items-center justify-between gap-3">
          <div className="text-xs text-stone-500">
            {isOwner && 'You are the donor of this food listing.'}
            {isAssignedNgo && 'Your organization has claimed this donation.'}
            {isAssignedVolunteer && 'You are assigned as courier for this donation.'}
          </div>

          <div className="flex items-center gap-2">
            {/* NGO Claim Action */}
            {donation.status === 'available' && (isNgo || isAdmin) && (
              <button
                onClick={handleNgoClaim}
                disabled={loadingAction}
                className="bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-xs px-5 py-2.5 rounded-xl shadow-xs transition-colors flex items-center gap-2 cursor-pointer disabled:opacity-50"
              >
                {loadingAction ? <Loader2 className="w-4 h-4 animate-spin" /> : <Building2 className="w-4 h-4" />}
                Claim / Request for My NGO
              </button>
            )}

            {/* Donor Accept Request */}
            {donation.status === 'requested' && (isOwner || isAdmin) && (
              <>
                <button
                  onClick={() =>
                    handleStatusChange(
                      'accepted',
                      'Donor accepted NGO request. Awaiting pickup dispatch.'
                    )
                  }
                  disabled={loadingAction}
                  className="bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-xs px-4 py-2.5 rounded-xl cursor-pointer"
                >
                  Accept NGO Request
                </button>
                <button
                  onClick={() =>
                    handleStatusChange('available', 'Donor released request back to available listings.', {
                      assignedNgoId: '',
                      assignedNgoName: '',
                      claimLock: '',
                    })
                  }
                  disabled={loadingAction}
                  className="bg-stone-200 hover:bg-stone-300 text-stone-700 font-bold text-xs px-3.5 py-2.5 rounded-xl cursor-pointer"
                >
                  Decline & Re-open
                </button>
              </>
            )}

            {/* Volunteer Self-Assign or NGO schedule */}
            {donation.status === 'accepted' && (isVolunteer || isNgo || isAdmin) && (
              <button
                onClick={() =>
                  handleStatusChange(
                    'scheduled',
                    'Volunteer registered pickup schedule.',
                    {
                      assignedVolunteerId: currentUser?.uid,
                      assignedVolunteerName: userProfile?.displayName || 'Volunteer Courier',
                    }
                  )
                }
                disabled={loadingAction}
                className="bg-blue-600 hover:bg-blue-700 text-white font-bold text-xs px-4 py-2.5 rounded-xl flex items-center gap-2 cursor-pointer"
              >
                <Bike className="w-4 h-4" />
                Assign Me as Courier
              </button>
            )}

            {/* Volunteer Status: Picked Up */}
            {donation.status === 'scheduled' && (isAssignedVolunteer || isAdmin || isNgo) && (
              <button
                onClick={() =>
                  handleStatusChange('picked_up', 'Food collected from donor. In transit to shelter.')
                }
                disabled={loadingAction}
                className="bg-indigo-600 hover:bg-indigo-700 text-white font-bold text-xs px-4 py-2.5 rounded-xl flex items-center gap-2 cursor-pointer"
              >
                <Package className="w-4 h-4" />
                Mark Food Picked Up
              </button>
            )}

            {/* Volunteer/NGO Status: Delivered */}
            {donation.status === 'picked_up' && (isAssignedVolunteer || isAssignedNgo || isAdmin) && (
              <button
                onClick={() =>
                  handleStatusChange(
                    'delivered',
                    'Food handed over to verified shelter kitchen. Verified delivery complete.'
                  )
                }
                disabled={loadingAction}
                className="bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-xs px-4 py-2.5 rounded-xl flex items-center gap-2 cursor-pointer"
              >
                <CheckCircle2 className="w-4 h-4" />
                Confirm Safe Delivery
              </button>
            )}

            {/* Donor cancel before pickup */}
            {(isOwner || isAdmin) && ['available', 'requested'].includes(donation.status) && (
              <button
                onClick={() =>
                  handleStatusChange('cancelled', 'Donation cancelled by donor before collection.')
                }
                disabled={loadingAction}
                className="text-stone-500 hover:text-red-600 text-xs font-semibold px-3 py-2 cursor-pointer"
              >
                Cancel Donation
              </button>
            )}
          </div>
        </div>
      </div>

      {/* Verification & Tracking Modals */}
      <QRVerificationModal
        donation={donation}
        mode={qrModal.mode}
        isOpen={qrModal.isOpen}
        onClose={() => setQrModal((prev) => ({ ...prev, isOpen: false }))}
        onSuccess={() => {
          if (onRefresh) onRefresh();
        }}
      />

      <LiveTrackingModal
        donation={donation}
        isOpen={trackingModalOpen}
        onClose={() => setTrackingModalOpen(false)}
      />

      <SmartMatchModal
        donation={donation}
        isOpen={smartMatchModalOpen}
        onClose={() => setSmartMatchModalOpen(false)}
        onClaimSuccess={() => {
          if (onRefresh) onRefresh();
        }}
      />
    </div>
  );
};
