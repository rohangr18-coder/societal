import { useState, useEffect, useRef, useCallback } from 'react';

export interface DeviceLocation {
  lat: number;
  lng: number;
  accuracy: number; // in meters
  heading?: number | null;
  speed?: number | null;
  timestamp: number;
}

export interface GeolocationError {
  code?: number;
  message: string;
  type: 'PERMISSION_DENIED' | 'POSITION_UNAVAILABLE' | 'TIMEOUT' | 'UNSUPPORTED';
}

export function useDeviceLocation() {
  const [location, setLocation] = useState<DeviceLocation | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [isTracking, setIsTracking] = useState(false);
  const [followUser, setFollowUser] = useState(true);
  const [error, setError] = useState<GeolocationError | null>(null);

  const watchIdRef = useRef<number | null>(null);

  const clearError = useCallback(() => setError(null), []);

  // Request single current high-accuracy position
  const getCurrentLocation = useCallback((): Promise<DeviceLocation> => {
    return new Promise((resolve, reject) => {
      if (!('geolocation' in navigator)) {
        const err: GeolocationError = {
          message: 'Geolocation is not supported by your browser or device.',
          type: 'UNSUPPORTED',
        };
        setError(err);
        reject(err);
        return;
      }

      setIsLoading(true);
      setError(null);

      navigator.geolocation.getCurrentPosition(
        (position) => {
          setIsLoading(false);
          const devLoc: DeviceLocation = {
            lat: position.coords.latitude,
            lng: position.coords.longitude,
            accuracy: Math.round(position.coords.accuracy),
            heading: position.coords.heading,
            speed: position.coords.speed,
            timestamp: position.timestamp,
          };
          setLocation(devLoc);
          resolve(devLoc);
        },
        (geoError) => {
          setIsLoading(false);
          let type: GeolocationError['type'] = 'POSITION_UNAVAILABLE';
          let message = 'Unable to determine your physical location.';

          if (geoError.code === geoError.PERMISSION_DENIED) {
            type = 'PERMISSION_DENIED';
            message =
              'Location permission was denied. Please allow location access in your browser settings to find nearby food rescues or track routes.';
          } else if (geoError.code === geoError.POSITION_UNAVAILABLE) {
            type = 'POSITION_UNAVAILABLE';
            message =
              'GPS/Location information is currently unavailable from your device hardware or network.';
          } else if (geoError.code === geoError.TIMEOUT) {
            type = 'TIMEOUT';
            message = 'GPS location request timed out. Please try again in an area with clear reception.';
          }

          const err: GeolocationError = {
            code: geoError.code,
            message,
            type,
          };
          setError(err);
          reject(err);
        },
        {
          enableHighAccuracy: true,
          timeout: 15000,
          maximumAge: 0, // Force fresh hardware reading
        }
      );
    });
  }, []);

  // Start continuous live tracking
  const startTracking = useCallback(() => {
    if (!('geolocation' in navigator)) {
      setError({
        message: 'Geolocation is not supported by this browser.',
        type: 'UNSUPPORTED',
      });
      return;
    }

    // Clear any existing watcher
    if (watchIdRef.current !== null) {
      navigator.geolocation.clearWatch(watchIdRef.current);
      watchIdRef.current = null;
    }

    setIsTracking(true);
    setError(null);

    watchIdRef.current = navigator.geolocation.watchPosition(
      (position) => {
        const devLoc: DeviceLocation = {
          lat: position.coords.latitude,
          lng: position.coords.longitude,
          accuracy: Math.round(position.coords.accuracy),
          heading: position.coords.heading,
          speed: position.coords.speed,
          timestamp: position.timestamp,
        };
        setLocation(devLoc);
      },
      (geoError) => {
        let type: GeolocationError['type'] = 'POSITION_UNAVAILABLE';
        let message = 'Live tracking lost device signal.';

        if (geoError.code === geoError.PERMISSION_DENIED) {
          type = 'PERMISSION_DENIED';
          message = 'Location permission revoked. Live GPS tracking stopped.';
          setIsTracking(false);
          if (watchIdRef.current !== null) {
            navigator.geolocation.clearWatch(watchIdRef.current);
            watchIdRef.current = null;
          }
        }

        setError({ code: geoError.code, message, type });
      },
      {
        enableHighAccuracy: true,
        timeout: 20000,
        maximumAge: 5000,
      }
    );
  }, []);

  // Stop continuous live tracking
  const stopTracking = useCallback(() => {
    if (watchIdRef.current !== null) {
      navigator.geolocation.clearWatch(watchIdRef.current);
      watchIdRef.current = null;
    }
    setIsTracking(false);
  }, []);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (watchIdRef.current !== null) {
        navigator.geolocation.clearWatch(watchIdRef.current);
        watchIdRef.current = null;
      }
    };
  }, []);

  return {
    location,
    isLoading,
    isTracking,
    followUser,
    setFollowUser,
    error,
    clearError,
    getCurrentLocation,
    startTracking,
    stopTracking,
  };
}
