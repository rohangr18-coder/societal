import React, { useState, useEffect, useRef } from 'react';
import {
  X,
  Navigation,
  MapPin,
  Compass,
  Radio,
  ShieldCheck,
  AlertCircle,
  ExternalLink,
  Loader2,
  Clock,
  CheckCircle2,
  Phone,
  Building2,
} from 'lucide-react';
import { Donation, LiveTrackingSession } from '../types';
import { useAuth } from '../context/AuthContext';
import {
  updateLiveTracking,
  stopLiveTracking,
  subscribeLiveTracking,
} from '../services/dbService';
import { useLanguage } from '../context/LanguageContext';

interface LiveTrackingModalProps {
  donation: Donation;
  isOpen: boolean;
  onClose: () => void;
}

export const LiveTrackingModal: React.FC<LiveTrackingModalProps> = ({
  donation,
  isOpen,
  onClose,
}) => {
  const { currentUser, userProfile } = useAuth();
  const { t } = useLanguage();

  const [activeSession, setActiveSession] = useState<LiveTrackingSession | null>(null);
  const [isBroadcasting, setIsBroadcasting] = useState(false);
  const [consentGranted, setConsentGranted] = useState(false);
  const [currentCoords, setCurrentCoords] = useState<{
    lat: number;
    lng: number;
    accuracy: number;
  } | null>(null);
  const [gpsError, setGpsError] = useState<string | null>(null);
  const [lastUpdateText, setLastUpdateText] = useState<string>('Just now');

  const watchIdRef = useRef<number | null>(null);

  const isAssignedVolunteer =
    currentUser?.uid &&
    (currentUser.uid === donation.assignedVolunteerId ||
      userProfile?.role === 'volunteer' ||
      userProfile?.role === 'admin');

  // Subscribe to live tracking updates from Firestore
  useEffect(() => {
    if (!isOpen || !donation) return;

    const unsubscribe = subscribeLiveTracking(donation.id, (session) => {
      setActiveSession(session);
      if (session?.lastUpdatedAt) {
        const timeDiff = Math.round(
          (Date.now() - new Date(session.lastUpdatedAt).getTime()) / 1000
        );
        if (timeDiff < 10) setLastUpdateText('Just now (< 10s)');
        else setLastUpdateText(`${timeDiff}s ago`);
      }
    });

    return () => {
      unsubscribe && unsubscribe();
    };
  }, [isOpen, donation?.id]);

  // Clean up GPS watcher on modal close / unmount
  useEffect(() => {
    return () => {
      stopBroadcasting();
    };
  }, []);

  const startBroadcasting = () => {
    if (!navigator.geolocation) {
      setGpsError('Geolocation is not supported by your browser.');
      return;
    }

    setConsentGranted(true);
    setIsBroadcasting(true);
    setGpsError(null);

    const volunteerName =
      userProfile?.displayName ||
      currentUser?.email?.split('@')[0] ||
      'Authorized Volunteer Courier';

    const id = navigator.geolocation.watchPosition(
      (pos) => {
        const { latitude, longitude, accuracy, heading, speed } = pos.coords;
        setCurrentCoords({ lat: latitude, lng: longitude, accuracy });

        const session: LiveTrackingSession = {
          donationId: donation.id,
          volunteerId: currentUser?.uid || 'anon_vol',
          volunteerName,
          latitude,
          longitude,
          accuracy: Math.round(accuracy),
          status: 'in_transit',
          destinationLat: donation.latitude,
          destinationLng: donation.longitude,
          destinationAddress: donation.pickupAddress,
          heading: heading ?? null,
          speed: speed ?? null,
          lastUpdatedAt: new Date().toISOString(),
        };

        updateLiveTracking(session).catch((err) => {
          console.warn('Error syncing live tracking:', err);
        });
      },
      (err) => {
        let msg = 'Error obtaining GPS location.';
        if (err.code === err.PERMISSION_DENIED) {
          msg = 'Location permission denied. Please allow GPS access in your browser settings.';
        } else if (err.code === err.POSITION_UNAVAILABLE) {
          msg = 'GPS signal is currently unavailable.';
        } else if (err.code === err.TIMEOUT) {
          msg = 'GPS location request timed out.';
        }
        setGpsError(msg);
        setIsBroadcasting(false);
      },
      {
        enableHighAccuracy: true,
        timeout: 10000,
        maximumAge: 2000,
      }
    );

    watchIdRef.current = id;
  };

  const stopBroadcasting = () => {
    if (watchIdRef.current !== null) {
      navigator.geolocation.clearWatch(watchIdRef.current);
      watchIdRef.current = null;
    }
    setIsBroadcasting(false);
    if (donation?.id) {
      stopLiveTracking(donation.id);
    }
  };

  if (!isOpen) return null;

  const displayLat = activeSession?.latitude || currentCoords?.lat;
  const displayLng = activeSession?.longitude || currentCoords?.lng;
  const displayAccuracy = activeSession?.accuracy || currentCoords?.accuracy;

  const googleMapsDirectionsUrl = `https://www.google.com/maps/dir/?api=1&destination=${donation.latitude},${donation.longitude}`;

  return (
    <div className="fixed inset-0 z-50 overflow-y-auto bg-stone-900/60 backdrop-blur-xs flex items-center justify-center p-4">
      <div className="bg-white rounded-3xl max-w-lg w-full shadow-2xl border border-stone-200 overflow-hidden">
        {/* Header */}
        <div className="bg-gradient-to-r from-emerald-800 to-teal-900 p-5 text-white flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <div className="w-9 h-9 rounded-xl bg-white/10 flex items-center justify-center text-emerald-300">
              <Navigation className="w-5 h-5 animate-pulse" />
            </div>
            <div>
              <h3 className="font-bold text-base leading-tight">
                {t('tracking.title')}
              </h3>
              <p className="text-xs text-emerald-200">
                {donation.foodName} • {donation.donorName}
              </p>
            </div>
          </div>
          <button
            onClick={() => {
              stopBroadcasting();
              onClose();
            }}
            className="p-1.5 rounded-xl hover:bg-white/10 text-emerald-200 hover:text-white transition-colors cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Content */}
        <div className="p-6 space-y-4">
          {/* Volunteer Broadcast Consent Card (if volunteer) */}
          {isAssignedVolunteer && !consentGranted && !isBroadcasting && (
            <div className="p-4 bg-emerald-50 border border-emerald-200 rounded-2xl">
              <div className="flex items-start gap-2.5 mb-3">
                <ShieldCheck className="w-5 h-5 text-emerald-700 shrink-0 mt-0.5" />
                <div>
                  <h4 className="text-xs font-bold text-emerald-950">
                    {t('tracking.consentTitle')}
                  </h4>
                  <p className="text-xs text-emerald-800 mt-1 leading-relaxed">
                    {t('tracking.consentText')}
                  </p>
                </div>
              </div>
              <button
                onClick={startBroadcasting}
                className="w-full py-2.5 bg-emerald-700 hover:bg-emerald-800 text-white font-bold text-xs rounded-xl shadow-xs transition-colors flex items-center justify-center gap-1.5 cursor-pointer"
              >
                <Radio className="w-4 h-4" />
                {t('tracking.consentAgree')}
              </button>
            </div>
          )}

          {/* Active Broadcast Control */}
          {isBroadcasting && (
            <div className="p-4 bg-teal-50 border border-teal-200 rounded-2xl flex items-center justify-between gap-3">
              <div className="flex items-center gap-2.5">
                <span className="relative flex h-3 w-3">
                  <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-teal-400 opacity-75"></span>
                  <span className="relative inline-flex rounded-full h-3 w-3 bg-teal-600"></span>
                </span>
                <div>
                  <p className="text-xs font-bold text-teal-950">Live GPS Broadcasting Active</p>
                  <p className="text-[11px] text-teal-700">Updating Firestore location stream</p>
                </div>
              </div>
              <button
                onClick={stopBroadcasting}
                className="px-3 py-1.5 bg-red-600 hover:bg-red-700 text-white text-xs font-bold rounded-xl transition-colors cursor-pointer"
              >
                {t('action.stopTracking')}
              </button>
            </div>
          )}

          {/* GPS Error Message */}
          {gpsError && (
            <div className="p-3 bg-red-50 border border-red-200 rounded-xl flex items-start gap-2 text-xs text-red-900">
              <AlertCircle className="w-4 h-4 text-red-600 shrink-0 mt-0.5" />
              <span>{gpsError}</span>
            </div>
          )}

          {/* Live Coordinates Display Card */}
          <div className="bg-stone-50 border border-stone-200 rounded-2xl p-4">
            <div className="flex items-center justify-between mb-3 border-b border-stone-200 pb-2">
              <span className="text-xs font-bold text-stone-700 flex items-center gap-1.5">
                <Compass className="w-4 h-4 text-emerald-600" />
                Real-Time Geolocation Telemetry
              </span>
              <span className="text-[10px] bg-stone-200 px-2 py-0.5 rounded-full font-mono text-stone-600">
                {lastUpdateText}
              </span>
            </div>

            {displayLat && displayLng ? (
              <div className="grid grid-cols-2 gap-3 text-xs">
                <div className="bg-white p-2.5 rounded-xl border border-stone-200">
                  <span className="text-stone-500 text-[10px] block font-semibold">LATITUDE</span>
                  <span className="font-mono font-bold text-stone-900">{displayLat.toFixed(6)}°</span>
                </div>
                <div className="bg-white p-2.5 rounded-xl border border-stone-200">
                  <span className="text-stone-500 text-[10px] block font-semibold">LONGITUDE</span>
                  <span className="font-mono font-bold text-stone-900">{displayLng.toFixed(6)}°</span>
                </div>
                <div className="bg-white p-2.5 rounded-xl border border-stone-200 col-span-2 flex items-center justify-between">
                  <span className="text-stone-500 text-[11px] font-medium">{t('tracking.accuracy')}:</span>
                  <span className="font-mono font-bold text-emerald-700">
                    ± {displayAccuracy ? `${displayAccuracy} m` : 'High precision'}
                  </span>
                </div>
              </div>
            ) : (
              <div className="py-6 text-center text-xs text-stone-500">
                <Radio className="w-8 h-8 text-stone-300 mx-auto mb-2" />
                No active GPS broadcast session in progress.
                {isAssignedVolunteer && ' Click "Agree & Start Broadcasting" above to stream your location.'}
              </div>
            )}
          </div>

          {/* Destination Details */}
          <div className="bg-stone-50 border border-stone-200 rounded-2xl p-4 text-xs space-y-2">
            <div className="flex items-start gap-2">
              <MapPin className="w-4 h-4 text-emerald-700 shrink-0 mt-0.5" />
              <div>
                <span className="font-bold text-stone-900 block">Pickup Location</span>
                <span className="text-stone-600">{donation.pickupAddress}</span>
              </div>
            </div>
            {donation.assignedNgoName && (
              <div className="flex items-start gap-2 pt-2 border-t border-stone-200">
                <Building2 className="w-4 h-4 text-teal-700 shrink-0 mt-0.5" />
                <div>
                  <span className="font-bold text-stone-900 block">Recipient Organization</span>
                  <span className="text-stone-600">{donation.assignedNgoName}</span>
                </div>
              </div>
            )}
          </div>

          {/* External Google Maps Navigation Button */}
          <a
            href={googleMapsDirectionsUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="w-full py-3 bg-stone-900 hover:bg-black text-white font-bold text-xs rounded-xl shadow-xs transition-colors flex items-center justify-center gap-2 cursor-pointer"
          >
            <Navigation className="w-4 h-4 text-emerald-400" />
            {t('action.getDirections')}
            <ExternalLink className="w-3.5 h-3.5 opacity-70" />
          </a>
        </div>

        {/* Footer */}
        <div className="bg-stone-50 px-6 py-3 border-t border-stone-200 flex justify-end">
          <button
            onClick={() => {
              stopBroadcasting();
              onClose();
            }}
            className="px-4 py-1.5 bg-stone-200 hover:bg-stone-300 text-stone-800 text-xs font-semibold rounded-xl transition-colors cursor-pointer"
          >
            {t('action.close')}
          </button>
        </div>
      </div>
    </div>
  );
};
