import React, { useState } from 'react';
import {
  HeartHandshake,
  UtensilsCrossed,
  Bike,
  CheckCircle2,
  AlertCircle,
  ExternalLink,
  Loader2,
  ArrowRight,
  Shield,
  RotateCcw,
  Mail,
  Lock,
  User,
  Sparkles,
} from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { UserRole } from '../types';

interface AuthViewProps {
  onSuccess: (targetDashboard?: string) => void;
  initialRole?: UserRole | null;
  onNavigateTab?: (tab: string) => void;
}

export const AuthView: React.FC<AuthViewProps> = ({
  onSuccess,
  initialRole = null,
  onNavigateTab,
}) => {
  const {
    currentUser,
    userProfile,
    signInWithGoogle,
    signInWithEmail,
    signUpWithEmail,
    resetPassword,
    updateRole,
    error,
    authProviderError,
    firebaseProjectId,
    clearError,
  } = useAuth();

  // Selected role state - defaults to initialRole if provided, otherwise null
  const [selectedRole, setSelectedRole] = useState<'donor' | 'volunteer' | null>(
    initialRole === 'volunteer' || initialRole === 'donor'
      ? initialRole
      : (userProfile?.role === 'volunteer' || userProfile?.role === 'donor' ? userProfile.role : null)
  );

  const [loading, setLoading] = useState(false);
  const [showEmailAuth, setShowEmailAuth] = useState(false);
  const [emailMode, setEmailMode] = useState<'signin' | 'register' | 'forgot'>('signin');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [displayName, setDisplayName] = useState('');
  const [resetSent, setResetSent] = useState(false);

  const currentHost = typeof window !== 'undefined' ? window.location.hostname : 'your Vercel domain';
  const consoleProvidersUrl = `https://console.firebase.google.com/project/${firebaseProjectId}/authentication/providers`;
  const consoleSettingsUrl = `https://console.firebase.google.com/project/${firebaseProjectId}/authentication/settings`;

  // Existing authenticated user missing a role
  const isAuthenticatedMissingRole = currentUser && !userProfile?.role;

  // Google Login Handler
  const handleGoogleSignIn = async () => {
    if (!selectedRole && !isAuthenticatedMissingRole) {
      return;
    }

    setLoading(true);
    try {
      const roleToUse = selectedRole || 'donor';
      const result = await signInWithGoogle(roleToUse);

      const effectiveRole = result?.profile?.role || roleToUse;
      const targetDashboard = effectiveRole === 'volunteer' ? 'volunteer' : 'dashboard';
      onSuccess(targetDashboard);
    } catch (err) {
      // Error is set in AuthContext; selectedRole is preserved for instant retry
    } finally {
      setLoading(false);
    }
  };

  // Existing user role confirmation handler
  const handleConfirmExistingUserRole = async () => {
    if (!selectedRole || !currentUser) return;
    setLoading(true);
    try {
      await updateRole(selectedRole);
      const targetDashboard = selectedRole === 'volunteer' ? 'volunteer' : 'dashboard';
      onSuccess(targetDashboard);
    } catch (err) {
      console.error('Error updating role:', err);
    } finally {
      setLoading(false);
    }
  };

  // Email form submit handler
  const handleEmailSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedRole && emailMode === 'register') return;

    setLoading(true);
    try {
      if (emailMode === 'signin') {
        await signInWithEmail(email, password);
        const targetDashboard = userProfile?.role === 'volunteer' ? 'volunteer' : 'dashboard';
        onSuccess(targetDashboard);
      } else if (emailMode === 'register') {
        await signUpWithEmail(email, password, displayName, selectedRole || 'donor');
        const targetDashboard = selectedRole === 'volunteer' ? 'volunteer' : 'dashboard';
        onSuccess(targetDashboard);
      } else if (emailMode === 'forgot') {
        await resetPassword(email);
        setResetSent(true);
      }
    } catch (err) {
      // Error handled in AuthContext
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-[85vh] flex items-center justify-center px-4 py-10 sm:py-16 bg-gradient-to-b from-stone-50 via-emerald-50/20 to-stone-50">
      <div className="max-w-2xl w-full bg-white rounded-3xl border border-stone-200/90 shadow-xl p-6 sm:p-10 space-y-8 animate-in fade-in duration-200">
        {/* Brand Header */}
        <div className="text-center space-y-3">
          <div className="inline-flex items-center gap-2 px-3.5 py-1.5 rounded-full bg-emerald-100/80 text-emerald-800 text-xs font-bold uppercase tracking-wider mb-1">
            <HeartHandshake className="w-4 h-4 text-emerald-600" />
            <span>ResQBite Food Rescue Network</span>
          </div>

          <h1 className="text-3xl sm:text-4xl font-black text-stone-900 tracking-tight">
            Welcome to ResQBite
          </h1>

          <p className="text-sm sm:text-base text-stone-600 italic font-medium">
            Rescue Food. Reduce Waste. Feed Communities.
          </p>

          <p className="text-xs text-stone-500 max-w-md mx-auto pt-1">
            {isAuthenticatedMissingRole
              ? 'Please select your role below to complete your profile setup and access your dashboard.'
              : 'Choose your role below before signing in. Food Donors post surplus meals, and Volunteers collect and deliver them to shelters.'}
          </p>
        </div>

        {/* Actionable Error Banner if Provider Disabled or Domain Unauthorized */}
        {authProviderError && (
          <div className="p-4 bg-amber-50/90 border border-amber-300 rounded-2xl text-xs space-y-3 text-amber-950">
            <div className="flex items-start justify-between gap-2">
              <div className="font-bold flex items-center gap-1.5 text-amber-900">
                <AlertCircle className="w-4 h-4 text-amber-600 shrink-0" />
                Firebase Setup Action Needed
              </div>
              <button
                type="button"
                onClick={clearError}
                className="text-[10px] text-amber-700 hover:text-amber-950 underline font-semibold cursor-pointer"
              >
                Dismiss
              </button>
            </div>

            {authProviderError === 'GOOGLE_AUTH_DISABLED' && (
              <div className="space-y-2 leading-relaxed">
                <p>
                  <strong>Google Sign-in</strong> is not yet enabled in your Firebase project (
                  <code className="bg-amber-100/80 px-1 py-0.5 rounded text-[11px] font-mono text-amber-900">
                    {firebaseProjectId}
                  </code>
                  ).
                </p>
                <div className="bg-white/80 p-2.5 rounded-xl border border-amber-200/70 space-y-1 text-[11px]">
                  <p className="font-semibold text-amber-900">How to enable in 2 minutes:</p>
                  <p className="text-stone-700">
                    In Firebase Console &gt; <strong>Authentication</strong> &gt; <strong>Sign-in method</strong>, click <strong>Add new provider</strong> &gt; <strong>Google</strong> &gt; toggle <strong>Enable</strong>, choose a support email, and click <strong>Save</strong>.
                  </p>
                </div>
                <a
                  href={consoleProvidersUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-1.5 text-emerald-800 font-bold hover:underline text-[11px]"
                >
                  Open Firebase Providers Console
                  <ExternalLink className="w-3.5 h-3.5" />
                </a>
              </div>
            )}

            {authProviderError === 'UNAUTHORIZED_DOMAIN' && (
              <div className="space-y-2 leading-relaxed">
                <p>
                  Your current deployment domain (
                  <code className="bg-amber-100/80 px-1 py-0.5 rounded text-[11px] font-mono text-amber-900">
                    {currentHost}
                  </code>
                  ) is not authorized in Firebase.
                </p>
                <div className="bg-white/80 p-2.5 rounded-xl border border-amber-200/70 space-y-1 text-[11px]">
                  <p className="font-semibold text-amber-900">How to authorize Vercel domain:</p>
                  <ol className="list-decimal pl-4 space-y-0.5 text-stone-700">
                    <li>Go to Firebase Console &gt; <strong>Authentication</strong> &gt; <strong>Settings</strong>.</li>
                    <li>Select the <strong>Authorized domains</strong> tab.</li>
                    <li>Click <strong>Add domain</strong> and enter <code className="font-mono text-stone-900">{currentHost}</code>.</li>
                  </ol>
                </div>
                <a
                  href={consoleSettingsUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-1.5 text-emerald-800 font-bold hover:underline text-[11px]"
                >
                  Open Authorized Domains Settings
                  <ExternalLink className="w-3.5 h-3.5" />
                </a>
              </div>
            )}
          </div>
        )}

        {/* General Error Message */}
        {error && !authProviderError && (
          <div className="p-3.5 bg-red-50 border border-red-200 rounded-2xl text-red-700 text-xs flex items-start justify-between gap-2">
            <div className="flex items-start gap-2">
              <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
              <span>{error}</span>
            </div>
            <button
              onClick={clearError}
              className="text-[11px] text-red-500 hover:text-red-800 font-bold uppercase tracking-wider"
            >
              Dismiss
            </button>
          </div>
        )}

        {resetSent && (
          <div className="p-3 bg-emerald-50 border border-emerald-200 rounded-2xl text-emerald-800 text-xs flex items-start gap-2">
            <CheckCircle2 className="w-4 h-4 shrink-0 mt-0.5" />
            <span>Password reset email dispatched. Please check your inbox.</span>
          </div>
        )}

        {/* ROLE SELECTION: TWO LARGE SELECTABLE CARDS */}
        <div className="space-y-4">
          <div className="flex items-center justify-between text-xs font-bold text-stone-700 px-1">
            <span>Select Your Network Role:</span>
            {selectedRole && (
              <span className="text-emerald-700 font-extrabold flex items-center gap-1">
                <CheckCircle2 className="w-3.5 h-3.5" />
                <span>Selected: {selectedRole === 'donor' ? 'Food Donor' : 'Volunteer'}</span>
              </span>
            )}
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            {/* CARD 1: FOOD DONOR */}
            <div
              onClick={() => setSelectedRole('donor')}
              className={`relative rounded-3xl p-6 border-2 transition-all cursor-pointer flex flex-col justify-between text-left group ${
                selectedRole === 'donor'
                  ? 'border-emerald-600 bg-emerald-50/60 shadow-md ring-2 ring-emerald-500/20'
                  : 'border-stone-200 bg-stone-50/40 hover:border-emerald-300 hover:bg-stone-50'
              }`}
            >
              {selectedRole === 'donor' && (
                <div className="absolute top-4 right-4 w-6 h-6 rounded-full bg-emerald-600 text-white flex items-center justify-center shadow-xs">
                  <CheckCircle2 className="w-4 h-4" />
                </div>
              )}

              <div className="space-y-3">
                <div
                  className={`w-14 h-14 rounded-2xl flex items-center justify-center transition-colors ${
                    selectedRole === 'donor'
                      ? 'bg-emerald-600 text-white shadow-md'
                      : 'bg-emerald-100 text-emerald-800 group-hover:bg-emerald-200'
                  }`}
                >
                  <UtensilsCrossed className="w-7 h-7" />
                </div>

                <div>
                  <h3 className="text-lg font-black text-stone-900 tracking-tight">Food Donor</h3>
                  <p className="text-xs text-stone-600 mt-1 leading-relaxed">
                    "I have surplus food and want to donate it."
                  </p>
                </div>
              </div>

              <div className="pt-5 mt-2 border-t border-stone-200/60">
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    setSelectedRole('donor');
                  }}
                  className={`w-full py-2.5 px-4 rounded-xl text-xs font-bold transition-all flex items-center justify-center gap-1.5 cursor-pointer ${
                    selectedRole === 'donor'
                      ? 'bg-emerald-600 text-white shadow-xs'
                      : 'bg-white text-stone-700 border border-stone-300 group-hover:border-emerald-400'
                  }`}
                >
                  <span>Continue as Donor</span>
                  <ArrowRight className="w-3.5 h-3.5" />
                </button>
              </div>
            </div>

            {/* CARD 2: VOLUNTEER */}
            <div
              onClick={() => setSelectedRole('volunteer')}
              className={`relative rounded-3xl p-6 border-2 transition-all cursor-pointer flex flex-col justify-between text-left group ${
                selectedRole === 'volunteer'
                  ? 'border-emerald-600 bg-emerald-50/60 shadow-md ring-2 ring-emerald-500/20'
                  : 'border-stone-200 bg-stone-50/40 hover:border-emerald-300 hover:bg-stone-50'
              }`}
            >
              {selectedRole === 'volunteer' && (
                <div className="absolute top-4 right-4 w-6 h-6 rounded-full bg-emerald-600 text-white flex items-center justify-center shadow-xs">
                  <CheckCircle2 className="w-4 h-4" />
                </div>
              )}

              <div className="space-y-3">
                <div
                  className={`w-14 h-14 rounded-2xl flex items-center justify-center transition-colors ${
                    selectedRole === 'volunteer'
                      ? 'bg-emerald-600 text-white shadow-md'
                      : 'bg-teal-100 text-teal-800 group-hover:bg-teal-200'
                  }`}
                >
                  <Bike className="w-7 h-7" />
                </div>

                <div>
                  <h3 className="text-lg font-black text-stone-900 tracking-tight">Volunteer</h3>
                  <p className="text-xs text-stone-600 mt-1 leading-relaxed">
                    "I want to collect and deliver surplus food."
                  </p>
                </div>
              </div>

              <div className="pt-5 mt-2 border-t border-stone-200/60">
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    setSelectedRole('volunteer');
                  }}
                  className={`w-full py-2.5 px-4 rounded-xl text-xs font-bold transition-all flex items-center justify-center gap-1.5 cursor-pointer ${
                    selectedRole === 'volunteer'
                      ? 'bg-emerald-600 text-white shadow-xs'
                      : 'bg-white text-stone-700 border border-stone-300 group-hover:border-emerald-400'
                  }`}
                >
                  <span>Continue as Volunteer</span>
                  <ArrowRight className="w-3.5 h-3.5" />
                </button>
              </div>
            </div>
          </div>
        </div>

        {/* AUTHENTICATION ACTION AREA */}
        {isAuthenticatedMissingRole ? (
          /* FLOW FOR EXISTING USER MISSING ROLE */
          <div className="p-5 bg-emerald-50/80 rounded-2xl border border-emerald-200 space-y-3 text-center">
            <p className="text-xs text-emerald-950 font-medium">
              You are signed in as <span className="font-bold">{currentUser.email}</span>. Confirm your selected role to proceed to your dashboard.
            </p>
            <button
              onClick={handleConfirmExistingUserRole}
              disabled={!selectedRole || loading}
              className="w-full bg-emerald-600 hover:bg-emerald-700 text-white font-bold py-3 px-4 rounded-2xl transition-all shadow-md flex items-center justify-center gap-2 cursor-pointer disabled:opacity-50"
            >
              {loading ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : (
                <CheckCircle2 className="w-4 h-4" />
              )}
              <span>
                {selectedRole
                  ? `Save Role & Continue as ${selectedRole === 'donor' ? 'Donor' : 'Volunteer'}`
                  : 'Please Select a Role Above'}
              </span>
            </button>
          </div>
        ) : (
          /* STANDARD LOGIN FLOW: GOOGLE SIGN-IN */
          <div className="space-y-4 pt-2">
            {!selectedRole ? (
              /* Role not yet selected prompt */
              <div className="p-4 bg-stone-100/80 border border-stone-200 rounded-2xl text-center space-y-1">
                <p className="text-xs font-bold text-stone-700">
                  Select either Food Donor or Volunteer above to enable Google Sign-In
                </p>
                <p className="text-[11px] text-stone-500">
                  ResQBite tailors your dashboard experience based on your chosen participation role.
                </p>
              </div>
            ) : (
              /* Role selected: Active Google Sign-In */
              <div className="space-y-3">
                <div className="flex items-center justify-between text-xs px-1">
                  <span className="text-stone-600 font-medium">
                    Ready to authenticate as:{' '}
                    <strong className="text-emerald-800 font-bold capitalize">
                      {selectedRole === 'donor' ? 'Food Donor' : 'Volunteer'}
                    </strong>
                  </span>
                  <button
                    type="button"
                    onClick={() => setSelectedRole(null)}
                    className="text-stone-400 hover:text-stone-700 text-[11px] font-semibold flex items-center gap-1 cursor-pointer"
                  >
                    <RotateCcw className="w-3 h-3" />
                    <span>Change</span>
                  </button>
                </div>

                <button
                  type="button"
                  onClick={handleGoogleSignIn}
                  disabled={loading}
                  className="w-full flex items-center justify-center gap-3 py-3 px-4 rounded-2xl border-2 border-emerald-500/80 bg-white hover:bg-emerald-50/40 text-stone-800 font-black text-sm shadow-md transition-all hover:scale-[1.01] active:scale-[0.99] cursor-pointer disabled:opacity-50"
                >
                  {loading ? (
                    <>
                      <Loader2 className="w-5 h-5 animate-spin text-emerald-600" />
                      <span>Authenticating with Google...</span>
                    </>
                  ) : (
                    <>
                      <svg className="w-5 h-5 shrink-0" viewBox="0 0 24 24">
                        <path
                          fill="#4285F4"
                          d="M23.745 12.27c0-.7-.06-1.4-.19-2.07H12v4.51h6.6c-.29 1.52-1.14 2.8-2.4 3.66v3.05h3.87c2.26-2.09 3.67-5.17 3.67-9.15z"
                        />
                        <path
                          fill="#34A853"
                          d="M12 24c3.24 0 5.95-1.08 7.93-2.91l-3.87-3.05c-1.08.72-2.45 1.16-4.06 1.16-3.13 0-5.78-2.11-6.73-4.96H1.27v3.15C3.31 21.36 7.37 24 12 24z"
                        />
                        <path
                          fill="#FBBC05"
                          d="M5.27 14.24c-.25-.72-.38-1.49-.38-2.24s.13-1.52.38-2.24V6.61H1.27C.46 8.23 0 10.06 0 12s.46 3.77 1.27 5.39l4-3.15z"
                        />
                        <path
                          fill="#EA4335"
                          d="M12 4.75c1.77 0 3.35.61 4.6 1.8l3.42-3.42C17.95 1.19 15.24 0 12 0 7.37 0 3.31 2.64 1.27 6.61l4 3.15c.95-2.85 3.6-4.96 6.73-4.96z"
                        />
                      </svg>
                      <span>
                        Continue with Google as {selectedRole === 'donor' ? 'Food Donor' : 'Volunteer'}
                      </span>
                    </>
                  )}
                </button>
              </div>
            )}

            {/* Collapsible Secondary Email/Password Option */}
            <div className="pt-4 border-t border-stone-100 text-center">
              <button
                type="button"
                onClick={() => setShowEmailAuth(!showEmailAuth)}
                className="text-xs text-stone-500 hover:text-emerald-700 font-semibold cursor-pointer underline decoration-dotted"
              >
                {showEmailAuth ? 'Hide Email / Password Sign In' : 'Or continue with email & password'}
              </button>

              {showEmailAuth && (
                <div className="mt-4 p-5 rounded-2xl bg-stone-50 border border-stone-200 text-left space-y-4">
                  <div className="flex items-center justify-between">
                    <span className="font-bold text-xs text-stone-800">
                      {emailMode === 'signin' && 'Sign In via Email'}
                      {emailMode === 'register' && `Register as ${selectedRole ? (selectedRole === 'donor' ? 'Food Donor' : 'Volunteer') : 'Member'}`}
                      {emailMode === 'forgot' && 'Reset Password'}
                    </span>
                    <div className="flex gap-2 text-[11px]">
                      {emailMode !== 'signin' && (
                        <button
                          type="button"
                          onClick={() => setEmailMode('signin')}
                          className="text-emerald-700 font-bold hover:underline"
                        >
                          Sign In
                        </button>
                      )}
                      {emailMode !== 'register' && (
                        <button
                          type="button"
                          onClick={() => setEmailMode('register')}
                          className="text-emerald-700 font-bold hover:underline"
                        >
                          Register
                        </button>
                      )}
                    </div>
                  </div>

                  <form onSubmit={handleEmailSubmit} className="space-y-3 text-xs">
                    {emailMode === 'register' && (
                      <div>
                        <label className="font-semibold text-stone-700 block mb-1">
                          Full Name / Organization *
                        </label>
                        <div className="relative">
                          <User className="w-4 h-4 text-stone-400 absolute left-3 top-2.5" />
                          <input
                            type="text"
                            required
                            placeholder="e.g. Maya Sharma or Green Bakery"
                            value={displayName}
                            onChange={(e) => setDisplayName(e.target.value)}
                            className="w-full pl-9 pr-3 py-2 rounded-xl border border-stone-200 focus:border-emerald-500 outline-hidden font-medium bg-white"
                          />
                        </div>
                      </div>
                    )}

                    <div>
                      <label className="font-semibold text-stone-700 block mb-1">Email Address *</label>
                      <div className="relative">
                        <Mail className="w-4 h-4 text-stone-400 absolute left-3 top-2.5" />
                        <input
                          type="email"
                          required
                          placeholder="you@example.com"
                          value={email}
                          onChange={(e) => setEmail(e.target.value)}
                          className="w-full pl-9 pr-3 py-2 rounded-xl border border-stone-200 focus:border-emerald-500 outline-hidden font-medium bg-white"
                        />
                      </div>
                    </div>

                    {emailMode !== 'forgot' && (
                      <div>
                        <div className="flex items-center justify-between mb-1">
                          <label className="font-semibold text-stone-700">Password *</label>
                          {emailMode === 'signin' && (
                            <button
                              type="button"
                              onClick={() => setEmailMode('forgot')}
                              className="text-[11px] text-stone-400 hover:text-emerald-700"
                            >
                              Forgot?
                            </button>
                          )}
                        </div>
                        <div className="relative">
                          <Lock className="w-4 h-4 text-stone-400 absolute left-3 top-2.5" />
                          <input
                            type="password"
                            required
                            placeholder="••••••••"
                            value={password}
                            onChange={(e) => setPassword(e.target.value)}
                            className="w-full pl-9 pr-3 py-2 rounded-xl border border-stone-200 focus:border-emerald-500 outline-hidden font-medium bg-white"
                          />
                        </div>
                      </div>
                    )}

                    <button
                      type="submit"
                      disabled={loading || (emailMode === 'register' && !selectedRole)}
                      className="w-full bg-emerald-600 hover:bg-emerald-700 text-white font-bold py-2.5 rounded-xl transition-colors cursor-pointer flex items-center justify-center gap-1.5 disabled:opacity-50"
                    >
                      {loading && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
                      <span>
                        {emailMode === 'signin' && 'Sign In with Email'}
                        {emailMode === 'register' && `Create ${selectedRole === 'volunteer' ? 'Volunteer' : 'Donor'} Account`}
                        {emailMode === 'forgot' && 'Send Password Reset Link'}
                      </span>
                    </button>
                  </form>
                </div>
              )}
            </div>
          </div>
        )}

        {/* Guest Browse Link */}
        <div className="text-center pt-2">
          <button
            type="button"
            onClick={() => onNavigateTab && onNavigateTab('browse')}
            className="text-xs text-stone-500 hover:text-stone-800 font-medium inline-flex items-center gap-1 cursor-pointer"
          >
            <span>Or explore available food rescue requests first</span>
            <ArrowRight className="w-3 h-3" />
          </button>
        </div>
      </div>
    </div>
  );
};
