import React, { useState, useEffect, useMemo } from 'react';
import { Clock, Flame, AlertTriangle, ShieldCheck, Timer, Sparkles } from 'lucide-react';

export interface PickupCountdownTimerProps {
  pickupDeadline: string;
  collectionDeadline?: string;
  pickupDate?: string;
  timeZone?: string;
  variant?: 'banner' | 'card' | 'inline' | 'compact';
  className?: string;
  showIcon?: boolean;
}

export interface CountdownState {
  targetTimestamp: number | null;
  diffMs: number;
  totalSeconds: number;
  hours: number;
  minutes: number;
  seconds: number;
  isExpired: boolean;
  isUnder60Minutes: boolean;
  formattedTime: string;
  digitalClock: string;
  statusLabel: string;
  urgencyLevel: 'expired' | 'urgent_red' | 'caution_amber' | 'safe_green';
}

/**
 * Robust parsing for pickup deadlines across all ResQBite formats:
 * - ISO string: "2026-10-30T18:00:00"
 * - String with date & time: "2026-10-30 before 18:00 (Asia/Kolkata)"
 * - Relative string: "Today before 6:00 PM", "Tomorrow before 12:00 PM"
 * - Short string: "Today 5 PM", "Today 8:00 PM"
 */
export function parsePickupDeadline(
  pickupDeadline?: string,
  collectionDeadline?: string,
  pickupDate?: string
): number | null {
  // 1. Try collectionDeadline directly
  if (collectionDeadline) {
    const t = new Date(collectionDeadline).getTime();
    if (!isNaN(t)) return t;
  }

  if (!pickupDeadline) return null;

  // 2. Direct ISO or date string parse
  const directTime = new Date(pickupDeadline).getTime();
  if (!isNaN(directTime)) {
    return directTime;
  }

  const clean = pickupDeadline.trim();

  // 3. Match format like "2026-10-30 before 18:00" or "2026-10-30 18:00:00"
  const dateRegex = /(\d{4}-\d{2}-\d{2})/;
  const timeRegex = /(\d{1,2}):(\d{2})(?::(\d{2}))?\s*(AM|PM)?/i;

  const dateMatch = clean.match(dateRegex);
  const timeMatch = clean.match(timeRegex);

  const effectiveDate = dateMatch ? dateMatch[1] : pickupDate;

  if (effectiveDate && timeMatch) {
    let hour = parseInt(timeMatch[1], 10);
    const minute = parseInt(timeMatch[2], 10);
    const second = timeMatch[3] ? parseInt(timeMatch[3], 10) : 0;
    const ampm = timeMatch[4]?.toUpperCase();

    if (ampm === 'PM' && hour < 12) hour += 12;
    if (ampm === 'AM' && hour === 12) hour = 0;

    const isoStr = `${effectiveDate}T${String(hour).padStart(2, '0')}:${String(minute).padStart(2, '0')}:${String(second).padStart(2, '0')}`;
    const t = new Date(isoStr).getTime();
    if (!isNaN(t)) return t;
  }

  // 4. Handle "Today before 6:00 PM" or "Today 5 PM" or "Tomorrow before 12:00 PM"
  const isToday = /today/i.test(clean);
  const isTomorrow = /tomorrow/i.test(clean);

  if ((isToday || isTomorrow) && (timeMatch || /(\d{1,2})\s*(AM|PM)/i.test(clean))) {
    const now = new Date();
    if (isTomorrow) {
      now.setDate(now.getDate() + 1);
    }

    let hour = 18; // default 6 PM
    let minute = 0;

    if (timeMatch) {
      hour = parseInt(timeMatch[1], 10);
      minute = parseInt(timeMatch[2], 10);
      const ampm = timeMatch[4]?.toUpperCase();
      if (ampm === 'PM' && hour < 12) hour += 12;
      if (ampm === 'AM' && hour === 12) hour = 0;
    } else {
      const simpleMatch = clean.match(/(\d{1,2})\s*(AM|PM)/i);
      if (simpleMatch) {
        hour = parseInt(simpleMatch[1], 10);
        if (simpleMatch[2].toUpperCase() === 'PM' && hour < 12) hour += 12;
        if (simpleMatch[2].toUpperCase() === 'AM' && hour === 12) hour = 0;
      }
    }

    now.setHours(hour, minute, 0, 0);
    return now.getTime();
  }

  return null;
}

/**
 * Computes exact countdown state from target deadline and current timestamp
 */
