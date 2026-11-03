import React, { useState, useEffect, useRef } from 'react';
import jsQR from 'jsqr';
import {
  X,
  Camera,
  QrCode,
  CheckCircle2,
  AlertTriangle,
  Loader2,
  Upload,
  RefreshCw,
  PackageCheck,
  ShieldCheck,
  MapPin,
  Clock,
  Sparkles,
  ArrowRight,
  Flashlight,
  KeyRound,
  Bike,
} from 'lucide-react';
import { Donation } from '../types';
import { useAuth } from '../context/AuthContext';
import { useLanguage } from '../context/LanguageContext';
import {
  getDonation,
  verifyPickupWithToken,
  transitionCollectionStatus,
  getOrCreateVerification,
} from '../services/dbService';

export interface VolunteerQRScannerModalProps {
  isOpen: boolean;
  onClose: () => void;
  donations: Donation[];
  onPickupVerified: (donationId: string) => void;
}

export interface ParsedQRResult {
  raw: string;
  donationId: string | null;
  token?: string | null;
  pin?: string | null;
  action?: 'pickup' | 'delivery' | 'view';
}

/**
 * Robustly parses QR code content scanned from a donor's donation display screen.
 * Supports:
 * 1. JSON payload: {"app":"resqbite","type":"pickup","donationId":"...","token":"...","pin":"..."}
 * 2. URL parameter or path: https://.../donation/xyz or ?donationId=xyz
 * 3. URI scheme: resqbite://pickup?donationId=xyz&token=...
 * 4. Prefixed strings: RESQBITE:DONATION:xyz, DONATION:xyz
 * 5. Plain donation ID or verification token
 */
export function parseDonationQR(raw: string, knownDonations: Donation[] = []): ParsedQRResult {
  const trimmed = raw.trim();
  if (!trimmed) {
    return { raw, donationId: null };
  }

  // 1. Try parsing JSON format
  if (trimmed.startsWith('{') && trimmed.endsWith('}')) {
    try {
      const parsed = JSON.parse(trimmed);
      const donationId = parsed.donationId || parsed.id || null;
      return {
        raw,
        donationId: donationId ? String(donationId).trim() : null,
        token: parsed.token ? String(parsed.token).trim() : null,
        pin: parsed.pin ? String(parsed.pin).trim() : null,
        action: parsed.type || 'pickup',
      };
    } catch {
      // not valid JSON, proceed to other checks
    }
  }

  // 2. Try parsing URL / URI
  if (trimmed.includes('://') || trimmed.includes('/') || trimmed.includes('?')) {
    try {
      // Standardize pseudo-protocol for URL parsing
      const urlString = trimmed.startsWith('resqbite://')
        ? trimmed.replace('resqbite://', 'https://resqbite.local/')
        : trimmed.startsWith('http')
        ? trimmed
        : `https://resqbite.local/${trimmed.replace(/^\/+/, '')}`;

      const url = new URL(urlString);
      const donationIdParam =
        url.searchParams.get('donationId') ||
        url.searchParams.get('id') ||
        url.searchParams.get('donation');
      const tokenParam = url.searchParams.get('token') || url.searchParams.get('code');
      const pinParam = url.searchParams.get('pin');

      if (donationIdParam) {
        return {
          raw,
          donationId: donationIdParam.trim(),
          token: tokenParam?.trim() || null,
          pin: pinParam?.trim() || null,
          action: 'pickup',
        };
      }

      // Check path segment (e.g. /donation/abc1234 or /pickup/abc1234)
      const pathParts = url.pathname.split('/').filter(Boolean);
      for (let i = 0; i < pathParts.length; i++) {
        if (
          (pathParts[i] === 'donation' || pathParts[i] === 'donations' || pathParts[i] === 'pickup') &&
          pathParts[i + 1]
        ) {
          return {
            raw,
            donationId: pathParts[i + 1].trim(),
            token: tokenParam?.trim() || null,
            pin: pinParam?.trim() || null,
            action: 'pickup',
          };
        }
      }
    } catch {
      // url parse failed, fall through
    }
  }

  // 3. Try parsing prefix formats
  const upper = trimmed.toUpperCase();
  if (upper.startsWith('RESQBITE:DONATION:')) {
    const id = trimmed.slice('RESQBITE:DONATION:'.length).trim();
    return { raw, donationId: id, action: 'pickup' };
  }
  if (upper.startsWith('DONATION:')) {
    const id = trimmed.slice('DONATION:'.length).trim();
    return { raw, donationId: id, action: 'pickup' };
  }
  if (upper.startsWith('RESQBITE:PICKUP:')) {
    const parts = trimmed.slice('RESQBITE:PICKUP:'.length).split(':');
    return {
      raw,
      donationId: parts[0]?.trim() || null,
      token: parts[1]?.trim() || null,
      action: 'pickup',
    };
  }

  // 4. Check if trimmed matches an existing known donation ID
  const matched = knownDonations.find((d) => d.id === trimmed);
  if (matched) {
    return { raw, donationId: matched.id, action: 'pickup' };
  }

  // 5. Check if it's a verification token (PKUP-...)
  if (upper.startsWith('PKUP-') || upper.startsWith('PKUP')) {
    return { raw, donationId: null, token: trimmed, action: 'pickup' };
  }

  // 6. Fallback: treat non-empty string as candidate donationId
  return {
    raw,
    donationId: trimmed,
    action: 'pickup',
  };
}

