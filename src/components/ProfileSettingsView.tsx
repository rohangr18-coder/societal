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
} from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { UserRole, VolunteerProfile } from '../types';
import {
  createOrUpdateUserProfile,
  getVolunteerProfile,
  saveVolunteerProfile,
} from '../services/dbService';
import {
  isFcmSupported,
  enableVolunteerPushNotifications,
  disableVolunteerPushNotifications,
  sendTestBrowserPushNotification,
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

  // UI Action states
  const [togglingPush, setTogglingPush] = useState<boolean>(false);
  const [testingPush, setTestingPush] = useState<boolean>(false);
  const [feedback, setFeedback] = useState<{ type: 'success' | 'error' | 'info'; message: string } | null>(null);

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
      });

      // Also sync volunteer profile if applicable
      if (role === 'volunteer' || userProfile?.role === 'volunteer') {
        await saveVolunteerProfile({
          userId: currentUser.uid,
          fullName: displayName.trim() || userProfile?.displayName || 'Volunteer',
          phone: phoneNumber.trim(),
          notificationRadiusKm,
          pushNotificationsEnabled: pushEnabled,
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

  // Handle Push Notifications Toggle
  const handleTogglePush = async () => {
    if (!currentUser) return;
    setTogglingPush(true);
    setFeedback(null);

    const willEnable = !pushEnabled;

    try {
      if (willEnable) {
        // Run FCM registration and permission flow
        const result = await enableVolunteerPushNotifications(currentUser.uid);

        if (typeof window !== 'undefined' && 'Notification' in window) {
          setPermissionState(Notification.permission);
        }

        if (result.success) {
          setPushEnabled(true);
          if (result.token) setFcmToken(result.token);

          // Update user profile record as well
          await createOrUpdateUserProfile({
            uid: currentUser.uid,
            email: currentUser.email || '',
            pushNotificationsEnabled: true,
            pushNotificationPermission: 'granted',
            ...(result.token ? { fcmToken: result.token } : {}),
            notificationRadiusKm,
          });

          await refreshProfile();
          setFeedback({
            type: 'success',
            message: 'Push notifications activated! You will receive instant alerts when donations are posted nearby.',
          });
        } else {
          setPushEnabled(false);
          setFeedback({
            type: 'error',
            message: result.message || 'Could not enable push notifications.',
          });
        }
      } else {
        // Disable push notifications
        await disableVolunteerPushNotifications(currentUser.uid);

        // Update user profile record
        await createOrUpdateUserProfile({
          uid: currentUser.uid,
          email: currentUser.email || '',
          pushNotificationsEnabled: false,
          notificationRadiusKm,
        });

        setPushEnabled(false);
        await refreshProfile();
        setFeedback({
          type: 'info',
          message: 'Push notifications turned off. You can re-enable them anytime.',
        });
      }
    } catch (err: any) {
      setFeedback({
        type: 'error',
        message: err.message || 'An unexpected error occurred while toggling notifications.',
      });
    } finally {
      setTogglingPush(false);
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
        `Push alerts active within ${notificationRadiusKm} km! You will be alerted when surplus food donations are posted nearby.`
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

  return (
    <div className="max-w-3xl mx-auto px-4 sm:px-6 lg:px-8 py-10 space-y-8">
      {/* Header */}
      <div className="space-y-1">
        <h1 className="text-2xl font-extrabold text-stone-900 tracking-tight">
          User Profile & Notification Settings
        </h1>
        <p className="text-xs sm:text-sm text-stone-500">
          Manage your account credentials, volunteer role, and real-time push notification radius.
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
            <div className="flex items-center gap-2 mt-2">
              <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full bg-emerald-50 text-emerald-800 text-[11px] font-bold uppercase tracking-wider">
                <Shield className="w-3.5 h-3.5 text-emerald-600" />
                Role: {userProfile?.role || 'Member'}
              </span>
              {pushEnabled && (
                <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full bg-blue-50 text-blue-700 text-[11px] font-bold">
                  <Radio className="w-3 h-3 text-blue-500 animate-pulse" />
                  Push Alerts Active
                </span>
              )}
            </div>
          </div>
        </div>

        {/* Global Feedback Banner */}
        {savedMessage && (
          <div className="p-3.5 bg-emerald-50 border border-emerald-200 rounded-2xl text-emerald-800 text-xs flex items-center gap-2 animate-fade-in">
            <CheckCircle2 className="w-4 h-4 shrink-0 text-emerald-600" />
            <span className="font-semibold">Profile details saved successfully!</span>
          </div>
        )}

        {feedback && (
          <div
            className={`p-3.5 rounded-2xl border text-xs flex items-start gap-2.5 animate-fade-in ${
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
                <div className="w-8 h-8 rounded-xl bg-emerald-100 text-emerald-700 flex items-center justify-center">
                  <BellRing className="w-4 h-4" />
                </div>
                <h3 className="text-sm font-bold text-stone-900">
                  Browser Push Notifications (FCM)
                </h3>
              </div>
              <p className="text-xs text-stone-500 max-w-lg leading-relaxed">
                Receive instant browser alerts on this device whenever new surplus food is posted
                nearby, even if this browser tab is closed.
              </p>
            </div>

            {/* Accessible Toggle Button */}
            <div className="flex items-center gap-3 shrink-0">
              <span className="text-xs font-semibold text-stone-600 hidden sm:inline">
                {pushEnabled ? 'Enabled' : 'Disabled'}
              </span>
              <button
                type="button"
                role="switch"
                aria-checked={pushEnabled}
                disabled={togglingPush || !fcmSupported}
                onClick={handleTogglePush}
                className={`relative inline-flex h-7 w-12 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-hidden focus:ring-2 focus:ring-emerald-500 focus:ring-offset-2 ${
                  pushEnabled ? 'bg-emerald-600' : 'bg-stone-300'
                } ${togglingPush || !fcmSupported ? 'opacity-60 cursor-not-allowed' : ''}`}
                title={pushEnabled ? 'Turn off push notifications' : 'Turn on push notifications'}
              >
                <span className="sr-only">Toggle push notifications</span>
                <span
                  aria-hidden="true"
                  className={`pointer-events-none inline-block h-6 w-6 transform rounded-full bg-white shadow-md ring-0 transition duration-200 ease-in-out flex items-center justify-center ${
                    pushEnabled ? 'translate-x-5' : 'translate-x-0'
                  }`}
                >
                  {togglingPush ? (
                    <Loader2 className="w-3.5 h-3.5 animate-spin text-stone-500" />
                  ) : pushEnabled ? (
                    <Check className="w-3.5 h-3.5 text-emerald-600" />
                  ) : null}
                </span>
              </button>
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
                  Service Worker Supported
                </span>
              ) : (
                <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-amber-100 text-amber-800 font-medium">
                  Push Unsupported in this Browser
                </span>
              )}

              {fcmToken && (
                <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-blue-50 text-blue-700 font-medium font-mono text-[10px]">
                  FCM Token Registered
                </span>
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
            <div className="p-3 bg-red-50 border border-red-200 rounded-xl text-red-800 text-xs space-y-1">
              <div className="font-bold flex items-center gap-1.5">
                <AlertCircle className="w-4 h-4 text-red-600 shrink-0" />
                Browser notifications are blocked for this site
              </div>
              <p className="text-[11px] text-red-700 leading-relaxed">
                To receive alerts, click the lock or settings icon next to the URL in your browser’s
                address bar, change <strong>Notifications</strong> to <strong>Allow</strong>, and then toggle push notifications on again.
              </p>
            </div>
          )}

          {/* Alert Vicinity Radius Configuration */}
          <div className="pt-4 border-t border-stone-200 space-y-3">
            <div className="flex items-center justify-between">
              <label className="text-xs font-bold text-stone-800 flex items-center gap-1.5">
                <Navigation className="w-3.5 h-3.5 text-emerald-600" />
                Notification Vicinity Radius
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
            <label className="font-semibold text-stone-700 block mb-1.5">Mobile Contact Phone</label>
            <input
              type="tel"
              placeholder="+91 98765 43210"
              value={phoneNumber}
              onChange={(e) => setPhoneNumber(e.target.value)}
              className="w-full px-3.5 py-2.5 rounded-xl border border-stone-200 focus:border-emerald-500 focus:ring-2 focus:ring-emerald-100 outline-hidden text-stone-900"
            />
            <span className="text-[11px] text-stone-400 mt-1 block">
              Shared only with verified rescue partners when coordinating an active pickup.
            </span>
          </div>

          {!isAdmin && (
            <div>
              <label className="font-semibold text-stone-700 block mb-2">Switch Active Role</label>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <button
                  type="button"
                  onClick={() => setRole('donor')}
                  className={`p-3 rounded-2xl border text-center transition-all cursor-pointer ${
                    role === 'donor'
                      ? 'border-emerald-600 bg-emerald-50 text-emerald-950 font-bold ring-2 ring-emerald-200'
                      : 'border-stone-200 text-stone-600 hover:bg-stone-50'
                  }`}
                >
                  <Utensils className="w-4 h-4 mx-auto text-emerald-600 mb-1" />
                  <span className="block text-xs font-bold">Food Donor</span>
                  <span className="block text-[10px] text-stone-500 font-normal mt-0.5">Post surplus meals</span>
                </button>

                <button
                  type="button"
                  onClick={() => setRole('ngo')}
                  className={`p-3 rounded-2xl border text-center transition-all cursor-pointer ${
                    role === 'ngo'
                      ? 'border-orange-600 bg-orange-50 text-orange-950 font-bold ring-2 ring-orange-200'
                      : 'border-stone-200 text-stone-600 hover:bg-stone-50'
                  }`}
                >
                  <Building2 className="w-4 h-4 mx-auto text-orange-600 mb-1" />
                  <span className="block text-xs font-bold">NGO / Shelter</span>
                  <span className="block text-[10px] text-stone-500 font-normal mt-0.5">Claim for community</span>
                </button>

                <button
                  type="button"
                  onClick={() => setRole('volunteer')}
                  className={`p-3 rounded-2xl border text-center transition-all cursor-pointer ${
                    role === 'volunteer'
                      ? 'border-blue-600 bg-blue-50 text-blue-950 font-bold ring-2 ring-blue-200'
                      : 'border-stone-200 text-stone-600 hover:bg-stone-50'
                  }`}
                >
                  <Bike className="w-4 h-4 mx-auto text-blue-600 mb-1" />
                  <span className="block text-xs font-bold">Volunteer</span>
                  <span className="block text-[10px] text-stone-500 font-normal mt-0.5">Collect & deliver</span>
                </button>
              </div>
            </div>
          )}

          <div className="flex items-center justify-between pt-5 border-t border-stone-100">
            <button
              type="button"
              onClick={logout}
              className="text-red-600 hover:text-red-700 font-semibold flex items-center gap-1.5 cursor-pointer py-2 px-3 rounded-xl hover:bg-red-50 transition-colors"
            >
              <LogOut className="w-4 h-4" />
              Sign Out
            </button>

            <button
              type="submit"
              disabled={saving}
              className="bg-emerald-600 hover:bg-emerald-700 text-white font-bold px-6 py-2.5 rounded-xl shadow-xs transition-colors flex items-center gap-2 cursor-pointer disabled:opacity-50"
            >
              {saving ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" />
                  Saving Profile...
                </>
              ) : (
                <>
                  <Save className="w-4 h-4" />
                  Save Profile Changes
                </>
              )}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
