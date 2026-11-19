import React, { useState, useEffect, useRef, useCallback } from 'react';
import QRCode from 'qrcode';
import jsQR from 'jsqr';
import {
  X,
  QrCode,
  CheckCircle2,
  AlertTriangle,
  Loader2,
  Camera,
  KeyRound,
  ShieldCheck,
  PackageCheck,
  RefreshCw,
  Clock,
} from 'lucide-react';
import { Donation, VerificationRecord } from '../types';
import { useAuth } from '../context/AuthContext';
import {
  getOrCreateVerification,
  generateVerificationOtp,
  verifyPickupWithToken,
  verifyDeliveryWithToken,
} from '../services/dbService';
import { useLanguage } from '../context/LanguageContext';

interface QRVerificationModalProps {
  donation: Donation;
  mode: 'show_pickup' | 'scan_pickup' | 'show_delivery' | 'scan_delivery';
  isOpen: boolean;
  onClose: () => void;
  onSuccess?: () => void;
}

function formatCountdown(secondsLeft: number): string {
  const safe = Math.max(0, Math.floor(secondsLeft));
  const mins = Math.floor(safe / 60);
  const secs = safe % 60;
  return `${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}`;
}

export const QRVerificationModal: React.FC<QRVerificationModalProps> = ({
  donation,
  mode,
  isOpen,
  onClose,
  onSuccess,
}) => {
  const { currentUser, userProfile } = useAuth();
  const { t } = useLanguage();

  const [loading, setLoading] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [verificationData, setVerificationData] = useState<VerificationRecord | null>(null);
  const [qrDataUrl, setQrDataUrl] = useState<string | null>(null);

  // One-time password (OTP) display state (React state only; never persisted to storage)
  const [otpValue, setOtpValue] = useState<string | null>(null);
  const [otpExpiresAt, setOtpExpiresAt] = useState<string | null>(null);
  const [otpSecondsLeft, setOtpSecondsLeft] = useState<number>(0);
  const [otpLoading, setOtpLoading] = useState(false);
  const [otpError, setOtpError] = useState<string | null>(null);

  // Scan/manual input state
  const [otpDigits, setOtpDigits] = useState<string[]>(['', '', '', '', '', '']);
  const otpInputRefs = useRef<Array<HTMLInputElement | null>>([]);
  const [manualCode, setManualCode] = useState('');
  const [verifying, setVerifying] = useState(false);
  const [resultMsg, setResultMsg] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  // Camera video ref
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const animationFrameRef = useRef<number | null>(null);
  const [cameraActive, setCameraActive] = useState(false);

  const isShowMode = mode === 'show_pickup' || mode === 'show_delivery';
  const isPickup = mode === 'show_pickup' || mode === 'scan_pickup';
  const otpMode: 'pickup' | 'delivery' = isPickup ? 'pickup' : 'delivery';

  const stopCamera = useCallback(() => {
    if (animationFrameRef.current) {
      cancelAnimationFrame(animationFrameRef.current);
      animationFrameRef.current = null;
    }
    if (videoRef.current && videoRef.current.srcObject) {
      const stream = videoRef.current.srcObject as MediaStream;
      stream.getTracks().forEach((track) => track.stop());
      videoRef.current.srcObject = null;
    }
    setCameraActive(false);
  }, []);

  const handleGenerateOtp = useCallback(async () => {
    if (!donation?.id) return;
    setOtpLoading(true);
    setOtpError(null);
    try {
      const res = await generateVerificationOtp(donation.id, otpMode);
      setOtpValue(res.otp);
      setOtpExpiresAt(res.expiresAt);
      const remaining = Math.max(0, Math.ceil((new Date(res.expiresAt).getTime() - Date.now()) / 1000));
      setOtpSecondsLeft(remaining);
    } catch (err: any) {
      setOtpError(err?.message || 'Failed to generate OTP.');
    } finally {
      setOtpLoading(false);
    }
  }, [donation?.id, otpMode]);

  const loadShowVerification = useCallback(async () => {
    if (!donation?.id) return;
    setLoading(true);
    setLoadError(null);
    setVerificationData(null);
    setQrDataUrl(null);
    setOtpValue(null);
    setOtpExpiresAt(null);
    setOtpSecondsLeft(0);
    setOtpError(null);

    try {
      const rec = await getOrCreateVerification(donation.id);
      setVerificationData(rec);
      const tokenToDisplay = isPickup ? rec.pickupToken : rec.deliveryToken;
      const pinToDisplay = isPickup ? rec.pickupPin : rec.deliveryPin;

      // Structured QR payload with donationId, tokens, and verification parameters
      const structuredPayload = JSON.stringify({
        app: 'resqbite',
        type: isPickup ? 'pickup' : 'delivery',
        donationId: donation.id,
        token: tokenToDisplay,
        pin: pinToDisplay,
      });

      try {
        const url = await QRCode.toDataURL(structuredPayload, {
          width: 280,
          margin: 2,
          color: {
            dark: '#064e3b',
            light: '#ffffff',
          },
        });
        setQrDataUrl(url);
      } catch (err) {
        console.warn('QR code generation error:', err);
      }

      // Auto-generate a fresh one-time password once when opening in show mode
      void handleGenerateOtp();
    } catch (err: any) {
      setLoadError(err?.message || 'Failed to load verification code.');
    } finally {
      setLoading(false);
    }
  }, [donation?.id, isPickup, handleGenerateOtp]);

  // Load verification record ONLY in show_pickup / show_delivery modes (never in scan modes)
  useEffect(() => {
    if (!isOpen || !donation) {
      setOtpValue(null);
      setOtpExpiresAt(null);
      setOtpSecondsLeft(0);
      setOtpError(null);
      setLoadError(null);
      return;
    }

    setResultMsg(null);
    setManualCode('');
    setOtpDigits(['', '', '', '', '', '']);

    if (isShowMode) {
      void loadShowVerification();
    } else {
      setLoading(false);
      setLoadError(null);
      setVerificationData(null);
      setQrDataUrl(null);
    }

    return () => {
      stopCamera();
    };
  }, [isOpen, donation?.id, mode, isShowMode, loadShowVerification, stopCamera]);

  // Live 1-second OTP countdown timer
  useEffect(() => {
    if (!isOpen || !isShowMode || !otpExpiresAt) return;

    const updateTick = () => {
      const remaining = Math.max(0, Math.ceil((new Date(otpExpiresAt).getTime() - Date.now()) / 1000));
      setOtpSecondsLeft(remaining);
    };

    updateTick();
    const timer = window.setInterval(updateTick, 1000);
    return () => window.clearInterval(timer);
  }, [isOpen, isShowMode, otpExpiresAt]);

  const startCamera = async () => {
    try {
      setCameraActive(true);
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: 'environment' },
      });
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        videoRef.current.setAttribute('playsinline', 'true');
        await videoRef.current.play();
        startScanLoop();
      }
    } catch {
      setCameraActive(false);
      setResultMsg({
        type: 'error',
        text: 'Camera access denied or unavailable on this device. Please enter the 6-digit OTP or QR code manually below.',
      });
    }
  };

  const startScanLoop = () => {
    const scan = () => {
      if (!videoRef.current || videoRef.current.readyState < 2) {
        animationFrameRef.current = requestAnimationFrame(scan);
        return;
      }
      const video = videoRef.current;
      const canvas = document.createElement('canvas');
      const ctx = canvas.getContext('2d');
      if (ctx && video.videoWidth > 0 && video.videoHeight > 0) {
        canvas.width = video.videoWidth;
        canvas.height = video.videoHeight;
        ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
        const imgData = ctx.getImageData(0, 0, canvas.width, canvas.height);
        const code = jsQR(imgData.data, imgData.width, imgData.height);
        if (code && code.data) {
          let codeValue = code.data.trim();
          if (codeValue.startsWith('{') && codeValue.endsWith('}')) {
            try {
              const parsed = JSON.parse(codeValue);
              codeValue = parsed.token || parsed.pin || codeValue;
            } catch {}
          }
          setManualCode(codeValue);
          stopCamera();
          void submitVerification(codeValue);
          return;
        }
      }
      animationFrameRef.current = requestAnimationFrame(scan);
    };
    animationFrameRef.current = requestAnimationFrame(scan);
  };

  const submitVerification = async (codeToSubmit: string) => {
    if (!codeToSubmit.trim() || !currentUser || verifying) return;

    setVerifying(true);
    setResultMsg(null);

    let cleanCode = codeToSubmit.trim();
    if (cleanCode.startsWith('{') && cleanCode.endsWith('}')) {
      try {
        const parsed = JSON.parse(cleanCode);
        cleanCode = parsed.token || parsed.pin || cleanCode;
      } catch {}
    }

    const actorName = userProfile?.displayName || currentUser.email?.split('@')[0] || 'Authorized Courier';

    try {
      if (isPickup) {
        const res = await verifyPickupWithToken(
          donation.id,
          cleanCode,
          currentUser.uid,
          actorName
        );
        if (res.success) {
          setResultMsg({ type: 'success', text: res.message });
          stopCamera();
          if (onSuccess) onSuccess();
        } else {
          setResultMsg({ type: 'error', text: res.message });
        }
      } else {
        const res = await verifyDeliveryWithToken(
          donation.id,
          cleanCode,
          currentUser.uid,
          actorName
        );
        if (res.success) {
          setResultMsg({ type: 'success', text: res.message });
          stopCamera();
          if (onSuccess) onSuccess();
        } else {
          setResultMsg({ type: 'error', text: res.message });
        }
      }
    } catch (err: any) {
      setResultMsg({ type: 'error', text: err?.message || 'Verification failure' });
    } finally {
      setVerifying(false);
    }
  };

  const joinedOtp = otpDigits.join('');

  const handleOtpDigitChange = (index: number, raw: string) => {
    const digitsOnly = raw.replace(/\D/g, '');
    if (!digitsOnly) {
      const next = [...otpDigits];
      next[index] = '';
      setOtpDigits(next);
      return;
    }
    if (digitsOnly.length > 1) {
      // Handle multi-digit paste or autofill
      const next = [...otpDigits];
      for (let i = 0; i < digitsOnly.length && index + i < 6; i++) {
        next[index + i] = digitsOnly[i];
      }
      setOtpDigits(next);
      const focusIdx = Math.min(5, index + digitsOnly.length);
      otpInputRefs.current[focusIdx]?.focus();
      return;
    }
    const next = [...otpDigits];
    next[index] = digitsOnly[0];
    setOtpDigits(next);
    if (index < 5) {
      otpInputRefs.current[index + 1]?.focus();
    }
  };

  const handleOtpKeyDown = (index: number, e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Backspace' && !otpDigits[index] && index > 0) {
      otpInputRefs.current[index - 1]?.focus();
    } else if (e.key === 'ArrowLeft' && index > 0) {
      otpInputRefs.current[index - 1]?.focus();
    } else if (e.key === 'ArrowRight' && index < 5) {
      otpInputRefs.current[index + 1]?.focus();
    } else if (e.key === 'Enter' && joinedOtp.length === 6) {
      e.preventDefault();
      void submitVerification(joinedOtp);
    }
  };

  const handleOtpPaste = (e: React.ClipboardEvent<HTMLInputElement>) => {
    const pasted = e.clipboardData.getData('text').replace(/\D/g, '').slice(0, 6);
    if (!pasted) return;
    e.preventDefault();
    const next = ['', '', '', '', '', ''];
    for (let i = 0; i < pasted.length; i++) {
      next[i] = pasted[i];
    }
    setOtpDigits(next);
    otpInputRefs.current[Math.min(5, pasted.length)]?.focus();
  };

  const handleOtpSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (joinedOtp.length === 6) {
      await submitVerification(joinedOtp);
    }
  };

  const handleManualSubmit = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    await submitVerification(manualCode);
  };

  if (!isOpen) return null;

  const isOtpExpired = Boolean(otpValue && otpExpiresAt && otpSecondsLeft <= 0);
  const tokenPlaceholder = isPickup
    ? 'e.g. PKUP-A87X12BC or 6-digit OTP/PIN'
    : 'e.g. DLVR-9F4C21AB or 6-digit OTP/PIN';

  return (
    <div className="fixed inset-0 z-50 overflow-y-auto bg-stone-900/60 backdrop-blur-xs flex items-center justify-center p-4">
      <div className="bg-white rounded-3xl max-w-md w-full shadow-2xl border border-stone-200 overflow-hidden">
        {/* Header */}
        <div className="bg-gradient-to-r from-emerald-800 to-teal-900 p-5 text-white flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <div className="w-9 h-9 rounded-xl bg-white/10 flex items-center justify-center text-emerald-300">
              <QrCode className="w-5 h-5" />
            </div>
            <div>
              <h3 className="font-bold text-base leading-tight">
                {isPickup ? t('qr.pickupTitle') : t('qr.deliveryTitle')}
              </h3>
              <p className="text-xs text-emerald-200">
                {isPickup ? 'Donor & Courier Handover' : 'Shelter Receipt Confirmation'}
              </p>
            </div>
          </div>
          <button
            onClick={() => {
              stopCamera();
              onClose();
            }}
            className="p-1.5 rounded-xl hover:bg-white/10 text-emerald-200 hover:text-white transition-colors cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Content */}
        <div className="p-6">
          {loading ? (
            <div className="py-12 flex flex-col items-center justify-center gap-3">
              <Loader2 className="w-8 h-8 animate-spin text-emerald-600" />
              <p className="text-xs text-stone-500 font-medium">Loading verification code...</p>
            </div>
          ) : isShowMode ? (
            loadError ? (
              /* REAL ERROR STATE WITH RETRY (NO FAKE QR FALLBACK) */
              <div className="py-6 flex flex-col items-center text-center gap-4">
                <div className="w-12 h-12 rounded-2xl bg-red-50 border border-red-200 flex items-center justify-center text-red-600">
                  <AlertTriangle className="w-6 h-6" />
                </div>
                <div className="space-y-1">
                  <h4 className="font-bold text-sm text-stone-900">Could not load handover code</h4>
                  <p className="text-xs text-red-700 bg-red-50 border border-red-200 rounded-xl p-3 text-left">
                    {loadError}
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => void loadShowVerification()}
                  className="px-4 py-2 bg-emerald-700 hover:bg-emerald-800 text-white text-xs font-bold rounded-xl flex items-center gap-1.5 transition-colors cursor-pointer"
                >
                  <RefreshCw className="w-3.5 h-3.5" />
                  Retry
                </button>
              </div>
            ) : (
              /* DISPLAY QR CODE + ONE-TIME PASSWORD (OTP) VIEW */
              <div className="flex flex-col items-center text-center">
                <div className="p-3 bg-emerald-50/80 border-2 border-emerald-200 rounded-3xl shadow-inner mb-4">
                  {qrDataUrl ? (
                    <img
                      src={qrDataUrl}
                      alt="Handover QR Code"
                      className="w-52 h-52 rounded-2xl shadow-xs"
                    />
                  ) : (
                    <div className="w-52 h-52 flex items-center justify-center">
                      <QrCode className="w-16 h-16 text-emerald-400" />
                    </div>
                  )}
                </div>

                {/* One-time password (OTP) Card */}
                <div className="bg-emerald-50/70 border border-emerald-200 rounded-2xl p-3.5 w-full mb-3">
                  <div className="flex items-center justify-between gap-2 mb-1.5">
                    <span className="text-[11px] font-bold uppercase tracking-wider text-emerald-900 flex items-center gap-1">
                      <KeyRound className="w-3.5 h-3.5 text-emerald-700" />
                      One-time password (OTP)
                    </span>
                    {otpValue && (
                      <span
                        className={`text-[11px] font-semibold flex items-center gap-1 ${
                          isOtpExpired ? 'text-red-700' : 'text-emerald-800'
                        }`}
                      >
                        <Clock className="w-3 h-3" />
                        {isOtpExpired ? 'Expired' : `Expires in ${formatCountdown(otpSecondsLeft)}`}
                      </span>
                    )}
                  </div>

                  {otpLoading ? (
                    <div className="py-3 flex items-center justify-center gap-2 text-xs text-emerald-800">
                      <Loader2 className="w-4 h-4 animate-spin" />
                      <span>Generating 6-digit OTP...</span>
                    </div>
                  ) : otpValue ? (
                    <div className="my-1.5">
                      <div
                        className={`text-3xl font-mono font-extrabold tracking-[0.35em] pl-[0.35em] ${
                          isOtpExpired ? 'text-stone-400 line-through' : 'text-emerald-900'
                        }`}
                      >
                        {otpValue}
                      </div>
                      {isOtpExpired && (
                        <p className="text-[11px] text-red-700 font-medium mt-1">
                          This OTP has expired. Generate a new one for handover.
                        </p>
                      )}
                    </div>
                  ) : (
                    <p className="text-xs text-stone-600 my-1.5">
                      Generate a single-use 6-digit OTP to share verbally with the courier.
                    </p>
                  )}

                  {otpError && (
                    <div className="mt-2 p-2 bg-red-50 border border-red-200 rounded-lg text-[11px] text-red-800 text-left">
                      {otpError}
                    </div>
                  )}

                  <button
                    type="button"
                    onClick={() => void handleGenerateOtp()}
                    disabled={otpLoading}
                    className="mt-2.5 w-full py-2 px-3 bg-white hover:bg-emerald-100/70 border border-emerald-300 text-emerald-900 font-bold text-xs rounded-xl flex items-center justify-center gap-1.5 transition-colors cursor-pointer disabled:opacity-50"
                  >
                    <RefreshCw className={`w-3.5 h-3.5 ${otpLoading ? 'animate-spin' : ''}`} />
                    {otpValue ? 'Generate new OTP' : 'Generate OTP'}
                  </button>
                </div>

                {/* Backup Token / PIN Reference */}
                <div className="bg-stone-50 border border-stone-200 rounded-2xl p-2.5 w-full mb-3">
                  <p className="text-[11px] text-stone-500">
                    QR Code Token:{' '}
                    <code className="text-stone-800 font-mono font-semibold text-[11px]">
                      {isPickup ? verificationData?.pickupToken : verificationData?.deliveryToken}
                    </code>
                  </p>
                </div>

                <p className="text-xs text-stone-600 mb-2">
                  {isPickup ? t('qr.pickupInstruction') : t('qr.deliveryInstruction')}
                </p>

                <div className="w-full p-2.5 bg-amber-50 border border-amber-200 rounded-xl text-left flex items-start gap-2">
                  <ShieldCheck className="w-4 h-4 text-amber-700 shrink-0 mt-0.5" />
                  <p className="text-[11px] text-amber-900 leading-relaxed">
                    <strong>Replay Protection:</strong> Each QR token and 6-digit OTP is single-use and expires once confirmed on the server.
                  </p>
                </div>
              </div>
            )
          ) : (
            /* SCANNER & OTP / MANUAL VERIFICATION VIEW */
            <div className="space-y-4">
              {/* Camera Scanner Section */}
              <div>
                {cameraActive ? (
                  <div className="relative rounded-2xl overflow-hidden bg-black aspect-video mb-2">
                    <video ref={videoRef} className="w-full h-full object-cover" />
                    <button
                      type="button"
                      onClick={stopCamera}
                      className="absolute top-2 right-2 bg-black/60 text-white text-xs px-2.5 py-1 rounded-lg backdrop-blur-xs cursor-pointer"
                    >
                      Stop Camera
                    </button>
                    <div className="absolute inset-x-8 inset-y-6 border-2 border-dashed border-emerald-400 rounded-xl pointer-events-none animate-pulse" />
                  </div>
                ) : (
                  <button
                    type="button"
                    onClick={startCamera}
                    className="w-full py-3 bg-emerald-50 hover:bg-emerald-100 border border-emerald-300 rounded-2xl text-emerald-800 font-bold text-xs flex items-center justify-center gap-2 transition-colors cursor-pointer"
                  >
                    <Camera className="w-4 h-4" />
                    Open Device Camera Scanner
                  </button>
                )}
              </div>

              {/* 6-Digit Numeric OTP Entry */}
              <form onSubmit={handleOtpSubmit} className="bg-stone-50 border border-stone-200 rounded-2xl p-3.5 space-y-3">
                <label className="block text-xs font-bold text-stone-700 flex items-center gap-1.5">
                  <KeyRound className="w-3.5 h-3.5 text-emerald-600" />
                  Enter 6-Digit One-Time Password (OTP)
                </label>
                <div className="grid grid-cols-6 gap-2">
                  {otpDigits.map((digit, idx) => (
                    <input
                      key={idx}
                      ref={(el) => {
                        otpInputRefs.current[idx] = el;
                      }}
                      type="text"
                      inputMode="numeric"
                      pattern="[0-9]*"
                      autoComplete="one-time-code"
                      maxLength={1}
                      value={digit}
                      onChange={(e) => handleOtpDigitChange(idx, e.target.value)}
                      onKeyDown={(e) => handleOtpKeyDown(idx, e)}
                      onPaste={handleOtpPaste}
                      aria-label={`OTP digit ${idx + 1}`}
                      className="w-full h-11 text-center text-lg font-mono font-bold bg-white border border-stone-300 rounded-xl focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500 focus:outline-hidden"
                    />
                  ))}
                </div>
                <button
                  type="submit"
                  disabled={verifying || joinedOtp.length !== 6}
                  className="w-full py-2.5 bg-emerald-700 hover:bg-emerald-800 text-white font-bold text-xs rounded-xl shadow-xs transition-colors flex items-center justify-center gap-1.5 cursor-pointer disabled:opacity-50"
                >
                  {verifying ? (
                    <Loader2 className="w-4 h-4 animate-spin" />
                  ) : (
                    <>
                      <PackageCheck className="w-4 h-4" />
                      Verify with 6-Digit OTP
                    </>
                  )}
                </button>
              </form>

              {/* Result / Error Banner */}
              {resultMsg && (
                <div
                  className={`p-3 rounded-xl text-xs flex items-start gap-2 ${
                    resultMsg.type === 'success'
                      ? 'bg-emerald-50 border border-emerald-200 text-emerald-900'
                      : 'bg-red-50 border border-red-200 text-red-900'
                  }`}
                >
                  {resultMsg.type === 'success' ? (
                    <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0 mt-0.5" />
                  ) : (
                    <AlertTriangle className="w-4 h-4 text-red-600 shrink-0 mt-0.5" />
                  )}
                  <span>{resultMsg.text}</span>
                </div>
              )}

              {/* Existing QR Code Text / Manual Token Fallback */}
              <form onSubmit={handleManualSubmit} className="space-y-2.5 pt-1 border-t border-stone-200">
                <div>
                  <label className="block text-xs font-bold text-stone-700 mb-1.5">
                    Or enter QR code text ({isPickup ? 'PKUP-XXXXXXXX' : 'DLVR-XXXXXXXX'}) or 6-digit OTP/PIN
                  </label>
                  <input
                    type="text"
                    value={manualCode}
                    onChange={(e) => setManualCode(e.target.value)}
                    placeholder={tokenPlaceholder}
                    className="w-full px-3.5 py-2.5 text-sm font-mono border border-stone-300 rounded-xl focus:ring-2 focus:ring-emerald-500 focus:outline-hidden uppercase"
                  />
                </div>

                <button
                  type="submit"
                  disabled={verifying || !manualCode.trim()}
                  className="w-full py-2.5 bg-stone-800 hover:bg-stone-900 text-white font-bold text-xs rounded-xl shadow-xs transition-colors flex items-center justify-center gap-1.5 cursor-pointer disabled:opacity-50"
                >
                  {verifying ? (
                    <Loader2 className="w-4 h-4 animate-spin" />
                  ) : (
                    <>
                      <PackageCheck className="w-4 h-4" />
                      Confirm Verification Handover
                    </>
                  )}
                </button>
              </form>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="bg-stone-50 px-6 py-3 border-t border-stone-200 flex justify-end">
          <button
            type="button"
            onClick={() => {
              stopCamera();
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
