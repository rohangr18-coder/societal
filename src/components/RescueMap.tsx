import React, { useEffect, useRef } from 'react';
import L from 'leaflet';
import { Donation } from '../types';

interface RescueMapProps {
  donations?: Donation[];
  center?: [number, number];
  zoom?: number;
  height?: string;
  selectedDonationId?: string;
  onSelectDonation?: (donation: Donation) => void;
  onPickLocation?: (lat: number, lng: number) => void;
  interactive?: boolean;
  routeEndpoints?: {
    origin: [number, number];
    destination: [number, number];
    originLabel?: string;
    destLabel?: string;
  };
}

export const RescueMap: React.FC<RescueMapProps> = ({
  donations = [],
  center = [28.6139, 77.2090], // Default center (can be customized or current GPS)
  zoom = 13,
  height = '420px',
  selectedDonationId,
  onSelectDonation,
  onPickLocation,
  interactive = true,
  routeEndpoints,
}) => {
  const mapContainerRef = useRef<HTMLDivElement>(null);
  const mapInstanceRef = useRef<L.Map | null>(null);
  const markersLayerRef = useRef<L.LayerGroup | null>(null);
  const routeLayerRef = useRef<L.LayerGroup | null>(null);

  useEffect(() => {
    if (!mapContainerRef.current) return;

    if (!mapInstanceRef.current) {
      const map = L.map(mapContainerRef.current, {
        center: center,
        zoom: zoom,
        zoomControl: true,
      });

      L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
        attribution: '&copy; OpenStreetMap contributors',
        maxZoom: 19,
      }).addTo(map);

      markersLayerRef.current = L.layerGroup().addTo(map);
      routeLayerRef.current = L.layerGroup().addTo(map);

      if (onPickLocation) {
        map.on('click', (e) => {
          onPickLocation(e.latlng.lat, e.latlng.lng);
        });
      }

      mapInstanceRef.current = map;
    }

    return () => {
      // Cleanup on unmount
      if (mapInstanceRef.current) {
        mapInstanceRef.current.remove();
        mapInstanceRef.current = null;
      }
    };
  }, []);

  // Update center when center prop changes
  useEffect(() => {
    if (mapInstanceRef.current && center) {
      mapInstanceRef.current.setView(center, zoom);
    }
  }, [center[0], center[1], zoom]);

  // Update donation markers
  useEffect(() => {
    if (!mapInstanceRef.current || !markersLayerRef.current) return;

    markersLayerRef.current.clearLayers();

    donations.forEach((donation) => {
      if (!donation.latitude || !donation.longitude) return;

      const isSelected = donation.id === selectedDonationId;
      const statusColor =
        donation.status === 'available'
          ? '#16a34a' // Green
          : donation.status === 'requested' || donation.status === 'accepted'
          ? '#ea580c' // Orange
          : donation.status === 'delivered'
          ? '#64748b' // Slate
          : '#2563eb'; // Blue for scheduled/picked up

      const markerHtml = `
        <div style="
          background-color: ${statusColor};
          width: ${isSelected ? '32px' : '26px'};
          height: ${isSelected ? '32px' : '26px'};
          border-radius: 50%;
          border: 3px solid white;
          box-shadow: 0 4px 6px rgba(0,0,0,0.3);
          display: flex;
          align-items: center;
          justify-content: center;
          color: white;
          font-weight: bold;
          font-size: 11px;
          cursor: pointer;
          transform: translate(-50%, -50%);
        ">
          🍲
        </div>
      `;

      const customIcon = L.divIcon({
        className: 'custom-food-marker',
        html: markerHtml,
        iconSize: [30, 30],
        iconAnchor: [15, 15],
      });

      const marker = L.marker([donation.latitude, donation.longitude], { icon: customIcon });

      marker.bindPopup(`
        <div style="font-family: sans-serif; font-size: 13px; max-width: 220px;">
          <h4 style="margin: 0 0 4px 0; font-weight: 700; color: #15803d; font-size: 14px;">${donation.foodName}</h4>
          <p style="margin: 2px 0; color: #4b5563;"><strong>Quantity:</strong> ${donation.quantity} ${donation.unit}</p>
          <p style="margin: 2px 0; color: #4b5563;"><strong>Status:</strong> <span style="text-transform: capitalize; font-weight: 600; color: ${statusColor};">${donation.status.replace('_', ' ')}</span></p>
          <p style="margin: 2px 0; color: #4b5563;"><strong>Deadline:</strong> ${donation.pickupDeadline || 'Not specified'}</p>
          <p style="margin: 4px 0 0 0; color: #6b7280; font-size: 11px;">📍 ${donation.pickupAddress}</p>
        </div>
      `);

      marker.on('click', () => {
        if (onSelectDonation) {
          onSelectDonation(donation);
        }
      });

      markersLayerRef.current?.addLayer(marker);
    });
  }, [donations, selectedDonationId, onSelectDonation]);

  // Update Route if endpoints are passed
  useEffect(() => {
    if (!mapInstanceRef.current || !routeLayerRef.current) return;

    routeLayerRef.current.clearLayers();

    if (routeEndpoints) {
      const { origin, destination, originLabel, destLabel } = routeEndpoints;

      // Origin Marker
      const originIcon = L.divIcon({
        className: 'origin-marker',
        html: `<div style="background:#16a34a;color:white;border-radius:50%;width:24px;height:24px;border:2px solid white;display:flex;align-items:center;justify-content:center;font-weight:bold;font-size:10px;">A</div>`,
        iconSize: [24, 24],
      });
      const oMarker = L.marker(origin, { icon: originIcon }).bindPopup(originLabel || 'Pickup Point');
      routeLayerRef.current.addLayer(oMarker);

      // Destination Marker
      const destIcon = L.divIcon({
        className: 'dest-marker',
        html: `<div style="background:#ea580c;color:white;border-radius:50%;width:24px;height:24px;border:2px solid white;display:flex;align-items:center;justify-content:center;font-weight:bold;font-size:10px;">B</div>`,
        iconSize: [24, 24],
      });
      const dMarker = L.marker(destination, { icon: destIcon }).bindPopup(destLabel || 'Drop-off Shelter');
      routeLayerRef.current.addLayer(dMarker);

      // Route polyline (dashed green to orange)
      const line = L.polyline([origin, destination], {
        color: '#16a34a',
        weight: 4,
        opacity: 0.8,
        dashArray: '8, 8',
      });
      routeLayerRef.current.addLayer(line);

      // Fit bounds to show route
      const bounds = L.latLngBounds([origin, destination]);
      mapInstanceRef.current.fitBounds(bounds, { padding: [40, 40] });
    }
  }, [routeEndpoints]);

  return (
    <div className="relative rounded-2xl overflow-hidden border border-emerald-100 shadow-sm">
      <div ref={mapContainerRef} style={{ width: '100%', height }} className="z-10" />
      {onPickLocation && (
        <div className="absolute top-3 right-3 z-20 bg-white/95 backdrop-blur-xs px-3 py-1.5 rounded-lg border border-emerald-200 text-xs font-medium text-emerald-800 shadow-xs pointer-events-none">
          Click map to set exact coordinates
        </div>
      )}
    </div>
  );
};

export { calculateDistanceKm } from '../utils/geo';
