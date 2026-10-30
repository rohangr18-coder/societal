import React, { useState } from 'react';
import {
  CheckCircle2,
  Clock,
  Package,
  Building2,
  Bike,
  ChevronDown,
  ChevronUp,
  AlertTriangle,
  Radio,
  Sparkles,
  MapPin,
  Calendar,
  Check,
} from 'lucide-react';
import { Donation, DonationStatus, TimelineEntry } from '../types';

interface RescueTimelineProps {
  donation: Donation;
  className?: string;
}

type StageStatus = 'completed' | 'current' | 'pending' | 'cancelled';

interface TimelineStage {
  id: 'posted' | 'claimed' | 'in_transit' | 'delivered';
  title: string;
  shortLabel: string;
  description: string;
  icon: React.ReactNode;
  status: StageStatus;
  timestamp?: string;
  actor?: string;
  details?: string;
  notes?: string[];
}

export const RescueTimeline: React.FC<RescueTimelineProps> = ({ donation, className = '' }) => {
  const [showDetailedLog, setShowDetailedLog] = useState(false);

  const status = donation.status;
  const isCancelled = status === 'cancelled';
  const isExpired = status === 'expired';

  // Helper to extract timeline timestamps and notes for each stage
  const getStageTimelineInfo = (targetStatuses: DonationStatus[]) => {
    if (!donation.timeline || donation.timeline.length === 0) return null;
    const matches = donation.timeline.filter((entry) => targetStatuses.includes(entry.status));
    if (matches.length === 0) return null;
    const latest = matches[matches.length - 1];
    return {
      timestamp: latest.timestamp,
      actor: latest.actorName,
      note: latest.note,
      allNotes: matches.map((m) => m.note).filter(Boolean) as string[],
    };
  };

  const postedInfo = getStageTimelineInfo(['available']);
  const claimedInfo = getStageTimelineInfo(['requested', 'accepted', 'scheduled']);
  const inTransitInfo = getStageTimelineInfo(['picked_up', 'in_transit']);
  const deliveredInfo = getStageTimelineInfo(['delivered', 'completed']);

  // Determine stage statuses
  // Stage 1: Posted
  const postedStatus: StageStatus = 'completed';

  // Stage 2: Claimed
  let claimedStatus: StageStatus = 'pending';
  if (['accepted', 'scheduled', 'picked_up', 'in_transit', 'delivered', 'completed'].includes(status)) {
    claimedStatus = 'completed';
  } else if (status === 'requested') {
    claimedStatus = 'current';
  } else if (isCancelled || isExpired) {
    claimedStatus = donation.assignedNgoId ? 'completed' : 'cancelled';
  }

  // Stage 3: In Transit
  let inTransitStatus: StageStatus = 'pending';
  if (['delivered', 'completed'].includes(status)) {
    inTransitStatus = 'completed';
  } else if (['picked_up', 'in_transit'].includes(status)) {
    inTransitStatus = 'current';
  } else if (isCancelled) {
    inTransitStatus = 'cancelled';
  }

  // Stage 4: Delivered
  let deliveredStatus: StageStatus = 'pending';
  if (['delivered', 'completed'].includes(status)) {
    deliveredStatus = 'completed';
  } else if (isCancelled || isExpired) {
    deliveredStatus = 'cancelled';
  }

  // Construct stages data
  const stages: TimelineStage[] = [
    {
      id: 'posted',
      title: 'Posted',
      shortLabel: '1. Food Donation Posted',
      description: `Surplus food listed by ${donation.donorName}`,
      icon: <Package className="w-4 h-4" />,
      status: postedStatus,
      timestamp: postedInfo?.timestamp || donation.createdAt,
      actor: donation.donorName,
      details: `${donation.quantity} ${donation.unit} (${donation.category})`,
      notes: postedInfo?.allNotes,
    },
    {
      id: 'claimed',
      title: 'Claimed',
      shortLabel: '2. Claimed & Assigned',
      description: donation.assignedNgoName
        ? `Claimed by ${donation.assignedNgoName}`
        : 'Awaiting NGO partner or volunteer courier claim',
      icon: <Building2 className="w-4 h-4" />,
      status: claimedStatus,
      timestamp: claimedInfo?.timestamp || donation.acceptedAt,
      actor: donation.assignedNgoName || (status === 'requested' ? 'NGO Partner' : undefined),
      details: donation.assignedVolunteerName
        ? `Courier: ${donation.assignedVolunteerName}`
        : donation.assignedNgoName
        ? 'Assigned to verified community shelter'
        : 'Open for nearby organizations',
      notes: claimedInfo?.allNotes,
    },
    {
      id: 'in_transit',
      title: 'In Transit',
      shortLabel: '3. Picked Up & En Route',
      description: donation.assignedVolunteerName
        ? `Handover verified • ${donation.assignedVolunteerName} en route`
        : 'Volunteer courier collection & transport to shelter',
      icon: <Bike className="w-4 h-4" />,
      status: inTransitStatus,
      timestamp: inTransitInfo?.timestamp || donation.pickedUpAt,
      actor: donation.assignedVolunteerName,
      details:
        inTransitStatus === 'current'
          ? 'Live GPS tracking active — food safely en route'
          : inTransitStatus === 'completed'
          ? 'Pickup successfully completed from donor'
          : 'Pending physical pickup from donor address',
      notes: inTransitInfo?.allNotes,
    },
    {
      id: 'delivered',
      title: 'Delivered',
      shortLabel: '4. Delivered to Shelter',
      description:
        deliveredStatus === 'completed'
          ? 'Delivered to shelter and verified with recipient handover code'
          : 'Safe delivery confirmation & community meal impact',
      icon: <CheckCircle2 className="w-4 h-4" />,
      status: deliveredStatus,
      timestamp: deliveredInfo?.timestamp || donation.deliveredAt || donation.completedAt,
      actor: donation.assignedNgoName,
      details:
        deliveredStatus === 'completed'
          ? `Impact logged: ≈ ${donation.servings || donation.quantity * 2} meals rescued`
          : `Destination: ${donation.dropoffAddress || donation.assignedNgoName || 'Verified Shelter'}`,
      notes: deliveredInfo?.allNotes,
    },
  ];

  // Calculate vertical progress percentage based on active status
  let progressPercentage = 0;
  if (deliveredStatus === 'completed') {
    progressPercentage = 100;
  } else if (inTransitStatus === 'current') {
    progressPercentage = 70;
  } else if (claimedStatus === 'completed') {
    progressPercentage = 42;
  } else if (claimedStatus === 'current') {
    progressPercentage = 25;
  } else {
    // Only posted
    progressPercentage = 8;
  }

  // Format date helper
  const formatTime = (isoString?: string) => {
    if (!isoString) return null;
    try {
      const date = new Date(isoString);
      return date.toLocaleString([], {
        month: 'short',
        day: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
      });
    } catch {
      return isoString;
    }
  };

  return (
    <div className={`bg-white rounded-2xl border border-stone-200/90 p-5 shadow-2xs space-y-4 ${className}`}>
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-2 pb-3 border-b border-stone-100">
        <div className="flex items-center gap-2">
          <div className="w-7 h-7 rounded-xl bg-emerald-100 text-emerald-800 flex items-center justify-center">
            <Radio className="w-4 h-4 text-emerald-700 animate-pulse" />
          </div>
          <div>
            <h3 className="font-extrabold text-stone-900 text-sm tracking-tight flex items-center gap-2">
              Rescue Timeline
              <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-emerald-50 text-emerald-800 border border-emerald-200 uppercase tracking-wider">
                Live Tracking
              </span>
            </h3>
            <p className="text-[11px] text-stone-500">
              Vertical progress tracking from Posted to Claimed and Delivered
            </p>
          </div>
        </div>

        {/* Status Badge */}
        <div className="flex items-center gap-2">
          <span
            className={`text-xs font-bold px-3 py-1 rounded-xl uppercase tracking-wider ${
              status === 'delivered' || status === 'completed'
                ? 'bg-emerald-100 text-emerald-900 border border-emerald-300'
                : status === 'in_transit' || status === 'picked_up'
                ? 'bg-blue-100 text-blue-900 border border-blue-300'
                : status === 'accepted' || status === 'scheduled' || status === 'requested'
                ? 'bg-amber-100 text-amber-900 border border-amber-300'
                : isCancelled
                ? 'bg-red-100 text-red-900 border border-red-300'
                : 'bg-emerald-50 text-emerald-800 border border-emerald-200'
            }`}
          >
            {status.replace('_', ' ')}
          </span>
        </div>
      </div>

      {/* Vertical Progress Bar Container */}
      <div className="relative pl-9 sm:pl-10 py-1 space-y-6">
        {/* Continuous Background Vertical Track */}
        <div
          className="absolute left-[18px] sm:left-[20px] top-4 bottom-4 w-1 bg-stone-200 rounded-full -translate-x-1/2"
          aria-hidden="true"
        />

        {/* Dynamic Colored Vertical Progress Bar */}
        <div
          className="absolute left-[18px] sm:left-[20px] top-4 w-1 bg-gradient-to-b from-emerald-500 via-teal-500 to-emerald-600 rounded-full -translate-x-1/2 transition-all duration-700 ease-in-out"
          style={{ height: `${progressPercentage}%` }}
          aria-hidden="true"
        />

        {/* Timeline Stages */}
        {stages.map((stage, index) => {
          const isCompleted = stage.status === 'completed';
          const isCurrent = stage.status === 'current';
          const isPending = stage.status === 'pending';

          return (
            <div key={stage.id} className="relative group">
              {/* Step Node Circle centered precisely on the vertical track */}
              <div
                className={`absolute -left-9 sm:-left-10 top-0.5 w-8 h-8 rounded-full flex items-center justify-center font-bold text-xs transition-all shadow-xs ${
                  isCompleted
                    ? 'bg-emerald-600 text-white ring-4 ring-emerald-100 border-2 border-white'
                    : isCurrent
                    ? 'bg-amber-500 text-white ring-4 ring-amber-100 border-2 border-white animate-pulse'
                    : 'bg-stone-100 text-stone-400 border-2 border-stone-300 ring-4 ring-stone-50'
                }`}
                aria-label={`Stage ${stage.title}: ${stage.status}`}
              >
                {isCompleted ? (
                  <Check className="w-4 h-4 stroke-[3]" />
                ) : isCurrent ? (
                  <Clock className="w-4 h-4 animate-spin-slow" />
                ) : (
                  <span className="text-[11px] font-extrabold">{index + 1}</span>
                )}
              </div>

              {/* Stage Card Content */}
              <div
                className={`p-3.5 rounded-2xl border transition-all ${
                  isCurrent
                    ? 'bg-amber-50/50 border-amber-200 shadow-2xs'
                    : isCompleted
                    ? 'bg-stone-50/80 border-stone-200/80 hover:bg-stone-50'
                    : 'bg-white border-dashed border-stone-200 opacity-75'
                }`}
              >
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-1 mb-1">
                  <div className="flex items-center gap-2">
                    <span
                      className={`text-xs font-extrabold tracking-tight ${
                        isCompleted
                          ? 'text-stone-900'
                          : isCurrent
                          ? 'text-amber-950'
                          : 'text-stone-500'
                      }`}
                    >
                      {stage.title}
                    </span>

                    {/* Stage Status Tag */}
                    <span
                      className={`text-[10px] font-bold px-2 py-0.5 rounded-full uppercase tracking-wider ${
                        isCompleted
                          ? 'bg-emerald-100 text-emerald-800'
                          : isCurrent
                          ? 'bg-amber-100 text-amber-900 font-extrabold animate-pulse'
                          : 'bg-stone-200 text-stone-600'
                      }`}
                    >
                      {isCompleted ? 'Completed' : isCurrent ? 'Active Now' : 'Pending'}
                    </span>
                  </div>

                  {stage.timestamp && (
                    <span className="text-[11px] font-medium text-stone-500 flex items-center gap-1">
                      <Clock className="w-3 h-3 text-stone-400" />
                      {formatTime(stage.timestamp)}
                    </span>
                  )}
                </div>

                <p className="text-xs text-stone-600 font-medium leading-relaxed">
                  {stage.description}
                </p>

                {stage.details && (
                  <p className="text-[11px] text-stone-500 mt-1 flex items-center gap-1.5 font-medium">
                    <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 shrink-0" />
                    {stage.details}
                  </p>
                )}

                {/* Sub-notes from timeline if available */}
                {stage.notes && stage.notes.length > 0 && (
                  <div className="mt-2 pt-2 border-t border-stone-200/60 text-[11px] text-stone-500 space-y-0.5">
                    {stage.notes.map((note, nIdx) => (
                      <p key={nIdx} className="italic text-stone-600">
                        &ldquo;{note}&rdquo;
                      </p>
                    ))}
                  </div>
                )}
              </div>
            </div>
          );
        })}
      </div>

      {/* Cancellation / Expiry Alert if applicable */}
      {(isCancelled || isExpired) && (
        <div className="p-3 bg-red-50 border border-red-200 rounded-xl text-red-900 text-xs flex items-center gap-2">
          <AlertTriangle className="w-4 h-4 text-red-600 shrink-0" />
          <span className="font-semibold">
            This donation was {status === 'cancelled' ? 'cancelled' : 'marked as expired'}.
          </span>
        </div>
      )}

      {/* Detailed Activity Log Collapsible */}
      {donation.timeline && donation.timeline.length > 0 && (
        <div className="pt-2 border-t border-stone-100">
          <button
            type="button"
            onClick={() => setShowDetailedLog(!showDetailedLog)}
            className="w-full py-1.5 flex items-center justify-between text-xs font-semibold text-stone-500 hover:text-stone-800 transition-colors cursor-pointer"
          >
            <span className="flex items-center gap-1.5">
              <Clock className="w-3.5 h-3.5 text-stone-400" />
              Detailed Activity Log ({donation.timeline.length} events)
            </span>
            {showDetailedLog ? (
              <ChevronUp className="w-3.5 h-3.5 text-stone-400" />
            ) : (
              <ChevronDown className="w-3.5 h-3.5 text-stone-400" />
            )}
          </button>

          {showDetailedLog && (
            <div className="mt-2 pt-2 space-y-2 border-t border-stone-100 animate-fade-in text-xs">
              {donation.timeline.map((entry, idx) => (
                <div key={idx} className="flex items-start justify-between gap-2 p-2 rounded-xl bg-stone-50">
                  <div className="space-y-0.5">
                    <span className="font-bold text-stone-800 capitalize">
                      {entry.status.replace('_', ' ')}
                    </span>
                    <p className="text-[11px] text-stone-500">
                      {entry.actorName} {entry.note ? `• ${entry.note}` : ''}
                    </p>
                  </div>
                  <span className="text-[10px] text-stone-400 shrink-0">
                    {formatTime(entry.timestamp)}
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
};
