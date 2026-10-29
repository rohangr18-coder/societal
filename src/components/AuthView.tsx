import React, { useState } from 'react';
import {
  HeartHandshake,
  Mail,
  Lock,
  User,
  Shield,
  Utensils,
  Building2,
  Bike,
  AlertCircle,
  CheckCircle2,
  ExternalLink,
  Loader2,
} from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { UserRole } from '../types';

interface AuthViewProps {
  onSuccess: () => void;
}

export const AuthView: React.FC<AuthViewProps> = ({ onSuccess }) => {
  const {
    signInWithEmail,
    signUpWithEmail,
    signInWithGoogle,
    resetPassword,
    error,
    authProviderError,
    firebaseProjectId,
    clearError,
  } = useAuth();

  const [mode, setMode] = useState<'signin' | 'register' | 'forgot'>('signin');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [displayName, setDisplayName] = useState('');
  const [role, setRole] = useState<UserRole>('donor');
  const [loading, setLoading] = useState(false);
  const [resetSent, setResetSent] = useState(false);

  const currentHost = typeof window !== 'undefined' ? window.location.hostname : 'your Vercel domain';
  const consoleProvidersUrl = `https://console.firebase.google.com/project/${firebaseProjectId}/authentication/providers`;
  const consoleSettingsUrl = `https://console.firebase.google.com/project/${firebaseProjectId}/authentication/settings`;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    try {
      if (mode === 'signin') {
        await signInWithEmail(email, password);
        onSuccess();
      } else if (mode === 'register') {
        await signUpWithEmail(email, password, displayName, role);
        onSuccess();
      } else if (mode === 'forgot') {
        await resetPassword(email);
        setResetSent(true);
      }
    } catch (err) {
      // Error message is set in AuthContext
    } finally {
      setLoading(false);
    }
  };

  const handleGoogleSignIn = async () => {
    setLoading(true);
    try {
      await signInWithGoogle();
      onSuccess();
    } catch (err) {
      // Error message is set in AuthContext
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-[80vh] flex items-center justify-center px-4 py-12">
      <div className="max-w-md w-full bg-white rounded-3xl border border-stone-200/80 shadow-xl p-8 space-y-6">
        {/* Brand Header */}
        <div className="text-center space-y-2">
          <div className="w-12 h-12 rounded-2xl bg-gradient-to-br from-emerald-600 to-teal-700 flex items-center justify-center text-white mx-auto shadow-md">
            <HeartHandshake className="w-7 h-7" />
          </div>
          <h2 className="text-2xl font-black text-stone-900 tracking-tight">
            {mode === 'signin' && 'Sign In to Food Rescue'}
            {mode === 'register' && 'Join the Rescue Network'}
            {mode === 'forgot' && 'Reset Your Password'}
          </h2>
          <p className="text-xs text-stone-500">
            {mode === 'signin' && 'Enter your credentials to access your dashboard'}
            {mode === 'register' && 'Select your organization type and create your secure account'}
            {mode === 'forgot' && 'We will send a password reset link to your email'}
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

            {authProviderError === 'EMAIL_PASSWORD_DISABLED' && (
              <div className="space-y-2 leading-relaxed">
                <p>
                  <strong>Email/Password sign-in</strong> is currently disabled in your Firebase project (
                  <code className="bg-amber-100/80 px-1 py-0.5 rounded text-[11px] font-mono text-amber-900">{firebaseProjectId}</code>
                  ).
                </p>
                <div className="bg-white/80 p-2.5 rounded-xl border border-amber-200/70 space-y-1 text-[11px]">
                  <p className="font-semibold text-amber-900">How to enable in 3 steps:</p>
                  <ol className="list-decimal pl-4 space-y-0.5 text-stone-700">
                    <li>Open Firebase Console &gt; <strong>Authentication</strong> &gt; <strong>Sign-in method</strong>.</li>
                    <li>Click on <strong>Email/Password</strong> under "Sign-in providers".</li>
                    <li>Toggle the <strong>Enable</strong> switch to ON and click <strong>Save</strong>.</li>
                  </ol>
                </div>
                <a
                  href={consoleProvidersUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-1.5 text-emerald-800 font-bold hover:underline text-[11px]"
                >
                  Open Firebase Authentication Console
                  <ExternalLink className="w-3.5 h-3.5" />
                </a>
              </div>
            )}

            {authProviderError === 'GOOGLE_AUTH_DISABLED' && (
              <div className="space-y-2 leading-relaxed">
                <p>
                  <strong>Google Sign-in</strong> is not yet enabled in your Firebase project (
                  <code className="bg-amber-100/80 px-1 py-0.5 rounded text-[11px] font-mono text-amber-900">{firebaseProjectId}</code>
                  ).
                </p>
                <div className="bg-white/80 p-2.5 rounded-xl border border-amber-200/70 space-y-1 text-[11px]">
                  <p className="font-semibold text-amber-900">How to enable:</p>
                  <p className="text-stone-700">
                    In Firebase Console &gt; <strong>Authentication</strong> &gt; <strong>Sign-in method</strong>, click <strong>Add new provider</strong> &gt; <strong>Google</strong> &gt; toggle <strong>Enable</strong>, select your support email, and click <strong>Save</strong>.
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
                  <code className="bg-amber-100/80 px-1 py-0.5 rounded text-[11px] font-mono text-amber-900">{currentHost}</code>
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
          <div className="p-3 bg-red-50 border border-red-200 rounded-xl text-red-700 text-xs flex items-start gap-2">
            <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
            <span>{error}</span>
          </div>
        )}

        {resetSent && (
          <div className="p-3 bg-emerald-50 border border-emerald-200 rounded-xl text-emerald-800 text-xs flex items-start gap-2">
            <CheckCircle2 className="w-4 h-4 shrink-0 mt-0.5" />
            <span>Password reset email dispatched. Please check your inbox.</span>
          </div>
        )}

        {/* Google One-Click Sign In */}
        {mode !== 'forgot' && (
          <div>
            <button
              type="button"
              onClick={handleGoogleSignIn}
              disabled={loading}
              className="w-full flex items-center justify-center gap-3 py-2.5 px-4 rounded-xl border border-stone-200 bg-stone-50/50 hover:bg-stone-100 font-semibold text-xs text-stone-700 transition-colors cursor-pointer"
            >
              <svg className="w-4 h-4" viewBox="0 0 24 24">
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
              Continue with Google Account
            </button>

            <div className="relative my-4 text-center">
              <span className="bg-white px-3 text-[11px] font-bold text-stone-400 uppercase tracking-wider relative z-10">
                Or with Email
              </span>
              <div className="absolute inset-0 flex items-center">
                <div className="w-full border-t border-stone-200" />
              </div>
            </div>
          </div>
        )}

        {/* Email & Password Form */}
        <form onSubmit={handleSubmit} className="space-y-4 text-xs">
          {mode === 'register' && (
            <>
              <div>
                <label className="font-semibold text-stone-700 block mb-1">
                  Full Name / Organization Name *
                </label>
                <div className="relative">
                  <User className="w-4 h-4 text-stone-400 absolute left-3 top-2.5" />
                  <input
                    type="text"
                    required
                    placeholder="e.g. Radisson Blu Hotel or Asha Foundation"
                    value={displayName}
                    onChange={(e) => setDisplayName(e.target.value)}
                    className="w-full pl-9 pr-3 py-2 rounded-xl border border-stone-200 focus:border-emerald-500 outline-hidden font-medium"
                  />
                </div>
              </div>

              {/* Account Type Selection */}
              <div>
                <label className="font-semibold text-stone-700 block mb-2">
                  Select Your Account Role *
                </label>
                <div className="grid grid-cols-3 gap-2">
                  <button
                    type="button"
                    onClick={() => setRole('donor')}
                    className={`p-3 rounded-xl border text-center transition-all cursor-pointer ${
                      role === 'donor'
                        ? 'border-emerald-600 bg-emerald-50/70 text-emerald-950 font-bold shadow-2xs'
                        : 'border-stone-200 text-stone-600 hover:bg-stone-50'
                    }`}
                  >
                    <Utensils className="w-5 h-5 mx-auto text-emerald-600 mb-1" />
                    <span className="block text-[11px]">Food Donor</span>
                  </button>

                  <button
                    type="button"
                    onClick={() => setRole('ngo')}
                    className={`p-3 rounded-xl border text-center transition-all cursor-pointer ${
                      role === 'ngo'
                        ? 'border-orange-600 bg-orange-50/70 text-orange-950 font-bold shadow-2xs'
                        : 'border-stone-200 text-stone-600 hover:bg-stone-50'
                    }`}
                  >
                    <Building2 className="w-5 h-5 mx-auto text-orange-600 mb-1" />
                    <span className="block text-[11px]">NGO Shelter</span>
                  </button>

                  <button
                    type="button"
                    onClick={() => setRole('volunteer')}
                    className={`p-3 rounded-xl border text-center transition-all cursor-pointer ${
                      role === 'volunteer'
                        ? 'border-blue-600 bg-blue-50/70 text-blue-950 font-bold shadow-2xs'
                        : 'border-stone-200 text-stone-600 hover:bg-stone-50'
                    }`}
                  >
                    <Bike className="w-5 h-5 mx-auto text-blue-600 mb-1" />
                    <span className="block text-[11px]">Volunteer</span>
                  </button>
                </div>
              </div>
            </>
          )}

          <div>
            <label className="font-semibold text-stone-700 block mb-1">Email Address *</label>
            <div className="relative">
              <Mail className="w-4 h-4 text-stone-400 absolute left-3 top-2.5" />
              <input
                type="email"
                required
                placeholder="name@example.com"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="w-full pl-9 pr-3 py-2 rounded-xl border border-stone-200 focus:border-emerald-500 outline-hidden font-medium"
              />
            </div>
          </div>

          {mode !== 'forgot' && (
            <div>
              <div className="flex items-center justify-between mb-1">
                <label className="font-semibold text-stone-700">Password *</label>
                {mode === 'signin' && (
                  <button
                    type="button"
                    onClick={() => {
                      clearError();
                      setMode('forgot');
                    }}
                    className="text-[11px] text-emerald-700 hover:underline"
                  >
                    Forgot password?
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
                  className="w-full pl-9 pr-3 py-2 rounded-xl border border-stone-200 focus:border-emerald-500 outline-hidden"
                />
              </div>
            </div>
          )}

          <button
            type="submit"
            disabled={loading}
            className="w-full bg-emerald-600 hover:bg-emerald-700 text-white font-bold py-2.5 rounded-xl shadow-xs transition-colors flex items-center justify-center gap-2 cursor-pointer disabled:opacity-50"
          >
            {loading ? (
              <Loader2 className="w-4 h-4 animate-spin" />
            ) : mode === 'signin' ? (
              'Sign In'
            ) : mode === 'register' ? (
              'Create Account'
            ) : (
              'Send Reset Link'
            )}
          </button>
        </form>

        {/* Mode Switcher Footer */}
        <div className="text-center text-xs text-stone-500 pt-2 border-t border-stone-100">
          {mode === 'signin' ? (
            <p>
              Don't have an account yet?{' '}
              <button
                type="button"
                onClick={() => {
                  clearError();
                  setMode('register');
                }}
                className="font-bold text-emerald-700 hover:underline"
              >
                Register now
              </button>
            </p>
          ) : (
            <p>
              Already registered?{' '}
              <button
                type="button"
                onClick={() => {
                  clearError();
                  setMode('signin');
                }}
                className="font-bold text-emerald-700 hover:underline"
              >
                Sign in to your account
              </button>
            </p>
          )}
        </div>
      </div>
    </div>
  );
};
