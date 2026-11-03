import React from 'react';
import { CheckCircle2 } from 'lucide-react';
import { Donation } from '../../types';

export interface VolunteerHistoryTabProps {
  completedCollections: Donation[];
}

export const VolunteerHistoryTab: React.FC<VolunteerHistoryTabProps> = ({
  completedCollections,
}) => {
  return (
    <div className="space-y-6">
      <div className="bg-white rounded-3xl p-6 sm:p-8 border border-stone-200">
        <h3 className="text-lg font-black text-stone-900 mb-4">Your Completed Food Rescue Runs</h3>

        {completedCollections.length === 0 ? (
          <div className="text-center py-12 text-stone-400 text-xs">
            No past deliveries recorded yet. Once you complete your first collection run, your verified impact certificate will appear here!
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs text-stone-700">
              <thead className="bg-stone-50 text-stone-500 font-bold uppercase tracking-wider border-b border-stone-200">
                <tr>
                  <th className="py-3 px-4">Food Item</th>
                  <th className="py-3 px-4">Quantity / Meals</th>
                  <th className="py-3 px-4">Donor</th>
                  <th className="py-3 px-4">Recipient Shelter</th>
                  <th className="py-3 px-4">Completion Date</th>
                  <th className="py-3 px-4">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-stone-100">
                {completedCollections.map((donation) => (
                  <tr key={donation.id} className="hover:bg-stone-50/60">
                    <td className="py-3.5 px-4 font-bold text-stone-900">{donation.foodName}</td>
                    <td className="py-3.5 px-4">
                      {donation.quantity} {donation.unit} (~{donation.servings || donation.quantity * 2} meals)
                    </td>
                    <td className="py-3.5 px-4">{donation.donorName}</td>
                    <td className="py-3.5 px-4">{donation.assignedNgoName || 'Community Shelter'}</td>
                    <td className="py-3.5 px-4 text-stone-500">
                      {donation.deliveredAt ? new Date(donation.deliveredAt).toLocaleDateString() : 'Recent'}
                    </td>
                    <td className="py-3.5 px-4">
                      <span className="inline-flex items-center gap-1 text-emerald-700 font-bold bg-emerald-50 px-2 py-0.5 rounded-full">
                        <CheckCircle2 className="w-3 h-3" />
                        <span>Delivered</span>
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
};
