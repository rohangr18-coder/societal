import React, { useState, useEffect, useRef } from 'react';
import {
  MessageCircle,
  Sparkles,
  X,
  Send,
  Trash2,
  Bot,
  User,
  ArrowRight,
  ShieldCheck,
  AlertCircle,
  MapPin,
  RefreshCw,
  Loader2,
  ChevronDown,
  Info,
} from 'lucide-react';
import { Donation, UserProfile, ChatMessage, ChatAction } from '../types';
import { useLanguage } from '../context/LanguageContext';

interface MithraChatbotProps {
  onNavigate: (tab: string) => void;
  onOpenCreateDonation: () => void;
  onSelectDonation?: (donation: Donation) => void;
  donations: Donation[];
  userProfile: UserProfile | null;
  onSeedDemo?: () => void;
}

const STARTER_QUESTIONS_MAP: Record<string, string[]> = {
  en: [
    'How do I donate surplus food?',
    'What is the 2-hour food safety rule?',
    'How do NGOs claim meals on ResQBite?',
    'Show pickup locations on Google Maps',
    'What is our community impact?',
  ],
  kn: [
    'ಹೆಚ್ಚುವರಿ ಆಹಾರವನ್ನು ಹೇಗೆ ದಾನ ಮಾಡುವುದು?',
    '೨-ಗಂಟೆಗಳ ಆಹಾರ ಸುರಕ್ಷತಾ ನಿಯಮ ಯಾವುದು?',
    'ಎನ್‌ಜಿಒಗಳು ಆಹಾರವನ್ನು ಹೇಗೆ ಪಡೆಯುತ್ತವೆ?',
    'ಗೂಗಲ್ ಮ್ಯಾಪ್ಸ್‌ನಲ್ಲಿ ಪಿಕಪ್ ಸ್ಥಳಗಳನ್ನು ತೋರಿಸಿ',
    'ನಮ್ಮ ಸಮುದಾಯದ ಪ್ರಭಾವವೇನು?',
  ],
  hi: [
    'अतिरिक्त भोजन कैसे दान करें?',
    '२ घंटे का खाद्य सुरक्षा नियम क्या है?',
    'एनजीओ भोजन कैसे प्राप्त करते हैं?',
    'गूगल मैप्स पर पिकअप स्थान दिखाएं',
    'हमारा सामुदायिक प्रभाव क्या है?',
  ],
  ta: [
    'மீதமுள்ள உணவை எவ்வாறு தானம் செய்வது?',
    '2 மணி நேர உணவு பாதுகாப்பு விதி என்ன?',
    'என்ஜிஓக்கள் உணவை எவ்வாறு பெறுகின்றன?',
    'கூகிள் வரைபடத்தில் பிக்அப் இடங்களை காட்டு',
    'நமது சமூக தாக்கம் என்ன?',
  ],
};

