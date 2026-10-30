import React, { useState, useEffect } from 'react';
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
  Bell,
  BellRing,
  AlertCircle,
  Loader2,
  Send,
  Navigation,
  Compass,
  Radio,
  Check,
  ExternalLink,
  Copy,
  Info,
  Sliders,
} from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { UserRole, VolunteerProfile, NotificationPreferences } from '../types';
import {
  createOrUpdateUserProfile,
  getVolunteerProfile,
  saveVolunteerProfile,
} from '../services/dbService';
import {
  isFcmSupported,
  getVapidKey,
  enableUserPushNotifications,
  disableUserPushNotifications,
  enableVolunteerPushNotifications,
  disableVolunteerPushNotifications,
  sendTestBrowserPushNotification,
  getDefaultPreferences,
} from '../services/fcmService';

export const ProfileSettingsView: React.FC = () => {
  const { currentUser, userProfile, logout, refreshProfile, isAdmin } = useAuth();

  // Basic Profile State
  const [displayName, setDisplayName] = useState(userProfile?.displayName || '');
  const [phoneNumber, setPhoneNumber] = useState(userProfile?.phoneNumber || userProfile?.phone || '');
  const [role, setRole] = useState<UserRole>(userProfile?.role || 'donor');
  const [saving, setSaving] = useState(false);
  const [savedMessage, setSavedMessage] = useState(false);

  // Push Notifications & FCM State
  const [fcmSupported, setFcmSupported] = useState<boolean>(true);
  const [pushEnabled, setPushEnabled] = useState<boolean>(
    userProfile?.pushNotificationsEnabled ?? false
  );
  const [permissionState, setPermissionState] = useState<NotificationPermission>('default');
  const [fcmToken, setFcmToken] = useState<string | null>(userProfile?.fcmToken || null);
  const [notificationRadiusKm, setNotificationRadiusKm] = useState<number>(
    userProfile?.notificationRadiusKm || 10
  );
  const [volunteerData, setVolunteerData] = useState<VolunteerProfile | null>(null);

  // Role-specific Notification Preferences State
  const [preferences, setPreferences] = useState<NotificationPreferences>(
    userProfile?.notificationPreferences || getDefaultPreferences(userProfile?.role)
  );

  // UI Action states
  const [togglingPush, setTogglingPush] = useState<boolean>(false);
  const [testingPush, setTestingPush] = useState<boolean>(false);
  const [copiedToken, setCopiedToken] = useState<boolean>(false);
  const [feedback, setFeedback] = useState<{ type: 'success' | 'error' | 'info'; message: string } | null>(null);

  const configuredVapidKey = getVapidKey();

  // Synchronize state from userProfile and VolunteerProfile on mount
  useEffect(() => {
    if (!currentUser) return;

    // Check environment support
    isFcmSupported().then((supported) => {
      setFcmSupported(supported);
    });

    // Check browser notification permission
    if (typeof window !== 'undefined' && 'Notification' in window) {
      setPermissionState(Notification.permission);
    }

    if (userProfile?.notificationPreferences) {
      setPreferences(userProfile.notificationPreferences);
    }

    // Load volunteer profile if available
    getVolunteerProfile(currentUser.uid).then((vol) => {
      if (vol) {
        setVolunteerData(vol);
        if (vol.notificationRadiusKm) {
          setNotificationRadiusKm(vol.notificationRadiusKm);
        }
        if (vol.pushNotificationsEnabled !== undefined) {
          setPushEnabled(vol.pushNotificationsEnabled);
        }
        if (vol.fcmToken) {
          setFcmToken(vol.fcmToken);
        }
        if (vol.notificationPreferences) {
          setPreferences((prev) => ({ ...prev, ...vol.notificationPreferences }));
        }
      }
    });
  }, [currentUser]);

  if (!currentUser) return null;

  // Handle saving primary profile information
  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    setSavedMessage(false);
    setFeedback(null);
    try {
      await createOrUpdateUserProfile({
        uid: currentUser.uid,
        email: currentUser.email || '',
        displayName: displayName.trim(),
        phoneNumber: phoneNumber.trim(),
        phone: phoneNumber.trim(),
        role: isAdmin ? 'admin' : role,
        notificationRadiusKm,
        pushNotificationsEnabled: pushEnabled,
        notificationPreferences: preferences,
      });

      // Also sync volunteer profile if applicable
      if (role === 'volunteer' || userProfile?.role === 'volunteer') {
        await saveVolunteerProfile({
          userId: currentUser.uid,
          fullName: displayName.trim() || userProfile?.displayName || 'Volunteer',
          phone: phoneNumber.trim(),
          notificationRadiusKm,
          pushNotificationsEnabled: pushEnabled,
          notificationPreferences: preferences,
          optInNotifications: true,
        });
      }

      await refreshProfile();
      setSavedMessage(true);
      setTimeout(() => setSavedMessage(false), 3000);
    } catch (err: any) {
      alert(`Error updating profile: ${err.message}`);
    } finally {
      setSaving(false);
    }
  };

  // Handle explicit "Enable Notifications" click
  const handleEnableNotifications = async () => {
    if (!currentUser) return;
    setTogglingPush(true);
    setFeedback(null);

    try {
      // Requests permission ONLY upon this explicit user click
      const result =
        role === 'volunteer'
          ? await enableVolunteerPushNotifications(currentUser.uid, notificationRadiusKm, preferences)
          : await enableUserPushNotifications(currentUser.uid, role, preferences);

      if (typeof window !== 'undefined' && 'Notification' in window) {
        setPermissionState(Notification.permission);
      }

      if (result.success) {
        setPushEnabled(true);
        if (result.token) setFcmToken(result.token);

        await refreshProfile();
        setFeedback({
          type: 'success',
          message: result.message || 'Push notifications activated! You will receive instant alerts for surplus food rescues.',
        });
      } else {
        setPushEnabled(false);
        setFeedback({
          type: 'error',
          message: result.message || 'Could not enable push notifications.',
        });
      }
    } catch (err: any) {
      setFeedback({
        type: 'error',
        message: err.message || 'An unexpected error occurred while enabling notifications.',
      });
    } finally {
      setTogglingPush(false);
    }
  };

  // Handle Disable Notifications
  const handleDisableNotifications = async () => {
    if (!currentUser) return;
    setTogglingPush(true);
    setFeedback(null);

    try {
      if (role === 'volunteer') {
        await disableVolunteerPushNotifications(currentUser.uid);
      } else {
        await disableUserPushNotifications(currentUser.uid, role);
      }
      setPushEnabled(false);
      await refreshProfile();
      setFeedback({
        type: 'info',
        message: 'Push notifications turned off. You can re-enable them anytime.',
      });
    } catch (err: any) {
      setFeedback({
        type: 'error',
        message: err.message || 'Could not disable notifications.',
      });
    } finally {
      setTogglingPush(false);
    }
  };

  // Toggle Push Notifications switch
  const handleTogglePush = async () => {
    if (pushEnabled) {
      await handleDisableNotifications();
    } else {
      await handleEnableNotifications();
    }
  };

  // Update specific notification preference
  const handlePreferenceToggle = async (key: keyof NotificationPreferences) => {
    const updated = {
      ...preferences,
      [key]: !preferences[key],
    };
    setPreferences(updated);

    if (currentUser) {
      try {
        await createOrUpdateUserProfile({
          uid: currentUser.uid,
          email: currentUser.email || '',
          notificationPreferences: updated,
        });
        if (role === 'volunteer') {
          await saveVolunteerProfile({
            userId: currentUser.uid,
            fullName: displayName || currentUser.displayName || 'Volunteer',
            notificationPreferences: updated,
          });
        }
      } catch (err) {
        console.warn('Failed to persist preference change:', err);
      }
    }
  };

  // Handle radius distance change
  const handleRadiusChange = async (newRadius: number) => {
    setNotificationRadiusKm(newRadius);
    if (!currentUser) return;

    try {
      await createOrUpdateUserProfile({
        uid: currentUser.uid,
        email: currentUser.email || '',
        notificationRadiusKm: newRadius,
      });

      if (role === 'volunteer' || userProfile?.role === 'volunteer') {
        await saveVolunteerProfile({
          userId: currentUser.uid,
          fullName: displayName || userProfile?.displayName || 'Volunteer',
          notificationRadiusKm: newRadius,
          pushNotificationsEnabled: pushEnabled,
        });
      }
    } catch (err) {
      console.warn('Radius update failed:', err);
    }
  };

  // Test FCM Browser Notification
  const handleSendTestPush = async () => {
    setTestingPush(true);
    setFeedback(null);
    try {
      const result = await sendTestBrowserPushNotification(
        '🚨 ResQBite Rescue Alert Test',
        `Push alerts active! Real-time alerts enabled for ${role.toUpperCase()} operations within ${notificationRadiusKm} km territory.`,
        fcmToken || undefined
      );

      if (result.success) {
        setFeedback({
          type: 'success',
          message: result.message || 'Test push alert sent to your browser!',
        });
      } else {
        setFeedback({
          type: 'error',
          message: result.message || 'Failed to dispatch test notification.',
        });
      }
    } catch (err: any) {
      setFeedback({
        type: 'error',
        message: err.message || 'Error triggering test push notification.',
      });
    } finally {
      setTestingPush(false);
    }
  };

  // Copy FCM token helper
  const handleCopyToken = () => {
    if (!fcmToken) return;
    navigator.clipboard.writeText(fcmToken);
    setCopiedToken(true);
    setTimeout(() => setCopiedToken(false), 2000);
  };

  return (
    <div className="max-w-3xl mx-auto px-4 sm:px-6 lg:px-8 py-10 space-y-8">
      {/* Header */}
      <div className="space-y-1">
        <h1 className="text-2xl font-extrabold text-stone-900 tracking-tight">
          User Profile & Notification Settings
        </h1>
        <p className="text-xs sm:text-sm text-stone-500">
          Manage your account credentials, role preferences, and real-time browser push notifications.
        </p>
      </div>

      {/* Main Settings Card */}
      <div className="bg-white rounded-3xl border border-stone-200 shadow-2xs p-6 sm:p-8 space-y-8">
        {/* User Card */}
        <div className="flex items-center gap-4 pb-6 border-b border-stone-100">
          <div className="w-16 h-16 rounded-2xl bg-emerald-100 text-emerald-800 flex items-center justify-center font-extrabold text-2xl uppercase border-2 border-emerald-200 shrink-0">
            {userProfile?.displayName ? userProfile.displayName.charAt(0) : 'U'}
          </div>
          <div className="min-w-0 flex-1">
            <h2 className="text-lg font-bold text-stone-900 truncate">{userProfile?.displayName || 'ResQBite Member'}</h2>
            <p className="text-xs text-stone-500 flex items-center gap-1.5 mt-0.5 truncate">
              <Mail className="w-3.5 h-3.5 shrink-0" />
              {currentUser.email}
            </p>
            <div className="flex flex-wrap items-center gap-2 mt-2">
              <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full bg-emerald-50 text-emerald-800 text-[11px] font-bold uppercase tracking-wider">
                <Shield className="w-3.5 h-3.5 text-emerald-600" />
                Role: {userProfile?.role || 'Member'}
              </span>
              {pushEnabled ? (
                <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full bg-emerald-100 text-emerald-800 text-[11px] font-bold">
                  <Radio className="w-3 h-3 text-emerald-600 animate-pulse" />
                  Push Alerts Active
                </span>
              ) : (
                <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full bg-stone-100 text-stone-600 text-[11px] font-medium">
                  Push Alerts Inactive
                </span>
              )}
            </div>
          </div>
        </div>

        {/* Global Feedback Banner */}
        {feedback && (
          <div
            className={`p-4 rounded-2xl border text-xs flex items-start gap-3 transition-all ${
              feedback.type === 'success'
                ? 'bg-emerald-50 border-emerald-200 text-emerald-900'
                : feedback.type === 'error'
                ? 'bg-red-50 border-red-200 text-red-900'
                : 'bg-blue-50 border-blue-200 text-blue-900'
            }`}
          >
            {feedback.type === 'success' ? (
              <CheckCircle2 className="w-4 h-4 shrink-0 text-emerald-600 mt-0.5" />
            ) : feedback.type === 'error' ? (
              <AlertCircle className="w-4 h-4 shrink-0 text-red-600 mt-0.5" />
            ) : (
              <Bell className="w-4 h-4 shrink-0 text-blue-600 mt-0.5" />
            )}
            <div className="flex-1">
              <span className="font-medium leading-relaxed">{feedback.message}</span>
            </div>
          </div>
        )}

        {/* ==================================================== */}
        {/* PUSH NOTIFICATIONS & FCM VICINITY SECTION           */}
        {/* ==================================================== */}
        <div className="rounded-2xl border border-stone-200 bg-stone-50/70 p-5 sm:p-6 space-y-5">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
            <div className="space-y-1">
              <div className="flex items-center gap-2">
                <div className="w-9 h-9 rounded-xl bg-emerald-100 text-emerald-700 flex items-center justify-center shrink-0">
                  <BellRing className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="text-sm font-bold text-stone-900">
                    Browser Push Notifications (FCM)
                  </h3>
                  <p className="text-[11px] text-stone-500">
                    Receive immediate desktop or mobile browser alerts when rescue actions occur.
                  </p>
                </div>
              </div>
            </div>

            {/* Clear Primary Enable Button or Active Switch */}
            <div className="flex items-center gap-3 shrink-0">
              {!pushEnabled || permissionState !== 'granted' ? (
                <button
                  type="button"
                  disabled={togglingPush || !fcmSupported}
                  onClick={handleEnableNotifications}
                  className="bg-emerald-600 hover:bg-emerald-700 active:scale-98 text-white font-bold text-xs sm:text-sm px-4 py-2.5 rounded-xl shadow-xs transition-all flex items-center gap-2 cursor-pointer disabled:opacity-50"
                >
                  {togglingPush ? (
                    <Loader2 className="w-4 h-4 animate-spin" />
                  ) : (
                    <BellRing className="w-4 h-4" />
                  )}
                  <span>Enable Notifications</span>
                </button>
              ) : (
                <div className="flex items-center gap-3">
                  <span className="text-xs font-semibold text-emerald-700 flex items-center gap-1">
                    <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600" />
                    Enabled
                  </span>
                  <button
                    type="button"
                    role="switch"
                    aria-checked={pushEnabled}
                    disabled={togglingPush}
                    onClick={handleTogglePush}
                    className="relative inline-flex h-7 w-12 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out bg-emerald-600 focus:outline-hidden focus:ring-2 focus:ring-emerald-500 focus:ring-offset-2"
                    title="Turn off push notifications"
                  >
                    <span className="sr-only">Toggle push notifications</span>
                    <span
                      aria-hidden="true"
                      className="pointer-events-none inline-block h-6 w-6 transform translate-x-5 rounded-full bg-white shadow-md ring-0 transition duration-200 ease-in-out flex items-center justify-center"
                    >
                      {togglingPush ? (
                        <Loader2 className="w-3.5 h-3.5 animate-spin text-stone-500" />
                      ) : (
                        <Check className="w-3.5 h-3.5 text-emerald-600" />
                      )}
                    </span>
                  </button>
                </div>
              )}
            </div>
          </div>

          {/* FCM Status Badges & Diagnostic Info */}
          <div className="pt-3 border-t border-stone-200 flex flex-wrap items-center justify-between gap-3 text-[11px]">
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-stone-500 font-medium">Browser Permission:</span>
              {permissionState === 'granted' ? (
                <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-800 font-bold">
                  <CheckCircle2 className="w-3 h-3 text-emerald-600" />
                  Granted
                </span>
              ) : permissionState === 'denied' ? (
                <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-red-100 text-red-800 font-bold">
                  <AlertCircle className="w-3 h-3 text-red-600" />
                  Blocked
                </span>
              ) : (
                <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-amber-100 text-amber-800 font-bold">
                  <AlertCircle className="w-3 h-3 text-amber-600" />
                  Not Requested
                </span>
              )}

              {fcmSupported ? (
                <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-stone-200 text-stone-700 font-medium">
                  Service Worker Scope: /
                </span>
              ) : (
                <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-amber-100 text-amber-800 font-medium">
                  Push Unsupported in this Browser
                </span>
              )}

              {configuredVapidKey ? (
                <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-emerald-50 text-emerald-700 border border-emerald-200 font-medium">
                  VAPID Key Configured
                </span>
              ) : (
                <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-amber-50 text-amber-800 border border-amber-200 font-medium" title="Configure VITE_FIREBASE_VAPID_KEY for background Web Push when app is closed">
                  VAPID Key Optional
                </span>
              )}

              {fcmToken && (
                <button
                  type="button"
                  onClick={handleCopyToken}
                  className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-blue-50 hover:bg-blue-100 text-blue-700 font-mono text-[10px] transition-colors cursor-pointer"
                  title="Click to copy full registration token"
                >
                  <Copy className="w-2.5 h-2.5" />
                  <span>Token: {fcmToken.slice(0, 10)}...{fcmToken.slice(-6)}</span>
                  {copiedToken && <span className="font-bold text-emerald-600">Copied!</span>}
                </button>
              )}
            </div>

            {/* Test Push Button */}
            {pushEnabled && permissionState === 'granted' && (
              <button
                type="button"
                disabled={testingPush}
                onClick={handleSendTestPush}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-white border border-stone-300 text-stone-700 font-semibold hover:bg-stone-50 hover:border-stone-400 transition-colors shadow-2xs cursor-pointer disabled:opacity-50"
              >
                {testingPush ? (
                  <Loader2 className="w-3 h-3 animate-spin text-stone-500" />
                ) : (
                  <Send className="w-3 h-3 text-emerald-600" />
                )}
                <span>Send Test Push Alert</span>
              </button>
            )}
          </div>

          {/* Blocked Permission Warning & Guidance */}
          {permissionState === 'denied' && (
            <div className="p-3.5 bg-red-50 border border-red-200 rounded-xl text-red-800 text-xs space-y-1.5">
              <div className="font-bold flex items-center gap-1.5">
                <AlertCircle className="w-4 h-4 text-red-600 shrink-0" />
                Browser notifications are blocked for this website
              </div>
              <p className="text-[11px] text-red-700 leading-relaxed">
                To receive alerts, click the lock or settings icon next to the URL in your browser’s
                address bar, change <strong>Notifications</strong> to <strong>Allow</strong>, then refresh this page and click <strong>Enable Notifications</strong>.
              </p>
            </div>
          )}

          {/* ==================================================== */}
          {/* ROLE-BASED NOTIFICATION PREFERENCES                  */}
          {/* ==================================================== */}
          <div className="pt-4 border-t border-stone-200 space-y-4">
            <div className="flex items-center justify-between">
              <h4 className="text-xs font-bold text-stone-800 flex items-center gap-1.5">
                <Sliders className="w-3.5 h-3.5 text-emerald-600" />
                Notification Preferences ({role.toUpperCase()})
              </h4>
              <span className="text-[10px] text-stone-400">Auto-saved to Firestore</span>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs">
              {/* Donor Preferences */}
              {(role === 'donor' || role === 'admin' || !role) && (
                <>
                  <label className="flex items-start gap-2.5 p-3 rounded-xl bg-white border border-stone-200 hover:border-emerald-200 transition-colors cursor-pointer">
                    <input
                      type="checkbox"
                      checked={preferences.donorOnClaimed !== false}
                      onChange={() => handlePreferenceToggle('donorOnClaimed')}
                      className="mt-0.5 rounded border-stone-300 text-emerald-600 focus:ring-emerald-500"
                    />
                    <div>
                      <span className="font-semibold text-stone-800 block">Shelter Claim Alerts</span>
                      <span className="text-[11px] text-stone-500">Notify me when a verified shelter requests my food</span>
                    </div>
                  </label>

                  <label className="flex items-start gap-2.5 p-3 rounded-xl bg-white border border-stone-200 hover:border-emerald-200 transition-colors cursor-pointer">
                    <input
                      type="checkbox"
                      checked={preferences.donorOnPickup !== false}
                      onChange={() => handlePreferenceToggle('donorOnPickup')}
                      className="mt-0.5 rounded border-stone-300 text-emerald-600 focus:ring-emerald-500"
                    />
                    <div>
                      <span className="font-semibold text-stone-800 block">Volunteer Pickup Alerts</span>
                      <span className="text-[11px] text-stone-500">Notify me when courier accepts pickup or collects food</span>
                    </div>
                  </label>

                  <label className="flex items-start gap-2.5 p-3 rounded-xl bg-white border border-stone-200 hover:border-emerald-200 transition-colors cursor-pointer">
                    <input
                      type="checkbox"
                      checked={preferences.donorOnDelivered !== false}
                      onChange={() => handlePreferenceToggle('donorOnDelivered')}
                      className="mt-0.5 rounded border-stone-300 text-emerald-600 focus:ring-emerald-500"
                    />
                    <div>
                      <span className="font-semibold text-stone-800 block">Delivery Confirmation</span>
                      <span className="text-[11px] text-stone-500">Notify me when shelter confirms successful food delivery</span>
                    </div>
                  </label>
                </>
              )}

              {/* Volunteer Preferences */}
              {(role === 'volunteer' || role === 'admin') && (
                <>
                  <label className="flex items-start gap-2.5 p-3 rounded-xl bg-white border border-stone-200 hover:border-emerald-200 transition-colors cursor-pointer">
                    <input
                      type="checkbox"
                      checked={preferences.volunteerNearby !== false}
                      onChange={() => handlePreferenceToggle('volunteerNearby')}
                      className="mt-0.5 rounded border-stone-300 text-emerald-600 focus:ring-emerald-500"
                    />
                    <div>
                      <span className="font-semibold text-stone-800 block">Nearby Donation Alerts</span>
                      <span className="text-[11px] text-stone-500">Alert me when surplus food is posted in my radius</span>
                    </div>
                  </label>

                  <label className="flex items-start gap-2.5 p-3 rounded-xl bg-white border border-stone-200 hover:border-emerald-200 transition-colors cursor-pointer">
                    <input
                      type="checkbox"
                      checked={preferences.volunteerUrgent !== false}
                      onChange={() => handlePreferenceToggle('volunteerUrgent')}
                      className="mt-0.5 rounded border-stone-300 text-emerald-600 focus:ring-emerald-500"
                    />
                    <div>
                      <span className="font-semibold text-stone-800 block">Urgent Rescues</span>
                      <span className="text-[11px] text-stone-500">Priority alerts for surplus expiring in &lt; 2 hours</span>
                    </div>
                  </label>

                  <label className="flex items-start gap-2.5 p-3 rounded-xl bg-white border border-stone-200 hover:border-emerald-200 transition-colors cursor-pointer">
                    <input
                      type="checkbox"
                      checked={preferences.volunteerRouteUpdates !== false}
                      onChange={() => handlePreferenceToggle('volunteerRouteUpdates')}
                      className="mt-0.5 rounded border-stone-300 text-emerald-600 focus:ring-emerald-500"
                    />
                    <div>
                      <span className="font-semibold text-stone-800 block">Route & Handover Updates</span>
                      <span className="text-[11px] text-stone-500">Alerts for handover verification and status transitions</span>
                    </div>
                  </label>
                </>
              )}

              {/* Admin Preferences */}
              {isAdmin && (
                <>
                  <label className="flex items-start gap-2.5 p-3 rounded-xl bg-white border border-stone-200 hover:border-emerald-200 transition-colors cursor-pointer">
                    <input
                      type="checkbox"
                      checked={preferences.adminNewDonations !== false}
                      onChange={() => handlePreferenceToggle('adminNewDonations')}
                      className="mt-0.5 rounded border-stone-300 text-emerald-600 focus:ring-emerald-500"
                    />
                    <div>
                      <span className="font-semibold text-stone-800 block">Platform-Wide Audit</span>
                      <span className="text-[11px] text-stone-500">Notify admin on every new surplus food posting</span>
                    </div>
                  </label>

                  <label className="flex items-start gap-2.5 p-3 rounded-xl bg-white border border-stone-200 hover:border-emerald-200 transition-colors cursor-pointer">
                    <input
                      type="checkbox"
                      checked={preferences.adminUrgentEscalations !== false}
                      onChange={() => handlePreferenceToggle('adminUrgentEscalations')}
                      className="mt-0.5 rounded border-stone-300 text-emerald-600 focus:ring-emerald-500"
                    />
                    <div>
                      <span className="font-semibold text-stone-800 block">Unclaimed Escalations</span>
                      <span className="text-[11px] text-stone-500">Escalate surplus listings expiring without assigned courier</span>
                    </div>
                  </label>
                </>
              )}
            </div>
          </div>

          {/* Alert Vicinity Radius Configuration */}
          {(role === 'volunteer' || role === 'admin') && (
            <div className="pt-4 border-t border-stone-200 space-y-3">
              <div className="flex items-center justify-between">
                <label className="text-xs font-bold text-stone-800 flex items-center gap-1.5">
                  <Navigation className="w-3.5 h-3.5 text-emerald-600" />
                  Volunteer Notification Vicinity Radius
                </label>
                <span className="text-xs font-extrabold text-emerald-700 bg-emerald-50 px-2.5 py-0.5 rounded-lg border border-emerald-200">
                  {notificationRadiusKm} km radius
                </span>
              </div>
              <p className="text-[11px] text-stone-500 leading-relaxed">
                Volunteers receive push notifications and radar alerts exclusively for surplus food
                donations created within this distance from their pickup territory.
              </p>

              <div className="flex items-center gap-2">
                <input
                  type="range"
                  min="2"
                  max="30"
                  step="1"
                  value={notificationRadiusKm}
                  onChange={(e) => handleRadiusChange(Number(e.target.value))}
                  className="w-full h-2 bg-stone-200 rounded-lg appearance-none cursor-pointer accent-emerald-600"
                />
              </div>

              {/* Quick Radius Presets */}
              <div className="flex items-center gap-2 pt-1">
                <span className="text-[10px] text-stone-400 font-semibold uppercase tracking-wider">Presets:</span>
                {[5, 10, 15, 20, 25].map((km) => (
                  <button
                    key={km}
                    type="button"
                    onClick={() => handleRadiusChange(km)}
                    className={`px-2 py-0.5 text-[11px] rounded-lg font-semibold transition-colors cursor-pointer ${
                      notificationRadiusKm === km
                        ? 'bg-emerald-600 text-white shadow-2xs'
                        : 'bg-white border border-stone-200 text-stone-600 hover:bg-stone-50'
                    }`}
                  >
                    {km} km
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* Profile Details Form */}
        <form onSubmit={handleSave} className="space-y-5 text-xs">
          <div>
            <label className="font-semibold text-stone-700 block mb-1.5">Display Name</label>
            <input
              type="text"
              required
              value={displayName}
              onChange={(e) => setDisplayName(e.target.value)}
              className="w-full px-3.5 py-2.5 rounded-xl border border-stone-200 focus:border-emerald-500 focus:ring-2 focus:ring-emerald-100 outline-hidden font-medium text-stone-900"
            />
          </div>

          <div>
            <label className="font-semibold text-stone-700 block mb-1.5">Contact Phone Number</label>
            <div className="relative">
              <Phone className="w-4 h-4 text-stone-400 absolute left-3.5 top-3" />
              <input
                type="tel"
                placeholder="+91 98765 43210"
                value={phoneNumber}
                onChange={(e) => setPhoneNumber(e.target.value)}
                className="w-full pl-10 pr-3.5 py-2.5 rounded-xl border border-stone-200 focus:border-emerald-500 focus:ring-2 focus:ring-emerald-100 outline-hidden font-medium text-stone-900"
              />
            </div>
            <p className="text-[11px] text-stone-400 mt-1">
              Required for active rescue contact and courier handover coordination.
            </p>
          </div>

          {/* Account Role Selector */}
          <div>
            <label className="font-semibold text-stone-700 block mb-1.5">Primary Platform Role</label>
            {isAdmin ? (
              <div className="p-3 bg-amber-50 border border-amber-200 rounded-xl text-amber-900 font-semibold flex items-center gap-2">
                <Shield className="w-4 h-4 text-amber-600 shrink-0" />
                <span>Administrator (Super-User Access Granted)</span>
              </div>
            ) : (
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <button
                  type="button"
                  onClick={() => setRole('donor')}
                  className={`p-3 rounded-2xl border text-left transition-all cursor-pointer ${
                    role === 'donor'
                      ? 'border-emerald-600 bg-emerald-50/60 ring-2 ring-emerald-500/20'
                      : 'border-stone-200 hover:border-stone-300'
                  }`}
                >
                  <Utensils className={`w-4 h-4 mb-2 ${role === 'donor' ? 'text-emerald-600' : 'text-stone-400'}`} />
                  <div className="font-bold text-stone-900 text-xs">Food Donor</div>
                  <div className="text-[11px] text-stone-500 mt-0.5">Hotel, Caterer, Household</div>
                </button>

                <button
                  type="button"
                  onClick={() => setRole('volunteer')}
                  className={`p-3 rounded-2xl border text-left transition-all cursor-pointer ${
                    role === 'volunteer'
                      ? 'border-emerald-600 bg-emerald-50/60 ring-2 ring-emerald-500/20'
                      : 'border-stone-200 hover:border-stone-300'
                  }`}
                >
                  <Bike className={`w-4 h-4 mb-2 ${role === 'volunteer' ? 'text-emerald-600' : 'text-stone-400'}`} />
                  <div className="font-bold text-stone-900 text-xs">Volunteer Courier</div>
                  <div className="text-[11px] text-stone-500 mt-0.5">Pickup &amp; Transport Deliveries</div>
                </button>

                <button
                  type="button"
                  onClick={() => setRole('ngo')}
                  className={`p-3 rounded-2xl border text-left transition-all cursor-pointer ${
                    role === 'ngo'
                      ? 'border-emerald-600 bg-emerald-50/60 ring-2 ring-emerald-500/20'
                      : 'border-stone-200 hover:border-stone-300'
                  }`}
                >
                  <Building2 className={`w-4 h-4 mb-2 ${role === 'ngo' ? 'text-emerald-600' : 'text-stone-400'}`} />
                  <div className="font-bold text-stone-900 text-xs">Shelter / NGO</div>
                  <div className="text-[11px] text-stone-500 mt-0.5">Community Feeding Center</div>
                </button>
              </div>
            )}
          </div>

          <div className="pt-4 border-t border-stone-100 flex items-center justify-between">
            <button
              type="submit"
              disabled={saving}
              className="bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-xs sm:text-sm px-6 py-2.5 rounded-xl shadow-xs transition-colors flex items-center gap-2 cursor-pointer disabled:opacity-50"
            >
              {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
              <span>{saving ? 'Saving...' : 'Save Profile Changes'}</span>
            </button>

            {savedMessage && (
              <span className="text-xs font-bold text-emerald-600 flex items-center gap-1.5 animate-in fade-in">
                <CheckCircle2 className="w-4 h-4" />
                Profile updated successfully!
              </span>
            )}
          </div>
        </form>

        {/* Account Logout Action */}
        <div className="pt-6 border-t border-stone-100 flex items-center justify-between">
          <div className="text-xs text-stone-500">
            Signed in as <span className="font-bold text-stone-800">{currentUser.email}</span>
          </div>
          <button
            type="button"
            onClick={logout}
            className="text-xs font-bold text-red-600 hover:text-red-700 flex items-center gap-1.5 px-3 py-1.5 rounded-xl hover:bg-red-50 transition-colors cursor-pointer"
          >
            <LogOut className="w-3.5 h-3.5" />
            <span>Sign Out</span>
          </button>
        </div>
      </div>
    </div>
  );
};
