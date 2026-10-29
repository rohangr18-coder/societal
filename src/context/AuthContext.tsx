import React, { createContext, useContext, useEffect, useState } from 'react';
import {
  User as FirebaseUser,
  onAuthStateChanged,
  signInWithEmailAndPassword,
  createUserWithEmailAndPassword,
  signInWithPopup,
  signInWithRedirect,
  getRedirectResult,
  GoogleAuthProvider,
  signOut,
  sendPasswordResetEmail,
  updateProfile,
} from 'firebase/auth';
import { auth, firebaseProjectInfo } from '../lib/firebase';
import { UserProfile, UserRole } from '../types';
import { getUserProfile, createOrUpdateUserProfile } from '../services/dbService';

export type AuthProviderErrorType = 'EMAIL_PASSWORD_DISABLED' | 'GOOGLE_AUTH_DISABLED' | 'UNAUTHORIZED_DOMAIN' | null;

interface AuthContextType {
  currentUser: FirebaseUser | null;
  userProfile: UserProfile | null;
  loading: boolean;
  error: string | null;
  authProviderError: AuthProviderErrorType;
  firebaseProjectId: string;
  signInWithEmail: (email: string, pass: string) => Promise<void>;
  signUpWithEmail: (email: string, pass: string, displayName: string, role: UserRole) => Promise<void>;
  signInWithGoogle: () => Promise<void>;
  logout: () => Promise<void>;
  resetPassword: (email: string) => Promise<void>;
  refreshProfile: () => Promise<void>;
  updateRole: (newRole: UserRole) => Promise<void>;
  clearError: () => void;
  isAdmin: boolean;
  isNgo: boolean;
  isDonor: boolean;
  isVolunteer: boolean;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

const ADMIN_BOOTSTRAP_EMAIL = 'rohangr18@gmail.com';

function mapAuthError(err: any, method: 'signin' | 'signup' | 'google' | 'reset'): { message: string; providerError: AuthProviderErrorType } {
  const code = err?.code || '';
  const currentHost = typeof window !== 'undefined' ? window.location.hostname : 'your deployed domain';

  if (code === 'auth/operation-not-allowed' || code === 'auth/admin-restricted-operation') {
    if (method === 'google') {
      return {
        message: 'Google Sign-in is disabled in your Firebase project. Enable it under Firebase Console > Authentication > Sign-in method.',
        providerError: 'GOOGLE_AUTH_DISABLED',
      };
    }
    return {
      message: 'Email/Password authentication provider is currently disabled in your Firebase project. To enable it, visit Firebase Console > Authentication > Sign-in method > enable Email/Password.',
      providerError: 'EMAIL_PASSWORD_DISABLED',
    };
  }

  if (code === 'auth/unauthorized-domain') {
    return {
      message: `The domain "${currentHost}" is not authorized in Firebase Authentication. Please add it in Firebase Console > Authentication > Settings > Authorized domains.`,
      providerError: 'UNAUTHORIZED_DOMAIN',
    };
  }

  if (code === 'auth/email-already-in-use') {
    return {
      message: 'This email address is already registered. Please sign in or use "Forgot password".',
      providerError: null,
    };
  }

  if (code === 'auth/invalid-email') {
    return {
      message: 'The email address format is invalid. Please check and try again.',
      providerError: null,
    };
  }

  if (code === 'auth/weak-password') {
    return {
      message: 'Password is too weak. Please use at least 6 characters.',
      providerError: null,
    };
  }

  if (code === 'auth/user-not-found' || code === 'auth/wrong-password' || code === 'auth/invalid-credential') {
    return {
      message: 'Invalid email or password. Please verify your credentials and try again.',
      providerError: null,
    };
  }

  if (code === 'auth/user-disabled') {
    return {
      message: 'This account has been disabled. Please contact platform support.',
      providerError: null,
    };
  }

  if (code === 'auth/too-many-requests') {
    return {
      message: 'Access temporarily disabled due to multiple failed login attempts. Please try again later or reset your password.',
      providerError: null,
    };
  }

  if (code === 'auth/network-request-failed') {
    return {
      message: 'Network connection failed. Please check your internet connection and try again.',
      providerError: null,
    };
  }

  if (code === 'auth/popup-closed-by-user') {
    return {
      message: 'Google sign-in popup was closed before completion.',
      providerError: null,
    };
  }

  if (code === 'auth/popup-blocked') {
    return {
      message: 'The sign-in popup was blocked by your browser. Please allow popups or try again.',
      providerError: null,
    };
  }

  if (code === 'auth/cancelled-popup-request') {
    return {
      message: 'Sign-in was cancelled.',
      providerError: null,
    };
  }

  return {
    message: err?.message || 'Authentication failed. Please try again.',
    providerError: null,
  };
}

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [currentUser, setCurrentUser] = useState<FirebaseUser | null>(null);
  const [userProfile, setUserProfile] = useState<UserProfile | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [authProviderError, setAuthProviderError] = useState<AuthProviderErrorType>(null);

