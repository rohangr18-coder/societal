import React, { useState, useEffect, useMemo } from 'react';
import {
  Bike,
  Compass,
  CheckCircle2,
  AlertCircle,
  Radio,
  Sliders,
  Bell,
  BellRing,
  Loader2,
  PackageCheck,
  LayoutGrid,
  Map as MapIcon,
  Layers,
  Camera,
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
import { isDonationExpired as checkFoodSafetyExpired } from '../utils/foodSafety';
import { LiveTrackingMap } from './LiveTrackingMap';
import { VolunteerNotificationsSlideOver } from './VolunteerNotificationsSlideOver';
import { VolunteerClusterMap } from './VolunteerClusterMap';
import { VolunteerQRScannerModal } from './VolunteerQRScannerModal';
import { AvailableCollectionCard } from './volunteer/AvailableCollectionCard';
import { ActiveCollectionCard } from './volunteer/ActiveCollectionCard';
import { VolunteerHistoryTab } from './volunteer/VolunteerHistoryTab';
import { VolunteerSettingsTab } from './volunteer/VolunteerSettingsTab';
import { VolunteerCancellationModal } from './volunteer/VolunteerCancellationModal';
import { VolunteerStatsHeader } from './volunteer/VolunteerStatsHeader';
import { QRVerificationModal } from './QRVerificationModal';
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
  const [recentlyAccepted, setRecentlyAccepted] = useState<Donation[]>([]);

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

  // Volunteer QR Scanner modal state
  const [scannerOpen, setScannerOpen] = useState<boolean>(false);

  // Delivery & Pickup QR Verification modal state
  const [qrModal, setQrModal] = useState<{
    isOpen: boolean;
    mode: 'scan_pickup' | 'scan_delivery';
    donation: Donation | null;
  }>({ isOpen: false, mode: 'scan_pickup', donation: null });

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
      .catch((profileErr) => {
        console.warn('[VolunteerView] Profile lookup notice:', profileErr);
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

  // Extract a concise, safe technical detail without exposing serialized user/auth JSON
  const extractSafeErrorDetail = (err: any): string => {
    let raw = err?.message || String(err || 'Unexpected error');
    try {
      const parsed = JSON.parse(raw);
      if (parsed && typeof parsed.error === 'string') {
        raw = parsed.error;
      }
    } catch {
      // Not JSON
    }
    return raw.length > 140 ? `${raw.slice(0, 140)}…` : raw;
  };

  // Atomic accept request
  const handleAcceptRequest = async (donation: Donation) => {
    if (!currentUser) {
      onNavigateTab && onNavigateTab('auth');
      return;
    }

    if (isDonationExpired(donation)) {
      setActionMessage({
        type: 'error',
        text: 'Food Safety Alert: This donation has passed its safe consumption deadline and can no longer be accepted.',
      });
      return;
    }

    setClaimingDonationId(donation.id);
    setActionMessage(null);

    try {
      // Ensure user profile is saved with role:'volunteer' in Firestore before accepting
      if (userProfile?.role !== 'volunteer' && userProfile?.role !== 'admin') {
        await updateRole('volunteer');
      }

      const volunteerName =
        userProfile?.displayName || currentUser.email?.split('@')[0] || 'Volunteer Courier';
      const volunteerPhone = userProfile?.phone || profile?.phone || '+91 98765 43210';

      const res = await acceptDonationByVolunteer(
        donation.id,
        currentUser.uid,
        volunteerName,
        volunteerPhone
      );

      if (res.success) {
        if (res.donation) {
          setRecentlyAccepted((prev) => [res.donation!, ...prev.filter((d) => d.id !== res.donation!.id)]);
        }
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
      const detail = extractSafeErrorDetail(err);
      setActionMessage({
        type: 'error',
        text: `Could not accept this collection, please try again. (${detail})`,
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

    if (nextStatus === 'picked_up') {
      if (isDonationExpired(donation)) {
        setActionMessage({
          type: 'error',
          text: 'Food Safety Alert: This donation has expired and cannot be picked up.',
        });
        return;
      }
      setScannerOpen(true);
      return;
    }
    if (nextStatus === 'delivered') {
      setQrModal({ isOpen: true, mode: 'scan_delivery', donation });
      return;
    }

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

  // Time-aware helpers using centralized food-safety expiration evaluation
  const isDonationExpired = (d: Donation): boolean =>
    d.status === 'expired' ||
    (['available', 'requested', 'accepted', 'scheduled'].includes(d.status) &&
      checkFoodSafetyExpired(d).isExpired);

  const getRemainingTimeInfo = (d: Donation) => {
    const deadline = d.collectionDeadline || d.pickupDeadline;
    if (!deadline) return { label: 'Urgent', isUrgent: false, isExpired: false, minutesRemaining: 999 };
    const t = new Date(deadline).getTime();
    if (isNaN(t)) return { label: deadline, isUrgent: false, isExpired: false, minutesRemaining: 999 };
    const diffMs = t - Date.now();
    if (diffMs <= 0) return { label: 'Expired', isUrgent: false, isExpired: true, minutesRemaining: 0 };
    const totalMins = Math.floor(diffMs / (1000 * 60));
    const hours = Math.floor(totalMins / 60);
    const mins = totalMins % 60;
    return {
      label: hours > 0 ? `${hours}h ${mins}m remaining` : `${mins}m remaining`,
      isUrgent: totalMins <= 45,
      isExpired: false,
      minutesRemaining: totalMins,
    };
  };

  const formatPickupWindow = (d: Donation): string => {
    const today = new Date().toISOString().split('T')[0];
    const dateLabel = d.pickupDate ? (d.pickupDate === today ? 'Today' : d.pickupDate) : 'Today';
    return d.availableFrom && d.availableUntil
      ? `${dateLabel}, ${d.availableFrom} – ${d.availableUntil} (${d.timeZone || 'Asia/Kolkata'})`
      : `${dateLabel}, ${d.pickupDeadline || 'As soon as possible'}`;
  };

  // Filter available collections: exclude expired, claimed, or recently accepted donations
  const availableCollections = donations
    .filter(
      (d) =>
        (d.status === 'available' || d.status === 'requested') &&
        !isDonationExpired(d) &&
        !d.assignedVolunteerId &&
        !recentlyAccepted.some((r) => r.id === d.id)
    )
    .map((d) => ({
      ...d,
      distanceKm: d.latitude && d.longitude ? calculateDistanceKmSafe(volLat, volLng, d.latitude, d.longitude, 0) : 0,
    }))
    .filter((d) => selectedRadiusFilter === 0 || d.distanceKm <= selectedRadiusFilter)
    .sort((a, b) => a.distanceKm - b.distanceKm);

  // Active collection for this volunteer (snapshot merged with local immediate accepts)
  const activeCollections = useMemo(() => {
    const list = donations.filter(
      (d) =>
        currentUser &&
        d.assignedVolunteerId === currentUser.uid &&
        ['accepted', 'scheduled', 'picked_up', 'in_transit'].includes(d.status)
    );
    for (const r of recentlyAccepted) {
      if (!list.some((d) => d.id === r.id)) list.unshift(r);
    }
    return list;
  }, [donations, currentUser, recentlyAccepted]);

  // Completed collections for this volunteer
  const completedCollections = donations.filter(
    (d) =>
      currentUser &&
      d.assignedVolunteerId === currentUser.uid &&
      ['delivered', 'completed'].includes(d.status)
  );

  // Total metrics
  const totalMealsDelivered = completedCollections.reduce((acc, cur) => acc + (cur.servings || Math.round(cur.quantity * 2.5)), 0);
  const totalKgRescued = completedCollections.reduce((acc, cur) => {
    const kg = cur.unit.toLowerCase() === 'kg' ? cur.quantity : cur.servings ? cur.servings * 0.4 : cur.quantity * 0.5;
    return acc + Math.round(kg);
  }, 0);

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
      {/* Alert / Feedback Toast */}
      {actionMessage && (
        <div className={`mb-6 p-4 rounded-2xl flex items-center justify-between gap-3 shadow-xs animate-in fade-in duration-200 ${actionMessage.type === 'success' ? 'bg-emerald-50 border border-emerald-200 text-emerald-900' : 'bg-rose-50 border border-rose-200 text-rose-900'}`}>
          <div className="flex items-center gap-3 text-sm font-medium">
            {actionMessage.type === 'success' ? <CheckCircle2 className="w-5 h-5 text-emerald-600 shrink-0" /> : <AlertCircle className="w-5 h-5 text-rose-600 shrink-0" />}
            <span>{actionMessage.text}</span>
          </div>
          <button onClick={() => setActionMessage(null)} className="text-xs font-bold uppercase tracking-wider text-stone-500 hover:text-stone-800 cursor-pointer">
            Dismiss
          </button>
        </div>
      )}

      <VolunteerStatsHeader
        showRoleBanner={Boolean(currentUser && userProfile?.role !== 'volunteer')}
        userRole={userProfile?.role}
        isAvailable={isAvailable}
        radiusKm={radiusKm}
        vehicleType={vehicleType}
        optInNotifs={optInNotifs}
        unreadNotifCount={unreadNotifCount}
        activeCount={activeCollections.length}
        completedCount={completedCollections.length}
        totalMealsDelivered={totalMealsDelivered}
        onActivateRole={handleActivateVolunteerRole}
        onOpenNotifications={() => setNotificationsOpen(true)}
      >
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

        {/* QR Code Scanner to scan Donor's display screen and trigger pickup */}
        <button
          onClick={() => setScannerOpen(true)}
          className="ml-auto px-4 py-2.5 rounded-xl font-bold text-xs sm:text-sm flex items-center gap-2 bg-gradient-to-r from-emerald-700 to-teal-800 hover:from-emerald-800 hover:to-teal-900 text-white shadow-xs transition-all cursor-pointer"
          title="Scan Donor Display Screen to Verify Pickup"
        >
          <Camera className="w-4 h-4" />
          <span>Scan Donor Screen</span>
        </button>

        {/* Slide-over Recent Notifications Action Button */}
        <button
          onClick={() => setNotificationsOpen(true)}
          className={`px-4 py-2.5 rounded-xl font-bold text-xs sm:text-sm flex items-center gap-2 transition-all cursor-pointer border ${
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
      </VolunteerStatsHeader>

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
                <AvailableCollectionCard
                  key={donation.id}
                  donation={donation}
                  claimingDonationId={claimingDonationId}
                  onAccept={handleAcceptRequest}
                  getRemainingTimeInfo={getRemainingTimeInfo}
                  formatPickupWindow={formatPickupWindow}
                />
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
            <>
              {activeCollections.map((donation) => (
                <ActiveCollectionCard
                  key={donation.id}
                  donation={donation}
                  statusUpdating={statusUpdating}
                  onCancel={(d) => setCancelModalDonation(d)}
                  onScanPickup={() => setScannerOpen(true)}
                  onScanDelivery={(d) => setQrModal({ isOpen: true, mode: 'scan_delivery', donation: d })}
                  onTransitionStatus={handleTransitionStatus}
                />
              ))}
              {/* Active collections card: Scan Donor Screen to Verify */}
            </>
          )}
        </div>
      )}

      {/* TAB 3: COMPLETED HISTORY */}
      {activeTab === 'history' && (
        <VolunteerHistoryTab completedCollections={completedCollections} />
      )}

      {/* TAB 4: VOLUNTEER SETTINGS & RADIUS */}
      {activeTab === 'settings' && (
        <VolunteerSettingsTab
          isAvailable={isAvailable}
          setIsAvailable={setIsAvailable}
          radiusKm={radiusKm}
          setRadiusKm={setRadiusKm}
          vehicleType={vehicleType}
          setVehicleType={setVehicleType}
          handleDetectLocation={handleDetectLocation}
          gpsDetecting={gpsDetecting}
          volunteerCoords={volunteerCoords}
          optInNotifs={optInNotifs}
          setOptInNotifs={setOptInNotifs}
          fcmEnabled={fcmEnabled}
          fcmPermission={fcmPermission}
          fcmLoading={fcmLoading}
          handleTogglePushNotifications={handleTogglePushNotifications}
          testingFcm={testingFcm}
          handleTestPushNotification={handleTestPushNotification}
          fcmToken={fcmToken}
          copiedToken={copiedToken}
          handleCopyFcmToken={handleCopyFcmToken}
          savingSettings={savingSettings}
          handleSaveSettings={handleSaveSettings}
          userProfile={userProfile}
          handleActivateVolunteerRole={handleActivateVolunteerRole}
        />
      )}

      {/* Cancellation Modal */}
      <VolunteerCancellationModal
        donation={cancelModalDonation}
        cancelReason={cancelReason}
        setCancelReason={setCancelReason}
        cancelling={cancelling}
        onClose={() => setCancelModalDonation(null)}
        onConfirm={handleConfirmCancel}
      />

      {/* Handover Delivery QR Verification Modal */}
      {qrModal.isOpen && qrModal.donation && (
        <QRVerificationModal
          isOpen={qrModal.isOpen}
          mode={qrModal.mode}
          donation={qrModal.donation}
          onClose={() => setQrModal({ isOpen: false, mode: 'scan_pickup', donation: null })}
          onSuccess={() => {
            setQrModal({ isOpen: false, mode: 'scan_pickup', donation: null });
            setActionMessage({
              type: 'success',
              text: 'Delivery handover successfully verified! Food rescue completed.',
            });
            setActiveTab('history');
          }}
        />
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

      {/* Volunteer QR Scanner for Donor Display Screens */}
      <VolunteerQRScannerModal
        isOpen={scannerOpen}
        onClose={() => setScannerOpen(false)}
        donations={donations}
        onPickupVerified={(donationId) => {
          setActionMessage({
            type: 'success',
            text: `Pickup verified! Donation #${donationId.slice(0, 8)} has been confirmed and marked as picked up.`,
          });
          setActiveTab('active');
        }}
      />
    </div>
  );
};
