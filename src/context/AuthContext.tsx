import React, { createContext, useContext, useEffect, useState, useRef } from 'react';
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
import { isUserAdminInFirestore } from '../services/dbUserService';

export type AuthProviderErrorType =
  | 'EMAIL_PASSWORD_DISABLED'
  | 'GOOGLE_AUTH_DISABLED'
  | 'UNAUTHORIZED_DOMAIN'
  | 'POPUP_BLOCKED'
  | 'NETWORK_ERROR'
  | 'FIRESTORE_ERROR'
  | null;

interface AuthContextType {
  currentUser: FirebaseUser | null;
  userProfile: UserProfile | null;
  loading: boolean;
  profileLoading: boolean;
  error: string | null;
  authProviderError: AuthProviderErrorType;
  firebaseProjectId: string;
  signInWithEmail: (email: string, pass: string) => Promise<void>;
  signUpWithEmail: (email: string, pass: string, displayName: string, role: UserRole) => Promise<void>;
  signInWithGoogle: (selectedRole?: UserRole) => Promise<{ isNewUser: boolean; profile: UserProfile }>;
  logout: () => Promise<void>;
  resetPassword: (email: string) => Promise<void>;
  refreshProfile: (desiredRole?: UserRole) => Promise<UserProfile | null>;
  updateRole: (newRole: UserRole) => Promise<void>;
  clearError: () => void;
  isAdmin: boolean;
  isNgo: boolean;
  isDonor: boolean;
  isVolunteer: boolean;
  hasRole: boolean;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

const PROFILE_FETCH_TIMEOUT_MS = 4000;

/**
 * Maps raw Firebase authentication or Firestore errors to user-friendly messages
 */
export function mapAuthError(
  err: any,
  method: 'signin' | 'signup' | 'google' | 'reset' | 'profile' = 'signin'
): { message: string; providerError: AuthProviderErrorType } {
  const code = err?.code || '';
  const rawMessage = err?.message || String(err || '');
  const currentHost = typeof window !== 'undefined' ? window.location.hostname : 'your deployed domain';

  if (code === 'auth/operation-not-allowed' || code === 'auth/admin-restricted-operation') {
    if (method === 'google') {
      return {
        message: 'Google Sign-in is not enabled in your Firebase project. Please enable it in Firebase Console > Authentication > Sign-in method.',
        providerError: 'GOOGLE_AUTH_DISABLED',
      };
    }
    return {
      message: 'Email/Password sign-in is not enabled in your Firebase project. Please enable it in Firebase Console > Authentication > Sign-in method.',
      providerError: 'EMAIL_PASSWORD_DISABLED',
    };
  }

  if (code === 'auth/unauthorized-domain' || rawMessage.includes('unauthorized-domain')) {
    return {
      message: `The domain "${currentHost}" is not authorized in Firebase. Add it in Firebase Console > Authentication > Settings > Authorized domains.`,
      providerError: 'UNAUTHORIZED_DOMAIN',
    };
  }

  if (code === 'auth/popup-blocked') {
    return {
      message: 'The sign-in popup was blocked by your browser. Please allow popups for this site or try again.',
      providerError: 'POPUP_BLOCKED',
    };
  }

  if (code === 'auth/popup-closed-by-user') {
    return {
      message: 'Google sign-in popup was closed before completion. Please try again.',
      providerError: null,
    };
  }

  if (code === 'auth/cancelled-popup-request') {
    return {
      message: 'Sign-in request was cancelled by a newer request.',
      providerError: null,
    };
  }

  if (code === 'auth/network-request-failed' || rawMessage.includes('network-request-failed')) {
    return {
      message: 'Network connection failed. Please check your internet connection and try again.',
      providerError: 'NETWORK_ERROR',
    };
  }

  if (code === 'auth/email-already-in-use') {
    return {
      message: 'This email is already registered. Please sign in or use "Forgot password".',
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

  if (
    code === 'auth/user-not-found' ||
    code === 'auth/wrong-password' ||
    code === 'auth/invalid-credential'
  ) {
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

  // Firestore-specific errors
  if (rawMessage.includes('permission-denied') || code === 'permission-denied') {
    return {
      message: 'Firestore permission denied while loading user profile. Security rules prevented read/write.',
      providerError: 'FIRESTORE_ERROR',
    };
  }

  if (rawMessage.includes('unavailable') || code === 'unavailable') {
    return {
      message: 'Cloud Firestore service is temporarily unavailable. Retrying with local cache.',
      providerError: 'FIRESTORE_ERROR',
    };
  }

  return {
    message: rawMessage || 'Authentication operation failed. Please try again.',
    providerError: null,
  };
}

/**
 * Executes a promise with an automatic timeout fallback
 */
async function withTimeout<T>(promise: Promise<T>, timeoutMs: number, fallbackValue: T): Promise<T> {
  let timer: any;
  const timeoutPromise = new Promise<T>((resolve) => {
    timer = setTimeout(() => {
      resolve(fallbackValue);
    }, timeoutMs);
  });

  try {
    const result = await Promise.race([promise, timeoutPromise]);
    clearTimeout(timer);
    return result;
  } catch (err) {
    clearTimeout(timer);
    throw err;
  }
}

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [currentUser, setCurrentUser] = useState<FirebaseUser | null>(null);
  const [userProfile, setUserProfile] = useState<UserProfile | null>(null);
  const [loading, setLoading] = useState<boolean>(true); // Initial auth check
  const [profileLoading, setProfileLoading] = useState<boolean>(false); // Firestore profile sync
  const [error, setError] = useState<string | null>(null);
  const [authProviderError, setAuthProviderError] = useState<AuthProviderErrorType>(null);
  const [isVerifiedAdmin, setIsVerifiedAdmin] = useState<boolean>(false);

  // In-flight sync de-duplication
  const syncInProgressRef = useRef<boolean>(false);
  const currentUserRef = useRef<FirebaseUser | null>(null);
  currentUserRef.current = currentUser;

  /**
   * Verifies admin status strictly via Firebase Auth custom claims or /admins/{uid} collection
   */
  const checkAdminAuthorization = async (user: FirebaseUser): Promise<boolean> => {
    try {
      const tokenResult = await withTimeout(user.getIdTokenResult(false), 2000, null);
      if (tokenResult?.claims?.role === 'admin' || tokenResult?.claims?.admin === true) {
        return true;
      }
    } catch {
      // Custom claim check failed; fall through to admins collection check
    }

    try {
      return await withTimeout(isUserAdminInFirestore(user.uid), 2500, false);
    } catch {
      return false;
    }
  };

  /**
   * Safe profile retrieval and synchronization with non-blocking timeouts
   */
  const refreshProfile = async (desiredRole?: UserRole): Promise<UserProfile | null> => {
    const user = auth.currentUser;
    if (!user) {
      setUserProfile(null);
      return null;
    }

    // Prevent concurrent duplicate sync calls
    if (syncInProgressRef.current) {
      return userProfile;
    }

    syncInProgressRef.current = true;
    setProfileLoading(true);

    try {
      // 1. Verify admin strictly via custom claims or admins/{uid} collection
      const isAdminUser = await checkAdminAuthorization(user);
      setIsVerifiedAdmin(isAdminUser);

      // 2. Fetch existing profile with timeout
      let profile: UserProfile | null = null;
      try {
        profile = await withTimeout(
          getUserProfile(user.uid),
          PROFILE_FETCH_TIMEOUT_MS,
          null
        );
      } catch (profileErr) {
        console.warn('[AuthContext] Profile fetch warning:', profileErr);
      }

      if (!profile) {
        // New profile: only assign a role if desiredRole was passed or admin
        const roleToAssign = isAdminUser ? 'admin' : desiredRole;

        const newProfile: UserProfile = {
          uid: user.uid,
          email: user.email || '',
          displayName: user.displayName || user.email?.split('@')[0] || 'Member',
          ...(roleToAssign ? { role: roleToAssign } : {}),
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        };

        // Attempt Firestore save with timeout
        try {
          if (roleToAssign) {
            profile = await withTimeout(
              createOrUpdateUserProfile(newProfile),
              PROFILE_FETCH_TIMEOUT_MS,
              newProfile
            );
          } else {
            profile = newProfile;
          }
        } catch {
          profile = newProfile;
        }
      } else {
        // Existing profile in Firestore: STRICTLY PRESERVE EXISTING ROLE
        if (isAdminUser && profile.role !== 'admin') {
          try {
            profile = await withTimeout(
              createOrUpdateUserProfile({ ...profile, role: 'admin' }),
              PROFILE_FETCH_TIMEOUT_MS,
              { ...profile, role: 'admin' }
            );
          } catch {
            profile = { ...profile, role: 'admin' };
          }
        } else if (!profile.role && desiredRole) {
          // If existing profile was missing a role, apply desiredRole
          try {
            profile = await withTimeout(
              createOrUpdateUserProfile({ ...profile, role: desiredRole }),
              PROFILE_FETCH_TIMEOUT_MS,
              { ...profile, role: desiredRole }
            );
          } catch {
            profile = { ...profile, role: desiredRole };
          }
        }
      }

      setUserProfile(profile);
      return profile;
    } catch (err: any) {
      console.warn('[AuthContext] Profile sync fallback:', err);
      // Construct safe in-memory fallback profile so the user is NEVER blocked
      const fallback: UserProfile = {
        uid: user.uid,
        email: user.email || '',
        displayName: user.displayName || user.email?.split('@')[0] || 'Member',
        role: desiredRole || 'donor',
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };
      setUserProfile(fallback);
      return fallback;
    } finally {
      syncInProgressRef.current = false;
      setProfileLoading(false);
    }
  };

  useEffect(() => {
    let isMounted = true;

    // Safety fallback: ensure initial loading resolves within 3 seconds regardless of network
    const safetyTimer = setTimeout(() => {
      if (isMounted) {
        setLoading(false);
      }
    }, 3000);

    // 1. Check if returning from a mobile redirect authentication flow
    getRedirectResult(auth)
      .then(async (result) => {
        if (!isMounted) return;
        if (result?.user) {
          setCurrentUser(result.user);
          await refreshProfile();
        }
      })
      .catch((err) => {
        if (!isMounted) return;
        const { message, providerError } = mapAuthError(err, 'google');
        setError(message);
        setAuthProviderError(providerError);
      });

    // 2. Main Firebase Auth State Listener
    const unsubscribe = onAuthStateChanged(
      auth,
      async (user) => {
        if (!isMounted) return;
        clearTimeout(safetyTimer);
        setCurrentUser(user);

        if (user) {
          // Unblock auth loading immediately, sync profile asynchronously
          setLoading(false);
          await refreshProfile();
        } else {
          setUserProfile(null);
          setIsVerifiedAdmin(false);
          setLoading(false);
        }
      },
      (authErr) => {
        if (!isMounted) return;
        clearTimeout(safetyTimer);
        console.error('[AuthContext] onAuthStateChanged error:', authErr);
        const { message, providerError } = mapAuthError(authErr, 'signin');
        setError(message);
        setAuthProviderError(providerError);
        setLoading(false);
      }
    );

    return () => {
      isMounted = false;
      clearTimeout(safetyTimer);
      unsubscribe();
    };
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
      const cred = await signInWithEmailAndPassword(auth, cleanEmail, pass);
      setCurrentUser(cred.user);
      await refreshProfile();
      setError(null);
      setAuthProviderError(null);
    } catch (err: any) {
      const { message, providerError } = mapAuthError(err, 'signin');
      setError(message);
      setAuthProviderError(providerError);
      throw err;
    }
  };

  const signUpWithEmail = async (
    email: string,
    pass: string,
    displayName: string,
    role: UserRole
  ) => {
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
    const safeRole: UserRole = role === 'ngo' || role === 'volunteer' ? role : 'donor';

    try {
      const cred = await createUserWithEmailAndPassword(auth, cleanEmail, pass);
      setCurrentUser(cred.user);

      if (cleanName) {
        await updateProfile(cred.user, { displayName: cleanName }).catch(console.warn);
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

  /**
   * Resilient Google Sign-In with timeout protection and non-blocking profile retrieval
   */
  const signInWithGoogle = async (
    selectedRole?: UserRole
  ): Promise<{ isNewUser: boolean; profile: UserProfile }> => {
    setError(null);
    setAuthProviderError(null);

    const provider = new GoogleAuthProvider();
    provider.setCustomParameters({ prompt: 'select_account' });

    try {
      const res = await signInWithPopup(auth, provider);
      const user = res.user;
      setCurrentUser(user);

      // Check verified admin status via custom claims or admins/{uid} collection
      const isAdminUser = await checkAdminAuthorization(user);
      setIsVerifiedAdmin(isAdminUser);

      // Retrieve existing profile with timeout protection
      const existing = await withTimeout(
        getUserProfile(user.uid),
        PROFILE_FETCH_TIMEOUT_MS,
        null
      ).catch(() => null);

      let finalProfile: UserProfile;

      if (existing && existing.role) {
        // Returning user with already saved role: PRESERVE SAVED ROLE!
        finalProfile = existing;
        if (isAdminUser && existing.role !== 'admin') {
          try {
            finalProfile = await withTimeout(
              createOrUpdateUserProfile({ ...existing, role: 'admin' }),
              PROFILE_FETCH_TIMEOUT_MS,
              { ...existing, role: 'admin' }
            );
          } catch {
            finalProfile = { ...existing, role: 'admin' };
          }
        }
      } else {
        // New user OR existing user without a role:
        const roleToAssign: UserRole = isAdminUser
          ? 'admin'
          : (selectedRole === 'volunteer' || selectedRole === 'ngo' ? selectedRole : (selectedRole || 'donor'));

        const newProfileData: UserProfile = {
          uid: user.uid,
          email: user.email || '',
          displayName: user.displayName || user.email?.split('@')[0] || 'Member',
          role: roleToAssign,
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        };

        try {
          finalProfile = await withTimeout(
            createOrUpdateUserProfile(newProfileData),
            PROFILE_FETCH_TIMEOUT_MS,
            newProfileData
          );
        } catch (saveErr) {
          console.warn('[signInWithGoogle] Firestore profile save warning, using provisional profile:', saveErr);
          finalProfile = newProfileData;
        }
      }

      setUserProfile(finalProfile);
      setError(null);
      setAuthProviderError(null);
      return { isNewUser: !existing, profile: finalProfile };
    } catch (err: any) {
      // If popup was blocked (e.g. strict mobile browsers), attempt redirect flow
      if (err?.code === 'auth/popup-blocked') {
        try {
          await signInWithRedirect(auth, provider);
          return { isNewUser: false, profile: null as any };
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
      setIsVerifiedAdmin(false);
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
    if (!currentUser) return;

    // Security: non-admin users cannot self-assign admin privileges
    if (newRole === 'admin' && !isVerifiedAdmin) {
      const msg = 'Administrator privileges cannot be self-assigned. Contact an existing admin.';
      setError(msg);
      throw new Error(msg);
    }

    const currentData = userProfile || {
      uid: currentUser.uid,
      email: currentUser.email || '',
      displayName: currentUser.displayName || 'Member',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };

    const updated = await createOrUpdateUserProfile({
      ...currentData,
      role: newRole,
    });
    setUserProfile(updated);
  };

  const clearError = () => {
    setError(null);
    setAuthProviderError(null);
  };

  const isAdmin = isVerifiedAdmin;
  const isNgo = userProfile?.role === 'ngo';
  const isDonor = userProfile?.role === 'donor';
  const isVolunteer = userProfile?.role === 'volunteer';

  return (
    <AuthContext.Provider
      value={{
        currentUser,
        userProfile,
        loading,
        profileLoading,
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
        hasRole: Boolean(userProfile?.role),
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
