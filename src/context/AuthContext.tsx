import React, { createContext, useContext, useEffect, useState } from 'react';
import {
  User as FirebaseUser,
  onAuthStateChanged,
  signInWithEmailAndPassword,
  createUserWithEmailAndPassword,
  signInWithPopup,
  GoogleAuthProvider,
  signOut,
  sendPasswordResetEmail,
  updateProfile,
} from 'firebase/auth';
import { auth } from '../lib/firebase';
import { UserProfile, UserRole } from '../types';
import { getUserProfile, createOrUpdateUserProfile } from '../services/dbService';

interface AuthContextType {
  currentUser: FirebaseUser | null;
  userProfile: UserProfile | null;
  loading: boolean;
  error: string | null;
  authProviderError: string | null;
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

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [currentUser, setCurrentUser] = useState<FirebaseUser | null>(null);
  const [userProfile, setUserProfile] = useState<UserProfile | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [authProviderError, setAuthProviderError] = useState<string | null>(null);

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
    try {
      await signInWithEmailAndPassword(auth, email, pass);
    } catch (err: any) {
      const msg = err.code === 'auth/operation-not-allowed'
        ? 'Email/Password sign-in is not yet enabled in your Firebase Console. Please enable it under Authentication > Sign-in method.'
        : err.message || 'Failed to sign in';
      setError(msg);
      if (err.code === 'auth/operation-not-allowed') {
        setAuthProviderError('EMAIL_PASSWORD_DISABLED');
      }
      throw err;
    }
  };

  const signUpWithEmail = async (email: string, pass: string, displayName: string, role: UserRole) => {
    setError(null);
    setAuthProviderError(null);
    try {
      const cred = await createUserWithEmailAndPassword(auth, email, pass);
      await updateProfile(cred.user, { displayName });
      
      const isBootstrapAdmin = email.toLowerCase() === ADMIN_BOOTSTRAP_EMAIL.toLowerCase();
      const initialRole = isBootstrapAdmin ? 'admin' : role;

      const profile = await createOrUpdateUserProfile({
        uid: cred.user.uid,
        email: email,
        displayName: displayName,
        role: initialRole,
      });
      setUserProfile(profile);
    } catch (err: any) {
      const msg = err.code === 'auth/operation-not-allowed'
        ? 'Email/Password sign-in is not yet enabled in your Firebase Console. Please enable it under Authentication > Sign-in method.'
        : err.message || 'Failed to register account';
      setError(msg);
      if (err.code === 'auth/operation-not-allowed') {
        setAuthProviderError('EMAIL_PASSWORD_DISABLED');
      }
      throw err;
    }
  };

  const signInWithGoogle = async () => {
    setError(null);
    setAuthProviderError(null);
    try {
      const provider = new GoogleAuthProvider();
      const cred = await signInWithPopup(auth, provider);
      await refreshProfile();
    } catch (err: any) {
      const msg = err.code === 'auth/operation-not-allowed'
        ? 'Google Sign-in is not yet enabled in Firebase Console. Please enable Google under Authentication > Sign-in method.'
        : err.message || 'Google sign-in error';
      setError(msg);
      if (err.code === 'auth/operation-not-allowed') {
        setAuthProviderError('GOOGLE_AUTH_DISABLED');
      }
      throw err;
    }
  };

  const logout = async () => {
    try {
      await signOut(auth);
      setUserProfile(null);
      setCurrentUser(null);
    } catch (err: any) {
      setError(err.message);
    }
  };

  const resetPassword = async (email: string) => {
    setError(null);
    try {
      await sendPasswordResetEmail(auth, email);
    } catch (err: any) {
      setError(err.message || 'Failed to send password reset email');
      throw err;
    }
  };

  const updateRole = async (newRole: UserRole) => {
    if (!currentUser || !userProfile) return;
    // Don't downgrade bootstrap admin
    if (currentUser.email?.toLowerCase() === ADMIN_BOOTSTRAP_EMAIL.toLowerCase() && newRole !== 'admin') {
      alert('Bootstrap administrator role cannot be altered.');
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