export function computeCountdown(
  targetTimestamp: number | null,
  nowMs: number = Date.now()
): CountdownState {
  if (!targetTimestamp || isNaN(targetTimestamp)) {
    return {
      targetTimestamp: null,
      diffMs: 0,
      totalSeconds: 0,
      hours: 0,
      minutes: 0,
      seconds: 0,
      isExpired: false,
      isUnder60Minutes: false,
      formattedTime: 'Flexible Window',
      digitalClock: '--:--:--',
      statusLabel: 'No strict deadline',
      urgencyLevel: 'safe_green',
    };
  }

  const diffMs = targetTimestamp - nowMs;

  if (diffMs <= 0) {
    return {
      targetTimestamp,
      diffMs: 0,
      totalSeconds: 0,
      hours: 0,
      minutes: 0,
      seconds: 0,
      isExpired: true,
      isUnder60Minutes: true, // Expired window is under 60 mins
      formattedTime: '00m 00s (Expired)',
      digitalClock: '00:00:00',
      statusLabel: 'Collection Window Expired',
      urgencyLevel: 'expired',
    };
  }

  const totalSeconds = Math.floor(diffMs / 1000);
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;

  const totalMinutesRemaining = Math.floor(diffMs / (60 * 1000));
  // Under 60 minutes condition (< 3,600,000 ms)
  const isUnder60Minutes = diffMs < 60 * 60 * 1000;

  let formattedTime = '';
  if (hours > 0) {
    formattedTime = `${hours}h ${String(minutes).padStart(2, '0')}m ${String(seconds).padStart(2, '0')}s`;
  } else {
    formattedTime = `${minutes}m ${String(seconds).padStart(2, '0')}s`;
  }

  const digitalClock = `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;

  let statusLabel = '';
  let urgencyLevel: 'expired' | 'urgent_red' | 'caution_amber' | 'safe_green' = 'safe_green';

  if (isUnder60Minutes) {
    statusLabel = 'Urgent: Under 60 Minutes Left!';
    urgencyLevel = 'urgent_red';
  } else if (totalMinutesRemaining <= 240) {
    statusLabel = 'Pending Pickup Window (Today)';
    urgencyLevel = 'caution_amber';
  } else {
    statusLabel = 'Pickup Window Open';
    urgencyLevel = 'safe_green';
  }

  return {
    targetTimestamp,
    diffMs,
    totalSeconds,
    hours,
    minutes,
    seconds,
    isExpired: false,
    isUnder60Minutes,
    formattedTime,
    digitalClock,
    statusLabel,
    urgencyLevel,
  };
}

export const PickupCountdownTimer: React.FC<PickupCountdownTimerProps> = ({
  pickupDeadline,
  collectionDeadline,
  pickupDate,
  timeZone,
  variant = 'banner',
  className = '',
  showIcon = true,
}) => {
  // Real-time ticking timestamp state
  const [nowMs, setNowMs] = useState<number>(Date.now());

  // Interval hook updating every 1000ms
  useEffect(() => {
    const timer = setInterval(() => {
      setNowMs(Date.now());
    }, 1000);
    return () => clearInterval(timer);
  }, []);

  // Parse deadline timestamp
  const targetTimestamp = useMemo(() => {
    return parsePickupDeadline(pickupDeadline, collectionDeadline, pickupDate);
  }, [pickupDeadline, collectionDeadline, pickupDate]);

  // Compute live countdown state
  const countdown = useMemo(() => {
    return computeCountdown(targetTimestamp, nowMs);
  }, [targetTimestamp, nowMs]);

  // Color Coding: RED when under 60 minutes or expired
  const isRed = countdown.isUnder60Minutes || countdown.isExpired;

  // COMPACT / INLINE VARIANT
  if (variant === 'inline' || variant === 'compact') {
    return (
      <span
        data-testid="countdown-inline"
        className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-xl text-xs font-mono font-bold transition-colors ${
          isRed
            ? 'bg-red-100 text-red-700 border border-red-300 animate-pulse'
            : countdown.urgencyLevel === 'caution_amber'
            ? 'bg-amber-100 text-amber-800 border border-amber-300'
            : 'bg-emerald-100 text-emerald-800 border border-emerald-300'
        } ${className}`}
      >
        {showIcon && (
          isRed ? (
            <Flame className="w-3.5 h-3.5 text-red-600 animate-bounce" />
          ) : (
            <Clock className="w-3.5 h-3.5 text-stone-500" />
          )
        )}
        <span className="font-semibold">{countdown.formattedTime}</span>
      </span>
    );
  }

  // CARD VARIANT
  if (variant === 'card') {
    return (
      <div
        data-testid="countdown-card"
        className={`p-3 rounded-2xl border transition-all ${
          isRed
            ? 'bg-red-50 border-red-200 text-red-900 shadow-2xs'
            : countdown.urgencyLevel === 'caution_amber'
            ? 'bg-amber-50 border-amber-200 text-amber-900'
            : 'bg-stone-50 border-stone-200 text-stone-800'
        } ${className}`}
      >
        <div className="flex items-center justify-between text-xs mb-1">
          <span className="font-semibold text-stone-500 flex items-center gap-1">
            <Timer className="w-3.5 h-3.5 text-stone-400" />
            Time Remaining
          </span>
          {isRed && (
            <span className="bg-red-600 text-white text-[10px] uppercase font-extrabold px-1.5 py-0.2 rounded-md">
              {countdown.isExpired ? 'Expired' : '< 60m Urgency'}
            </span>
          )}
        </div>
        <div
          className={`text-xl font-mono font-extrabold tracking-tight ${
            isRed ? 'text-red-600' : 'text-stone-900'
          }`}
        >
          {countdown.digitalClock}
        </div>
        <div className="text-[11px] text-stone-500 mt-0.5">
          {countdown.formattedTime} left
        </div>
      </div>
    );
  }

  // DEFAULT HERO BANNER VARIANT
  return (
    <div
      data-testid="countdown-banner"
      className={`rounded-3xl border p-4 sm:p-5 transition-all shadow-2xs ${
        isRed
          ? 'bg-red-50/90 border-red-300 text-red-950 ring-2 ring-red-400/20'
          : countdown.urgencyLevel === 'caution_amber'
          ? 'bg-amber-50/80 border-amber-200 text-amber-950'
          : 'bg-emerald-50/70 border-emerald-200 text-emerald-950'
      } ${className}`}
    >
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        {/* Left Info Column */}
        <div className="space-y-1">
          <div className="flex items-center gap-2">
            <div
              className={`p-1.5 rounded-xl ${
                isRed
                  ? 'bg-red-200/80 text-red-700 animate-pulse'
                  : countdown.urgencyLevel === 'caution_amber'
                  ? 'bg-amber-200/70 text-amber-800'
                  : 'bg-emerald-200/70 text-emerald-800'
              }`}
            >
              {isRed ? (
                <Flame className="w-4 h-4 text-red-600" />
              ) : countdown.urgencyLevel === 'caution_amber' ? (
                <Clock className="w-4 h-4 text-amber-700" />
              ) : (
                <ShieldCheck className="w-4 h-4 text-emerald-700" />
              )}
            </div>

            <h3 className="text-xs font-bold uppercase tracking-wider">
              Time Remaining Before Expiration
            </h3>

            {isRed && (
              <span className="bg-red-600 text-white text-[10px] font-extrabold px-2 py-0.5 rounded-full uppercase tracking-wider animate-pulse">
                {countdown.isExpired ? 'Deadline Expired' : 'Under 60 Mins'}
              </span>
            )}
          </div>

          <p
            className={`text-xs ${
              isRed ? 'text-red-800 font-medium' : 'text-stone-600'
            }`}
          >
            {isRed
              ? countdown.isExpired
                ? 'This food collection deadline has passed. Please contact the donor or dispatch courier immediately.'
                : 'High Urgency: Less than 1 hour remaining before pickup expires! Expedited collection required.'
              : 'Active rescue window is currently open. Ensure collection is scheduled before the deadline.'}
          </p>
        </div>

        {/* Right Digital Countdown Display */}
        <div
          className={`flex items-center gap-2 sm:self-center px-4 py-2.5 rounded-2xl border ${
            isRed
              ? 'bg-white/90 border-red-300 shadow-xs'
              : 'bg-white/90 border-stone-200/80 shadow-2xs'
          }`}
        >
          <div className="text-center">
            <span className="text-[10px] uppercase font-bold text-stone-400 block tracking-wider">
              Countdown
            </span>
            <div
              className={`font-mono text-2xl sm:text-3xl font-extrabold tracking-tight ${
                isRed ? 'text-red-600' : 'text-stone-900'
              }`}
            >
              {countdown.digitalClock}
            </div>
            <span
              className={`text-[10px] font-semibold block ${
                isRed ? 'text-red-600' : 'text-emerald-700'
              }`}
            >
              {countdown.formattedTime} left
            </span>
          </div>
        </div>
      </div>
    </div>
  );
};
