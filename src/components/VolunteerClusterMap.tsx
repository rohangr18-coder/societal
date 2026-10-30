import React, { useState, useEffect, useMemo, useRef } from 'react';
import {
  APIProvider,
  Map,
  AdvancedMarker,
  InfoWindow,
  useMap,
} from '@vis.gl/react-google-maps';
import L from 'leaflet';
import {
  Compass,
  Navigation,
  Crosshair,
  Clock,
  MapPin,
  AlertTriangle,
  CheckCircle2,
  ExternalLink,
  Layers,
  Sparkles,
  Radio,
  Loader2,
  X,
  ArrowRight,
  Filter,
  Flame,
  Bike,
} from 'lucide-react';
import { Donation } from '../types';
import { calculateDistanceKm, calculateDistanceKmSafe } from '../utils/geo';
import {
  clusterDonations,
  getPickupWindowInfo,
  DonationCluster,
} from '../utils/clustering';
import { useDeviceLocation, DeviceLocation } from '../hooks/useDeviceLocation';
import { GOOGLE_MAPS_API_KEY } from './GoogleRescueMap';

interface VolunteerClusterMapProps {
  donations: Donation[];
  volunteerLat?: number;
  volunteerLng?: number;
  baseRadiusKm?: number;
  onSelectDonation?: (donation: Donation) => void;
  onAcceptRequest?: (donation: Donation) => void;
  height?: string;
  claimingDonationId?: string | null;
}

// Map pan/recenter helper
function MapRecenterController({
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
    if (typeof targetZoom === 'number') {
      map.setZoom(targetZoom);
    }
  }, [map, targetCenter?.lat, targetCenter?.lng, targetZoom]);
  return null;
}

