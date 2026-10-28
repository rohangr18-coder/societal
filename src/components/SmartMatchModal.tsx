import React, { useState, useEffect } from 'react';
import {
  X,
  Sparkles,
  Building2,
  MapPin,
  CheckCircle2,
  AlertCircle,
  Loader2,
  ArrowRight,
  TrendingUp,
  ShieldCheck,
  Scale,
} from 'lucide-react';
import { Donation, Organization, SmartMatchResult } from '../types';
import { calculateSmartMatches } from '../utils/matching';
import { claimDonationByNgo, subscribeOrganizations } from '../services/dbService';
import { useAuth } from '../context/AuthContext';
import { useLanguage } from '../context/LanguageContext';

interface SmartMatchModalProps {
  donation: Donation;
  isOpen: boolean;
  onClose: () => void;
  onClaimSuccess?: () => void;
}

export const SmartMatchModal: React.FC<SmartMatchModalProps> = ({
  donation,
  isOpen,
  onClose,
  onClaimSuccess,
}) => {
  const { currentUser, userProfile, isNgo, isAdmin } = useAuth();
  const { t } = useLanguage();

  const [orgs, setOrgs] = useState<Organization[]>([]);
  const [loadingOrgs, setLoadingOrgs] = useState(true);
  const [matches, setMatches] = useState<SmartMatchResult[]>([]);
  const [claimingNgoId, setClaimingNgoId] = useState<string | null>(null);
  const [claimMessage, setClaimMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  useEffect(() => {
    if (!isOpen) return;

    setLoadingOrgs(true);
    setClaimMessage(null);

    const unsubscribe = subscribeOrganizations((list) => {
      setOrgs(list);
      const calculated = calculateSmartMatches(donation, list);
      setMatches(calculated);
      setLoadingOrgs(false);
    });

    return () => {
      unsubscribe && unsubscribe();
    };
  }, [isOpen, donation?.id]);

  const handleAssignNgo = async (ngo: Organization) => {
    if (!currentUser) return;

    setClaimingNgoId(ngo.id);
    setClaimMessage(null);

    try {
      const res = await claimDonationByNgo(
        donation.id,
        ngo.ownerUid,
        ngo.name,
        userProfile?.displayName || 'Coordinator'
      );

      if (res.success) {
        setClaimMessage({ type: 'success', text: `Assigned to ${ngo.name} successfully!` });
        if (onClaimSuccess) onClaimSuccess();
      } else {
        setClaimMessage({ type: 'error', text: res.message });
      }
    } catch (err: any) {
      setClaimMessage({ type: 'error', text: err.message || 'Error assigning NGO' });
    } finally {
      setClaimingNgoId(null);
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 overflow-y-auto bg-stone-900/60 backdrop-blur-xs flex items-center justify-center p-4">
      <div className="bg-white rounded-3xl max-w-2xl w-full shadow-2xl border border-stone-200 overflow-hidden flex flex-col max-h-[90vh]">
        {/* Header */}
        <div className="bg-gradient-to-r from-emerald-800 to-teal-900 p-5 text-white flex items-center justify-between shrink-0">
          <div className="flex items-center gap-2.5">
            <div className="w-9 h-9 rounded-xl bg-white/10 flex items-center justify-center text-amber-300">
              <Sparkles className="w-5 h-5" />
            </div>
            <div>
              <h3 className="font-bold text-base leading-tight">
                {t('action.smartMatch')}
              </h3>
              <p className="text-xs text-emerald-200">
                Data-Grounded Compatibility for &quot;{donation.foodName}&quot;
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded-xl hover:bg-white/10 text-emerald-200 hover:text-white transition-colors cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Content */}
        <div className="p-6 overflow-y-auto space-y-4">
          {/* Donation Summary Card */}
          <div className="p-3.5 bg-emerald-50/70 border border-emerald-200 rounded-2xl flex flex-wrap items-center justify-between gap-3 text-xs">
            <div>
              <span className="font-bold text-emerald-950 block">{donation.foodName}</span>
              <span className="text-emerald-700">
                {donation.quantity} {donation.unit} • {donation.category}
              </span>
            </div>
            <div className="text-right">
              <span className="text-stone-500 block">Pickup Deadline</span>
              <span className="font-semibold text-stone-900">{donation.pickupDeadline}</span>
            </div>
          </div>

          {claimMessage && (
            <div
              className={`p-3 rounded-xl text-xs flex items-start gap-2 ${
                claimMessage.type === 'success'
                  ? 'bg-emerald-50 border border-emerald-200 text-emerald-900'
                  : 'bg-red-50 border border-red-200 text-red-900'
              }`}
            >
              {claimMessage.type === 'success' ? (
                <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0 mt-0.5" />
              ) : (
                <AlertCircle className="w-4 h-4 text-red-600 shrink-0 mt-0.5" />
              )}
              <span>{claimMessage.text}</span>
            </div>
          )}

          {/* Matches List */}
          {loadingOrgs ? (
            <div className="py-12 flex flex-col items-center justify-center gap-3">
              <Loader2 className="w-8 h-8 animate-spin text-emerald-600" />
              <p className="text-xs text-stone-500 font-medium">
                Evaluating candidate NGOs across proximity, capacity, and turnaround...
              </p>
            </div>
          ) : matches.length === 0 ? (
            <div className="py-12 text-center text-xs text-stone-500 bg-stone-50 rounded-2xl p-6">
              <Building2 className="w-8 h-8 text-stone-300 mx-auto mb-2" />
              No verified NGOs registered in database yet.
            </div>
          ) : (
            <div className="space-y-3">
              <h4 className="text-xs font-bold uppercase tracking-wider text-stone-500">
                Ranked Eligible Organizations ({matches.length})
              </h4>

              {matches.map((item, idx) => {
                const isClaimedByThis = donation.assignedNgoId === item.ngo.id;
                return (
                  <div
                    key={item.ngo.id}
                    className="p-4 bg-stone-50 hover:bg-stone-100/80 border border-stone-200 rounded-2xl transition-all"
                  >
                    <div className="flex items-start justify-between gap-3 mb-2">
                      <div className="flex items-center gap-2">
                        <span className="w-6 h-6 rounded-full bg-emerald-100 text-emerald-800 text-xs font-bold flex items-center justify-center shrink-0">
                          #{idx + 1}
                        </span>
                        <div>
                          <div className="flex items-center gap-1.5">
                            <h5 className="font-bold text-sm text-stone-900">{item.ngo.name}</h5>
                            {item.ngo.verificationStatus === 'verified' && (
                              <ShieldCheck className="w-4 h-4 text-teal-600 shrink-0" />
                            )}
                          </div>
                          <p className="text-xs text-stone-500">{item.ngo.type} • {item.ngo.city}</p>
                        </div>
                      </div>

                      {/* Compatibility Score Pill */}
                      <div className="text-right shrink-0">
                        <span className="px-2.5 py-1 rounded-full text-xs font-bold bg-emerald-700 text-white shadow-2xs">
                          {item.score}% Match
                        </span>
                      </div>
                    </div>

                    {/* Explanatory Reasons */}
                    <div className="my-2.5 p-2.5 bg-white border border-stone-200 rounded-xl space-y-1">
                      <p className="text-[11px] font-medium text-stone-800 italic leading-snug">
                        &quot;{item.summaryExplanation}&quot;
                      </p>
                      <div className="pt-1.5 border-t border-stone-100 flex flex-wrap gap-1.5">
                        {item.reasons.map((r, rIdx) => (
                          <span
                            key={rIdx}
                            className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[10px] bg-stone-100 text-stone-700 font-medium"
                          >
                            <CheckCircle2 className="w-3 h-3 text-emerald-600" />
                            {r}
                          </span>
                        ))}
                      </div>
                    </div>

                    {/* Action Button */}
                    <div className="flex items-center justify-between pt-1">
                      <div className="text-[11px] text-stone-500 flex items-center gap-1">
                        <Scale className="w-3.5 h-3.5 text-stone-400" />
                        Capacity: {item.ngo.capacityDailyMeals || 100} meals/day
                      </div>

                      {(isAdmin || isNgo || currentUser?.uid === donation.donorId) && (
                        <button
                          onClick={() => handleAssignNgo(item.ngo)}
                          disabled={claimingNgoId === item.ngo.id || isClaimedByThis}
                          className={`px-4 py-1.5 rounded-xl font-bold text-xs transition-colors flex items-center gap-1.5 cursor-pointer disabled:opacity-50 ${
                            isClaimedByThis
                              ? 'bg-stone-200 text-stone-600'
                              : 'bg-emerald-700 hover:bg-emerald-800 text-white'
                          }`}
                        >
                          {claimingNgoId === item.ngo.id ? (
                            <Loader2 className="w-3.5 h-3.5 animate-spin" />
                          ) : isClaimedByThis ? (
                            'Already Assigned'
                          ) : (
                            <>
                              Confirm Match & Assign
                              <ArrowRight className="w-3.5 h-3.5" />
                            </>
                          )}
                        </button>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="bg-stone-50 px-6 py-3 border-t border-stone-200 flex justify-end shrink-0">
          <button
            onClick={onClose}
            className="px-4 py-1.5 bg-stone-200 hover:bg-stone-300 text-stone-800 text-xs font-semibold rounded-xl transition-colors cursor-pointer"
          >
            {t('action.close')}
          </button>
        </div>
      </div>
    </div>
  );
};
