import React, { useState, useEffect } from 'react';
import {
  Bike,
  Car,
  Truck,
  MapPin,
  Clock,
  Compass,
  CheckCircle2,
  AlertCircle,
  Radio,
  Navigation,
  ShieldCheck,
  ChevronRight,
  Phone,
  Building2,
  Calendar,
  Sparkles,
  ArrowRight,
  RotateCcw,
  Sliders,
  Bell,
  BellRing,
  Send,
  Copy,
  Check,
  UserCheck,
  Loader2,
  Award,
  PackageCheck,
  AlertTriangle,
  ExternalLink,
  LayoutGrid,
  Map as MapIcon,
  Layers,
} from 'lucide-react';
import { Donation, VolunteerProfile, DonationStatus } from '../types';
import { useAuth } from '../context/AuthContext';
import { useLanguage } from '../context/LanguageContext';
import {
  acceptDonationByVolunteer,
  cancelVolunteerCollection,
  transitionCollectionStatus,
  getVolunteerProfile,
  saveVolunteerProfile,
  subscribeNotifications,
} from '../services/dbService';
import { calculateDistanceKm, calculateDistanceKmSafe } from '../utils/geo';
import { LiveTrackingMap } from './LiveTrackingMap';
import { VolunteerNotificationsSlideOver } from './VolunteerNotificationsSlideOver';
import { VolunteerClusterMap } from './VolunteerClusterMap';
import {
  isFcmSupported,
  enableVolunteerPushNotifications,
  disableVolunteerPushNotifications,
  sendTestBrowserPushNotification,
  subscribeForegroundFcm,
} from '../services/fcmService';

interface VolunteerViewProps {
  donations: Donation[];
  onSelectDonation?: (donation: Donation) => void;
  onNavigateTab?: (tab: string) => void;
}

