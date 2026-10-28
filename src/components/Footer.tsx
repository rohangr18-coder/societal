import React from 'react';
import { HeartHandshake, ShieldCheck, Github, ExternalLink } from 'lucide-react';

interface FooterProps {
  onNavigate: (tab: string) => void;
}

export const Footer: React.FC<FooterProps> = ({ onNavigate }) => {
  return (
    <footer className="bg-stone-900 text-stone-300 pt-14 pb-10 border-t border-stone-800">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 space-y-10">
        <div className="grid grid-cols-1 md:grid-cols-4 gap-8">
          {/* Brand Info */}
          <div className="space-y-3 md:col-span-1">
            <div className="flex items-center gap-2.5">
              <div className="w-9 h-9 rounded-xl bg-emerald-600 flex items-center justify-center text-white shadow-xs">
                <HeartHandshake className="w-5 h-5" />
              </div>
              <span className="text-lg font-bold text-white tracking-tight">
                ResQ<span className="text-emerald-400">Bite</span>
              </span>
            </div>
            <p className="text-xs text-stone-400 leading-relaxed">
              Open logistics platform connecting commercial and household edible surplus with verified humanitarian feeding kitchens in real time.
            </p>
          </div>

          {/* Quick Navigation */}
          <div className="space-y-3 text-xs">
            <h4 className="font-bold text-white uppercase tracking-wider text-[11px]">Platform</h4>
            <ul className="space-y-2">
              <li>
                <button onClick={() => onNavigate('browse')} className="hover:text-emerald-400 transition-colors">
                  Browse Food Surplus
                </button>
              </li>
              <li>
                <button onClick={() => onNavigate('map')} className="hover:text-emerald-400 transition-colors">
                  Live GPS Radar
                </button>
              </li>
              <li>
                <button onClick={() => onNavigate('impact')} className="hover:text-emerald-400 transition-colors">
                  Verified Impact Metrics
                </button>
              </li>
              <li>
                <button onClick={() => onNavigate('organizations')} className="hover:text-emerald-400 transition-colors">
                  NGO & Volunteer Registry
                </button>
              </li>
            </ul>
          </div>

          {/* Guidelines & Safety */}
          <div className="space-y-3 text-xs">
            <h4 className="font-bold text-white uppercase tracking-wider text-[11px]">Safety & Standards</h4>
            <ul className="space-y-2">
              <li>
                <button onClick={() => onNavigate('about')} className="hover:text-emerald-400 transition-colors">
                  Food Safety Protocols
                </button>
              </li>
              <li>
                <button onClick={() => onNavigate('about')} className="hover:text-emerald-400 transition-colors">
                  Good Samaritan Legal Defense
                </button>
              </li>
              <li>
                <button onClick={() => onNavigate('about')} className="hover:text-emerald-400 transition-colors">
                  Cold-Chain Preservation Rules
                </button>
              </li>
              <li>
                <button onClick={() => onNavigate('about')} className="hover:text-emerald-400 transition-colors">
                  AI Logistics Grounding
                </button>
              </li>
            </ul>
          </div>

          {/* Academic & Hackathon info */}
          <div className="space-y-3 text-xs">
            <h4 className="font-bold text-white uppercase tracking-wider text-[11px]">Engineering Project</h4>
            <p className="text-stone-400 leading-relaxed text-[11px]">
              Engineered with Firebase Firestore real-time subscriptions, transactional concurrency protection, and server-side Google Gemini 3.8 models.
            </p>
            <div className="pt-2 text-[11px] text-emerald-400 flex items-center gap-1.5 font-mono">
              <ShieldCheck className="w-3.5 h-3.5" />
              Verified Societal Impact Architecture
            </div>
          </div>
        </div>

        <div className="pt-8 border-t border-stone-800 flex flex-col sm:flex-row items-center justify-between text-xs text-stone-500 gap-3">
          <p>© {new Date().getFullYear()} ResQBite (Food Rescue Network). Non-profit public interest deployment.</p>
          <div className="flex gap-4">
            <button onClick={() => onNavigate('about')} className="hover:text-stone-300">Privacy Policy</button>
            <button onClick={() => onNavigate('about')} className="hover:text-stone-300">Terms of Service</button>
            <button onClick={() => onNavigate('about')} className="hover:text-stone-300">Contact</button>
          </div>
        </div>
      </div>
    </footer>
  );
};