  const refreshProfile = async () => {
    if (!auth.currentUser) {
      setUserProfile(null);
      return;
    }

    try {
      let profile = await getUserProfile(auth.currentUser.uid);
      const isBootstrapAdmin = auth.currentUser.email?.toLowerCase() === ADMIN_BOOTSTRAP_EMAIL.toLowerCase();

      if (!profile) {
        // Auto-create initial profile
        profile = await createOrUpdateUserProfile({
          uid: auth.currentUser.uid,
          email: auth.currentUser.email || '',
          displayName: auth.currentUser.displayName || auth.currentUser.email?.split('@')[0] || 'Member',
          role: isBootstrapAdmin ? 'admin' : 'donor',
        });
      } else if (isBootstrapAdmin && profile.role !== 'admin') {
        // Elevate bootstrap admin
        profile = await createOrUpdateUserProfile({
          ...profile,
          role: 'admin',
        });
      }

      setUserProfile(profile);
    } catch (err: any) {
      console.error('Profile fetch error:', err);
    }
  };

  useEffect(() => {
    // Check if returning from a mobile redirect authentication flow
    getRedirectResult(auth)
      .then(async (result) => {
        if (result?.user) {
          await refreshProfile();
        }
      })
      .catch((err) => {
        const { message, providerError } = mapAuthError(err, 'google');
        setError(message);
        setAuthProviderError(providerError);
      });

    const unsubscribe = onAuthStateChanged(auth, async (user) => {
      setCurrentUser(user);
      if (user) {
        await refreshProfile();
      } else {
        setUserProfile(null);
      }
      setLoading(false);
    });

    return () => unsubscribe();
  }, []);

  const signInWithEmail = async (email: string, pass: string) => {
    setError(null);
    setAuthProviderError(null);
    const cleanEmail = email.trim();
    if (!cleanEmail || !pass) {
      const msg = 'Please enter both email and password.';
      setError(msg);
      throw new Error(msg);
    }

    try {
      await signInWithEmailAndPassword(auth, cleanEmail, pass);
      // Successful login clears any prior error
      setError(null);
      setAuthProviderError(null);
    } catch (err: any) {
      const { message, providerError } = mapAuthError(err, 'signin');
      setError(message);
      setAuthProviderError(providerError);
      throw err;
    }
  };

  const signUpWithEmail = async (email: string, pass: string, displayName: string, role: UserRole) => {
    setError(null);
    setAuthProviderError(null);
    const cleanEmail = email.trim();
    const cleanName = displayName.trim();

    if (!cleanEmail || !pass) {
      const msg = 'Please enter both email and password.';
      setError(msg);
      throw new Error(msg);
    }
    if (pass.length < 6) {
      const msg = 'Password must be at least 6 characters.';
      setError(msg);
      throw new Error(msg);
    }

    // Role escalation security: Users CANNOT assign themselves the admin role during registration
    const isBootstrapAdmin = cleanEmail.toLowerCase() === ADMIN_BOOTSTRAP_EMAIL.toLowerCase();
    const safeRole: UserRole = isBootstrapAdmin
      ? 'admin'
      : (role === 'ngo' || role === 'volunteer' ? role : 'donor');

    try {
      const cred = await createUserWithEmailAndPassword(auth, cleanEmail, pass);
      if (cleanName) {
        await updateProfile(cred.user, { displayName: cleanName });
      }

      const profile = await createOrUpdateUserProfile({
        uid: cred.user.uid,
        email: cleanEmail,
        displayName: cleanName || cleanEmail.split('@')[0],
        role: safeRole,
      });
      setUserProfile(profile);
      setError(null);
      setAuthProviderError(null);
    } catch (err: any) {
      const { message, providerError } = mapAuthError(err, 'signup');
      setError(message);
      setAuthProviderError(providerError);
      throw err;
    }
  };

