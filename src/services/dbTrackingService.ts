import {
  doc,
  setDoc,
  updateDoc,
  onSnapshot,
} from 'firebase/firestore';
import { db, handleFirestoreError, OperationType } from '../lib/firebase';
import { LiveTrackingSession } from '../types';

export async function updateVolunteerLocation(
  userId: string,
  latitude: number,
  longitude: number,
  address?: string
): Promise<void> {
  const path = `volunteerProfiles/${userId}`;
  try {
    const volRef = doc(db, 'volunteerProfiles', userId);
    await updateDoc(volRef, {
      latitude,
      longitude,
      ...(address ? { address } : {}),
      updatedAt: new Date().toISOString(),
    });
  } catch (error) {
    handleFirestoreError(error, OperationType.UPDATE, path);
  }
}

export async function startLiveTracking(session: LiveTrackingSession): Promise<void> {
  const path = `trackingSessions/${session.donationId}`;
  try {
    const ref = doc(db, 'trackingSessions', session.donationId);
    await setDoc(ref, session, { merge: true });
  } catch (error) {
    handleFirestoreError(error, OperationType.WRITE, path);
  }
}

export async function updateLiveTracking(session: LiveTrackingSession): Promise<void> {
  return startLiveTracking(session);
}

export async function updateLiveTrackingLocation(
  donationId: string,
  latitude: number,
  longitude: number,
  accuracyMeters?: number,
  speedKmh?: number,
  headingDegrees?: number,
  batteryPercent?: number
): Promise<void> {
  const path = `trackingSessions/${donationId}`;
  try {
    const ref = doc(db, 'trackingSessions', donationId);
    await updateDoc(ref, {
      currentLatitude: latitude,
      currentLongitude: longitude,
      accuracyMeters: accuracyMeters || 10,
      ...(speedKmh !== undefined ? { speedKmh } : {}),
      ...(headingDegrees !== undefined ? { headingDegrees } : {}),
      ...(batteryPercent !== undefined ? { batteryPercent } : {}),
      lastUpdatedAt: new Date().toISOString(),
    });
  } catch (error) {
    handleFirestoreError(error, OperationType.UPDATE, path);
  }
}

export async function stopLiveTracking(donationId: string): Promise<void> {
  const path = `trackingSessions/${donationId}`;
  try {
    const ref = doc(db, 'trackingSessions', donationId);
    await updateDoc(ref, {
      status: 'stopped',
      lastUpdatedAt: new Date().toISOString(),
    });
  } catch (error) {
    console.warn('Could not stop tracking session:', error);
  }
}

export function subscribeLiveTracking(
  donationId: string,
  callback: (session: LiveTrackingSession | null) => void
) {
  const path = `trackingSessions/${donationId}`;
  try {
    const ref = doc(db, 'trackingSessions', donationId);
    return onSnapshot(
      ref,
      (snap) => {
        if (snap.exists()) {
          callback(snap.data() as LiveTrackingSession);
        } else {
          callback(null);
        }
      },
      (error) => {
        handleFirestoreError(error, OperationType.GET, path);
      }
    );
  } catch (error) {
    handleFirestoreError(error, OperationType.GET, path);
  }
}
