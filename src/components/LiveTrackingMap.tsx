import React, { useEffect, useRef, useState } from 'react';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import {
  Navigation,
  MapPin,
  Compass,
  Radio,
  ShieldCheck,
  AlertCircle,
  ExternalLink,
  Loader2,
  Clock,
  Phone,
  Building2,
  CheckCircle2,
} from 'lucide-react';
import { Donation, LiveTrackingSession } from '../types';
import { useAuth } from '../context/AuthContext';
import {
  updateLiveTracking,
  stopLiveTracking,
  subscribeLiveTracking,
} from '../services/dbService';
import { calculateDistanceKm } from '../utils/geo';

interface LiveTrackingMapProps {
  donation: Donation;
  height?: string;
  allowBroadcast?: boolean;
}

export const LiveTrackingMap: React.FC<LiveTrackingMapProps> = ({
  donation,
  height = '420px',
  allowBroadcast = true,
}) => {
  const { currentUser, userProfile } = useAuth();

  const mapContainerRef = useRef<HTMLDivElement>(null);
  const mapInstanceRef = useRef<L.Map | null>(null);
  const donorMarkerRef = useRef<L.Marker | null>(null);
  const ngoMarkerRef = useRef<L.Marker | null>(null);
  const volunteerMarkerRef = useRef<L.Marker | null>(null);
  const routeLineRef = useRef<L.Polyline | null>(null);
  const watchIdRef = useRef<number | null>(null);

  const [activeSession, setActiveSession] = useState<LiveTrackingSession | null>(null);
  const [isBroadcasting, setIsBroadcasting] = useState(false);
  const [gpsError, setGpsError] = useState<string | null>(null);
  const [lastUpdateText, setLastUpdateText] = useState<string>('Waiting for signal');
  const [consentModalOpen, setConsentModalOpen] = useState(false);

  const isAssignedVolunteer =
    currentUser?.uid &&
    (currentUser.uid === donation.assignedVolunteerId ||
      userProfile?.role === 'volunteer' ||
      userProfile?.role === 'admin');

  // Coordinates
  const donorLat = donation.latitude || 28.6139;
  const donorLng = donation.longitude || 77.209;
  const ngoLat = donation.dropoffLatitude || 28.5729;
  const ngoLng = donation.dropoffLongitude || 77.2215;

  const currentCourierLat = activeSession?.latitude || null;
  const currentCourierLng = activeSession?.longitude || null;

  // Subscribe to live tracking sessions in Firestore
  useEffect(() => {
    if (!donation?.id) return;

    const unsubscribe = subscribeLiveTracking(donation.id, (session) => {
      setActiveSession(session);
      if (session?.lastUpdatedAt) {
        const diffSecs = Math.max(
          0,
          Math.round((Date.now() - new Date(session.lastUpdatedAt).getTime()) / 1000)
        );
        if (diffSecs < 10) setLastUpdateText('Live (< 10s ago)');
        else if (diffSecs < 60) setLastUpdateText(`${diffSecs}s ago`);
        else setLastUpdateText(`${Math.round(diffSecs / 60)}m ago`);
      }
    });

    return () => {
      unsubscribe && unsubscribe();
    };
  }, [donation?.id]);

  // Clean up watcher on unmount
  useEffect(() => {
    return () => {
      if (watchIdRef.current !== null) {
        navigator.geolocation.clearWatch(watchIdRef.current);
        watchIdRef.current = null;
      }
    };
  }, []);

  // Initialize Leaflet map
  useEffect(() => {
    if (!mapContainerRef.current) return;

    if (!mapInstanceRef.current) {
      const map = L.map(mapContainerRef.current, {
        center: [donorLat, donorLng],
        zoom: 13,
        zoomControl: true,
      });

      L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
        attribution: '&copy; OpenStreetMap contributors',
        maxZoom: 19,
      }).addTo(map);

      // Custom Pickup marker icon
      const donorIcon = L.divIcon({
        className: 'custom-donor-pin',
        html: `
          <div style="background-color: #16a34a; width: 34px; height: 34px; border-radius: 50%; border: 3px solid white; display: flex; align-items: center; justify-content: center; box-shadow: 0 4px 10px rgba(0,0,0,0.3); color: white; font-weight: bold; font-size: 16px;">
            🍲
          </div>
        `,
        iconSize: [34, 34],
        iconAnchor: [17, 17],
      });

      donorMarkerRef.current = L.marker([donorLat, donorLng], { icon: donorIcon })
        .addTo(map)
        .bindPopup(
          `<b>Pickup Location</b><br/>${donation.foodName}<br/><span style="font-size: 11px; color: #555;">${donation.pickupAddress}</span>`
        );

      // NGO / Dropoff marker
      const ngoIcon = L.divIcon({
        className: 'custom-ngo-pin',
        html: `
          <div style="background-color: #2563eb; width: 34px; height: 34px; border-radius: 50%; border: 3px solid white; display: flex; align-items: center; justify-content: center; box-shadow: 0 4px 10px rgba(0,0,0,0.3); color: white; font-weight: bold; font-size: 16px;">
            🏢
          </div>
        `,
        iconSize: [34, 34],
        iconAnchor: [17, 17],
      });

      ngoMarkerRef.current = L.marker([ngoLat, ngoLng], { icon: ngoIcon })
        .addTo(map)
        .bindPopup(
          `<b>Dropoff Shelter / Recipient</b><br/>${donation.assignedNgoName || 'Community Feeding Partner'}`
        );

      mapInstanceRef.current = map;
    }

    return () => {
      if (mapInstanceRef.current) {
        mapInstanceRef.current.remove();
        mapInstanceRef.current = null;
      }
    };
  }, []);

  // Update volunteer courier position and route polyline dynamically
  useEffect(() => {
    const map = mapInstanceRef.current;
    if (!map) return;

    if (currentCourierLat && currentCourierLng) {
      const courierLatLng: [number, number] = [currentCourierLat, currentCourierLng];

      const courierIcon = L.divIcon({
        className: 'custom-courier-pin',
        html: `
          <div style="position: relative; width: 40px; height: 40px; display: flex; align-items: center; justify-content: center;">
            <div style="position: absolute; width: 100%; height: 100%; border-radius: 50%; background-color: rgba(16, 185, 129, 0.4); animation: ping 1.5s cubic-bezier(0, 0, 0.2, 1) infinite;"></div>
            <div style="position: relative; background-color: #059669; width: 32px; height: 32px; border-radius: 50%; border: 3px solid #ffffff; display: flex; align-items: center; justify-content: center; box-shadow: 0 4px 12px rgba(5,150,105,0.45); color: white; font-size: 16px;">
              🛵
            </div>
          </div>
        `,
        iconSize: [40, 40],
        iconAnchor: [20, 20],
      });

      if (!volunteerMarkerRef.current) {
        volunteerMarkerRef.current = L.marker(courierLatLng, { icon: courierIcon })
          .addTo(map)
          .bindPopup(
            `<b>Courier Live Location</b><br/>${activeSession?.volunteerName || 'Volunteer Courier'}<br/><span style="font-size: 11px; color: #059669;">Moving towards ${donation.status === 'picked_up' || donation.status === 'in_transit' ? 'Dropoff Shelter' : 'Pickup Point'}</span>`
          );
      } else {
        volunteerMarkerRef.current.setLatLng(courierLatLng);
      }

      // Draw polyline: Courier -> Target
      const targetLatLng: [number, number] =
        donation.status === 'picked_up' || donation.status === 'in_transit'
          ? [ngoLat, ngoLng]
          : [donorLat, donorLng];

      const waypoints: [number, number][] = [courierLatLng, targetLatLng];

      if (!routeLineRef.current) {
        routeLineRef.current = L.polyline(waypoints, {
          color: '#10b981',
          weight: 4,
          dashArray: '8, 8',
          opacity: 0.8,
        }).addTo(map);
      } else {
        routeLineRef.current.setLatLngs(waypoints);
      }

      // Fit bounds to show courier and target
      try {
        const bounds = L.latLngBounds([courierLatLng, targetLatLng, [donorLat, donorLng]]);
        map.fitBounds(bounds, { padding: [50, 50], maxZoom: 15 });
      } catch (err) {
        // bounds catch
      }
    }
  }, [currentCourierLat, currentCourierLng, donation.status]);

  // Geolocation Broadcasting Handler
  const handleStartBroadcast = () => {
    if (!navigator.geolocation) {
      setGpsError('Geolocation is not supported by your browser.');
      return;
    }

    setConsentModalOpen(false);
    setIsBroadcasting(true);
    setGpsError(null);

    const volunteerName =
      userProfile?.displayName || currentUser?.email?.split('@')[0] || 'Volunteer Courier';

    const id = navigator.geolocation.watchPosition(
      (pos) => {
        const { latitude, longitude, accuracy, heading, speed } = pos.coords;

        const session: LiveTrackingSession = {
          donationId: donation.id,
          volunteerId: currentUser?.uid || 'anon_vol',
          volunteerName,
          latitude,
          longitude,
          accuracy: Math.round(accuracy),
          status: 'in_transit',
          destinationLat: donation.status === 'picked_up' ? ngoLat : donorLat,
          destinationLng: donation.status === 'picked_up' ? ngoLng : donorLng,
          destinationAddress:
            donation.status === 'picked_up'
              ? donation.dropoffAddress || 'Shelter Destination'
              : donation.pickupAddress,
          heading: heading ?? null,
          speed: speed ?? null,
          lastUpdatedAt: new Date().toISOString(),
        };

        updateLiveTracking(session).catch((err) => {
          console.warn('Live tracking update failed:', err);
        });
      },
      (err) => {
        let msg = 'Error obtaining GPS location.';
        if (err.code === err.PERMISSION_DENIED) {
          msg = 'Location permission was denied. Please allow location permissions in your browser bar.';
        } else if (err.code === err.POSITION_UNAVAILABLE) {
          msg = 'GPS location is currently unavailable.';
        } else if (err.code === err.TIMEOUT) {
          msg = 'GPS request timed out.';
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

  const handleStopBroadcast = () => {
    if (watchIdRef.current !== null) {
      navigator.geolocation.clearWatch(watchIdRef.current);
      watchIdRef.current = null;
    }
    setIsBroadcasting(false);
    stopLiveTracking(donation.id).catch(console.warn);
  };

  // Calculate distance & ETA
  const targetLat =
    donation.status === 'picked_up' || donation.status === 'in_transit' ? ngoLat : donorLat;
  const targetLng =
    donation.status === 'picked_up' || donation.status === 'in_transit' ? ngoLng : donorLng;

  const distanceKm =
    currentCourierLat && currentCourierLng
      ? calculateDistanceKm(currentCourierLat, currentCourierLng, targetLat, targetLng)
      : calculateDistanceKm(donorLat, donorLng, ngoLat, ngoLng);

  // Estimate ETA assuming average city speed of 22 km/h
  const etaMinutes = Math.max(3, Math.round((distanceKm / 22) * 60));

  return (
    <div className="relative rounded-2xl overflow-hidden border border-emerald-100 shadow-sm bg-white">
      {/* Top Tracking Telemetry Ribbon */}
      <div className="bg-gradient-to-r from-stone-900 via-stone-800 to-emerald-950 text-white p-3.5 flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <div className="relative flex items-center justify-center w-8 h-8 rounded-full bg-emerald-500/20 text-emerald-400">
            <Radio className="w-4 h-4 animate-pulse" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <span className="text-xs font-bold uppercase tracking-wider text-emerald-400">
                {activeSession?.status === 'in_transit' ? 'Courier Live on Radar' : 'Courier Route'}
              </span>
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-400"></span>
              <span className="text-[11px] text-stone-300 font-medium">{lastUpdateText}</span>
            </div>
            <div className="text-sm font-semibold truncate max-w-xs sm:max-w-md text-stone-100">
              {donation.status === 'picked_up' || donation.status === 'in_transit'
                ? `En Route to Shelter: ${donation.assignedNgoName || 'Destination'}`
                : `En Route to Donor: ${donation.pickupAddress}`}
            </div>
          </div>
        </div>

        <div className="flex items-center gap-4 text-xs font-semibold">
          <div className="bg-stone-800/80 px-3 py-1.5 rounded-xl border border-stone-700/60 flex items-center gap-1.5">
            <Compass className="w-3.5 h-3.5 text-emerald-400" />
            <span>{distanceKm.toFixed(1)} km</span>
          </div>
          <div className="bg-stone-800/80 px-3 py-1.5 rounded-xl border border-stone-700/60 flex items-center gap-1.5">
            <Clock className="w-3.5 h-3.5 text-amber-400" />
            <span>~{etaMinutes} mins ETA</span>
          </div>
        </div>
      </div>

      {/* GPS Error Alert */}
      {gpsError && (
        <div className="bg-amber-50 border-b border-amber-200 px-4 py-2.5 flex items-center gap-2 text-xs text-amber-900">
          <AlertCircle className="w-4 h-4 text-amber-600 shrink-0" />
          <span>{gpsError}</span>
        </div>
      )}

      {/* Leaflet Map Canvas */}
      <div ref={mapContainerRef} style={{ height, width: '100%' }} className="z-0" />

      {/* Bottom Floating Action Bar */}
      <div className="p-3 bg-stone-50 border-t border-stone-200 flex flex-wrap items-center justify-between gap-3 text-xs">
        <div className="flex items-center gap-4 text-stone-600">
          <div className="flex items-center gap-1.5 font-medium">
            <span className="w-2.5 h-2.5 rounded-full bg-emerald-600 inline-block"></span>
            <span>Pickup: Donor</span>
          </div>
          <div className="flex items-center gap-1.5 font-medium">
            <span className="w-2.5 h-2.5 rounded-full bg-blue-600 inline-block"></span>
            <span>Dropoff: Shelter</span>
          </div>
          {currentCourierLat && (
            <div className="flex items-center gap-1.5 font-medium text-emerald-700">
              <span className="w-2.5 h-2.5 rounded-full bg-emerald-500 animate-ping inline-block"></span>
              <span>Courier Live</span>
            </div>
          )}
        </div>

        <div className="flex items-center gap-2">
          {allowBroadcast && isAssignedVolunteer && (
            <>
              {!isBroadcasting ? (
                <button
                  onClick={() => setConsentModalOpen(true)}
                  className="bg-emerald-600 hover:bg-emerald-700 text-white font-bold px-3.5 py-1.5 rounded-xl transition-all shadow-xs flex items-center gap-1.5 cursor-pointer"
                >
                  <Navigation className="w-3.5 h-3.5" />
                  <span>Share My Live GPS</span>
                </button>
              ) : (
                <button
                  onClick={handleStopBroadcast}
                  className="bg-rose-600 hover:bg-rose-700 text-white font-bold px-3.5 py-1.5 rounded-xl transition-all shadow-xs flex items-center gap-1.5 cursor-pointer animate-pulse"
                >
                  <Radio className="w-3.5 h-3.5" />
                  <span>Stop Location Sharing</span>
                </button>
              )}
            </>
          )}

          <a
            href={`https://www.google.com/maps/dir/?api=1&destination=${targetLat},${targetLng}`}
            target="_blank"
            rel="noopener noreferrer"
            className="px-3 py-1.5 rounded-xl border border-stone-300 hover:bg-white text-stone-700 font-semibold flex items-center gap-1 transition-colors"
          >
            <span>Open in Maps</span>
            <ExternalLink className="w-3 h-3 text-stone-500" />
          </a>
        </div>
      </div>

      {/* Geolocation Consent Modal */}
      {consentModalOpen && (
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl max-w-md w-full p-6 shadow-2xl border border-emerald-100 animate-in fade-in zoom-in-95 duration-150">
            <div className="w-12 h-12 rounded-2xl bg-emerald-100 text-emerald-700 flex items-center justify-center mb-4">
              <ShieldCheck className="w-6 h-6" />
            </div>
            <h3 className="text-lg font-bold text-stone-900 mb-2">
              Share Live Location with Donor & Shelter?
            </h3>
            <p className="text-xs text-stone-600 leading-relaxed mb-4">
              ResQBite uses your browser GPS to broadcast your live position to the donor and
              recipient shelter during this active collection run. This allows them to prepare the food
              and receive the delivery smoothly.
            </p>
            <div className="bg-stone-50 p-3 rounded-xl border border-stone-200 text-[11px] text-stone-600 mb-5 space-y-1">
              <div className="flex items-center gap-2 text-emerald-700 font-bold">
                <CheckCircle2 className="w-3.5 h-3.5 shrink-0" />
                <span>Encrypted transit via Cloud Firestore</span>
              </div>
              <div className="flex items-center gap-2 text-stone-600">
                <CheckCircle2 className="w-3.5 h-3.5 text-stone-400 shrink-0" />
                <span>Broadcasting automatically terminates once marked delivered</span>
              </div>
              <div className="flex items-center gap-2 text-stone-600">
                <CheckCircle2 className="w-3.5 h-3.5 text-stone-400 shrink-0" />
                <span>You can tap "Stop Location Sharing" at any time</span>
              </div>
            </div>
            <div className="flex items-center justify-end gap-2.5">
              <button
                onClick={() => setConsentModalOpen(false)}
                className="px-4 py-2 rounded-xl border border-stone-300 text-stone-700 text-xs font-semibold hover:bg-stone-100 transition-colors cursor-pointer"
              >
                Cancel
              </button>
              <button
                onClick={handleStartBroadcast}
                className="px-4 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold transition-all shadow-xs flex items-center gap-1.5 cursor-pointer"
              >
                <Navigation className="w-3.5 h-3.5" />
                <span>Allow & Start Sharing</span>
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
