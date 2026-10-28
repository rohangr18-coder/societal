import React, { useState } from 'react';
import {
  ShieldCheck,
  CheckCircle2,
  Thermometer,
  Package,
  Globe,
  Sparkles,
  HelpCircle,
  Mail,
  Loader2,
  FileCheck,
} from 'lucide-react';

const LANGUAGES = [
  'Hindi',
  'Tamil',
  'Telugu',
  'Bengali',
  'Marathi',
  'Spanish',
  'French',
];

export const AboutView: React.FC = () => {
  const [selectedLang, setSelectedLang] = useState('Hindi');
  const [translatedRules, setTranslatedRules] = useState<string[] | null>(null);
  const [translating, setTranslating] = useState(false);

  const handleTranslate = async (lang: string) => {
    setSelectedLang(lang);
    setTranslating(true);
    try {
      const res = await fetch('/api/gemini/multilingual-guide', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ language: lang }),
      });
      const data = await res.json();
      if (data.guidelines) {
        setTranslatedRules(data.guidelines);
      }
    } catch (err) {
      console.error(err);
    } finally {
      setTranslating(false);
    }
  };

  return (
    <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 py-10 space-y-12">
      {/* Title */}
      <div className="text-center space-y-3">
        <span className="text-xs font-bold uppercase tracking-wider text-emerald-700 bg-emerald-50 px-3 py-1 rounded-full border border-emerald-200">
          Standards & Compliance
        </span>
        <h1 className="text-3xl sm:text-4xl font-extrabold text-stone-900 tracking-tight">
          How Food Rescue Works & Safety Guidelines
        </h1>
        <p className="text-sm text-stone-600 max-w-2xl mx-auto leading-relaxed">
          The Food Rescue Network connects edible surplus food sources directly with verified charities through rigorous temperature maintenance and legal safe-harbor standards.
        </p>
      </div>

      {/* 4 Steps Section */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <div className="bg-white p-5 rounded-2xl border border-stone-200 shadow-2xs space-y-2">
          <div className="w-8 h-8 rounded-lg bg-emerald-100 text-emerald-800 flex items-center justify-center font-bold text-sm">
            01
          </div>
          <h4 className="font-bold text-stone-900 text-sm">Listing</h4>
          <p className="text-xs text-stone-500 leading-relaxed">
            Donor registers surplus with quantity, preparation time, and strict pickup deadline.
          </p>
        </div>

        <div className="bg-white p-5 rounded-2xl border border-stone-200 shadow-2xs space-y-2">
          <div className="w-8 h-8 rounded-lg bg-amber-100 text-amber-800 flex items-center justify-center font-bold text-sm">
            02
          </div>
          <h4 className="font-bold text-stone-900 text-sm">Atomic Claim</h4>
          <p className="text-xs text-stone-500 leading-relaxed">
            Verified NGO locks the claim via database transaction to eliminate duplicate requests.
          </p>
        </div>

        <div className="bg-white p-5 rounded-2xl border border-stone-200 shadow-2xs space-y-2">
          <div className="w-8 h-8 rounded-lg bg-blue-100 text-blue-800 flex items-center justify-center font-bold text-sm">
            03
          </div>
          <h4 className="font-bold text-stone-900 text-sm">Thermal Transit</h4>
          <p className="text-xs text-stone-500 leading-relaxed">
            Volunteer courier transports food in food-grade insulated bags along optimized routes.
          </p>
        </div>

        <div className="bg-white p-5 rounded-2xl border border-stone-200 shadow-2xs space-y-2">
          <div className="w-8 h-8 rounded-lg bg-teal-100 text-teal-800 flex items-center justify-center font-bold text-sm">
            04
          </div>
          <h4 className="font-bold text-stone-900 text-sm">Receipt & Impact</h4>
          <p className="text-xs text-stone-500 leading-relaxed">
            Recipient shelter confirms delivery, logging verified kilograms and meals saved into platform metrics.
          </p>
        </div>
      </div>

      {/* Safety & Good Samaritan Law */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <div className="bg-white p-6 rounded-3xl border border-stone-200 shadow-2xs space-y-4">
          <div className="flex items-center gap-2 text-emerald-800 font-bold text-base">
            <ShieldCheck className="w-5 h-5 text-emerald-600" />
            Good Samaritan Legal Protection
          </div>
          <p className="text-xs text-stone-600 leading-relaxed">
            Under national food safety regulations and Good Samaritan food donation acts, any commercial or individual donor donating food in good faith is protected from civil liability.
          </p>
          <ul className="text-xs text-stone-600 space-y-2 pt-2 border-t border-stone-100">
            <li className="flex items-start gap-2">
              <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0 mt-0.5" />
              <span>Full legal protection for genuine good-faith donations.</span>
            </li>
            <li className="flex items-start gap-2">
              <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0 mt-0.5" />
              <span>All recipient organizations are pre-screened and verified.</span>
            </li>
            <li className="flex items-start gap-2">
              <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0 mt-0.5" />
              <span>Timestamped digital audit trail of handovers.</span>
            </li>
          </ul>
        </div>

        <div className="bg-white p-6 rounded-3xl border border-stone-200 shadow-2xs space-y-4">
          <div className="flex items-center gap-2 text-stone-900 font-bold text-base">
            <Thermometer className="w-5 h-5 text-teal-600" />
            Temperature & Cold Chain Rules
          </div>
          <p className="text-xs text-stone-600 leading-relaxed">
            Strict cold-chain hygiene prevents bacterial growth and guarantees food remains wholesome:
          </p>
          <ul className="text-xs text-stone-600 space-y-2 pt-2 border-t border-stone-100">
            <li className="flex items-start gap-2">
              <span className="font-bold text-teal-800 shrink-0">Hot Food:</span>
              <span>Must be kept above 60°C (140°F) until dispatch or safely chilled quickly.</span>
            </li>
            <li className="flex items-start gap-2">
              <span className="font-bold text-teal-800 shrink-0">Chilled Food:</span>
              <span>Perishables and dairy must stay below 4°C (40°F) in insulated ice containers.</span>
            </li>
            <li className="flex items-start gap-2">
              <span className="font-bold text-teal-800 shrink-0">Packaging:</span>
              <span>Only clean, non-toxic, food-grade containers or foil wrapping permitted.</span>
            </li>
          </ul>
        </div>
      </div>

      {/* Multilingual AI Safety Guide */}
      <div className="bg-gradient-to-r from-emerald-50 to-teal-50 p-6 sm:p-8 rounded-3xl border border-emerald-200 space-y-4">
        <div className="flex flex-col sm:flex-row justify-between sm:items-center gap-3">
          <div className="flex items-center gap-2">
            <Sparkles className="w-5 h-5 text-amber-500" />
            <h3 className="font-bold text-emerald-950 text-base">
              Multilingual Field Safety Guidance (AI Powered)
            </h3>
          </div>
          <div className="flex items-center gap-2 overflow-x-auto pb-1">
            {LANGUAGES.map((lang) => (
              <button
                key={lang}
                onClick={() => handleTranslate(lang)}
                className={`px-3 py-1 rounded-xl text-xs font-bold transition-all cursor-pointer ${
                  selectedLang === lang
                    ? 'bg-emerald-800 text-white shadow-xs'
                    : 'bg-white text-stone-700 hover:bg-emerald-100/50'
                }`}
              >
                {lang}
              </button>
            ))}
          </div>
        </div>

        <p className="text-xs text-emerald-900/80">
          Translate critical food handling and volunteer delivery protocols into local languages for ground workers and couriers:
        </p>

        {translating ? (
          <div className="p-6 text-center text-xs text-emerald-800 flex items-center justify-center gap-2">
            <Loader2 className="w-4 h-4 animate-spin" />
            Generating {selectedLang} guidance via Gemini AI...
          </div>
        ) : (
          <div className="bg-white/90 p-5 rounded-2xl border border-emerald-200/80 space-y-2 text-xs text-stone-800">
            <div className="font-bold text-emerald-950 mb-1">
              Field Protocols in {selectedLang}:
            </div>
            {(translatedRules || [
              '1. Inspect food temperature and integrity before dispatch.',
              '2. Keep cooked hot food above 60°C and cold perishable food below 4°C during transport.',
              '3. Use sealed clean containers and sanitize handling equipment.',
              '4. Maintain delivery logs and verify receipt upon handover.',
            ]).map((rule, i) => (
              <div key={i} className="flex items-start gap-2">
                <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600 shrink-0 mt-0.5" />
                <span>{rule}</span>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Contact & Terms Section */}
      <div className="p-6 bg-white rounded-3xl border border-stone-200 text-xs text-stone-500 space-y-3">
        <h4 className="font-bold text-stone-800 text-sm">Platform Support, Terms & Privacy</h4>
        <p className="leading-relaxed">
          Food Rescue Network is an open social-impact platform designed for university engineering, Smart India Hackathons, and municipal surplus redistribution. All personal data and contact numbers are exclusively shared between authorized parties during active claims.
        </p>
        <div className="pt-2 flex flex-wrap gap-4 text-emerald-700 font-semibold">
          <span>Support Contact: rohangr18@gmail.com</span>
          <span>•</span>
          <span>Open Food Safety Standards</span>
          <span>•</span>
          <span>Zero Commercial Fees</span>
        </div>
      </div>
    </div>
  );
};