  const signInWithGoogle = async () => {
    setError(null);
    setAuthProviderError(null);
    const provider = new GoogleAuthProvider();
    provider.setCustomParameters({ prompt: 'select_account' });

    try {
      await signInWithPopup(auth, provider);
      await refreshProfile();
      setError(null);
      setAuthProviderError(null);
    } catch (err: any) {
      // If popup was blocked (common on strict mobile browsers), attempt redirect flow
      if (err?.code === 'auth/popup-blocked') {
        try {
          await signInWithRedirect(auth, provider);
          return;
        } catch (redirectErr) {
          const { message, providerError } = mapAuthError(redirectErr, 'google');
          setError(message);
          setAuthProviderError(providerError);
          throw redirectErr;
        }
      }

      const { message, providerError } = mapAuthError(err, 'google');
      setError(message);
      setAuthProviderError(providerError);
      throw err;
    }
  };

  const logout = async () => {
    try {
      await signOut(auth);
      setUserProfile(null);
      setCurrentUser(null);
      setError(null);
      setAuthProviderError(null);
    } catch (err: any) {
      setError(err?.message || 'Failed to sign out');
    }
  };

  const resetPassword = async (email: string) => {
    setError(null);
    const cleanEmail = email.trim();
    if (!cleanEmail) {
      const msg = 'Please enter your registered email address.';
      setError(msg);
      throw new Error(msg);
    }

    try {
      await sendPasswordResetEmail(auth, cleanEmail);
    } catch (err: any) {
      const { message } = mapAuthError(err, 'reset');
      setError(message);
      throw err;
    }
  };

  const updateRole = async (newRole: UserRole) => {
    if (!currentUser || !userProfile) return;
    const isBootstrap = currentUser.email?.toLowerCase() === ADMIN_BOOTSTRAP_EMAIL.toLowerCase();

    // Security: non-bootstrap users cannot escalate their role to admin
    if (newRole === 'admin' && !isBootstrap) {
      setError('Administrator privileges cannot be self-assigned. Contact an existing admin.');
      return;
    }

    // Don't downgrade bootstrap admin
    if (isBootstrap && newRole !== 'admin') {
      setError('Bootstrap administrator role cannot be altered.');
      return;
    }

    const updated = await createOrUpdateUserProfile({
      ...userProfile,
      role: newRole,
    });
    setUserProfile(updated);
  };

  const clearError = () => {
    setError(null);
    setAuthProviderError(null);
  };

  const isBootstrap = currentUser?.email?.toLowerCase() === ADMIN_BOOTSTRAP_EMAIL.toLowerCase();
  const isAdmin = isBootstrap || userProfile?.role === 'admin';
  const isNgo = userProfile?.role === 'ngo';
  const isDonor = userProfile?.role === 'donor';
  const isVolunteer = userProfile?.role === 'volunteer';

  return (
    <AuthContext.Provider
      value={{
        currentUser,
        userProfile,
        loading,
        error,
        authProviderError,
        firebaseProjectId: firebaseProjectInfo.projectId,
        signInWithEmail,
        signUpWithEmail,
        signInWithGoogle,
        logout,
        resetPassword,
        refreshProfile,
        updateRole,
        clearError,
        isAdmin,
        isNgo,
        isDonor,
        isVolunteer,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
};

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
}

