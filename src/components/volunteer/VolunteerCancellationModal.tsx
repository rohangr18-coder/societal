import React from 'react';
import { AlertTriangle, Loader2 } from 'lucide-react';
import { Donation } from '../../types';

export interface VolunteerCancellationModalProps {
  donation: Donation | null;
  cancelReason: string;
  setCancelReason: (reason: string) => void;
  cancelling: boolean;
  onClose: () => void;
  onConfirm: () => void;
}

export const VolunteerCancellationModal: React.FC<VolunteerCancellationModalProps> = ({
  donation,
  cancelReason,
  setCancelReason,
  cancelling,
  onClose,
  onConfirm,
}) => {
  if (!donation) return null;

  return (
    <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-xs flex items-center justify-center p-4">
      <div className="bg-white rounded-3xl max-w-md w-full p-6 shadow-2xl border border-stone-200 space-y-4">
        <div className="w-12 h-12 rounded-2xl bg-rose-100 text-rose-700 flex items-center justify-center">
          <AlertTriangle className="w-6 h-6" />
        </div>
        <div>
          <h3 className="text-lg font-bold text-stone-900">Cancel Collection Assignment?</h3>
          <p className="text-xs text-stone-500 mt-1">
            This will release <span className="font-bold text-stone-800">"{donation.foodName}"</span> back into the pool so other nearby volunteers can collect it before the deadline.
          </p>
        </div>

        <div className="space-y-1.5 text-xs">
          <label className="font-bold text-stone-700">Reason for release:</label>
          <select
            value={cancelReason}
            onChange={(e) => setCancelReason(e.target.value)}
            className="w-full p-2.5 rounded-xl border border-stone-300 bg-stone-50 text-stone-800 focus:outline-emerald-600 text-xs"
          >
            <option value="Change in schedule / Vehicle issue">Change in schedule / Vehicle issue</option>
            <option value="Traffic delay / Too far to reach before deadline">Traffic delay / Too far to reach before deadline</option>
            <option value="Donor location unreachable">Donor location unreachable</option>
            <option value="Personal emergency">Personal emergency</option>
          </select>
        </div>

        <div className="flex items-center justify-end gap-2.5 pt-2">
          <button
            onClick={onClose}
            className="px-4 py-2 rounded-xl border border-stone-300 text-stone-700 text-xs font-semibold hover:bg-stone-50 cursor-pointer"
          >
            Keep Assignment
          </button>
          <button
            onClick={onConfirm}
            disabled={cancelling}
            className="px-4 py-2 rounded-xl bg-rose-600 hover:bg-rose-700 text-white text-xs font-bold transition-colors cursor-pointer disabled:opacity-50 flex items-center gap-1.5"
          >
            {cancelling ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : null}
            <span>Confirm Release</span>
          </button>
        </div>
      </div>
    </div>
  );
};