export const MithraChatbot: React.FC<MithraChatbotProps> = ({
  onNavigate,
  onOpenCreateDonation,
  onSelectDonation,
  donations,
  userProfile,
  onSeedDemo,
}) => {
  const { language, t } = useLanguage();
  const starterQuestions = STARTER_QUESTIONS_MAP[language] || STARTER_QUESTIONS_MAP.en;
  const [isOpen, setIsOpen] = useState(false);
  const [messages, setMessages] = useState<ChatMessage[]>(() => {
    // Attempt to load saved conversation from sessionStorage
    try {
      const saved = sessionStorage.getItem('resqbite_mithra_messages');
      if (saved) {
        return JSON.parse(saved);
      }
    } catch {
      // Ignore
    }
    return [
      {
        id: 'welcome-1',
        sender: 'mithra',
        text: `👋 Greetings! I am **Mithra AI**, your intelligent companion for food rescue.

I can guide you on **food safety standards**, scheduling **GPS-tracked pickups**, claiming surplus meals for shelters, and maximizing our community impact.

How can I help you today?`,
        timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
        actions: [
          { type: 'create_donation', label: 'Donate Surplus Food' },
          { type: 'open_map', label: 'Explore Live Map' },
          { type: 'browse', label: 'Browse Food Feed' },
        ],
      },
    ];
  });

  const [inputMessage, setInputMessage] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [confirmClearOpen, setConfirmClearOpen] = useState(false);
  const [hasUnread, setHasUnread] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  // Sync to session storage
  useEffect(() => {
    try {
      sessionStorage.setItem('resqbite_mithra_messages', JSON.stringify(messages));
    } catch {
      // Ignore
    }
  }, [messages]);

  // Scroll to bottom on message updates
  useEffect(() => {
    if (isOpen) {
      messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
      setHasUnread(false);
    }
  }, [messages, isOpen]);

  // Focus input when opened
  useEffect(() => {
    if (isOpen) {
      setTimeout(() => inputRef.current?.focus(), 150);
    }
  }, [isOpen]);

  const handleActionClick = (action: ChatAction) => {
    switch (action.type) {
      case 'create_donation':
        onOpenCreateDonation();
        break;
      case 'open_map':
        onNavigate('map');
        break;
      case 'browse':
        onNavigate('browse');
        break;
      case 'dashboard':
        onNavigate('dashboard');
        break;
      case 'impact':
        onNavigate('impact');
        break;
      case 'organizations':
        onNavigate('organizations');
        break;
      case 'profile':
        onNavigate('profile');
        break;
      case 'about':
        onNavigate('about');
        break;
      case 'seed_demo':
        if (onSeedDemo) onSeedDemo();
        break;
      case 'view_donation':
        if (action.targetId && onSelectDonation) {
          const match = donations.find((d) => d.id === action.targetId);
          if (match) {
            onSelectDonation(match);
          } else {
            onNavigate('browse');
          }
        }
        break;
      default:
        break;
    }
  };

  const handleSendMessage = async (textToSend?: string) => {
    const text = (textToSend || inputMessage).trim();
    if (!text || isLoading) return;

    const userMsg: ChatMessage = {
      id: `user-${Date.now()}`,
      sender: 'user',
      text,
      timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
    };

    setMessages((prev) => [...prev, userMsg]);
    setInputMessage('');
    setIsLoading(true);

    try {
      // Compute platform summary from real props
      const activeDonationsCount = donations.filter((d) => d.status === 'available').length;
      const totalMealsRescued = donations
        .filter((d) => d.status === 'delivered' || d.status === 'picked_up' || d.status === 'scheduled')
        .reduce((sum, d) => sum + (d.servings || d.quantity || 0), 0);
      const pendingDeliveriesCount = donations.filter((d) => d.status === 'scheduled' || d.status === 'picked_up' || d.status === 'requested').length;
      const recentFoodTypes = Array.from(new Set(donations.map((d) => d.category))).slice(0, 5);

      // Build recent conversation history for Gemini multi-turn API
      const history = messages.slice(-6).map((m) => ({
        role: m.sender === 'user' ? ('user' as const) : ('model' as const),
        parts: [{ text: m.text }],
      }));

      const response = await fetch('/api/gemini/mithra-chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          message: text,
          language,
          history,
          userContext: {
            userId: userProfile?.uid,
            role: userProfile?.role ? userProfile.role.toUpperCase() : 'Guest',
            organizationName: userProfile?.organizationId,
            locationCity: 'Nearby',
          },
          platformSummary: {
            activeDonationsCount,
            totalMealsRescued: Math.max(totalMealsRescued, 1420), // baseline impact
            pendingDeliveriesCount,
            recentFoodTypes,
          },
        }),
      });

      if (!response.ok) {
        throw new Error(`Server returned HTTP ${response.status}`);
      }

      const data = await response.json();

      const mithraMsg: ChatMessage = {
        id: `mithra-${Date.now()}`,
        sender: 'mithra',
        text: data.text || 'I am here to help you rescue surplus food and coordinate safe logistics.',
        timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
        actions: data.actions || [],
        isFallback: Boolean(data.isFallback),
      };

      setMessages((prev) => [...prev, mithraMsg]);
      if (!isOpen) {
        setHasUnread(true);
      }
    } catch (err: any) {
      console.error('Mithra Chat Error:', err);
      const errorMsg: ChatMessage = {
        id: `mithra-err-${Date.now()}`,
        sender: 'mithra',
        text: `⚠️ I encountered a temporary connection issue reaching the AI service (${err.message || 'Network error'}).
        
You can still navigate ResQBite easily:
- To list food: use the **"Donate Surplus Food"** button.
- To view live locations: check the **"Live Map"**.`,
        timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
        actions: [
          { type: 'create_donation', label: 'Donate Food' },
          { type: 'open_map', label: 'View Live Map' },
        ],
        isError: true,
      };
      setMessages((prev) => [...prev, errorMsg]);
    } finally {
      setIsLoading(false);
    }
  };

  const handleClearHistory = () => {
    const welcome: ChatMessage = {
      id: `welcome-${Date.now()}`,
      sender: 'mithra',
      text: `Chat cleared. I am **Mithra AI**, ready to assist you with food rescue, safety rules, and GPS logistics!`,
      timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
      actions: [
        { type: 'create_donation', label: 'Donate Surplus' },
        { type: 'open_map', label: 'Explore Map' },
      ],
    };
    setMessages([welcome]);
    setConfirmClearOpen(false);
  };

  // Helper to render basic markdown formatting: headers, bold, bullets, code
  const renderFormattedText = (raw: string) => {
    const lines = raw.split('\n');
    return (
      <div className="space-y-1.5 leading-relaxed text-sm">
        {lines.map((line, idx) => {
          if (!line.trim()) {
            return <div key={idx} className="h-1.5" />;
          }

          // Headers
          if (line.startsWith('### ')) {
            return (
              <h4 key={idx} className="font-semibold text-emerald-950 mt-2 mb-1 text-sm flex items-center gap-1.5">
                <Sparkles className="w-3.5 h-3.5 text-emerald-600 inline" />
                {line.replace('### ', '')}
              </h4>
            );
          }
          if (line.startsWith('## ')) {
            return (
              <h3 key={idx} className="font-bold text-emerald-950 mt-2 mb-1 text-base">
                {line.replace('## ', '')}
              </h3>
            );
          }

          // Bullet points
          if (line.trim().startsWith('- ') || line.trim().startsWith('* ')) {
            const content = line.trim().replace(/^[-*]\s+/, '');
            return (
              <div key={idx} className="flex items-start gap-2 text-xs md:text-sm pl-1">
                <span className="text-emerald-500 font-bold mt-1 text-xs">•</span>
                <span>{renderInlineStyles(content)}</span>
              </div>
            );
          }

          // Numbered list
          if (/^\d+\.\s+/.test(line.trim())) {
            const match = line.trim().match(/^(\d+)\.\s+(.*)/);
            if (match) {
              return (
                <div key={idx} className="flex items-start gap-2 text-xs md:text-sm pl-1">
                  <span className="text-emerald-700 font-semibold text-xs mt-0.5">{match[1]}.</span>
                  <span>{renderInlineStyles(match[2])}</span>
                </div>
              );
            }
          }

          // Standard paragraph
          return (
            <p key={idx} className="text-xs md:text-sm">
              {renderInlineStyles(line)}
            </p>
          );
        })}
      </div>
    );
  };

  // Inline formatting helper for **bold** and *italic*
  const renderInlineStyles = (text: string) => {
    const parts = text.split(/(\*\*[^*]+\*\*|\*[^*]+\*)/g);
    return parts.map((part, i) => {
      if (part.startsWith('**') && part.endsWith('**')) {
        return (
          <strong key={i} className="font-semibold text-emerald-950">
            {part.slice(2, -2)}
          </strong>
        );
      }
      if (part.startsWith('*') && part.endsWith('*')) {
        return (
          <em key={i} className="text-gray-600 text-xs">
            {part.slice(1, -1)}
          </em>
        );
      }
      return part;
    });
  };

  return (
    <>
      {/* Floating Action Button */}
      {!isOpen && (
        <div className="fixed bottom-6 right-6 z-40 flex items-center gap-3">
          {/* Subtle Speech Bubble Prompt */}
          <div className="hidden md:flex items-center gap-2 bg-white/95 backdrop-blur-md px-3.5 py-2 rounded-full shadow-lg border border-emerald-100 text-xs font-medium text-emerald-900 animate-fade-in">
            <Sparkles className="w-3.5 h-3.5 text-emerald-600 animate-pulse" />
            <span>Need rescue assistance? Ask Mithra AI</span>
          </div>

          <button
            onClick={() => setIsOpen(true)}
            aria-label="Open Mithra AI Chatbot"
            className="relative p-3.5 rounded-full bg-emerald-600 hover:bg-emerald-700 active:scale-95 text-white shadow-xl hover:shadow-2xl transition-all duration-200 border-2 border-white ring-4 ring-emerald-500/20 group cursor-pointer"
          >
            <Bot className="w-6 h-6 transition-transform group-hover:scale-110" />
            <span className="absolute -top-1 -right-1 flex h-4 w-4">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
              <span className="relative inline-flex rounded-full h-4 w-4 bg-emerald-500 border-2 border-white"></span>
            </span>
            {hasUnread && (
              <span className="absolute -bottom-1 -left-1 bg-amber-500 text-[10px] font-bold text-white px-1.5 py-0.5 rounded-full shadow">
                New
              </span>
            )}
          </button>
        </div>
      )}

      {/* Main Slide-out Chat Panel */}
      {isOpen && (
        <div
          role="dialog"
          aria-label="Mithra AI Chat Panel"
          className="fixed bottom-4 right-4 sm:bottom-6 sm:right-6 z-50 w-[calc(100vw-2rem)] sm:w-[420px] h-[600px] max-h-[85vh] bg-white rounded-2xl shadow-2xl border border-emerald-200 flex flex-col overflow-hidden animate-in fade-in slide-in-from-bottom-4 duration-200"
        >
          {/* Header */}
          <div className="bg-gradient-to-r from-emerald-700 via-emerald-600 to-teal-700 p-4 text-white flex items-center justify-between shadow-sm">
            <div className="flex items-center gap-3">
              <div className="relative w-10 h-10 rounded-full bg-white/15 backdrop-blur-md flex items-center justify-center border border-white/20 text-white shadow-inner">
                <Bot className="w-6 h-6 text-emerald-100" />
                <span className="absolute bottom-0 right-0 w-2.5 h-2.5 bg-green-400 rounded-full border-2 border-emerald-700" />
              </div>
              <div>
                <div className="flex items-center gap-2">
                  <h3 className="font-bold text-base tracking-tight leading-tight">Mithra AI</h3>
                  <span className="bg-emerald-500/30 text-emerald-100 text-[10px] px-2 py-0.5 rounded-full font-medium border border-emerald-400/30">
                    ResQBite Companion
                  </span>
                </div>
                <p className="text-[11px] text-emerald-100/90 leading-tight flex items-center gap-1 mt-0.5">
                  <span className="w-1.5 h-1.5 rounded-full bg-emerald-300 animate-pulse" />
                  Your intelligent companion for food rescue
                </p>
              </div>
            </div>

            <div className="flex items-center gap-1">
              <button
                onClick={() => setConfirmClearOpen(true)}
                title="Clear chat history"
                className="p-1.5 text-emerald-100 hover:text-white hover:bg-white/10 rounded-lg transition-colors cursor-pointer"
                aria-label="Clear chat history"
              >
                <Trash2 className="w-4 h-4" />
              </button>
              <button
                onClick={() => setIsOpen(false)}
                title="Close chat"
                className="p-1.5 text-emerald-100 hover:text-white hover:bg-white/10 rounded-lg transition-colors cursor-pointer"
                aria-label="Close chat"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
          </div>

          {/* Confirm Clear Modal Dropdown */}
          {confirmClearOpen && (
            <div className="bg-amber-50 border-b border-amber-200 px-4 py-2.5 flex items-center justify-between text-xs text-amber-900 animate-in fade-in">
              <div className="flex items-center gap-1.5 font-medium">
                <AlertCircle className="w-4 h-4 text-amber-600 flex-shrink-0" />
                <span>Clear conversation history?</span>
              </div>
              <div className="flex items-center gap-2">
                <button
                  onClick={() => setConfirmClearOpen(false)}
                  className="px-2 py-1 text-gray-600 hover:text-gray-900 text-xs font-medium cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  onClick={handleClearHistory}
                  className="px-2.5 py-1 bg-amber-600 hover:bg-amber-700 text-white rounded text-xs font-semibold shadow-xs cursor-pointer"
                >
                  Clear
                </button>
              </div>
            </div>
          )}

          {/* Messages Area */}
          <div className="flex-1 overflow-y-auto p-4 space-y-4 bg-slate-50/50">
            {messages.map((msg) => (
              <div
                key={msg.id}
                className={`flex gap-2.5 ${msg.sender === 'user' ? 'justify-end' : 'justify-start'}`}
              >
                {msg.sender === 'mithra' && (
                  <div className="w-7 h-7 rounded-full bg-emerald-600 text-white flex items-center justify-center flex-shrink-0 shadow-xs mt-1">
                    <Bot className="w-4 h-4" />
                  </div>
                )}

                <div
                  className={`max-w-[85%] rounded-2xl px-4 py-3 shadow-xs ${
                    msg.sender === 'user'
                      ? 'bg-emerald-600 text-white rounded-tr-xs'
                      : msg.isError
                      ? 'bg-rose-50 border border-rose-200 text-rose-900 rounded-tl-xs'
                      : 'bg-white border border-slate-200/80 text-gray-800 rounded-tl-xs'
                  }`}
                >
                  {/* Sender label and time */}
                  <div className="flex items-center justify-between gap-3 text-[10px] mb-1 opacity-70">
                    <span className="font-semibold uppercase tracking-wider">
                      {msg.sender === 'user' ? (userProfile?.role || 'You') : 'Mithra AI'}
                    </span>
                    <span>{msg.timestamp}</span>
                  </div>

                  {/* Body Text */}
                  <div className="text-sm">
                    {msg.sender === 'user' ? (
                      <p className="whitespace-pre-wrap">{msg.text}</p>
                    ) : (
                      renderFormattedText(msg.text)
                    )}
                  </div>

                  {/* Action Buttons if available */}
                  {msg.actions && msg.actions.length > 0 && (
                    <div className="mt-3 pt-2.5 border-t border-slate-100 flex flex-wrap gap-1.5">
                      {msg.actions.map((act, i) => (
                        <button
                          key={i}
                          onClick={() => handleActionClick(act)}
                          className="inline-flex items-center gap-1.5 text-xs font-medium px-2.5 py-1.5 rounded-lg bg-emerald-50 hover:bg-emerald-100 text-emerald-800 border border-emerald-200 hover:border-emerald-300 transition-colors cursor-pointer group"
                        >
                          {act.type === 'create_donation' && <Sparkles className="w-3 h-3 text-emerald-600" />}
                          {act.type === 'open_map' && <MapPin className="w-3 h-3 text-emerald-600" />}
                          {act.type === 'browse' && <ArrowRight className="w-3 h-3 text-emerald-600" />}
                          <span>{act.label}</span>
                          <ArrowRight className="w-2.5 h-2.5 opacity-60 group-hover:translate-x-0.5 transition-transform" />
                        </button>
                      ))}
                    </div>
                  )}

                  {/* Fallback Notice Indicator */}
                  {msg.isFallback && (
                    <div className="mt-2 text-[10px] text-gray-400 flex items-center gap-1">
                      <ShieldCheck className="w-3 h-3 text-emerald-600" />
                      <span>Deterministic safety guidance mode</span>
                    </div>
                  )}
                </div>

                {msg.sender === 'user' && (
                  <div className="w-7 h-7 rounded-full bg-slate-300 text-gray-700 flex items-center justify-center flex-shrink-0 shadow-xs mt-1">
                    <User className="w-4 h-4" />
                  </div>
                )}
              </div>
            ))}

            {/* Typing Indicator */}
            {isLoading && (
              <div className="flex gap-2.5 justify-start">
                <div className="w-7 h-7 rounded-full bg-emerald-600 text-white flex items-center justify-center flex-shrink-0 shadow-xs mt-1">
                  <Bot className="w-4 h-4" />
                </div>
                <div className="bg-white border border-slate-200 rounded-2xl rounded-tl-xs px-4 py-2.5 text-xs text-gray-500 shadow-xs flex items-center gap-2">
                  <div className="flex items-center gap-1">
                    <span className="w-2 h-2 rounded-full bg-emerald-500 animate-bounce" style={{ animationDelay: '0ms' }} />
                    <span className="w-2 h-2 rounded-full bg-emerald-500 animate-bounce" style={{ animationDelay: '150ms' }} />
                    <span className="w-2 h-2 rounded-full bg-emerald-500 animate-bounce" style={{ animationDelay: '300ms' }} />
                  </div>
                  <span className="font-medium text-emerald-800">{t('mithra.typing')}</span>
                </div>
              </div>
            )}

            <div ref={messagesEndRef} />
          </div>

          {/* Quick Starters Chips */}
          <div className="px-3 py-2 bg-white border-t border-slate-100 flex items-center gap-1.5 overflow-x-auto no-scrollbar">
            <span className="text-[10px] font-semibold text-gray-400 uppercase tracking-wider flex-shrink-0">
              Suggestions:
            </span>
            {starterQuestions.map((q, i) => (
              <button
                key={i}
                disabled={isLoading}
                onClick={() => handleSendMessage(q)}
                className="flex-shrink-0 text-[11px] px-2.5 py-1 rounded-full bg-slate-100 hover:bg-emerald-50 hover:text-emerald-700 hover:border-emerald-200 border border-transparent text-gray-600 transition-all cursor-pointer whitespace-nowrap"
              >
                {q}
              </button>
            ))}
          </div>

          {/* Input Form */}
          <form
            onSubmit={(e) => {
              e.preventDefault();
              handleSendMessage();
            }}
            className="p-3 bg-white border-t border-slate-200 flex flex-col gap-1.5"
          >
            <div className="relative flex items-center">
              <input
                ref={inputRef}
                type="text"
                value={inputMessage}
                maxLength={1000}
                onChange={(e) => setInputMessage(e.target.value)}
                placeholder={t('mithra.placeholder')}
                disabled={isLoading}
                className="w-full pl-3.5 pr-20 py-2.5 bg-slate-50 border border-slate-300 rounded-xl text-sm text-gray-900 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-600 transition-all disabled:opacity-50"
              />
              <div className="absolute right-1.5 flex items-center gap-1">
                <span className="text-[10px] text-gray-400 tabular-nums">
                  {inputMessage.length > 0 ? `${inputMessage.length}/1000` : ''}
                </span>
                <button
                  type="submit"
                  disabled={!inputMessage.trim() || isLoading}
                  aria-label="Send message"
                  className="p-2 rounded-lg bg-emerald-600 hover:bg-emerald-700 disabled:bg-gray-200 disabled:text-gray-400 text-white transition-all cursor-pointer disabled:cursor-not-allowed shadow-xs"
                >
                  {isLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
                </button>
              </div>
            </div>

            {/* Disclaimer footer */}
            <div className="flex items-center justify-between text-[10px] text-gray-400 px-1">
              <span className="flex items-center gap-1">
                <Info className="w-2.5 h-2.5 text-gray-400" />
                Mithra AI provides operational guidance. Always verify food hygiene.
              </span>
              <span>Gemini 3.8 Flash</span>
            </div>
          </form>
        </div>
      )}
    </>
  );
};