export const VolunteerQRScannerModal: React.FC<VolunteerQRScannerModalProps> = ({
  isOpen,
  onClose,
  donations,
  onPickupVerified,
}) => {
  const { currentUser, userProfile } = useAuth();
  const { t } = useLanguage();

  const [cameraActive, setCameraActive] = useState<boolean>(false);
  const [cameraError, setCameraError] = useState<string | null>(null);
  const [torchOn, setTorchOn] = useState<boolean>(false);
  const [hasTorch, setHasTorch] = useState<boolean>(false);

  // Scanning & Detection State
  const [scanning, setScanning] = useState<boolean>(true);
  const [detectedData, setDetectedData] = useState<ParsedQRResult | null>(null);
  const [matchedDonation, setMatchedDonation] = useState<Donation | null>(null);
  const [loadingDonation, setLoadingDonation] = useState<boolean>(false);

  // Verification Processing State
  const [manualPin, setManualPin] = useState<string>('');
  const [verifying, setVerifying] = useState<boolean>(false);
  const [verificationSuccess, setVerificationSuccess] = useState<string | null>(null);
  const [verificationError, setVerificationError] = useState<string | null>(null);

  // DOM references
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const animationFrameRef = useRef<number | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  // Sound feedback on successful scan
  const playBeep = () => {
    try {
      if (typeof window !== 'undefined' && 'AudioContext' in window) {
        const audioCtx = new (window.AudioContext || (window as any).webkitAudioContext)();
        const osc = audioCtx.createOscillator();
        const gain = audioCtx.createGain();
        osc.type = 'sine';
        osc.frequency.setValueAtTime(880, audioCtx.currentTime); // High pitch A5
        gain.gain.setValueAtTime(0.15, audioCtx.currentTime);
        gain.gain.exponentialRampToValueAtTime(0.001, audioCtx.currentTime + 0.15);
        osc.connect(gain);
        gain.connect(audioCtx.destination);
        osc.start();
        osc.stop(audioCtx.currentTime + 0.15);
      }
      if (typeof navigator !== 'undefined' && 'vibrate' in navigator) {
        navigator.vibrate([100, 50, 100]);
      }
    } catch {
      // Audio not permitted without interaction, ignore
    }
  };

  // Start Camera Stream
  const startCamera = async () => {
    setCameraError(null);
    setCameraActive(false);

    try {
      if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
        throw new Error('Camera access API is not supported in this browser environment.');
      }

      const stream = await navigator.mediaDevices.getUserMedia({
        video: {
          facingMode: { ideal: 'environment' },
          width: { ideal: 1280 },
          height: { ideal: 720 },
        },
        audio: false,
      });

      streamRef.current = stream;

      // Check if torch/flashlight is supported
      const track = stream.getVideoTracks()[0];
      if (track && typeof track.getCapabilities === 'function') {
        const capabilities: any = track.getCapabilities();
        if (capabilities && capabilities.torch) {
          setHasTorch(true);
        }
      }

      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        videoRef.current.setAttribute('playsinline', 'true');
        await videoRef.current.play();
        setCameraActive(true);
        startScanningLoop();
      }
    } catch (err: any) {
      console.warn('[VolunteerQRScanner] Camera stream initialization failed:', err);
      setCameraActive(false);
      let msg = 'Camera access was blocked or is unavailable.';
      if (err.name === 'NotAllowedError' || err.name === 'PermissionDeniedError') {
        msg = 'Camera permission denied. Please allow camera access in your browser or upload an image of the donor screen.';
      } else if (err.name === 'NotFoundError' || err.name === 'DevicesNotFoundError') {
        msg = 'No camera device found on this system. You can upload a photo of the donor screen below.';
      }
      setCameraError(msg);
    }
  };

  // Stop Camera Stream
  const stopCamera = () => {
    if (animationFrameRef.current) {
      cancelAnimationFrame(animationFrameRef.current);
      animationFrameRef.current = null;
    }
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((track) => track.stop());
      streamRef.current = null;
    }
    if (videoRef.current) {
      videoRef.current.srcObject = null;
    }
    setCameraActive(false);
    setTorchOn(false);
  };

  // Toggle Torch/Flashlight
  const toggleTorch = async () => {
    if (!streamRef.current) return;
    const track = streamRef.current.getVideoTracks()[0];
    if (track && typeof track.applyConstraints === 'function') {
      try {
        const nextTorch = !torchOn;
        await track.applyConstraints({
          advanced: [{ torch: nextTorch } as any],
        });
        setTorchOn(nextTorch);
      } catch (err) {
        console.warn('Torch toggle failed:', err);
      }
    }
  };

  // Continuous Camera Frame Processing via jsQR
  const startScanningLoop = () => {
    const scanFrame = () => {
      if (!videoRef.current || videoRef.current.readyState < 2) {
        animationFrameRef.current = requestAnimationFrame(scanFrame);
        return;
      }

      const video = videoRef.current;
      const canvas = canvasRef.current || document.createElement('canvas');
      const ctx = canvas.getContext('2d', { willReadFrequently: true });

      if (ctx && video.videoWidth > 0 && video.videoHeight > 0) {
        canvas.width = video.videoWidth;
        canvas.height = video.videoHeight;
        ctx.drawImage(video, 0, 0, canvas.width, canvas.height);

        const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
        const code = jsQR(imageData.data, imageData.width, imageData.height, {
          inversionAttempts: 'dontInvert',
        });

        if (code && code.data) {
          handleSuccessfulQrRead(code.data);
          return; // pause loop once detected
        }
      }

      animationFrameRef.current = requestAnimationFrame(scanFrame);
    };

    animationFrameRef.current = requestAnimationFrame(scanFrame);
  };

  // Handle Photo/Screenshot File Upload Fallback
  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setVerificationError(null);
    const reader = new FileReader();
    reader.onload = () => {
      const img = new Image();
      img.onload = () => {
        const canvas = document.createElement('canvas');
        canvas.width = img.width;
        canvas.height = img.height;
        const ctx = canvas.getContext('2d');
        if (ctx) {
          ctx.drawImage(img, 0, 0);
          const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
          const code = jsQR(imageData.data, imageData.width, imageData.height);
          if (code && code.data) {
            handleSuccessfulQrRead(code.data);
          } else {
            setVerificationError('No valid QR code was detected in the uploaded image. Please try a clearer screenshot.');
          }
        }
      };
      img.src = reader.result as string;
    };
    reader.readAsDataURL(file);
  };

  // Process Scanned QR Code
  const handleSuccessfulQrRead = async (rawCode: string) => {
    playBeep();
    setScanning(false);
    stopCamera();

    const parsed = parseDonationQR(rawCode, donations);
    setDetectedData(parsed);

    if (parsed.pin) {
      setManualPin(parsed.pin);
    }

    // Identify donation from known array or fetch from Firestore
    if (parsed.donationId) {
      setLoadingDonation(true);
      const foundInProps = donations.find((d) => d.id === parsed.donationId);
      if (foundInProps) {
        setMatchedDonation(foundInProps);
        setLoadingDonation(false);
        // Automatically trigger pickup verification if token is present
        if (parsed.token) {
          executePickupVerification(foundInProps, parsed.token);
        }
      } else {
        try {
          const fetched = await getDonation(parsed.donationId);
          if (fetched) {
            setMatchedDonation(fetched);
            if (parsed.token) {
              executePickupVerification(fetched, parsed.token);
            }
          } else {
            setVerificationError(`Donation #${parsed.donationId} was not found in the rescue database.`);
          }
        } catch (err: any) {
          setVerificationError(`Failed to load donation details: ${err.message}`);
        } finally {
          setLoadingDonation(false);
        }
      }
    } else if (parsed.token) {
      // Only token was provided: search donations for verification record or match
      setVerificationError('Verification token scanned without donation ID. Please confirm the donation.');
    } else {
      setVerificationError('Scanned QR code does not contain a recognized ResQBite donation ID.');
    }
  };

  // Execute 'pickup' verification flow
  const executePickupVerification = async (donation: Donation, tokenOrPinToUse?: string) => {
    if (!currentUser) return;
    setVerifying(true);
    setVerificationError(null);
    setVerificationSuccess(null);

    const actorName =
      userProfile?.displayName || currentUser.email?.split('@')[0] || 'Volunteer Courier';

    try {
      // 1. Check if token or PIN is provided
      const verificationCode = (tokenOrPinToUse || manualPin || detectedData?.token || detectedData?.pin || '').trim();

      if (verificationCode) {
        // Submit via server-side verification endpoint
        const res = await verifyPickupWithToken(
          donation.id,
          verificationCode,
          currentUser.uid,
          actorName
        );

        if (res.success) {
          setVerificationSuccess(res.message || 'Pickup successfully verified! Food is now marked as in transit.');
          onPickupVerified(donation.id);
        } else {
          setVerificationError(res.message || 'Pickup verification code was rejected.');
        }
      } else {
        setVerificationError('Please enter the 6-digit Pickup PIN shown on the donor\'s screen or scan their pickup QR code.');
      }
    } catch (err: any) {
      console.error('[VolunteerQRScanner] Error executing pickup verification:', err);
      setVerificationError(err.message || 'An unexpected error occurred during pickup verification.');
    } finally {
      setVerifying(false);
    }
  };

  // Reset Scanner to scan again
  const handleResetScan = () => {
    setDetectedData(null);
    setMatchedDonation(null);
    setVerificationSuccess(null);
    setVerificationError(null);
    setManualPin('');
    setScanning(true);
    startCamera();
  };

  // Lifecycle
  useEffect(() => {
    if (isOpen) {
      setScanning(true);
      setDetectedData(null);
      setMatchedDonation(null);
      setVerificationSuccess(null);
      setVerificationError(null);
      setManualPin('');
      startCamera();
    } else {
      stopCamera();
    }
    return () => {
      stopCamera();
    };
  }, [isOpen]);

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 overflow-y-auto bg-stone-900/70 backdrop-blur-xs flex items-center justify-center p-4">
      <div className="bg-white rounded-3xl max-w-lg w-full shadow-2xl border border-stone-200 overflow-hidden flex flex-col max-h-[92vh] animate-in fade-in zoom-in-95 duration-200">
        {/* Header */}
        <div className="bg-gradient-to-r from-emerald-800 to-teal-900 px-6 py-4 text-white flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-2xl bg-white/10 flex items-center justify-center text-emerald-300">
              <QrCode className="w-5 h-5" />
            </div>
            <div>
              <h2 className="font-bold text-base leading-tight">
                Scan Donor Display Screen
              </h2>
              <p className="text-xs text-emerald-200">
                Volunteer Courier Pickup Verification
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-2 rounded-xl text-emerald-200 hover:text-white hover:bg-white/10 transition-colors cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Modal Body */}
        <div className="p-6 overflow-y-auto space-y-5 text-sm">
          {scanning ? (
            /* CAMERA SCANNING VIEW */
            <div className="space-y-4">
              <div className="relative rounded-2xl overflow-hidden bg-black aspect-video sm:aspect-square flex items-center justify-center shadow-inner">
                <video
                  ref={videoRef}
                  className="w-full h-full object-cover"
                  playsInline
                  autoPlay
                  muted
                />
                <canvas ref={canvasRef} className="hidden" />

                {/* Viewfinder Overlay with Reticle & Laser */}
                {cameraActive && (
                  <div className="absolute inset-0 pointer-events-none flex items-center justify-center p-8">
                    <div className="relative w-48 h-48 sm:w-60 sm:h-60 border-2 border-emerald-400/80 rounded-2xl shadow-lg">
                      {/* Corner Target Markers */}
                      <div className="absolute -top-1 -left-1 w-5 h-5 border-t-4 border-l-4 border-emerald-400 rounded-tl-md" />
                      <div className="absolute -top-1 -right-1 w-5 h-5 border-t-4 border-r-4 border-emerald-400 rounded-tr-md" />
                      <div className="absolute -bottom-1 -left-1 w-5 h-5 border-b-4 border-l-4 border-emerald-400 rounded-bl-md" />
                      <div className="absolute -bottom-1 -right-1 w-5 h-5 border-b-4 border-r-4 border-emerald-400 rounded-br-md" />

                      {/* Animated Laser Scanning Line */}
                      <div className="absolute inset-x-0 h-0.5 bg-gradient-to-r from-transparent via-emerald-300 to-transparent shadow-[0_0_8px_rgba(52,211,153,0.8)] animate-bounce" />
                    </div>
                  </div>
                )}

                {/* Controls overlay */}
                {cameraActive && (
                  <div className="absolute bottom-3 inset-x-3 flex items-center justify-between text-xs text-white">
                    <span className="bg-black/60 backdrop-blur-xs px-3 py-1 rounded-full text-[11px] font-medium">
                      Align QR code inside box
                    </span>
                    {hasTorch && (
                      <button
                        type="button"
                        onClick={toggleTorch}
                        className={`p-2 rounded-full backdrop-blur-xs transition-colors cursor-pointer ${
                          torchOn ? 'bg-amber-500 text-stone-900' : 'bg-black/60 text-white hover:bg-black/80'
                        }`}
                        title="Toggle Flashlight"
                      >
                        <Flashlight className="w-4 h-4" />
                      </button>
                    )}
                  </div>
                )}

                {/* Fallback state when camera fails or is loading */}
                {!cameraActive && (
                  <div className="p-6 text-center text-stone-300 space-y-3">
                    {cameraError ? (
                      <>
                        <AlertTriangle className="w-10 h-10 mx-auto text-amber-400" />
                        <p className="text-xs text-amber-200">{cameraError}</p>
                      </>
                    ) : (
                      <>
                        <Loader2 className="w-8 h-8 animate-spin mx-auto text-emerald-400" />
                        <p className="text-xs text-stone-400">Initializing camera feed...</p>
                      </>
                    )}
                  </div>
                )}
              </div>

              {/* Upload image / Screenshot fallback */}
              <div className="flex flex-col sm:flex-row items-center gap-2 pt-1">
                <button
                  type="button"
                  onClick={() => fileInputRef.current?.click()}
                  className="w-full sm:w-auto flex-1 py-2.5 px-4 bg-stone-100 hover:bg-stone-200 text-stone-700 rounded-xl font-bold text-xs flex items-center justify-center gap-2 transition-colors cursor-pointer"
                >
                  <Upload className="w-4 h-4 text-emerald-600" />
                  <span>Upload Donor Screen Photo</span>
                </button>
                <input
                  ref={fileInputRef}
                  type="file"
                  accept="image/*"
                  onChange={handleFileUpload}
                  className="hidden"
                />
                {!cameraActive && (
                  <button
                    type="button"
                    onClick={startCamera}
                    className="w-full sm:w-auto py-2.5 px-4 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl font-bold text-xs flex items-center justify-center gap-2 transition-colors cursor-pointer"
                  >
                    <RefreshCw className="w-4 h-4" />
                    <span>Retry Camera</span>
                  </button>
                )}
              </div>

              <div className="p-3 bg-emerald-50/70 border border-emerald-200 rounded-2xl text-[11px] text-emerald-900 flex items-start gap-2">
                <ShieldCheck className="w-4 h-4 text-emerald-600 shrink-0 mt-0.5" />
                <span>
                  <strong>Tip:</strong> Ask the donor to open the donation on their phone screen and show the Pickup Handover QR Code. The scanner will instantly detect the donation ID and trigger the pickup verification flow.
                </span>
              </div>
            </div>
          ) : (
            /* SCANNED RESULT & PICKUP VERIFICATION TRIGGER VIEW */
            <div className="space-y-4">
              {/* Scan Successful Badge */}
              <div className="p-3 bg-emerald-50 border border-emerald-200 rounded-2xl flex items-center gap-3">
                <div className="w-8 h-8 rounded-xl bg-emerald-600 text-white flex items-center justify-center shrink-0">
                  <CheckCircle2 className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="font-bold text-xs text-emerald-950">
                    Donor Screen Scanned Successfully!
                  </h3>
                  <p className="text-[11px] text-emerald-800 font-mono">
                    Donation ID: {detectedData?.donationId || 'Verified via Token'}
                  </p>
                </div>
              </div>

              {/* Matched Donation Information Card */}
              {loadingDonation ? (
                <div className="py-8 text-center space-y-2">
                  <Loader2 className="w-6 h-6 animate-spin mx-auto text-emerald-600" />
                  <p className="text-xs text-stone-500">Retrieving donation record...</p>
                </div>
              ) : matchedDonation ? (
                <div className="bg-stone-50 border border-stone-200 rounded-2xl p-4 space-y-3">
                  <div className="flex items-start justify-between gap-2">
                    <div>
                      <span className="text-[10px] font-bold uppercase tracking-wider text-emerald-700 bg-emerald-100 px-2 py-0.5 rounded-full inline-block mb-1">
                        Status: {matchedDonation.status.replace('_', ' ').toUpperCase()}
                      </span>
                      <h4 className="text-sm font-extrabold text-stone-900">
                        {matchedDonation.foodName}
                      </h4>
                      <p className="text-xs text-stone-600">
                        {matchedDonation.quantity} {matchedDonation.unit} • Donor: {matchedDonation.donorName}
                      </p>
                    </div>
                  </div>

                  <div className="text-xs text-stone-500 space-y-1 pt-2 border-t border-stone-200">
                    <div className="flex items-center gap-1.5">
                      <MapPin className="w-3.5 h-3.5 text-emerald-600 shrink-0" />
                      <span className="truncate">{matchedDonation.pickupAddress}</span>
                    </div>
                    <div className="flex items-center gap-1.5">
                      <Clock className="w-3.5 h-3.5 text-stone-400 shrink-0" />
                      <span>Deadline: {matchedDonation.pickupDeadline}</span>
                    </div>
                  </div>
                </div>
              ) : null}

              {/* Status Alert or Error Message */}
              {verificationError && (
                <div className="p-3 bg-red-50 border border-red-200 rounded-xl text-red-800 text-xs flex items-start gap-2">
                  <AlertTriangle className="w-4 h-4 text-red-600 shrink-0 mt-0.5" />
                  <span>{verificationError}</span>
                </div>
              )}

              {/* Success Confirmation Banner */}
              {verificationSuccess && (
                <div className="p-4 bg-emerald-100 border border-emerald-300 rounded-2xl text-emerald-950 text-xs space-y-1">
                  <div className="flex items-center gap-2 font-bold text-sm text-emerald-900">
                    <PackageCheck className="w-5 h-5 text-emerald-700" />
                    <span>Pickup Handover Verified!</span>
                  </div>
                  <p>{verificationSuccess}</p>
                </div>
              )}

              {/* Verification Action Form */}
              {!verificationSuccess && matchedDonation && (
                <div className="space-y-3 pt-1">
                  {/* Optional PIN input if donor displayed 6-digit PIN */}
                  <div>
                    <label className="block text-xs font-bold text-stone-700 mb-1 flex items-center gap-1.5">
                      <KeyRound className="w-3.5 h-3.5 text-emerald-600" />
                      <span>6-Digit Verification PIN (from Donor Screen):</span>
                    </label>
                    <input
                      type="text"
                      value={manualPin}
                      onChange={(e) => setManualPin(e.target.value)}
                      placeholder="e.g. 123456 or leave blank for 1-tap courier pickup"
                      className="w-full px-3.5 py-2.5 text-sm font-mono border border-stone-300 rounded-xl focus:ring-2 focus:ring-emerald-500 focus:outline-hidden"
                    />
                  </div>

                  <button
                    type="button"
                    onClick={() => executePickupVerification(matchedDonation)}
                    disabled={verifying}
                    className="w-full py-3 bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-xs sm:text-sm rounded-xl shadow-xs transition-colors flex items-center justify-center gap-2 cursor-pointer disabled:opacity-50"
                  >
                    {verifying ? (
                      <>
                        <Loader2 className="w-4 h-4 animate-spin" />
                        <span>Verifying Pickup Handover...</span>
                      </>
                    ) : (
                      <>
                        <PackageCheck className="w-4 h-4" />
                        <span>Confirm Verified Food Pickup</span>
                      </>
                    )}
                  </button>
                </div>
              )}

              {/* Rescan / Reset Button */}
              <div className="pt-2 flex items-center justify-between">
                <button
                  type="button"
                  onClick={handleResetScan}
                  className="text-xs font-bold text-emerald-700 hover:text-emerald-800 flex items-center gap-1.5 cursor-pointer"
                >
                  <RefreshCw className="w-3.5 h-3.5" />
                  <span>Scan Another Donor Screen</span>
                </button>
                {verificationSuccess && (
                  <button
                    type="button"
                    onClick={onClose}
                    className="px-4 py-2 bg-emerald-700 text-white rounded-xl text-xs font-bold hover:bg-emerald-800 transition-colors cursor-pointer"
                  >
                    Done & View In-Transit Deliveries
                  </button>
                )}
              </div>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="bg-stone-50 px-6 py-3 border-t border-stone-100 flex items-center justify-between">
          <div className="text-[11px] text-stone-500 flex items-center gap-1">
            <ShieldCheck className="w-3.5 h-3.5 text-emerald-600" />
            <span>ResQBite Courier Verification Engine</span>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-1.5 bg-stone-200 hover:bg-stone-300 text-stone-700 rounded-xl text-xs font-semibold transition-colors cursor-pointer"
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
};
