import React, { useState, useEffect, useCallback, useRef } from 'react';
import {
  APIProvider,
  Map,
  AdvancedMarker,
  Pin,
  InfoWindow,
  useMap,
} from '@vis.gl/react-google-maps';
import {
  Navigation,
  Crosshair,
  Radio,
  AlertTriangle,
  ExternalLink,
  MapPin,
  Clock,
  Sparkles,
  Info,
  CheckCircle2,
  Loader2,
  Compass,
} from 'lucide-react';
import { Donation } from '../types';
import { calculateDistanceKm } from '../utils/geo';
import { useDeviceLocation, DeviceLocation } from '../hooks/useDeviceLocation';

export const GOOGLE_MAPS_API_KEY =
  import.meta.env.VITE_GOOGLE_MAPS_API_KEY || 'AIzaSyCRzQ8n6teSl3S8wTYYuFz-yy5ehJW6f3k';

interface GoogleRescueMapProps {
  donations?: Donation[];
  center?: { lat: number; lng: number };
  zoom?: number;
  height?: string;
  selectedDonationId?: string;
  onSelectDonation?: (donation: Donation) => void;
  onPickLocation?: (lat: number, lng: number) => void;
  draggablePin?: boolean;
  pickedPosition?: { lat: number; lng: number } | null;
  routeEndpoints?: {
    origin: { lat: number; lng: number };
    destination: { lat: number; lng: number };
    originLabel?: string;
    destLabel?: string;
  };
  showControls?: boolean;
  onLocationUpdate?: (location: DeviceLocation) => void;
}

// Inner helper component to pan/recenter map smoothly
function MapController({
  targetCenter,
  targetZoom,
}: {
  targetCenter?: { lat: number; lng: number };
  targetZoom?: number;
}) {
  const map = useMap();

  useEffect(() => {
    if (!map || !targetCenter) return;
    map.panTo(targetCenter);
    if (targetZoom) {
      map.setZoom(targetZoom);
    }
  }, [map, targetCenter?.lat, targetCenter?.lng, targetZoom]);

  return null;
}

// Polyline Route renderer inside Map
function PolylineRenderer({
  origin,
  destination,
}: {
  origin: { lat: number; lng: number };
  destination: { lat: number; lng: number };
}) {
  const map = useMap();
  const polylineRef = useRef<google.maps.Polyline | null>(null);

  useEffect(() => {
    if (!map || typeof google === 'undefined' || !google.maps) return;

    if (!polylineRef.current) {
      polylineRef.current = new google.maps.Polyline({
        path: [origin, destination],
        geodesic: true,
        strokeColor: '#059669',
        strokeOpacity: 0.85,
        strokeWeight: 5,
        map,
      });
    } else {
      polylineRef.current.setPath([origin, destination]);
      polylineRef.current.setMap(map);
    }

    const bounds = new google.maps.LatLngBounds();
    bounds.extend(origin);
    bounds.extend(destination);
    map.fitBounds(bounds, 50);

    return () => {
      if (polylineRef.current) {
        polylineRef.current.setMap(null);
      }
    };
  }, [map, origin.lat, origin.lng, destination.lat, destination.lng]);

  return null;
}

