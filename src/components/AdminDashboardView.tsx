import React, { useState, useEffect } from 'react';
import {
  ShieldCheck,
  Building2,
  CheckCircle2,
  XCircle,
  AlertTriangle,
  History,
  FileText,
  Search,
  Filter,
  Trash2,
} from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import {
  subscribeOrganizations,
  setOrganizationVerification,
  subscribeAuditLogs,
  updateDonationStatus,
} from '../services/dbService';
import { Organization, AuditLog, Donation } from '../types';

interface AdminDashboardViewProps {
  donations: Donation[];
  onSelectDonation: (donation: Donation) => void;
}

export const AdminDashboardView: React.FC<AdminDashboardViewProps> = ({ donations, onSelectDonation }) => {
  const { currentUser, isAdmin } = useAuth();
  const [organizations, setOrganizations] = useState<Organization[]>([]);
  const [auditLogs, setAuditLogs] = useState<AuditLog[]>([]);
  const [activeAdminTab, setActiveAdminTab] = useState<'verification' | 'donations' | 'audit'>('verification');

  // Verification modal state
  const [selectedOrg, setSelectedOrg] = useState<Organization | null>(null);
  const [reviewNotes, setReviewNotes] = useState('');
  const [actionLoading, setActionLoading] = useState(false);

  useEffect(() => {
    if (!isAdmin) return;
    const unsubOrgs = subscribeOrganizations((list) => setOrganizations(list));
    const unsubLogs = subscribeAuditLogs((list) => setAuditLogs(list));
    return () => {
      unsubOrgs && unsubOrgs();
      unsubLogs && unsubLogs();
    };
  }, [isAdmin]);

  if (!isAdmin) {
    return (
      <div className="max-w-xl mx-auto my-20 p-8 bg-amber-50 rounded-3xl border border-amber-200 text-center space-y-4">
        <ShieldCheck className="w-12 h-12 text-amber-600 mx-auto" />
        <h2 className="text-xl font-bold text-amber-900">Administrator Access Required</h2>
        <p className="text-xs text-amber-800 leading-relaxed">
          This portal is reserved for authorized platform administrators and verification compliance officers.
        </p>
      </div>
    );
  }

  const pendingOrgs = organizations.filter((o) => o.verificationStatus === 'pending');

  const handleVerify = async (status: 'verified' | 'rejected') => {
    if (!selectedOrg || !currentUser) return;
    setActionLoading(true);
    try {
      await setOrganizationVerification(selectedOrg.id, status, reviewNotes, currentUser.uid);
      setSelectedOrg(null);
      setReviewNotes('');
    } catch (err: any) {
      alert(`Error updating verification: ${err.message}`);
    } finally {
      setActionLoading(false);
    }
  };

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 space-y-8">
      {/* Admin Header */}
      <div className="bg-gradient-to-r from-stone-900 via-stone-800 to-amber-950 rounded-3xl p-6 sm:p-8 text-white flex flex-col md:flex-row items-start md:items-center justify-between gap-4 shadow-xl">
        <div>
          <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-amber-500/20 text-amber-300 text-xs font-bold border border-amber-500/30">
            <ShieldCheck className="w-4 h-4 text-amber-400" />
            Root Platform Administration
          </div>
          <h1 className="text-2xl sm:text-3xl font-extrabold mt-2 tracking-tight">
            Security & Verification Operations
          </h1>
          <p className="text-stone-300 text-xs sm:text-sm mt-1">
            Audit-grade moderation, NGO compliance verification, and live logistics oversight.
          </p>
        </div>

        <div className="flex items-center gap-3">
          <div className="bg-stone-800/80 p-3 rounded-2xl border border-stone-700 text-center">
            <span className="text-xs text-stone-400 block font-medium">Pending Review</span>
            <span className="text-2xl font-black text-amber-400">{pendingOrgs.length} NGOs</span>
          </div>
          <div className="bg-stone-800/80 p-3 rounded-2xl border border-stone-700 text-center">
            <span className="text-xs text-stone-400 block font-medium">Live Rescues</span>
            <span className="text-2xl font-black text-emerald-400">{donations.length}</span>
          </div>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex items-center border-b border-stone-200 gap-6">
        <button
          onClick={() => setActiveAdminTab('verification')}
          className={`pb-3 text-sm font-bold flex items-center gap-2 border-b-2 transition-all cursor-pointer ${
            activeAdminTab === 'verification'
              ? 'border-amber-600 text-amber-900'
              : 'border-transparent text-stone-500 hover:text-stone-800'
          }`}
        >
          <Building2 className="w-4 h-4" />
          NGO Verification Queue ({pendingOrgs.length})
        </button>

        <button
          onClick={() => setActiveAdminTab('donations')}
          className={`pb-3 text-sm font-bold flex items-center gap-2 border-b-2 transition-all cursor-pointer ${
            activeAdminTab === 'donations'
              ? 'border-amber-600 text-amber-900'
              : 'border-transparent text-stone-500 hover:text-stone-800'
          }`}
        >
          <FileText className="w-4 h-4" />
          All Platform Donations ({donations.length})
        </button>

        <button
          onClick={() => setActiveAdminTab('audit')}
          className={`pb-3 text-sm font-bold flex items-center gap-2 border-b-2 transition-all cursor-pointer ${
            activeAdminTab === 'audit'
              ? 'border-amber-600 text-amber-900'
              : 'border-transparent text-stone-500 hover:text-stone-800'
          }`}
        >
          <History className="w-4 h-4" />
          Immutable Audit Logs ({auditLogs.length})
        </button>
      </div>

      {/* TAB 1: Verification Queue */}
      {activeAdminTab === 'verification' && (
        <div className="space-y-4">
          {pendingOrgs.length === 0 ? (
            <div className="bg-white p-12 text-center rounded-3xl border border-stone-200 space-y-2">
              <CheckCircle2 className="w-12 h-12 text-emerald-600 mx-auto" />
              <h3 className="font-bold text-stone-900 text-base">Verification Queue Clear</h3>
              <p className="text-xs text-stone-500 max-w-sm mx-auto">
                All NGO applications have been reviewed and processed according to compliance guidelines.
              </p>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {pendingOrgs.map((org) => (
                <div key={org.id} className="bg-white p-5 rounded-2xl border border-amber-200 shadow-2xs space-y-3">
                  <div className="flex items-start justify-between">
                    <div>
                      <h4 className="font-bold text-stone-900 text-base">{org.name}</h4>
                      <p className="text-xs text-stone-500 font-mono">Reg #: {org.registrationNumber}</p>
                    </div>
                    <span className="text-[10px] font-bold text-amber-800 bg-amber-100 px-2.5 py-0.5 rounded-full uppercase">
                      Pending Audit
                    </span>
                  </div>

                  <div className="text-xs text-stone-600 space-y-1 bg-stone-50 p-3 rounded-xl">
                    <p><strong>Type:</strong> {org.type}</p>
                    <p><strong>Location:</strong> {org.address}, {org.city}</p>
                    <p><strong>Daily Intake:</strong> {org.capacityDailyMeals} Meals / Day</p>
                    <p><strong>Contact:</strong> {org.contactEmail} | {org.contactPhone}</p>
                  </div>

                  <div className="flex items-center justify-end gap-2 pt-2 border-t border-stone-100">
                    <button
                      onClick={() => setSelectedOrg(org)}
                      className="bg-amber-600 hover:bg-amber-700 text-white font-bold text-xs px-4 py-2 rounded-xl transition-colors cursor-pointer"
                    >
                      Review & Decide
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* TAB 2: Donations Monitoring */}
      {activeAdminTab === 'donations' && (
        <div className="bg-white rounded-3xl border border-stone-200 p-6 space-y-4 shadow-2xs">
          <div className="flex items-center justify-between">
            <h3 className="font-bold text-stone-900 text-base">Platform Surplus Feed</h3>
            <span className="text-xs text-stone-400">Total: {donations.length} records</span>
          </div>

          <div className="divide-y divide-stone-100">
            {donations.map((d) => (
              <div
                key={d.id}
                onClick={() => onSelectDonation(d)}
                className="py-3.5 hover:bg-stone-50 rounded-xl px-2 transition-colors cursor-pointer flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-xs"
              >
                <div>
                  <div className="flex items-center gap-2">
                    <span className="font-bold text-stone-900 text-sm">{d.foodName}</span>
                    <span className="text-stone-500 font-mono">({d.id.slice(0, 6)})</span>
                    <span className="text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-full bg-stone-100 text-stone-700">
                      {d.status.replace('_', ' ')}
                    </span>
                  </div>
                  <p className="text-stone-500 mt-0.5">
                    Donor: {d.donorName} | Qty: {d.quantity} {d.unit} | Location: {d.pickupAddress}
                  </p>
                </div>

                <div className="text-right">
                  <span className="font-bold text-emerald-700 hover:underline">Inspect Details →</span>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* TAB 3: Audit Trail */}
      {activeAdminTab === 'audit' && (
        <div className="bg-white rounded-3xl border border-stone-200 p-6 space-y-4 shadow-2xs">
          <h3 className="font-bold text-stone-900 text-base">Real-Time System Audit Trail</h3>
          <p className="text-xs text-stone-500">
            Immutable log entries recording administrative determinations, status updates, and critical events.
          </p>

          <div className="divide-y divide-stone-100 font-mono text-xs">
            {auditLogs.map((log) => (
              <div key={log.id} className="py-3 flex flex-col sm:flex-row justify-between gap-2">
                <div className="space-y-0.5">
                  <span className="font-bold text-stone-900">{log.action}</span>
                  <p className="text-stone-600 font-sans">{log.details}</p>
                </div>
                <div className="text-right shrink-0 text-stone-400 text-[11px]">
                  <span>{new Date(log.timestamp).toLocaleString()}</span>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Verification Decision Modal */}
      {selectedOrg && (
        <div className="fixed inset-0 z-50 bg-stone-900/60 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-3xl max-w-lg w-full p-6 space-y-4 animate-in fade-in zoom-in-95">
            <h2 className="text-lg font-bold text-stone-900">
              Review NGO Verification: {selectedOrg.name}
            </h2>
            <div className="bg-stone-50 p-3 rounded-xl text-xs space-y-1 text-stone-600">
              <p><strong>Registration ID:</strong> {selectedOrg.registrationNumber}</p>
              <p><strong>Address:</strong> {selectedOrg.address}, {selectedOrg.city}</p>
              <p><strong>Intake Capacity:</strong> {selectedOrg.capacityDailyMeals} Meals / Day</p>
            </div>

            <div>
              <label className="font-semibold text-stone-700 text-xs block mb-1">
                Auditor Review Notes & Justification:
              </label>
              <textarea
                rows={3}
                placeholder="e.g. Verified through State NGO Portal. Registration documents validated."
                value={reviewNotes}
                onChange={(e) => setReviewNotes(e.target.value)}
                className="w-full px-3 py-2 text-xs rounded-xl border border-stone-200 outline-hidden"
              />
            </div>

            <div className="flex items-center justify-end gap-2 pt-3">
              <button
                type="button"
                onClick={() => setSelectedOrg(null)}
                className="px-4 py-2 rounded-xl border border-stone-200 font-medium text-xs text-stone-600"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={() => handleVerify('rejected')}
                disabled={actionLoading}
                className="bg-red-600 hover:bg-red-700 text-white font-bold text-xs px-4 py-2 rounded-xl"
              >
                Reject Application
              </button>
              <button
                type="button"
                onClick={() => handleVerify('verified')}
                disabled={actionLoading}
                className="bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-xs px-5 py-2 rounded-xl"
              >
                Approve & Grant Verified Status
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