export const VolunteerClusterMap: React.FC<VolunteerClusterMapProps> = ({
  donations = [],
  volunteerLat = 28.6139,
  volunteerLng = 77.2090,
  baseRadiusKm = 10,
  onSelectDonation,
  onAcceptRequest,
  height = '520px',
  claimingDonationId = null,
}) => {
  // Proximity filter state
  const [selectedProximity, setSelectedProximity] = useState<number>(baseRadiusKm);
  const [urgentOnly, setUrgentOnly] = useState<boolean>(false);
  const [selectedCluster, setSelectedCluster] = useState<DonationCluster | null>(null);
  const [selectedSingleDonation, setSelectedSingleDonation] = useState<Donation | null>(null);

  // Map viewport state
  const [activeCenter, setActiveCenter] = useState<{ lat: number; lng: number }>({
    lat: volunteerLat,
    lng: volunteerLng,
  });
  const [activeZoom, setActiveZoom] = useState<number>(12);

  // Device GPS
  const {
    location: userGps,
    isLoading: gpsLoading,
    isTracking,
    getCurrentLocation,
    startTracking,
    stopTracking,
  } = useDeviceLocation();

  // Active volunteer coordinates (prioritize live device GPS if available)
  const currentVolunteerLat = userGps?.lat ?? volunteerLat;
  const currentVolunteerLng = userGps?.lng ?? volunteerLng;

  // Filter donations strictly for active requests with pending pickup windows and proximity
  const eligibleDonations = useMemo(() => {
    return donations.filter((d) => {
      // Must be active collection request
      if (!['available', 'requested'].includes(d.status)) return false;
      if (typeof d.latitude !== 'number' || typeof d.longitude !== 'number') return false;
      if (d.latitude === 0 && d.longitude === 0) return false;

      // Pending pickup window check (not expired)
      const windowInfo = getPickupWindowInfo(d);
      if (windowInfo.isExpired) return false;
      if (urgentOnly && !windowInfo.isUrgent) return false;

      // Proximity distance filter
      if (selectedProximity > 0) {
        const dist = calculateDistanceKm(
          currentVolunteerLat,
          currentVolunteerLng,
          d.latitude,
          d.longitude
        );
        if (dist !== null && dist > selectedProximity) return false;
      }

      return true;
    });
  }, [donations, currentVolunteerLat, currentVolunteerLng, selectedProximity, urgentOnly]);

  // Compute dynamic spatial clusters
  const clusters = useMemo(() => {
    // Dynamic cluster radius based on zoom level: broader at lower zooms
    const clusterDistKm = activeZoom <= 10 ? 4.5 : activeZoom <= 12 ? 2.5 : 1.2;
    return clusterDonations(
      eligibleDonations,
      clusterDistKm,
      currentVolunteerLat,
      currentVolunteerLng
    );
  }, [eligibleDonations, activeZoom, currentVolunteerLat, currentVolunteerLng]);

  // Total metrics for proximity banner
  const totalAvailableServings = useMemo(() => {
    return eligibleDonations.reduce(
      (sum, d) => sum + (d.servings || Math.round((d.quantity || 0) * 2.5)),
      0
    );
  }, [eligibleDonations]);

  const urgentCount = useMemo(() => {
    return eligibleDonations.filter((d) => getPickupWindowInfo(d).isUrgent).length;
  }, [eligibleDonations]);

  // Handle GPS recentering
  const handleRecenterVolunteer = async () => {
    try {
      if (userGps) {
        setActiveCenter({ lat: userGps.lat, lng: userGps.lng });
        setActiveZoom(13);
      } else {
        const loc = await getCurrentLocation();
        setActiveCenter({ lat: loc.lat, lng: loc.lng });
        setActiveZoom(13);
      }
    } catch {
      setActiveCenter({ lat: volunteerLat, lng: volunteerLng });
      setActiveZoom(13);
    }
  };

  // Zoom into cluster or open cluster drawer
  const handleClusterClick = (cluster: DonationCluster) => {
    setSelectedSingleDonation(null);
    if (cluster.count > 1) {
      setSelectedCluster(cluster);
      setActiveCenter({ lat: cluster.latitude, lng: cluster.longitude });
      if (activeZoom < 14) {
        setActiveZoom(activeZoom + 2);
      }
    } else {
      setSelectedSingleDonation(cluster.donations[0]);
      setActiveCenter({ lat: cluster.latitude, lng: cluster.longitude });
      setActiveZoom(15);
      if (onSelectDonation) {
        onSelectDonation(cluster.donations[0]);
      }
    }
  };

  // Leaflet Fallback Ref
  const leafletMapRef = useRef<HTMLDivElement>(null);
  const leafletInstanceRef = useRef<L.Map | null>(null);
  const leafletLayerRef = useRef<L.LayerGroup | null>(null);

  // Leaflet Fallback renderer if Google Maps is not provisioned
  const isGoogleMapsAvailable = Boolean(GOOGLE_MAPS_API_KEY && GOOGLE_MAPS_API_KEY.length > 10);

  useEffect(() => {
    if (isGoogleMapsAvailable || !leafletMapRef.current) return;

    if (!leafletInstanceRef.current) {
      const map = L.map(leafletMapRef.current, {
        center: [currentVolunteerLat, currentVolunteerLng],
        zoom: activeZoom,
      });

      L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
        attribution: '&copy; OpenStreetMap contributors',
        maxZoom: 19,
      }).addTo(map);

      leafletLayerRef.current = L.layerGroup().addTo(map);
      leafletInstanceRef.current = map;
    }

    const map = leafletInstanceRef.current;
    const layer = leafletLayerRef.current;
    if (!map || !layer) return;

    layer.clearLayers();

    // Volunteer beacon marker
    const volunteerIcon = L.divIcon({
      className: 'custom-volunteer-beacon',
      html: `
        <div style="position:relative; width:24px; height:24px; display:flex; align-items:center; justify-content:center;">
          <div style="position:absolute; width:24px; height:24px; border-radius:50%; background:rgba(37,99,235,0.25); animation:ping 1.5s cubic-bezier(0,0,0.2,1) infinite;"></div>
          <div style="width:16px; height:16px; border-radius:50%; background:#2563eb; border:2px solid #ffffff; box-shadow:0 2px 4px rgba(0,0,0,0.3);"></div>
        </div>
      `,
      iconSize: [24, 24],
      iconAnchor: [12, 12],
    });

    L.marker([currentVolunteerLat, currentVolunteerLng], { icon: volunteerIcon })
      .bindPopup(`<b>Your Base Location</b><br/>Patrol Radius: ${selectedProximity || 'All'} km`)
      .addTo(layer);

    // Proximity radius circle
    if (selectedProximity > 0) {
      L.circle([currentVolunteerLat, currentVolunteerLng], {
        radius: selectedProximity * 1000,
        color: '#059669',
        fillColor: '#10b981',
        fillOpacity: 0.08,
        weight: 1.5,
        dashArray: '4, 4',
      }).addTo(layer);
    }

    // Cluster markers
    clusters.forEach((cluster) => {
      const isUrgent = cluster.hasUrgent;
      const count = cluster.count;
      const bg = isUrgent ? '#e11d48' : count > 1 ? '#059669' : '#d97706';

      const clusterIcon = L.divIcon({
        className: 'custom-leaflet-cluster',
        html: `
          <div style="
            background: ${bg};
            color: #ffffff;
            font-weight: 800;
            font-size: 11px;
            padding: 4px 8px;
            border-radius: 999px;
            border: 2px solid #ffffff;
            box-shadow: 0 4px 6px -1px rgba(0,0,0,0.2);
            display: flex;
            align-items: center;
            gap: 4px;
            cursor: pointer;
            white-space: nowrap;
          ">
            <span>${isUrgent ? '🔥' : '🍲'}</span>
            <span>${count} ${count === 1 ? 'Pickup' : 'Pickups'}</span>
          </div>
        `,
        iconAnchor: [30, 15],
      });

      const marker = L.marker([cluster.latitude, cluster.longitude], { icon: clusterIcon });
      marker.on('click', () => {
        handleClusterClick(cluster);
      });
      marker.addTo(layer);
    });
  }, [
    isGoogleMapsAvailable,
    clusters,
    currentVolunteerLat,
    currentVolunteerLng,
    selectedProximity,
    activeZoom,
  ]);

  return (
    <div className="relative w-full rounded-3xl overflow-hidden border border-emerald-200 shadow-md bg-stone-900 text-stone-900">
      {/* Top Floating Proximity Radar Toolbar */}
      <div className="absolute top-3 left-3 right-3 z-20 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-2 pointer-events-none">
        {/* Proximity Radius Filter Pills */}
        <div className="bg-white/95 backdrop-blur-md px-3 py-2 rounded-2xl shadow-lg border border-emerald-100 flex flex-wrap items-center gap-1.5 pointer-events-auto">
          <div className="flex items-center gap-1.5 text-xs font-black text-emerald-950 pr-1.5 border-r border-stone-200">
            <Compass className="w-4 h-4 text-emerald-600" />
            <span className="hidden sm:inline">Proximity:</span>
          </div>

          {[3, 5, 10, 20, 0].map((radius) => (
            <button
              key={radius}
              onClick={() => {
                setSelectedProximity(radius);
                setSelectedCluster(null);
              }}
              className={`px-2.5 py-1 rounded-xl text-xs font-bold transition-all cursor-pointer ${
                selectedProximity === radius
                  ? 'bg-emerald-600 text-white shadow-xs'
                  : 'bg-stone-100 text-stone-700 hover:bg-stone-200'
              }`}
            >
              {radius === 0 ? 'All' : `${radius} km`}
            </button>
          ))}

          {/* Urgent Pending Filter Toggle */}
          <button
            onClick={() => setUrgentOnly(!urgentOnly)}
            className={`ml-1 px-2.5 py-1 rounded-xl text-xs font-bold transition-all cursor-pointer flex items-center gap-1 ${
              urgentOnly
                ? 'bg-rose-600 text-white shadow-xs'
                : 'bg-rose-50 text-rose-700 hover:bg-rose-100 border border-rose-200'
            }`}
            title="Show only collections with < 1h remaining in pickup window"
          >
            <Flame className="w-3.5 h-3.5" />
            <span>Urgent ({urgentCount})</span>
          </button>
        </div>

        {/* GPS Controls & Metrics Capsule */}
        <div className="flex items-center gap-2 pointer-events-auto">
          {/* Quick Metrics Capsule */}
          <div className="bg-stone-900/90 backdrop-blur-md text-white text-xs px-3.5 py-2 rounded-2xl shadow-lg border border-stone-700 flex items-center gap-2.5">
            <div className="flex items-center gap-1 text-emerald-400 font-bold">
              <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
              <span>{eligibleDonations.length} Active Pickups</span>
            </div>
            <span className="text-stone-400 text-[11px] hidden md:inline">
              ({clusters.length} Clusters • ~{totalAvailableServings} meals)
            </span>
          </div>

          {/* Recenter Button */}
          <button
            onClick={handleRecenterVolunteer}
            disabled={gpsLoading}
            className="bg-white hover:bg-stone-50 text-stone-800 p-2.5 rounded-2xl shadow-lg border border-stone-200 transition-colors cursor-pointer"
            title="Recenter map on volunteer location"
          >
            {gpsLoading ? (
              <Loader2 className="w-4 h-4 animate-spin text-emerald-600" />
            ) : (
              <Navigation className="w-4 h-4 text-emerald-600" />
            )}
          </button>
        </div>
      </div>

      {/* Main Map Canvas (Google Maps or Fallback) */}
      <div style={{ height, width: '100%' }} className="relative">
        {isGoogleMapsAvailable ? (
          <APIProvider apiKey={GOOGLE_MAPS_API_KEY} libraries={['marker', 'geometry']}>
            <Map
              mapId="DEMO_MAP_ID"
              defaultCenter={activeCenter}
              defaultZoom={activeZoom}
              gestureHandling="greedy"
              disableDefaultUI={false}
              internalUsageAttributionIds={['gmp_mcp_codeassist_v1_aistudio']}
              style={{ width: '100%', height: '100%' }}
            >
              <MapRecenterController targetCenter={activeCenter} targetZoom={activeZoom} />

              {/* VOLUNTEER BEACON MARKER */}
              <AdvancedMarker
                position={{ lat: currentVolunteerLat, lng: currentVolunteerLng }}
                title="Your Current Location (Volunteer Courier)"
                zIndex={999}
              >
                <div className="relative flex items-center justify-center">
                  <div className="w-12 h-12 rounded-full bg-blue-500/25 animate-ping absolute" />
                  <div className="w-9 h-9 rounded-full bg-blue-600 border-2 border-white flex items-center justify-center shadow-xl">
                    <Bike className="w-4 h-4 text-white" />
                  </div>
                </div>
              </AdvancedMarker>

              {/* REAL-TIME CLUSTER MARKERS */}
              {clusters.map((cluster) => {
                const isUrgent = cluster.hasUrgent;
                const isSingle = cluster.count === 1;
                const singleDonation = isSingle ? cluster.donations[0] : null;
                const windowInfo = singleDonation ? getPickupWindowInfo(singleDonation) : null;

                if (isSingle && singleDonation) {
                  // SINGLE PICKUP MARKER
                  const isClaiming = claimingDonationId === singleDonation.id;
                  const isUrgentSingle = windowInfo?.isUrgent;

                  return (
                    <AdvancedMarker
                      key={singleDonation.id}
                      position={{ lat: singleDonation.latitude, lng: singleDonation.longitude }}
                      title={`${singleDonation.foodName} (${windowInfo?.label})`}
                      onClick={() => handleClusterClick(cluster)}
                    >
                      <div className="group relative flex flex-col items-center cursor-pointer transition-transform hover:scale-110">
                        {/* Pending Pickup Window Floating Tag */}
                        <div
                          className={`mb-1 px-2 py-0.5 rounded-full text-[10px] font-black shadow-md border flex items-center gap-1 whitespace-nowrap ${
                            isUrgentSingle
                              ? 'bg-rose-600 text-white border-rose-300 animate-pulse'
                              : 'bg-stone-900/90 text-amber-300 border-stone-700'
                          }`}
                        >
                          <Clock className="w-2.5 h-2.5" />
                          <span>{windowInfo?.label}</span>
                        </div>

                        {/* Pin Body */}
                        <div
                          className={`w-9 h-9 rounded-2xl flex items-center justify-center text-sm shadow-xl border-2 border-white ${
                            isUrgentSingle ? 'bg-rose-600 text-white' : 'bg-emerald-600 text-white'
                          }`}
                        >
                          {singleDonation.category === 'Cooked Meals'
                            ? '🍲'
                            : singleDonation.category === 'Bakery'
                            ? '🥖'
                            : '🥗'}
                        </div>

                        {/* Serving volume subscript */}
                        <div className="mt-0.5 px-1.5 py-0.2 rounded-md bg-stone-950/80 text-white text-[9px] font-bold">
                          {singleDonation.quantity} {singleDonation.unit}
                        </div>
                      </div>
                    </AdvancedMarker>
                  );
                }

                // MULTI-DONATION CLUSTER MARKER
                return (
                  <AdvancedMarker
                    key={cluster.id}
                    position={{ lat: cluster.latitude, lng: cluster.longitude }}
                    title={`Cluster: ${cluster.count} Pending Donations`}
                    onClick={() => handleClusterClick(cluster)}
                  >
                    <div className="relative flex flex-col items-center cursor-pointer transition-transform hover:scale-115">
                      {/* Urgency Halo */}
                      <div
                        className={`w-14 h-14 rounded-full absolute -top-1.5 -left-1.5 animate-ping opacity-60 ${
                          isUrgent ? 'bg-rose-500' : 'bg-emerald-400'
                        }`}
                      />

                      {/* Main Cluster Bubble */}
                      <div
                        className={`relative z-10 w-11 h-11 rounded-full flex flex-col items-center justify-center text-white border-3 border-white shadow-2xl ${
                          isUrgent
                            ? 'bg-gradient-to-tr from-rose-700 to-rose-500'
                            : 'bg-gradient-to-tr from-emerald-800 to-teal-600'
                        }`}
                      >
                        <span className="text-sm font-black leading-none">{cluster.count}</span>
                        <span className="text-[8px] font-bold uppercase tracking-tighter opacity-90">
                          Runs
                        </span>
                      </div>

                      {/* Cluster Volume Pill */}
                      <div className="relative z-10 -mt-1.5 px-2 py-0.5 rounded-full bg-stone-950 text-amber-300 text-[10px] font-black border border-stone-800 shadow-md flex items-center gap-1">
                        {isUrgent && <Flame className="w-2.5 h-2.5 text-rose-400" />}
                        <span>~{cluster.totalServings} meals</span>
                      </div>
                    </div>
                  </AdvancedMarker>
                );
              })}

              {/* INFO WINDOW FOR SINGLE SELECTED DONATION */}
              {selectedSingleDonation && (
                <InfoWindow
                  position={{
                    lat: selectedSingleDonation.latitude,
                    lng: selectedSingleDonation.longitude,
                  }}
                  onCloseClick={() => setSelectedSingleDonation(null)}
                >
                  <div className="p-1 max-w-[260px] text-stone-800 font-sans space-y-2">
                    <div className="flex items-center justify-between gap-1">
                      <span className="text-[10px] font-bold uppercase tracking-wider text-emerald-800 bg-emerald-50 px-2 py-0.5 rounded-full border border-emerald-200">
                        {selectedSingleDonation.category}
                      </span>
                      {(() => {
                        const win = getPickupWindowInfo(selectedSingleDonation);
                        return (
                          <span
                            className={`text-[10px] font-black px-2 py-0.5 rounded-full ${
                              win.isUrgent
                                ? 'bg-rose-100 text-rose-800 animate-pulse'
                                : 'bg-amber-100 text-amber-800'
                            }`}
                          >
                            ⏱️ {win.label}
                          </span>
                        );
                      })()}
                    </div>

                    <div>
                      <h4 className="font-black text-stone-900 text-sm leading-snug">
                        {selectedSingleDonation.foodName}
                      </h4>
                      <p className="text-xs text-stone-600 mt-0.5">
                        <strong>Quantity:</strong> {selectedSingleDonation.quantity}{' '}
                        {selectedSingleDonation.unit} (~{selectedSingleDonation.servings || 20}{' '}
                        servings)
                      </p>
                    </div>

                    <div className="text-[11px] text-stone-500 bg-stone-50 p-2 rounded-xl border border-stone-100">
                      <div className="font-semibold text-stone-700">📍 Pickup Address:</div>
                      <div>{selectedSingleDonation.pickupAddress}</div>
                      <div className="mt-1 text-[10px] text-emerald-700 font-bold flex items-center gap-1">
                        <Compass className="w-3 h-3" />
                        <span>
                          ~
                          {calculateDistanceKmSafe(
                            currentVolunteerLat,
                            currentVolunteerLng,
                            selectedSingleDonation.latitude,
                            selectedSingleDonation.longitude,
                            0
                          ).toFixed(1)}{' '}
                          km from your location
                        </span>
                      </div>
                    </div>

                    <div className="flex items-center gap-2 pt-1">
                      {onAcceptRequest && (
                        <button
                          onClick={() => {
                            onAcceptRequest(selectedSingleDonation);
                            setSelectedSingleDonation(null);
                          }}
                          disabled={claimingDonationId === selectedSingleDonation.id}
                          className="flex-1 bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-xs py-2 px-3 rounded-xl transition-colors cursor-pointer text-center flex items-center justify-center gap-1.5 shadow-xs"
                        >
                          {claimingDonationId === selectedSingleDonation.id ? (
                            <Loader2 className="w-3.5 h-3.5 animate-spin" />
                          ) : (
                            <Bike className="w-3.5 h-3.5" />
                          )}
                          <span>Accept Run</span>
                        </button>
                      )}

                      {onSelectDonation && (
                        <button
                          onClick={() => {
                            onSelectDonation(selectedSingleDonation);
                            setSelectedSingleDonation(null);
                          }}
                          className="bg-stone-100 hover:bg-stone-200 text-stone-800 font-semibold text-xs py-2 px-3 rounded-xl transition-colors cursor-pointer"
                        >
                          Details
                        </button>
                      )}
                    </div>
                  </div>
                </InfoWindow>
              )}
            </Map>
          </APIProvider>
        ) : (
          <div ref={leafletMapRef} style={{ width: '100%', height: '100%' }} />
        )}
      </div>

      {/* CLUSTER INSPECTION POPUP DRAWER */}
      {selectedCluster && (
        <div className="absolute inset-x-3 bottom-3 z-30 max-h-[50%] bg-white/95 backdrop-blur-md rounded-2xl p-4 shadow-2xl border border-emerald-200 flex flex-col animate-in slide-in-from-bottom duration-200">
          <div className="flex items-center justify-between pb-2 border-b border-stone-200">
            <div className="flex items-center gap-2">
              <div className="w-8 h-8 rounded-xl bg-emerald-600 text-white flex items-center justify-center font-black text-sm">
                {selectedCluster.count}
              </div>
              <div>
                <h4 className="text-sm font-black text-stone-900 leading-tight">
                  Hotspot Cluster ({selectedCluster.count} Pending Donations)
                </h4>
                <p className="text-xs text-stone-500">
                  Total ~{selectedCluster.totalServings} meals available within ~{selectedCluster.minDistanceKm?.toFixed(1) || '<1'} km of you
                </p>
              </div>
            </div>
            <button
              onClick={() => setSelectedCluster(null)}
              className="text-stone-400 hover:text-stone-700 p-1 rounded-lg"
            >
              <X className="w-5 h-5" />
            </button>
          </div>

          {/* List of donations inside this cluster */}
          <div className="overflow-y-auto space-y-2 mt-3 pr-1">
            {selectedCluster.donations.map((donation) => {
              const windowInfo = getPickupWindowInfo(donation);
              const dist = calculateDistanceKm(
                currentVolunteerLat,
                currentVolunteerLng,
                donation.latitude,
                donation.longitude
              );

              return (
                <div
                  key={donation.id}
                  className="p-3 rounded-xl bg-stone-50 hover:bg-emerald-50/50 border border-stone-200 transition-colors flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3"
                >
                  <div className="space-y-1">
                    <div className="flex items-center gap-2">
                      <span className="font-bold text-xs text-stone-900">
                        {donation.foodName}
                      </span>
                      <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-emerald-100 text-emerald-800">
                        {donation.category}
                      </span>
                      <span
                        className={`px-2 py-0.5 rounded-full text-[10px] font-black ${
                          windowInfo.isUrgent
                            ? 'bg-rose-100 text-rose-800 animate-pulse'
                            : 'bg-amber-100 text-amber-800'
                        }`}
                      >
                        ⏱️ {windowInfo.label}
                      </span>
                    </div>

                    <div className="text-[11px] text-stone-500 flex flex-wrap items-center gap-2">
                      <span>Volume: {donation.quantity} {donation.unit}</span>
                      <span>•</span>
                      <span>📍 {dist !== null ? `${dist.toFixed(1)} km away` : 'location unconfirmed'} ({donation.pickupAddress})</span>
                    </div>
                  </div>

                  <div className="flex items-center gap-2 shrink-0">
                    {onAcceptRequest && (
                      <button
                        onClick={() => {
                          onAcceptRequest(donation);
                          setSelectedCluster(null);
                        }}
                        disabled={claimingDonationId === donation.id}
                        className="bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-xs px-3 py-1.5 rounded-xl transition-colors cursor-pointer flex items-center gap-1"
                      >
                        {claimingDonationId === donation.id ? (
                          <Loader2 className="w-3.5 h-3.5 animate-spin" />
                        ) : (
                          <Bike className="w-3.5 h-3.5" />
                        )}
                        <span>Accept</span>
                      </button>
                    )}

                    {onSelectDonation && (
                      <button
                        onClick={() => {
                          onSelectDonation(donation);
                          setSelectedCluster(null);
                        }}
                        className="bg-stone-200 hover:bg-stone-300 text-stone-800 font-semibold text-xs px-3 py-1.5 rounded-xl transition-colors cursor-pointer"
                      >
                        View
                      </button>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
};