export const VolunteerView: React.FC<VolunteerViewProps> = ({
  donations,
  onSelectDonation,
  onNavigateTab,
}) => {
  const { currentUser, userProfile, updateRole } = useAuth();
  const { t } = useLanguage();

  const [activeTab, setActiveTab] = useState<'available' | 'active' | 'history' | 'settings'>('available');
  const [profile, setProfile] = useState<VolunteerProfile | null>(null);
  const [loadingProfile, setLoadingProfile] = useState(true);
  const [claimingDonationId, setClaimingDonationId] = useState<string | null>(null);
  const [statusUpdating, setStatusUpdating] = useState(false);
  const [actionMessage, setActionMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  // Cancellation modal state
  const [cancelModalDonation, setCancelModalDonation] = useState<Donation | null>(null);
  const [cancelReason, setCancelReason] = useState('Change in schedule / Vehicle issue');
  const [cancelling, setCancelling] = useState(false);

  // Volunteer settings state
  const [radiusKm, setRadiusKm] = useState<number>(10);
  const [vehicleType, setVehicleType] = useState<string>('Two Wheeler');
  const [optInNotifs, setOptInNotifs] = useState<boolean>(true);
  const [isAvailable, setIsAvailable] = useState<boolean>(true);
  const [serviceArea, setServiceArea] = useState<string>('Downtown & Metro Area');
  const [volunteerCoords, setVolunteerCoords] = useState<{ lat: number; lng: number } | null>(null);
  const [gpsDetecting, setGpsDetecting] = useState(false);
  const [savingSettings, setSavingSettings] = useState(false);

  // Firebase Cloud Messaging (FCM) state
  const [fcmSupported, setFcmSupported] = useState(false);
  const [fcmEnabled, setFcmEnabled] = useState(false);
  const [fcmPermission, setFcmPermission] = useState<NotificationPermission>('default');
  const [fcmToken, setFcmToken] = useState<string | null>(null);
  const [fcmLoading, setFcmLoading] = useState(false);
  const [testingFcm, setTestingFcm] = useState(false);
  const [copiedToken, setCopiedToken] = useState(false);

  // Radius filter for available requests
  const [selectedRadiusFilter, setSelectedRadiusFilter] = useState<number>(10);

  // View mode for Available Collections tab: 'map' (default radar cluster map) | 'grid' | 'split'
  const [availableViewMode, setAvailableViewMode] = useState<'map' | 'grid' | 'split'>('map');

  // Notifications slide-over panel state
  const [notificationsOpen, setNotificationsOpen] = useState<boolean>(false);
  const [unreadNotifCount, setUnreadNotifCount] = useState<number>(0);

  // Subscribe to real-time notifications for unread count indicator
  useEffect(() => {
    if (!currentUser) {
      setUnreadNotifCount(0);
      return;
    }
    const unsubscribe = subscribeNotifications(currentUser.uid, (notifs) => {
      const unread = notifs.filter((n) => !n.read).length;
      setUnreadNotifCount(unread);
    });

    return () => {
      if (typeof unsubscribe === 'function') {
        unsubscribe();
      }
    };
  }, [currentUser]);

  // Initialize FCM capabilities & foreground listener
  useEffect(() => {
    isFcmSupported().then((supported) => {
      setFcmSupported(supported);
      if (typeof window !== 'undefined' && 'Notification' in window) {
        setFcmPermission(Notification.permission);
      }
    });

    const unsubscribe = subscribeForegroundFcm((payload) => {
      setActionMessage({
        type: 'success',
        text: `🔔 Push Notification: "${payload.title}" - ${payload.body}`,
      });
    });

    return () => {
      unsubscribe();
    };
  }, []);

  // Fetch or initialize volunteer profile
  useEffect(() => {
    if (!currentUser) {
      setLoadingProfile(false);
      return;
    }

    getVolunteerProfile(currentUser.uid)
      .then((existing) => {
        if (existing) {
          setProfile(existing);
          setRadiusKm(existing.notificationRadiusKm ?? 10);
          setVehicleType(existing.vehicleType || 'Two Wheeler');
          setOptInNotifs(existing.optInNotifications ?? true);
          setIsAvailable(existing.isAvailable ?? true);
          setServiceArea(existing.serviceArea || 'Downtown & Metro Area');
          if (existing.pushNotificationsEnabled) {
            setFcmEnabled(true);
          }
          if (existing.fcmToken) {
            setFcmToken(existing.fcmToken);
          }
          if (existing.latitude && existing.longitude) {
            setVolunteerCoords({ lat: existing.latitude, lng: existing.longitude });
          }
        } else {
          // Initialize default base coords if browser permits
          if (navigator.geolocation) {
            navigator.geolocation.getCurrentPosition(
              (pos) => {
                setVolunteerCoords({ lat: pos.coords.latitude, lng: pos.coords.longitude });
              },
              () => {
                setVolunteerCoords({ lat: 28.6139, lng: 77.209 });
              }
            );
          }
        }
      })
      .finally(() => setLoadingProfile(false));
  }, [currentUser]);

  // Handle auto-detecting volunteer base GPS
  const handleDetectLocation = () => {
    if (!navigator.geolocation) {
      setActionMessage({ type: 'error', text: 'Geolocation is not supported by your browser.' });
      return;
    }
    setGpsDetecting(true);
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setVolunteerCoords({ lat: pos.coords.latitude, lng: pos.coords.longitude });
        setGpsDetecting(false);
        setActionMessage({ type: 'success', text: 'Base location updated to your current GPS position.' });
      },
      (err) => {
        setGpsDetecting(false);
        setActionMessage({
          type: 'error',
          text: 'Could not access GPS. Please check location permissions in your browser.',
        });
      },
      { enableHighAccuracy: true, timeout: 8000 }
    );
  };

  // Toggle Browser Push Notifications (FCM)
  const handleTogglePushNotifications = async () => {
    if (!currentUser) {
      onNavigateTab && onNavigateTab('auth');
      return;
    }
    setFcmLoading(true);
    setActionMessage(null);
    try {
      if (!fcmEnabled) {
        const res = await enableVolunteerPushNotifications(currentUser.uid);
        if (res.success) {
          setFcmEnabled(true);
          setFcmPermission('granted');
          if (res.token) setFcmToken(res.token);
          setActionMessage({ type: 'success', text: res.message });
        } else {
          setFcmPermission(res.permission);
          setActionMessage({ type: 'error', text: res.message });
        }
      } else {
        await disableVolunteerPushNotifications(currentUser.uid);
        setFcmEnabled(false);
        setActionMessage({
          type: 'success',
          text: 'Browser push notifications paused. You can re-enable anytime.',
        });
      }
    } catch (err: any) {
      setActionMessage({ type: 'error', text: `Push notification error: ${err.message}` });
    } finally {
      setFcmLoading(false);
    }
  };

  // Send Test Push Notification
  const handleTestPushNotification = async () => {
    setTestingFcm(true);
    try {
      const res = await sendTestBrowserPushNotification(
        '🚨 ResQBite Collection Alert',
        `Food rescue dispatch test successful! You are active within ${radiusKm} km radius.`
      );
      setActionMessage({
        type: res.success ? 'success' : 'error',
        text: res.message,
      });
    } catch (err: any) {
      setActionMessage({ type: 'error', text: err.message });
    } finally {
      setTestingFcm(false);
    }
  };

  const handleCopyFcmToken = () => {
    if (!fcmToken) return;
    navigator.clipboard.writeText(fcmToken).then(() => {
      setCopiedToken(true);
      setTimeout(() => setCopiedToken(false), 2500);
    });
  };

  // Save Settings
  const handleSaveSettings = async () => {
    if (!currentUser) return;
    setSavingSettings(true);
    try {
      await saveVolunteerProfile({
        userId: currentUser.uid,
        fullName: userProfile?.displayName || currentUser.email?.split('@')[0] || 'Volunteer Hero',
        phone: userProfile?.phone || profile?.phone || '',
        vehicleType,
        serviceArea,
        isAvailable,
        notificationRadiusKm: radiusKm,
        optInNotifications: optInNotifs,
        pushNotificationsEnabled: fcmEnabled,
        ...(fcmToken ? { fcmToken } : {}),
        latitude: volunteerCoords?.lat,
        longitude: volunteerCoords?.lng,
      });

      const updated = await getVolunteerProfile(currentUser.uid);
      setProfile(updated);
      setActionMessage({ type: 'success', text: 'Volunteer settings updated successfully!' });
    } catch (err: any) {
      setActionMessage({ type: 'error', text: `Failed to save: ${err.message}` });
    } finally {
      setSavingSettings(false);
    }
  };

  // Switch role to volunteer if currently another role
  const handleActivateVolunteerRole = async () => {
    if (!currentUser) {
      onNavigateTab && onNavigateTab('auth');
      return;
    }
    try {
      await updateRole('volunteer');
      await handleSaveSettings();
      setActionMessage({
        type: 'success',
        text: 'Welcome to the ResQBite Volunteer Courier Team! You are now ready to rescue food.',
      });
    } catch (err: any) {
      setActionMessage({ type: 'error', text: `Could not update role: ${err.message}` });
    }
  };

  // Atomic accept request
  const handleAcceptRequest = async (donation: Donation) => {
    if (!currentUser) {
      onNavigateTab && onNavigateTab('auth');
      return;
    }

    setClaimingDonationId(donation.id);
    setActionMessage(null);

    const volunteerName =
      userProfile?.displayName || currentUser.email?.split('@')[0] || 'Volunteer Courier';
    const volunteerPhone = userProfile?.phone || profile?.phone || '+91 98765 43210';

    try {
      const res = await acceptDonationByVolunteer(
        donation.id,
        currentUser.uid,
        volunteerName,
        volunteerPhone
      );

      if (res.success) {
        setActionMessage({
          type: 'success',
          text: `Success! Collection request "${donation.foodName}" has been safely assigned to you.`,
        });
        setActiveTab('active');
      } else {
        setActionMessage({
          type: 'error',
          text: res.message || 'Could not accept request. Another volunteer may have claimed it.',
        });
      }
    } catch (err: any) {
      setActionMessage({
        type: 'error',
        text: `Error accepting collection: ${err.message}`,
      });
    } finally {
      setClaimingDonationId(null);
    }
  };

  // Atomic cancel assignment before pickup
  const handleConfirmCancel = async () => {
    if (!cancelModalDonation || !currentUser) return;
    setCancelling(true);
    const volunteerName =
      userProfile?.displayName || currentUser.email?.split('@')[0] || 'Volunteer Courier';

    try {
      const res = await cancelVolunteerCollection(
        cancelModalDonation.id,
        currentUser.uid,
        volunteerName,
        cancelReason
      );

      if (res.success) {
        setActionMessage({
          type: 'success',
          text: 'Collection assignment released. The request is now open for other volunteers.',
        });
        setCancelModalDonation(null);
        setActiveTab('available');
      } else {
        setActionMessage({
          type: 'error',
          text: res.message || 'Could not cancel assignment.',
        });
      }
    } catch (err: any) {
      setActionMessage({ type: 'error', text: `Cancellation error: ${err.message}` });
    } finally {
      setCancelling(false);
    }
  };

  // State transitions: ACCEPTED -> PICKED_UP -> IN_TRANSIT -> DELIVERED -> COMPLETED
  const handleTransitionStatus = async (donation: Donation, nextStatus: DonationStatus) => {
    if (!currentUser) return;
    setStatusUpdating(true);
    setActionMessage(null);

    const actorName =
      userProfile?.displayName || currentUser.email?.split('@')[0] || 'Volunteer Courier';

    try {
      const res = await transitionCollectionStatus(
        donation.id,
        nextStatus,
        currentUser.uid,
        actorName,
        `Courier progressed delivery status to ${nextStatus.toUpperCase()}`
      );

      if (res.success) {
        setActionMessage({
          type: 'success',
          text: `Collection status successfully advanced to ${nextStatus.replace('_', ' ').toUpperCase()}!`,
        });
      } else {
        setActionMessage({
          type: 'error',
          text: res.message || 'Error updating status.',
        });
      }
    } catch (err: any) {
      setActionMessage({ type: 'error', text: `Failed status update: ${err.message}` });
    } finally {
      setStatusUpdating(false);
    }
  };

  // Base volunteer location for distance calculations
  const volLat = volunteerCoords?.lat || 28.6139;
  const volLng = volunteerCoords?.lng || 77.209;

  // Time-aware helpers for accurate pickup scheduling & deadline countdown
  const isDonationExpired = (d: Donation): boolean => {
    if (d.status === 'expired') return true;
    const deadline = d.collectionDeadline || d.pickupDeadline;
    if (!deadline) return false;
    const t = new Date(deadline).getTime();
    if (!isNaN(t) && t < Date.now()) return true;
    return false;
  };

  const getRemainingTimeInfo = (d: Donation) => {
    const deadline = d.collectionDeadline || d.pickupDeadline;
    if (!deadline) {
      return { label: 'Urgent', isUrgent: false, isExpired: false, minutesRemaining: 999 };
    }
    const t = new Date(deadline).getTime();
    if (isNaN(t)) {
      return { label: deadline, isUrgent: false, isExpired: false, minutesRemaining: 999 };
    }
    const diffMs = t - Date.now();
    if (diffMs <= 0) {
      return { label: 'Expired', isUrgent: false, isExpired: true, minutesRemaining: 0 };
    }
    const totalMins = Math.floor(diffMs / (1000 * 60));
    const hours = Math.floor(totalMins / 60);
    const mins = totalMins % 60;
    const isUrgent = totalMins <= 45;

    let label = '';
    if (hours > 0) {
      label = `${hours}h ${mins}m remaining`;
    } else {
      label = `${mins}m remaining`;
    }
    return { label, isUrgent, isExpired: false, minutesRemaining: totalMins };
  };

  const formatPickupWindow = (d: Donation): string => {
    const today = new Date().toISOString().split('T')[0];
    const dateLabel = d.pickupDate ? (d.pickupDate === today ? 'Today' : d.pickupDate) : 'Today';
    if (d.availableFrom && d.availableUntil) {
      return `${dateLabel}, ${d.availableFrom} – ${d.availableUntil} (${d.timeZone || 'Asia/Kolkata'})`;
    }
    return `${dateLabel}, ${d.pickupDeadline || 'As soon as possible'}`;
  };

  // Filter available collections: exclude expired or already claimed donations
  const availableCollections = donations
    .filter((d) => (d.status === 'available' || d.status === 'requested') && !isDonationExpired(d) && !d.assignedVolunteerId)
    .map((d) => {
      const dist =
        d.latitude && d.longitude
          ? calculateDistanceKmSafe(volLat, volLng, d.latitude, d.longitude, 0)
          : 0;
      return { ...d, distanceKm: dist };
    })
    .filter((d) => selectedRadiusFilter === 0 || d.distanceKm <= selectedRadiusFilter)
    .sort((a, b) => a.distanceKm - b.distanceKm);

  // Active collection for this volunteer
  const activeCollections = donations.filter(
    (d) =>
      currentUser &&
      d.assignedVolunteerId === currentUser.uid &&
      ['accepted', 'scheduled', 'picked_up', 'in_transit'].includes(d.status)
  );

  // Completed collections for this volunteer
  const completedCollections = donations.filter(
    (d) =>
      currentUser &&
      d.assignedVolunteerId === currentUser.uid &&
      ['delivered', 'completed'].includes(d.status)
  );

  // Total metrics
  const totalMealsDelivered = completedCollections.reduce(
    (acc, cur) => acc + (cur.servings || Math.round(cur.quantity * 2.5)),
    0
  );
  const totalKgRescued = completedCollections.reduce((acc, cur) => {
    const kg =
      cur.unit.toLowerCase() === 'kg'
        ? cur.quantity
        : cur.servings
        ? cur.servings * 0.4
        : cur.quantity * 0.5;
    return acc + Math.round(kg);
  }, 0);

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
      {/* Alert / Feedback Toast */}
      {actionMessage && (
        <div
          className={`mb-6 p-4 rounded-2xl flex items-center justify-between gap-3 shadow-xs animate-in fade-in duration-200 ${
            actionMessage.type === 'success'
              ? 'bg-emerald-50 border border-emerald-200 text-emerald-900'
              : 'bg-rose-50 border border-rose-200 text-rose-900'
          }`}
        >
          <div className="flex items-center gap-3 text-sm font-medium">
            {actionMessage.type === 'success' ? (
              <CheckCircle2 className="w-5 h-5 text-emerald-600 shrink-0" />
            ) : (
              <AlertCircle className="w-5 h-5 text-rose-600 shrink-0" />
            )}
            <span>{actionMessage.text}</span>
          </div>
          <button
            onClick={() => setActionMessage(null)}
            className="text-xs font-bold uppercase tracking-wider text-stone-500 hover:text-stone-800"
          >
            Dismiss
          </button>
        </div>
      )}

      {/* Role Activation Banner if user is not currently in volunteer mode */}
      {currentUser && userProfile?.role !== 'volunteer' && (
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
              You are currently signed in as a <span className="font-bold text-white capitalize">{userProfile?.role || 'Guest'}</span>.
              Switch to the <span className="text-emerald-400 font-bold">Volunteer Courier</span> role to accept surplus food pickups,
              track collections with live GPS, and deliver meals to partner shelters.
            </p>
          </div>
          <button
            onClick={handleActivateVolunteerRole}
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
                onClick={() => setNotificationsOpen(true)}
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
                {activeCollections.length}
              </div>
              <div className="text-[11px] font-bold text-emerald-700 uppercase tracking-wider mt-0.5">
                Active Run
              </div>
            </div>
            <div className="p-4 rounded-2xl bg-teal-50/70 border border-teal-100 text-center">
              <div className="text-2xl sm:text-3xl font-black text-teal-800">
                {completedCollections.length}
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

        {/* Tab Navigation */}
        <div className="mt-8 pt-6 border-t border-stone-100 flex flex-wrap items-center gap-2">
          <button
            onClick={() => setActiveTab('available')}
            className={`px-4 py-2.5 rounded-xl font-bold text-xs sm:text-sm flex items-center gap-2 transition-all cursor-pointer ${
              activeTab === 'available'
                ? 'bg-emerald-600 text-white shadow-xs'
                : 'bg-stone-50 text-stone-600 hover:bg-stone-100'
            }`}
          >
            <Compass className="w-4 h-4" />
            <span>Available Collections</span>
            <span
              className={`px-2 py-0.5 rounded-full text-xs font-black ${
                activeTab === 'available' ? 'bg-emerald-700 text-white' : 'bg-stone-200 text-stone-700'
              }`}
            >
              {availableCollections.length}
            </span>
          </button>

          <button
            onClick={() => setActiveTab('active')}
            className={`px-4 py-2.5 rounded-xl font-bold text-xs sm:text-sm flex items-center gap-2 transition-all cursor-pointer ${
              activeTab === 'active'
                ? 'bg-emerald-600 text-white shadow-xs'
                : 'bg-stone-50 text-stone-600 hover:bg-stone-100'
            }`}
          >
            <Radio className="w-4 h-4" />
            <span>My Active Collections</span>
            {activeCollections.length > 0 && (
              <span className="px-2 py-0.5 rounded-full text-xs font-black bg-rose-500 text-white animate-pulse">
                {activeCollections.length}
              </span>
            )}
          </button>

          <button
            onClick={() => setActiveTab('history')}
            className={`px-4 py-2.5 rounded-xl font-bold text-xs sm:text-sm flex items-center gap-2 transition-all cursor-pointer ${
              activeTab === 'history'
                ? 'bg-emerald-600 text-white shadow-xs'
                : 'bg-stone-50 text-stone-600 hover:bg-stone-100'
            }`}
          >
            <PackageCheck className="w-4 h-4" />
            <span>Completed History</span>
            <span
              className={`px-2 py-0.5 rounded-full text-xs font-black ${
                activeTab === 'history' ? 'bg-emerald-700 text-white' : 'bg-stone-200 text-stone-700'
              }`}
            >
              {completedCollections.length}
            </span>
          </button>

          <button
            onClick={() => setActiveTab('settings')}
            className={`px-4 py-2.5 rounded-xl font-bold text-xs sm:text-sm flex items-center gap-2 transition-all cursor-pointer ${
              activeTab === 'settings'
                ? 'bg-emerald-600 text-white shadow-xs'
                : 'bg-stone-50 text-stone-600 hover:bg-stone-100'
            }`}
          >
            <Sliders className="w-4 h-4" />
            <span>Radius & Preferences</span>
          </button>

          {/* Slide-over Recent Notifications Action Button */}
          <button
            onClick={() => setNotificationsOpen(true)}
            className={`ml-auto px-4 py-2.5 rounded-xl font-bold text-xs sm:text-sm flex items-center gap-2 transition-all cursor-pointer border ${
              unreadNotifCount > 0
                ? 'bg-emerald-50 text-emerald-900 border-emerald-300 hover:bg-emerald-100 shadow-xs'
                : 'bg-white text-stone-700 border-stone-200 hover:bg-stone-50'
            }`}
            aria-label="Open Recent Notifications slide-over"
          >
            <div className="relative">
              <Bell className={`w-4 h-4 ${unreadNotifCount > 0 ? 'text-emerald-700' : 'text-stone-500'}`} />
              {unreadNotifCount > 0 && (
                <span className="absolute -top-1 -right-1 w-2 h-2 rounded-full bg-emerald-600 animate-ping" />
              )}
            </div>
            <span>Recent Notifications</span>
            {unreadNotifCount > 0 ? (
              <span className="px-2 py-0.5 rounded-full text-xs font-black bg-emerald-600 text-white">
                {unreadNotifCount}
              </span>
            ) : (
              <span className="px-2 py-0.5 rounded-full text-xs font-medium bg-stone-100 text-stone-600">
                0
              </span>
            )}
          </button>
        </div>
      </div>

      {/* TAB 1: AVAILABLE COLLECTIONS */}
      {activeTab === 'available' && (
        <div className="space-y-6">
          {/* Browser Push Notification Opt-in Prompt Banner */}
          {fcmSupported && !fcmEnabled && fcmPermission !== 'denied' && (
            <div className="bg-gradient-to-r from-emerald-700 to-teal-800 text-white rounded-2xl p-4 sm:p-5 shadow-sm flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 animate-in fade-in">
              <div className="flex items-start sm:items-center gap-3.5">
                <div className="w-10 h-10 rounded-xl bg-white/15 flex items-center justify-center shrink-0">
                  <BellRing className="w-5 h-5 text-amber-300 animate-pulse" />
                </div>
                <div>
                  <h4 className="font-bold text-sm sm:text-base flex items-center gap-2">
                    <span>Enable Browser Push Notifications</span>
                    <span className="text-[10px] uppercase font-black px-2 py-0.5 rounded-full bg-amber-400 text-stone-950">
                      Firebase Cloud Messaging
                    </span>
                  </h4>
                  <p className="text-xs text-emerald-100/90 mt-0.5">
                    Get instant native desktop and mobile lock-screen alerts whenever surplus food is posted within {radiusKm} km of your base.
                  </p>
                </div>
              </div>
              <button
                onClick={handleTogglePushNotifications}
                disabled={fcmLoading}
                className="bg-amber-400 hover:bg-amber-300 text-stone-950 font-bold text-xs px-4 py-2.5 rounded-xl transition-colors cursor-pointer shrink-0 shadow-xs flex items-center gap-1.5 disabled:opacity-50"
              >
                {fcmLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Bell className="w-4 h-4" />}
                <span>Enable Push Alerts</span>
              </button>
            </div>
          )}

          {/* Filter Bar with Proximity and View Mode Switcher */}
          <div className="bg-white p-4 rounded-2xl border border-stone-200 flex flex-wrap items-center justify-between gap-4 shadow-2xs">
            <div className="flex flex-wrap items-center gap-2">
              <div className="flex items-center gap-2 text-xs font-bold text-stone-700 pr-2 border-r border-stone-200">
                <Compass className="w-4 h-4 text-emerald-600" />
                <span>Proximity Filter:</span>
              </div>
              <div className="flex flex-wrap items-center gap-1.5">
                {[3, 5, 10, 20, 0].map((r) => (
                  <button
                    key={r}
                    onClick={() => setSelectedRadiusFilter(r)}
                    className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-colors cursor-pointer ${
                      selectedRadiusFilter === r
                        ? 'bg-emerald-600 text-white shadow-xs'
                        : 'bg-stone-100 text-stone-700 hover:bg-stone-200'
                    }`}
                  >
                    {r === 0 ? 'All Regions' : `Within ${r} km`}
                  </button>
                ))}
              </div>
            </div>

            {/* View Mode Switcher */}
            <div className="flex items-center bg-stone-100 p-1 rounded-xl text-xs font-bold gap-1">
              <button
                onClick={() => setAvailableViewMode('map')}
                className={`px-3 py-1.5 rounded-lg flex items-center gap-1.5 transition-all cursor-pointer ${
                  availableViewMode === 'map'
                    ? 'bg-white text-emerald-800 shadow-xs font-black'
                    : 'text-stone-600 hover:text-stone-900'
                }`}
                title="Cluster Radar Map View"
              >
                <MapIcon className="w-3.5 h-3.5 text-emerald-600" />
                <span>Map Radar</span>
              </button>
              <button
                onClick={() => setAvailableViewMode('split')}
                className={`px-3 py-1.5 rounded-lg flex items-center gap-1.5 transition-all cursor-pointer ${
                  availableViewMode === 'split'
                    ? 'bg-white text-emerald-800 shadow-xs font-black'
                    : 'text-stone-600 hover:text-stone-900'
                }`}
                title="Split Map & List View"
              >
                <Layers className="w-3.5 h-3.5 text-blue-600" />
                <span className="hidden sm:inline">Split View</span>
              </button>
              <button
                onClick={() => setAvailableViewMode('grid')}
                className={`px-3 py-1.5 rounded-lg flex items-center gap-1.5 transition-all cursor-pointer ${
                  availableViewMode === 'grid'
                    ? 'bg-white text-emerald-800 shadow-xs font-black'
                    : 'text-stone-600 hover:text-stone-900'
                }`}
                title="Cards Grid View"
              >
                <LayoutGrid className="w-3.5 h-3.5 text-amber-600" />
                <span>Cards Grid</span>
              </button>
            </div>
          </div>

          {/* REAL-TIME CLUSTER MAP VIEW */}
          {(availableViewMode === 'map' || availableViewMode === 'split') && (
            <div className="space-y-4">
              <VolunteerClusterMap
                donations={donations}
                volunteerLat={volLat}
                volunteerLng={volLng}
                baseRadiusKm={selectedRadiusFilter || radiusKm || 10}
                onSelectDonation={onSelectDonation}
                onAcceptRequest={handleAcceptRequest}
                claimingDonationId={claimingDonationId}
                height={availableViewMode === 'split' ? '440px' : '520px'}
              />
            </div>
          )}

          {availableCollections.length === 0 ? (
            <div className="bg-white rounded-3xl p-12 text-center border border-stone-200 max-w-xl mx-auto space-y-4">
              <div className="w-16 h-16 rounded-full bg-emerald-50 text-emerald-600 flex items-center justify-center mx-auto">
                <CheckCircle2 className="w-8 h-8" />
              </div>
              <h3 className="text-lg font-bold text-stone-900">No Food Awaiting Pickup In This Radius</h3>
              <p className="text-xs text-stone-500 max-w-md mx-auto">
                All surplus food requests within {selectedRadiusFilter ? `${selectedRadiusFilter} km` : 'your area'} are currently claimed or delivered! You will receive real-time notifications as soon as new donations are submitted.
              </p>
              <button
                onClick={() => setSelectedRadiusFilter(0)}
                className="text-xs font-bold text-emerald-700 hover:text-emerald-800 underline cursor-pointer"
              >
                Expand radius to view all regional surplus listings
              </button>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
              {availableCollections.map((donation) => (
                <div
                  key={donation.id}
                  className="bg-white rounded-2xl border border-stone-200 hover:border-emerald-300 transition-all shadow-sm hover:shadow-md overflow-hidden flex flex-col justify-between"
                >
                  <div>
                    {/* Image / Header */}
                    <div className="relative h-44 bg-stone-100 overflow-hidden">
                      {donation.imageUrl ? (
                        <img
                          src={donation.imageUrl}
                          alt={donation.foodName}
                          className="w-full h-full object-cover"
                        />
                      ) : (
                        <div className="w-full h-full flex items-center justify-center text-stone-400 font-bold text-xs">
                          Food Surplus Listing
                        </div>
                      )}
                      {/* Urgency Badge & Distance */}
                      {(() => {
                        const timeInfo = getRemainingTimeInfo(donation);
                        return (
                          <div className="absolute top-3 left-3 flex flex-wrap gap-1.5">
                            <span className="px-2.5 py-1 rounded-full text-[11px] font-black bg-stone-900/80 text-white backdrop-blur-xs flex items-center gap-1">
                              <Compass className="w-3 h-3 text-emerald-400" />
                              <span>{donation.distanceKm ? `${donation.distanceKm.toFixed(1)} km away` : '< 1 km'}</span>
                            </span>
                            <span
                              className={`px-2.5 py-1 rounded-full text-[11px] font-black shadow-xs flex items-center gap-1 ${
                                timeInfo.isUrgent
                                  ? 'bg-rose-500 text-white animate-pulse'
                                  : 'bg-amber-500 text-stone-950'
                              }`}
                            >
                              <Clock className="w-3 h-3" />
                              <span>{timeInfo.isUrgent ? `⚠️ Urgent: ${timeInfo.label}` : timeInfo.label}</span>
                            </span>
                          </div>
                        );
                      })()}
                      <div className="absolute top-3 right-3">
                        <span className="px-2.5 py-1 rounded-full text-[11px] font-black bg-emerald-600 text-white shadow-xs">
                          {donation.category}
                        </span>
                      </div>
                    </div>

                    {/* Body */}
                    <div className="p-5 space-y-3">
                      <div>
                        <h3 className="font-bold text-stone-900 text-base leading-snug line-clamp-1">
                          {donation.foodName}
                        </h3>
                        <p className="text-xs text-stone-500 mt-1 line-clamp-2">
                          {donation.description || 'Nutritious surplus ready for volunteer collection and shelter transport.'}
                        </p>
                      </div>

                      {/* Scheduled Pickup Window */}
                      <div className="bg-emerald-50/70 border border-emerald-100 rounded-xl p-2.5 text-xs text-emerald-950 flex items-start gap-2">
                        <Calendar className="w-4 h-4 text-emerald-700 shrink-0 mt-0.5" />
                        <div>
                          <div className="font-bold text-[11px] uppercase tracking-wider text-emerald-800">
                            Scheduled Pickup Window
                          </div>
                          <div className="font-semibold text-xs mt-0.5">
                            {formatPickupWindow(donation)}
                          </div>
                          {donation.preferredPickupTime && (
                            <div className="text-[11px] text-emerald-700 mt-0.5">
                              Preferred time: <strong>{donation.preferredPickupTime}</strong>
                            </div>
                          )}
                        </div>
                      </div>

                      <div className="space-y-1.5 pt-2 border-t border-stone-100 text-xs text-stone-600">
                        <div className="flex items-center justify-between">
                          <span className="text-stone-400">Quantity:</span>
                          <span className="font-bold text-stone-800">
                            {donation.quantity} {donation.unit} ({donation.servings || donation.quantity * 2} servings)
                          </span>
                        </div>
                        <div className="flex items-center justify-between">
                          <span className="text-stone-400">Donor:</span>
                          <span className="font-semibold text-stone-800 truncate max-w-[180px]">
                            {donation.donorName}
                          </span>
                        </div>
                        <div className="flex items-center gap-1.5 text-stone-500 pt-1">
                          <MapPin className="w-3.5 h-3.5 text-emerald-600 shrink-0" />
                          <span className="truncate">{donation.pickupAddress}</span>
                        </div>
                        {donation.storageType && (
                          <div className="text-[11px] text-amber-800 bg-amber-50 px-2.5 py-1 rounded-lg">
                            Storage: {donation.storageType}
                          </div>
                        )}
                      </div>
                    </div>
                  </div>

                  {/* Accept CTA */}
                  <div className="p-5 pt-0">
                    <button
                      onClick={() => handleAcceptRequest(donation)}
                      disabled={claimingDonationId === donation.id}
                      className="w-full bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-xs sm:text-sm py-3 rounded-xl transition-all shadow-xs flex items-center justify-center gap-2 cursor-pointer disabled:opacity-50"
                    >
                      {claimingDonationId === donation.id ? (
                        <>
                          <Loader2 className="w-4 h-4 animate-spin" />
                          <span>Reserving Collection...</span>
                        </>
                      ) : (
                        <>
                          <CheckCircle2 className="w-4 h-4" />
                          <span>Accept Collection Request</span>
                        </>
                      )}
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* TAB 2: MY ACTIVE COLLECTIONS */}
      {activeTab === 'active' && (
        <div className="space-y-6">
          {activeCollections.length === 0 ? (
            <div className="bg-white rounded-3xl p-12 text-center border border-stone-200 max-w-xl mx-auto space-y-4">
              <div className="w-16 h-16 rounded-full bg-stone-100 text-stone-400 flex items-center justify-center mx-auto">
                <Bike className="w-8 h-8" />
              </div>
              <h3 className="text-lg font-bold text-stone-900">No Active Collection Runs Right Now</h3>
              <p className="text-xs text-stone-500 max-w-md mx-auto">
                You do not have any food collections currently in progress. Browse available requests and accept a run to begin rescue logistics!
              </p>
              <button
                onClick={() => setActiveTab('available')}
                className="bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-xs px-5 py-2.5 rounded-xl transition-colors cursor-pointer"
              >
                Browse Available Food Collections
              </button>
            </div>
          ) : (
            activeCollections.map((donation) => (
              <div
                key={donation.id}
                className="bg-white rounded-3xl border border-emerald-200 shadow-md p-6 sm:p-8 space-y-6"
              >
                {/* Active Header & Stepper */}
                <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4 pb-6 border-b border-stone-100">
                  <div>
                    <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full text-xs font-bold bg-emerald-100 text-emerald-800 mb-2">
                      <Radio className="w-3.5 h-3.5 text-emerald-600 animate-pulse" />
                      <span>Collection Mission in Progress</span>
                    </div>
                    <h2 className="text-xl sm:text-2xl font-black text-stone-900">
                      {donation.foodName}
                    </h2>
                    <p className="text-xs text-stone-500">
                      {donation.quantity} {donation.unit} • Donor: {donation.donorName}
                    </p>
                  </div>

                  {/* Actions / Pre-pickup cancellation */}
                  <div className="flex items-center gap-3">
                    {['accepted', 'scheduled'].includes(donation.status) && (
                      <button
                        onClick={() => setCancelModalDonation(donation)}
                        className="px-4 py-2 rounded-xl border border-rose-200 hover:bg-rose-50 text-rose-700 text-xs font-bold transition-colors cursor-pointer"
                      >
                        Cancel Collection
                      </button>
                    )}
                  </div>
                </div>

                {/* Visual Status Progression Stepper */}
                <div className="py-2">
                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                    {[
                      { status: 'accepted', label: '1. Request Accepted', icon: CheckCircle2 },
                      { status: 'picked_up', label: '2. Food Picked Up', icon: PackageCheck },
                      { status: 'in_transit', label: '3. In Transit to Shelter', icon: Bike },
                      { status: 'delivered', label: '4. Delivered to Shelter', icon: Award },
                    ].map((step, idx) => {
                      const isPast =
                        (step.status === 'accepted' && ['accepted', 'picked_up', 'in_transit', 'delivered', 'completed'].includes(donation.status)) ||
                        (step.status === 'picked_up' && ['picked_up', 'in_transit', 'delivered', 'completed'].includes(donation.status)) ||
                        (step.status === 'in_transit' && ['in_transit', 'delivered', 'completed'].includes(donation.status)) ||
                        (step.status === 'delivered' && ['delivered', 'completed'].includes(donation.status));

                      const isCurrent = donation.status === step.status;

                      return (
                        <div
                          key={step.status}
                          className={`p-3.5 rounded-2xl border transition-all ${
                            isCurrent
                              ? 'bg-emerald-50 border-emerald-400 shadow-xs'
                              : isPast
                              ? 'bg-stone-50 border-stone-200 text-emerald-800'
                              : 'bg-stone-50/50 border-stone-200 opacity-50'
                          }`}
                        >
                          <div className="flex items-center gap-2">
                            <step.icon
                              className={`w-4 h-4 ${
                                isPast || isCurrent ? 'text-emerald-600' : 'text-stone-400'
                              }`}
                            />
                            <span className="text-xs font-bold text-stone-900">{step.label}</span>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>

                {/* Transition Action Buttons */}
                <div className="bg-stone-50 p-4 rounded-2xl border border-stone-200 flex flex-wrap items-center justify-between gap-4">
                  <div className="text-xs text-stone-600">
                    <span className="font-bold text-stone-900">Current Status:</span>{' '}
                    <span className="uppercase text-emerald-700 font-bold">{donation.status.replace('_', ' ')}</span>
                  </div>

                  <div className="flex flex-wrap items-center gap-2">
                    {donation.status === 'accepted' && (
                      <button
                        onClick={() => handleTransitionStatus(donation, 'picked_up')}
                        disabled={statusUpdating}
                        className="bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-xs px-4 py-2.5 rounded-xl shadow-xs transition-colors flex items-center gap-2 cursor-pointer disabled:opacity-50"
                      >
                        <PackageCheck className="w-4 h-4" />
                        <span>Confirm Food Picked Up from Donor</span>
                      </button>
                    )}

                    {donation.status === 'picked_up' && (
                      <button
                        onClick={() => handleTransitionStatus(donation, 'in_transit')}
                        disabled={statusUpdating}
                        className="bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-xs px-4 py-2.5 rounded-xl shadow-xs transition-colors flex items-center gap-2 cursor-pointer disabled:opacity-50"
                      >
                        <Bike className="w-4 h-4" />
                        <span>Depart to Shelter (In Transit)</span>
                      </button>
                    )}

                    {donation.status === 'in_transit' && (
                      <button
                        onClick={() => handleTransitionStatus(donation, 'delivered')}
                        disabled={statusUpdating}
                        className="bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-xs px-4 py-2.5 rounded-xl shadow-xs transition-colors flex items-center gap-2 cursor-pointer disabled:opacity-50"
                      >
                        <Award className="w-4 h-4" />
                        <span>Confirm Delivery at Shelter</span>
                      </button>
                    )}

                    {donation.status === 'delivered' && (
                      <button
                        onClick={() => handleTransitionStatus(donation, 'completed')}
                        disabled={statusUpdating}
                        className="bg-stone-900 hover:bg-stone-800 text-white font-bold text-xs px-4 py-2.5 rounded-xl shadow-xs transition-colors flex items-center gap-2 cursor-pointer disabled:opacity-50"
                      >
                        <CheckCircle2 className="w-4 h-4 text-emerald-400" />
                        <span>Finalize Mission & Archive</span>
                      </button>
                    )}
                  </div>
                </div>

                {/* Live GPS & Route Tracking Map */}
                <div className="space-y-3">
                  <div className="flex items-center justify-between">
                    <h3 className="text-sm font-bold text-stone-900 flex items-center gap-2">
                      <Radio className="w-4 h-4 text-emerald-600" />
                      <span>Live Courier Navigation & Radar</span>
                    </h3>
                    <span className="text-xs text-stone-500">
                      Donor and Shelter can view your pulse position in real time
                    </span>
                  </div>

                  <LiveTrackingMap donation={donation} height="400px" allowBroadcast={true} />
                </div>

                {/* Pickup and Shelter Address Cards */}
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-xs">
                  <div className="p-4 rounded-2xl bg-stone-50 border border-stone-200 space-y-2">
                    <div className="font-bold text-emerald-800 flex items-center gap-1.5 uppercase tracking-wider text-[11px]">
                      <MapPin className="w-3.5 h-3.5" />
                      <span>Pickup: Donor Facility</span>
                    </div>
                    <div className="font-bold text-stone-900 text-sm">{donation.donorName}</div>
                    <div className="text-stone-600">{donation.pickupAddress}</div>
                    <div className="pt-2 flex items-center gap-3">
                      <a
                        href={`https://www.google.com/maps/dir/?api=1&destination=${donation.latitude || 28.6139},${donation.longitude || 77.209}`}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-emerald-700 font-bold flex items-center gap-1 hover:underline"
                      >
                        <span>Get Directions</span>
                        <ExternalLink className="w-3 h-3" />
                      </a>
                    </div>
                  </div>

                  <div className="p-4 rounded-2xl bg-stone-50 border border-stone-200 space-y-2">
                    <div className="font-bold text-blue-800 flex items-center gap-1.5 uppercase tracking-wider text-[11px]">
                      <Building2 className="w-3.5 h-3.5" />
                      <span>Dropoff: Recipient Shelter</span>
                    </div>
                    <div className="font-bold text-stone-900 text-sm">
                      {donation.assignedNgoName || 'Verified Community Shelter'}
                    </div>
                    <div className="text-stone-600">
                      {donation.dropoffAddress || 'Shelter Central Hub, Food Rescue Network'}
                    </div>
                    <div className="pt-2 flex items-center gap-3">
                      <a
                        href={`https://www.google.com/maps/dir/?api=1&destination=${donation.dropoffLatitude || 28.5729},${donation.dropoffLongitude || 77.2215}`}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-blue-700 font-bold flex items-center gap-1 hover:underline"
                      >
                        <span>Get Directions</span>
                        <ExternalLink className="w-3 h-3" />
                      </a>
                    </div>
                  </div>
                </div>
              </div>
            ))
          )}
        </div>
      )}

      {/* TAB 3: COMPLETED HISTORY */}
      {activeTab === 'history' && (
        <div className="space-y-6">
          <div className="bg-white rounded-3xl p-6 sm:p-8 border border-stone-200">
            <h3 className="text-lg font-black text-stone-900 mb-4">Your Completed Food Rescue Runs</h3>

            {completedCollections.length === 0 ? (
              <div className="text-center py-12 text-stone-400 text-xs">
                No past deliveries recorded yet. Once you complete your first collection run, your verified impact certificate will appear here!
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs text-stone-700">
                  <thead className="bg-stone-50 text-stone-500 font-bold uppercase tracking-wider border-b border-stone-200">
                    <tr>
                      <th className="py-3 px-4">Food Item</th>
                      <th className="py-3 px-4">Quantity / Meals</th>
                      <th className="py-3 px-4">Donor</th>
                      <th className="py-3 px-4">Recipient Shelter</th>
                      <th className="py-3 px-4">Completion Date</th>
                      <th className="py-3 px-4">Status</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-stone-100">
                    {completedCollections.map((donation) => (
                      <tr key={donation.id} className="hover:bg-stone-50/60">
                        <td className="py-3.5 px-4 font-bold text-stone-900">{donation.foodName}</td>
                        <td className="py-3.5 px-4">
                          {donation.quantity} {donation.unit} (~{donation.servings || donation.quantity * 2} meals)
                        </td>
                        <td className="py-3.5 px-4">{donation.donorName}</td>
                        <td className="py-3.5 px-4">{donation.assignedNgoName || 'Community Shelter'}</td>
                        <td className="py-3.5 px-4 text-stone-500">
                          {donation.deliveredAt ? new Date(donation.deliveredAt).toLocaleDateString() : 'Recent'}
                        </td>
                        <td className="py-3.5 px-4">
                          <span className="inline-flex items-center gap-1 text-emerald-700 font-bold bg-emerald-50 px-2 py-0.5 rounded-full">
                            <CheckCircle2 className="w-3 h-3" />
                            <span>Delivered</span>
                          </span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>
      )}

      {/* TAB 4: VOLUNTEER SETTINGS & RADIUS */}
      {activeTab === 'settings' && (
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
      )}

      {/* Cancellation Modal */}
      {cancelModalDonation && (
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-3xl max-w-md w-full p-6 shadow-2xl border border-stone-200 space-y-4">
            <div className="w-12 h-12 rounded-2xl bg-rose-100 text-rose-700 flex items-center justify-center">
              <AlertTriangle className="w-6 h-6" />
            </div>
            <div>
              <h3 className="text-lg font-bold text-stone-900">Cancel Collection Assignment?</h3>
              <p className="text-xs text-stone-500 mt-1">
                This will release <span className="font-bold text-stone-800">"{cancelModalDonation.foodName}"</span> back into the pool so other nearby volunteers can collect it before the deadline.
              </p>
            </div>

            <div className="space-y-1.5 text-xs">
              <label className="font-bold text-stone-700">Reason for release:</label>
              <select
                value={cancelReason}
                onChange={(e) => setCancelReason(e.target.value)}
                className="w-full p-2.5 rounded-xl border border-stone-300 bg-stone-50 text-stone-800 focus:outline-emerald-600 text-xs"
              >
                <option value="Change in schedule / Vehicle issue">Change in schedule / Vehicle issue</option>
                <option value="Traffic delay / Too far to reach before deadline">Traffic delay / Too far to reach before deadline</option>
                <option value="Donor location unreachable">Donor location unreachable</option>
                <option value="Personal emergency">Personal emergency</option>
              </select>
            </div>

            <div className="flex items-center justify-end gap-2.5 pt-2">
              <button
                onClick={() => setCancelModalDonation(null)}
                className="px-4 py-2 rounded-xl border border-stone-300 text-stone-700 text-xs font-semibold hover:bg-stone-50 cursor-pointer"
              >
                Keep Assignment
              </button>
              <button
                onClick={handleConfirmCancel}
                disabled={cancelling}
                className="px-4 py-2 rounded-xl bg-rose-600 hover:bg-rose-700 text-white text-xs font-bold transition-colors cursor-pointer flex items-center gap-1.5"
              >
                {cancelling ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : null}
                <span>Release Assignment</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Recent Notifications Slide-over Panel */}
      <VolunteerNotificationsSlideOver
        isOpen={notificationsOpen}
        onClose={() => setNotificationsOpen(false)}
        userId={currentUser?.uid || ''}
        donations={donations}
        onSelectDonation={onSelectDonation}
        onNavigateTab={(tab) => setActiveTab(tab as any)}
      />
    </div>
  );
};