export const GoogleRescueMap: React.FC<GoogleRescueMapProps> = ({
  donations = [],
  center,
  zoom = 13,
  height = '460px',
  selectedDonationId,
  onSelectDonation,
  onPickLocation,
  draggablePin = false,
  pickedPosition,
  routeEndpoints,
  showControls = true,
  onLocationUpdate,
}) => {
  const defaultCenter = center || { lat: 28.6139, lng: 77.2090 };
  const [activeCenter, setActiveCenter] = useState<{ lat: number; lng: number }>(defaultCenter);
  const [activeZoom, setActiveZoom] = useState(zoom);

  // Active InfoWindow state
  const [hoveredDonation, setHoveredDonation] = useState<Donation | null>(null);
  const [selectedDonation, setSelectedDonation] = useState<Donation | null>(null);

  // Device GPS Hook
  const {
    location: userGps,
    isLoading: gpsLoading,
    isTracking,
    followUser,
    setFollowUser,
    error: gpsError,
    clearError: clearGpsError,
    getCurrentLocation,
    startTracking,
    stopTracking,
  } = useDeviceLocation();

  // Sync selected donation if prop changes
  useEffect(() => {
    if (selectedDonationId) {
      const match = donations.find((d) => d.id === selectedDonationId);
      if (match && match.latitude && match.longitude) {
        setSelectedDonation(match);
        setActiveCenter({ lat: match.latitude, lng: match.longitude });
        setActiveZoom(15);
      }
    }
  }, [selectedDonationId, donations]);

  // Handle GPS location updates
  useEffect(() => {
    if (userGps) {
      if (onLocationUpdate) {
        onLocationUpdate(userGps);
      }
      if (followUser) {
        setActiveCenter({ lat: userGps.lat, lng: userGps.lng });
      }
    }
  }, [userGps, followUser, onLocationUpdate]);

  const handleUseCurrentLocation = async () => {
    try {
      const loc = await getCurrentLocation();
      setActiveCenter({ lat: loc.lat, lng: loc.lng });
      setActiveZoom(15);
      if (onPickLocation) {
        onPickLocation(loc.lat, loc.lng);
      }
    } catch {
      // Handled in gpsError
    }
  };

  const handleMapClick = (e: any) => {
    if (!onPickLocation) return;
    const latLng = e.detail?.latLng;
    if (latLng) {
      onPickLocation(latLng.lat, latLng.lng);
    }
  };

  const openGoogleMapsDirections = (destLat: number, destLng: number) => {
    const originParam = userGps ? `${userGps.lat},${userGps.lng}` : '';
    const url = originParam
      ? `https://www.google.com/maps/dir/?api=1&origin=${originParam}&destination=${destLat},${destLng}&travelmode=driving`
      : `https://www.google.com/maps/search/?api=1&query=${destLat},${destLng}`;
    window.open(url, '_blank', 'noopener,noreferrer');
  };

  if (!GOOGLE_MAPS_API_KEY) {
    return (
      <div
        style={{ height }}
        className="w-full rounded-3xl border border-amber-200 bg-amber-50/70 p-6 flex flex-col items-center justify-center text-center space-y-3"
      >
        <AlertTriangle className="w-10 h-10 text-amber-600" />
        <h3 className="font-bold text-amber-950 text-base">Google Maps Platform Key Required</h3>
        <p className="text-xs text-amber-800 max-w-md leading-relaxed">
          Please add your Google Maps API key via <code>VITE_GOOGLE_MAPS_API_KEY</code> in environment settings or click Enable in Google Maps Setup to use interactive maps and directions.
        </p>
      </div>
    );
  }

  return (
    <div className="relative w-full rounded-3xl overflow-hidden border border-emerald-100 shadow-sm bg-stone-100">
      {/* Top GPS Status & Controls Bar */}
      {showControls && (
        <div className="absolute top-3 left-3 right-3 z-10 flex flex-wrap items-center justify-between gap-2 pointer-events-none">
          {/* GPS Quick Action Chips */}
          <div className="flex items-center gap-2 pointer-events-auto">
            <button
              type="button"
              onClick={handleUseCurrentLocation}
              disabled={gpsLoading}
              className="bg-white/95 hover:bg-white text-emerald-800 text-xs font-bold px-3 py-1.5 rounded-xl border border-emerald-200 shadow-sm flex items-center gap-1.5 backdrop-blur-xs transition-colors cursor-pointer disabled:opacity-50"
            >
              {gpsLoading ? (
                <Loader2 className="w-3.5 h-3.5 animate-spin text-emerald-600" />
              ) : (
                <Navigation className="w-3.5 h-3.5 text-emerald-600" />
              )}
              {userGps ? 'Recenter GPS' : 'Use My Current Location'}
            </button>

            {isTracking ? (
              <button
                type="button"
                onClick={stopTracking}
                className="bg-red-500 hover:bg-red-600 text-white text-xs font-bold px-3 py-1.5 rounded-xl shadow-sm flex items-center gap-1.5 backdrop-blur-xs transition-colors cursor-pointer"
              >
                <Radio className="w-3.5 h-3.5 animate-pulse" />
                Stop Live Tracking
              </button>
            ) : (
              <button
                type="button"
                onClick={startTracking}
                className="bg-white/95 hover:bg-white text-stone-700 hover:text-emerald-800 text-xs font-semibold px-3 py-1.5 rounded-xl border border-stone-200 shadow-sm flex items-center gap-1.5 backdrop-blur-xs transition-colors cursor-pointer"
              >
                <Crosshair className="w-3.5 h-3.5 text-stone-500" />
                Start Live Tracking
              </button>
            )}

            {userGps && (
              <button
                type="button"
                onClick={() => setFollowUser(!followUser)}
                className={`text-[11px] font-bold px-2.5 py-1.5 rounded-xl border transition-colors cursor-pointer ${
                  followUser
                    ? 'bg-emerald-600 text-white border-emerald-700 shadow-2xs'
                    : 'bg-white/90 text-stone-600 border-stone-200'
                }`}
              >
                Follow: {followUser ? 'ON' : 'OFF'}
              </button>
            )}
          </div>

          {/* GPS Accuracy Badge */}
          {userGps && (
            <div className="bg-emerald-950/80 backdrop-blur-xs text-white text-[11px] px-3 py-1 rounded-xl shadow-sm border border-emerald-700/60 pointer-events-auto flex items-center gap-2">
              <span className="w-2 h-2 rounded-full bg-emerald-400 animate-ping" />
              <span>
                GPS: {userGps.lat.toFixed(4)}, {userGps.lng.toFixed(4)}
              </span>
              <span className="text-emerald-300 font-semibold">(±{userGps.accuracy}m accuracy)</span>
            </div>
          )}
        </div>
      )}

      {/* GPS Error Alert */}
      {gpsError && (
        <div className="absolute top-14 left-3 right-3 z-10 p-3 bg-amber-50/95 backdrop-blur-xs border border-amber-300 rounded-2xl text-xs text-amber-900 shadow-md flex items-start justify-between gap-2">
          <div className="flex items-start gap-2">
            <AlertTriangle className="w-4 h-4 text-amber-600 shrink-0 mt-0.5" />
            <div>
              <p className="font-bold">GPS Location Notice:</p>
              <p className="text-[11px] mt-0.5 leading-relaxed">{gpsError.message}</p>
              <p className="text-[10px] text-amber-700 mt-1">
                Note: Browser location uses GPS, Wi-Fi, and network triangulation. You can also click anywhere on the map or type an address manually.
              </p>
            </div>
          </div>
          <button
            onClick={clearGpsError}
            className="text-stone-400 hover:text-stone-700 font-bold px-2 py-0.5 text-xs"
          >
            ✕
          </button>
        </div>
      )}

      {/* Primary Google Map Container */}
      <APIProvider apiKey={GOOGLE_MAPS_API_KEY} libraries={['marker', 'places', 'geometry']}>
        <div style={{ height, width: '100%' }}>
          <Map
            mapId="DEMO_MAP_ID"
            defaultCenter={defaultCenter}
            defaultZoom={activeZoom}
            gestureHandling="greedy"
            disableDefaultUI={false}
            onClick={handleMapClick}
            internalUsageAttributionIds={['gmp_git_agentskills_v1']}
            style={{ width: '100%', height: '100%' }}
          >
            <MapController targetCenter={activeCenter} targetZoom={activeZoom} />

            {/* Polyline Route if endpoints are passed */}
            {routeEndpoints && (
              <PolylineRenderer
                origin={routeEndpoints.origin}
                destination={routeEndpoints.destination}
              />
            )}

            {/* USER CURRENT GPS LOCATION MARKER */}
            {userGps && (
              <AdvancedMarker
                position={{ lat: userGps.lat, lng: userGps.lng }}
                title="Your Current Location"
                zIndex={999}
              >
                <div className="relative flex items-center justify-center">
                  {/* Outer Pulsing Accuracy Halo */}
                  <div className="w-10 h-10 rounded-full bg-blue-500/20 animate-ping absolute" />
                  <div className="w-8 h-8 rounded-full bg-blue-600/30 border-2 border-white flex items-center justify-center shadow-lg">
                    <div className="w-4 h-4 rounded-full bg-blue-600 border-2 border-white shadow-xs" />
                  </div>
                </div>
              </AdvancedMarker>
            )}

            {/* DRAGGABLE / PICKED LOCATION PIN (When creating or picking a point) */}
            {pickedPosition && (
              <AdvancedMarker
                position={pickedPosition}
                draggable={draggablePin}
                onDragEnd={(e) => {
                  if (onPickLocation && e.latLng) {
                    onPickLocation(e.latLng.lat(), e.latLng.lng());
                  }
                }}
                title="Selected Pickup Location (Drag to adjust)"
              >
                <Pin
                  background="#059669"
                  borderColor="#064e3b"
                  glyphColor="#ffffff"
                  scale={1.3}
                >
                  📍
                </Pin>
              </AdvancedMarker>
            )}

            {/* ROUTE ENDPOINT PINS */}
            {routeEndpoints && (
              <>
                <AdvancedMarker position={routeEndpoints.origin} title={routeEndpoints.originLabel || 'Pickup Point'}>
                  <Pin background="#059669" borderColor="#064e3b" glyphColor="#ffffff">
                    A
                  </Pin>
                </AdvancedMarker>
                <AdvancedMarker position={routeEndpoints.destination} title={routeEndpoints.destLabel || 'Drop-off Shelter'}>
                  <Pin background="#ea580c" borderColor="#9a3412" glyphColor="#ffffff">
                    B
                  </Pin>
                </AdvancedMarker>
              </>
            )}

            {/* FOOD DONATION MARKERS FROM REAL FIRESTORE RECORDS */}
            {donations.map((donation) => {
              if (!donation.latitude || !donation.longitude) return null;

              const isAvailable = donation.status === 'available';
              const isClaimed = donation.status === 'requested' || donation.status === 'accepted';
              const isInTransit = donation.status === 'scheduled' || donation.status === 'picked_up';
              const isDelivered = donation.status === 'delivered';

              const pinBg = isAvailable
                ? '#059669' // Green
                : isClaimed
                ? '#d97706' // Amber
                : isInTransit
                ? '#2563eb' // Blue
                : '#64748b'; // Gray

              const glyph = isAvailable ? '🍲' : isClaimed ? '⏳' : isInTransit ? '🚲' : '✓';

              return (
                <AdvancedMarker
                  key={donation.id}
                  position={{ lat: donation.latitude, lng: donation.longitude }}
                  title={`${donation.foodName} (${donation.status})`}
                  onClick={() => {
                    setSelectedDonation(donation);
                    if (onSelectDonation) {
                      onSelectDonation(donation);
                    }
                  }}
                >
                  <Pin
                    background={pinBg}
                    borderColor="#ffffff"
                    glyphColor="#ffffff"
                    scale={donation.id === selectedDonationId ? 1.4 : 1.1}
                  >
                    <span style={{ fontSize: '13px' }}>{glyph}</span>
                  </Pin>
                </AdvancedMarker>
              );
            })}

            {/* INFO WINDOW FOR SELECTED DONATION */}
            {selectedDonation && selectedDonation.latitude && selectedDonation.longitude && (
              <InfoWindow
                position={{ lat: selectedDonation.latitude, lng: selectedDonation.longitude }}
                onCloseClick={() => setSelectedDonation(null)}
              >
                <div className="p-1 max-w-[240px] text-stone-800 font-sans space-y-2">
                  <div className="flex items-center justify-between gap-1">
                    <span className="text-[10px] font-bold uppercase tracking-wider text-emerald-800 bg-emerald-50 px-2 py-0.5 rounded-full">
                      {selectedDonation.category}
                    </span>
                    <span className="text-[10px] font-bold text-orange-600 uppercase">
                      {selectedDonation.status.replace('_', ' ')}
                    </span>
                  </div>

                  <div>
                    <h4 className="font-bold text-stone-900 text-sm leading-snug">
                      {selectedDonation.foodName}
                    </h4>
                    <p className="text-[11px] text-stone-600 mt-0.5">
                      <strong>Volume:</strong> {selectedDonation.quantity} {selectedDonation.unit}
                    </p>
                    <p className="text-[11px] text-stone-500 flex items-center gap-1 mt-0.5">
                      <Clock className="w-3 h-3 text-stone-400" />
                      Deadline: {selectedDonation.pickupDeadline}
                    </p>
                  </div>

                  <div className="text-[11px] text-stone-500 bg-stone-50 p-1.5 rounded-lg">
                    📍 {selectedDonation.pickupAddress}
                  </div>

                  {/* Calculated Straight-line distance from user GPS */}
                  {userGps && (
                    <div className="text-[10px] text-stone-500 flex justify-between items-center font-medium">
                      <span>Approx. straight-line:</span>
                      <span className="font-bold text-emerald-700">
                        {calculateDistanceKm(
                          userGps.lat,
                          userGps.lng,
                          selectedDonation.latitude,
                          selectedDonation.longitude
                        )}{' '}
                        km away
                      </span>
                    </div>
                  )}

                  <div className="flex items-center gap-1.5 pt-1">
                    <button
                      type="button"
                      onClick={() => {
                        if (onSelectDonation) onSelectDonation(selectedDonation);
                      }}
                      className="flex-1 bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-[11px] py-1.5 px-2 rounded-lg text-center cursor-pointer transition-colors"
                    >
                      View Details
                    </button>
                    <button
                      type="button"
                      onClick={() =>
                        openGoogleMapsDirections(
                          selectedDonation.latitude,
                          selectedDonation.longitude
                        )
                      }
                      title="Open Google Maps Directions"
                      className="bg-stone-100 hover:bg-stone-200 text-stone-700 p-1.5 rounded-lg flex items-center justify-center transition-colors cursor-pointer"
                    >
                      <ExternalLink className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>
              </InfoWindow>
            )}
          </Map>
        </div>
      </APIProvider>

      {/* Bottom Hint Banner */}
      {onPickLocation && (
        <div className="absolute bottom-2 left-3 right-3 z-10 bg-white/95 backdrop-blur-xs px-3 py-1.5 rounded-xl border border-stone-200 text-[11px] text-stone-600 flex items-center justify-between shadow-xs">
          <span>Click on the map or drag the green pin to position the pickup point.</span>
          {pickedPosition && (
            <span className="font-mono text-emerald-800 font-bold">
              {pickedPosition.lat.toFixed(4)}, {pickedPosition.lng.toFixed(4)}
            </span>
          )}
        </div>
      )}
    </div>
  );
};
