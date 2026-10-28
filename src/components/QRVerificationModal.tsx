import React, { useState, useEffect, useRef } from 'react';
import QRCode from 'qrcode';
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
  Truck,
  ArrowRight,
} from 'lucide-react';
import { Donation, VerificationRecord } from '../types';
import { useAuth } from '../context/AuthContext';
import {
  getOrCreateVerification,
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
  const [verificationData, setVerificationData] = useState<VerificationRecord | null>(null);
  const [qrDataUrl, setQrDataUrl] = useState<string | null>(null);
  const [manualCode, setManualCode] = useState('');
  const [verifying, setVerifying] = useState(false);
  const [resultMsg, setResultMsg] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  // Camera video ref
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const [cameraActive, setCameraActive] = useState(false);

  const isShowMode = mode === 'show_pickup' || mode === 'show_delivery';
  const isPickup = mode === 'show_pickup' || mode === 'scan_pickup';

  // Load or generate verification record
  useEffect(() => {
    if (!isOpen || !donation) return;

    setLoading(true);
    setResultMsg(null);
    setManualCode('');

    getOrCreateVerification(donation.id)
      .then(async (rec) => {
        setVerificationData(rec);
        const tokenToDisplay = isPickup ? rec.pickupToken : rec.deliveryToken;
        try {
          const url = await QRCode.toDataURL(tokenToDisplay, {
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
      })
      .catch((err) => {
        setResultMsg({ type: 'error', text: err.message || 'Error loading verification record' });
      })
      .finally(() => {
        setLoading(false);
      });

    return () => {
      stopCamera();
    };
  }, [isOpen, donation?.id, mode]);

  const stopCamera = () => {
    if (videoRef.current && videoRef.current.srcObject) {
      const stream = videoRef.current.srcObject as MediaStream;
      stream.getTracks().forEach((track) => track.stop());
      videoRef.current.srcObject = null;
    }
    setCameraActive(false);
  };

  const startCamera = async () => {
    try {
      setCameraActive(true);
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: 'environment' },
      });
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        videoRef.current.play();
      }
    } catch (err) {
      setCameraActive(false);
      setResultMsg({
        type: 'error',
        text: 'Camera access denied or unavailable on this device. Please use manual PIN verification below.',
      });
    }
  };

  const handleManualSubmit = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    if (!manualCode.trim() || !currentUser) return;

    setVerifying(true);
    setResultMsg(null);

    const actorName = userProfile?.displayName || currentUser.email?.split('@')[0] || 'Authorized Courier';

    try {
      if (isPickup) {
        const res = await verifyPickupWithToken(
          donation.id,
          manualCode.trim(),
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
          manualCode.trim(),
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
      setResultMsg({ type: 'error', text: err.message || 'Verification failure' });
    } finally {
      setVerifying(false);
    }
  };

  if (!isOpen) return null;

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
              <p className="text-xs text-stone-500 font-medium">Generating cryptographic tokens...</p>
            </div>
          ) : isShowMode ? (
            /* DISPLAY QR CODE VIEW */
            <div className="flex flex-col items-center text-center">
              <div className="p-3 bg-emerald-50/80 border-2 border-emerald-200 rounded-3xl shadow-inner mb-4">
                {qrDataUrl ? (
                  <img
                    src={qrDataUrl}
                    alt="Handover QR Code"
                    className="w-56 h-56 rounded-2xl shadow-xs"
                  />
                ) : (
                  <div className="w-56 h-56 flex items-center justify-center">
                    <QrCode className="w-16 h-16 text-emerald-400" />
                  </div>
                )}
              </div>

              <div className="bg-stone-50 border border-stone-200 rounded-2xl p-3 w-full mb-4">
                <span className="text-[11px] font-bold uppercase tracking-wider text-stone-500 block mb-1">
                  6-Digit Backup PIN
                </span>
                <span className="text-2xl font-mono font-bold tracking-widest text-emerald-800">
                  {isPickup ? verificationData?.pickupPin : verificationData?.deliveryPin}
                </span>
                <p className="text-[11px] text-stone-500 mt-1">
                  Token: <code className="text-stone-700 font-mono text-[10px]">{isPickup ? verificationData?.pickupToken : verificationData?.deliveryToken}</code>
                </p>
              </div>

              <p className="text-xs text-stone-600 mb-2">
                {isPickup ? t('qr.pickupInstruction') : t('qr.deliveryInstruction')}
              </p>

              <div className="w-full p-2.5 bg-amber-50 border border-amber-200 rounded-xl text-left flex items-start gap-2">
                <ShieldCheck className="w-4 h-4 text-amber-700 shrink-0 mt-0.5" />
                <p className="text-[11px] text-amber-900 leading-relaxed">
                  <strong>Replay Protection:</strong> This verification token is single-use and expires once confirmed on the server.
                </p>
              </div>
            </div>
          ) : (
            /* SCANNER & VERIFICATION VIEW */
            <div>
              {/* Camera Scanner Section */}
              <div className="mb-4">
                {cameraActive ? (
                  <div className="relative rounded-2xl overflow-hidden bg-black aspect-video mb-3">
                    <video ref={videoRef} className="w-full h-full object-cover" />
                    <button
                      onClick={stopCamera}
                      className="absolute top-2 right-2 bg-black/60 text-white text-xs px-2.5 py-1 rounded-lg backdrop-blur-xs"
                    >
                      Stop Camera
                    </button>
                    <div className="absolute inset-x-8 inset-y-6 border-2 border-dashed border-emerald-400 rounded-xl pointer-events-none animate-pulse" />
                  </div>
                ) : (
                  <button
                    onClick={startCamera}
                    className="w-full py-3 bg-emerald-50 hover:bg-emerald-100 border border-emerald-300 rounded-2xl text-emerald-800 font-bold text-xs flex items-center justify-center gap-2 transition-colors cursor-pointer mb-3"
                  >
                    <Camera className="w-4 h-4" />
                    Open Device Camera Scanner
                  </button>
                )}
              </div>

              {/* Manual Input Fallback */}
              <form onSubmit={handleManualSubmit} className="space-y-3">
                <div>
                  <label className="block text-xs font-bold text-stone-700 mb-1.5 flex items-center gap-1.5">
                    <KeyRound className="w-3.5 h-3.5 text-emerald-600" />
                    {t('qr.manualPin')}
                  </label>
                  <input
                    type="text"
                    value={manualCode}
                    onChange={(e) => setManualCode(e.target.value)}
                    placeholder="e.g. PKUP-A87X or 6-digit PIN"
                    className="w-full px-3.5 py-2.5 text-sm font-mono border border-stone-300 rounded-xl focus:ring-2 focus:ring-emerald-500 focus:outline-hidden uppercase"
                  />
                </div>

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

                <button
                  type="submit"
                  disabled={verifying || !manualCode.trim()}
                  className="w-full py-2.5 bg-emerald-700 hover:bg-emerald-800 text-white font-bold text-xs rounded-xl shadow-xs transition-colors flex items-center justify-center gap-1.5 cursor-pointer disabled:opacity-50"
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
