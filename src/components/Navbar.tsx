import React, { useState, useEffect } from 'react';
import {
  HeartHandshake,
  Menu,
  X,
  Bell,
  BellRing,
  MapPin,
  PlusCircle,
  BarChart3,
  ShieldCheck,
  User,
  LogOut,
  LogIn,
  CheckCircle2,
  Compass,
  Users,
  Info,
  Globe,
  ChevronDown,
  Bike,
  Sparkles,
} from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { useLanguage } from '../context/LanguageContext';
import { subscribeNotifications, markNotificationAsRead } from '../services/dbService';
import { InAppNotification } from '../types';

interface NavbarProps {
  currentTab: string;
  setCurrentTab: (tab: string) => void;
  onOpenCreateDonation: () => void;
  onSelectRoleBeforeLogin?: (role: 'donor' | 'volunteer') => void;
  onOpenMithra?: () => void;
}

export const Navbar: React.FC<NavbarProps> = ({
  currentTab,
  setCurrentTab,
  onOpenCreateDonation,
  onSelectRoleBeforeLogin,
  onOpenMithra,
}) => {
  const { currentUser, userProfile, logout, isAdmin, isNgo, isDonor, isVolunteer } = useAuth();
  const { language, setLanguage, t, availableLanguages } = useLanguage();
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [notifDropdownOpen, setNotifDropdownOpen] = useState(false);
  const [langDropdownOpen, setLangDropdownOpen] = useState(false);
  const [notifications, setNotifications] = useState<InAppNotification[]>([]);

  useEffect(() => {
    if (!currentUser) {
      setNotifications([]);
      return;
    }
    const unsubscribe = subscribeNotifications(currentUser.uid, (list) => {
      setNotifications(list);
    });
    return () => unsubscribe && unsubscribe();
  }, [currentUser]);

  const unreadCount = notifications.filter((n) => !n.read).length;

  const handleNav = (tab: string) => {
    setCurrentTab(tab);
    setMobileMenuOpen(false);
    setNotifDropdownOpen(false);
  };

  return (
    <header className="sticky top-0 z-40 bg-white/95 backdrop-blur-md border-b border-emerald-100 shadow-xs">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex items-center justify-between h-16">
          {/* Brand Logo */}
          <button
            onClick={() => handleNav('home')}
            className="flex items-center gap-2.5 text-left group focus:outline-hidden"
          >
            <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-emerald-600 to-teal-700 flex items-center justify-center text-white shadow-xs group-hover:scale-105 transition-transform">
              <HeartHandshake className="w-6 h-6" />
            </div>
            <div>
              <span className="text-xl font-black text-stone-900 tracking-tight flex items-center">
                ResQ<span className="bg-gradient-to-r from-emerald-600 to-teal-600 bg-clip-text text-transparent font-black">Bite</span>
                <span className="w-1.5 h-1.5 rounded-full bg-amber-500 inline-block ml-1.5 mb-0.5" />
              </span>
              <span className="text-[11px] block text-emerald-700/90 font-medium tracking-tight">
                Surplus Food Rescue & Logistics
              </span>
            </div>
          </button>

          {/* Desktop Navigation */}
          <nav className="hidden lg:flex items-center gap-1">
            <button
              onClick={() => handleNav('browse')}
              className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-colors ${
                currentTab === 'browse'
                  ? 'bg-emerald-50 text-emerald-800 font-semibold'
                  : 'text-stone-600 hover:text-emerald-700 hover:bg-stone-50'
              }`}
            >
              {t('nav.browse')}
            </button>

            <button
              onClick={() => handleNav('map')}
              className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-colors flex items-center gap-1.5 ${
                currentTab === 'map'
                  ? 'bg-emerald-50 text-emerald-800 font-semibold'
                  : 'text-stone-600 hover:text-emerald-700 hover:bg-stone-50'
              }`}
            >
              <MapPin className="w-4 h-4 text-emerald-600" />
              {t('nav.map')}
            </button>

            {currentUser && (
              <>
                <button
                  onClick={() => handleNav('dashboard')}
                  className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-colors ${
                    currentTab === 'dashboard'
                      ? 'bg-emerald-50 text-emerald-800 font-semibold'
                      : 'text-stone-600 hover:text-emerald-700 hover:bg-stone-50'
                  }`}
                >
                  {t('nav.dashboard')}
                </button>
                <button
                  onClick={() => handleNav('organizations')}
                  className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-colors ${
                    currentTab === 'organizations'
                      ? 'bg-emerald-50 text-emerald-800 font-semibold'
                      : 'text-stone-600 hover:text-emerald-700 hover:bg-stone-50'
                  }`}
                >
                  {t('nav.organizations')}
                </button>
              </>
            )}

            <button
              onClick={() => {
                if (!currentUser) {
                  onSelectRoleBeforeLogin && onSelectRoleBeforeLogin('volunteer');
                  handleNav('auth');
                } else {
                  handleNav('volunteer');
                }
              }}
              className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-colors flex items-center gap-1.5 ${
                currentTab === 'volunteer'
                  ? 'bg-emerald-50 text-emerald-800 font-semibold'
                  : 'text-stone-600 hover:text-emerald-700 hover:bg-stone-50'
              }`}
            >
              <Bike className="w-4 h-4 text-emerald-600" />
              <span>Volunteer</span>
            </button>

            <button
              onClick={() => handleNav('impact')}
              className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-colors flex items-center gap-1.5 ${
                currentTab === 'impact'
                  ? 'bg-emerald-50 text-emerald-800 font-semibold'
                  : 'text-stone-600 hover:text-emerald-700 hover:bg-stone-50'
              }`}
            >
              <BarChart3 className="w-4 h-4 text-emerald-600" />
              {t('nav.impact')}
            </button>

            {isAdmin && (
              <button
                onClick={() => handleNav('admin')}
                className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-colors flex items-center gap-1.5 ${
                  currentTab === 'admin'
                    ? 'bg-amber-100 text-amber-900 font-semibold'
                    : 'text-amber-800 hover:bg-amber-50'
                }`}
              >
                <ShieldCheck className="w-4 h-4 text-amber-600" />
                {t('nav.admin')}
              </button>
            )}

            <button
              onClick={() => handleNav('about')}
              className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-colors ${
                currentTab === 'about'
                  ? 'bg-emerald-50 text-emerald-800 font-semibold'
                  : 'text-stone-600 hover:text-emerald-700 hover:bg-stone-50'
              }`}
            >
              {t('nav.about')}
            </button>
          </nav>

          {/* Action CTAs */}
          <div className="hidden sm:flex items-center gap-2.5">
            {/* Language Selector Dropdown */}
            <div className="relative">
              <button
                onClick={() => setLangDropdownOpen(!langDropdownOpen)}
                className="px-2.5 py-1.5 rounded-xl border border-stone-200 hover:border-emerald-300 bg-stone-50 hover:bg-emerald-50 text-stone-700 hover:text-emerald-900 text-xs font-bold flex items-center gap-1.5 transition-colors cursor-pointer"
                title={t('nav.selectLanguage')}
              >
                <Globe className="w-3.5 h-3.5 text-emerald-600" />
                <span>{availableLanguages.find((l) => l.code === language)?.nativeName || 'English'}</span>
                <ChevronDown className="w-3 h-3 text-stone-400" />
              </button>

              {langDropdownOpen && (
                <div className="absolute right-0 mt-2 w-44 bg-white rounded-2xl shadow-xl border border-stone-100 py-1.5 z-50 animate-in fade-in slide-in-from-top-2 duration-150">
                  <div className="px-3 py-1 text-[10px] font-bold uppercase tracking-wider text-stone-400">
                    {t('nav.selectLanguage')}
                  </div>
                  {availableLanguages.map((item) => (
                    <button
                      key={item.code}
                      onClick={() => {
                        setLanguage(item.code);
                        setLangDropdownOpen(false);
                      }}
                      className={`w-full px-3 py-2 text-xs flex items-center justify-between text-left transition-colors cursor-pointer ${
                        language === item.code
                          ? 'bg-emerald-50 text-emerald-900 font-bold'
                          : 'text-stone-700 hover:bg-stone-50'
                      }`}
                    >
                      <span className="flex items-center gap-2">
                        <span>{item.flag}</span>
                        <span>{item.nativeName}</span>
                      </span>
                      {language === item.code && (
                        <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600 shrink-0" />
                      )}
                    </button>
                  ))}
                </div>
              )}
            </div>

            {/* Mithra AI Button */}
            {onOpenMithra && (
              <button
                type="button"
                onClick={onOpenMithra}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl border border-emerald-200 bg-emerald-50 hover:bg-emerald-100 text-emerald-900 text-xs font-bold transition-all shadow-2xs hover:scale-102 cursor-pointer"
                title="Open Mithra AI Chatbot"
              >
                <Sparkles className="w-3.5 h-3.5 text-amber-500 animate-pulse" />
                <span>Mithra AI</span>
              </button>
            )}

            {currentUser ? (
              <>
                <button
                  onClick={onOpenCreateDonation}
                  className="bg-emerald-600 hover:bg-emerald-700 text-white font-medium text-sm px-4 py-2 rounded-xl shadow-xs transition-colors flex items-center gap-2 cursor-pointer"
                >
                  <PlusCircle className="w-4 h-4" />
                  {t('action.donateFood')}
                </button>

                {/* Notifications Dropdown */}
                <div className="relative">
                  <button
                    onClick={() => setNotifDropdownOpen(!notifDropdownOpen)}
                    className="p-2 text-stone-600 hover:text-emerald-700 hover:bg-emerald-50 rounded-xl relative transition-colors focus:outline-hidden"
                    title="Notifications"
                  >
                    <Bell className="w-5 h-5" />
                    {unreadCount > 0 && (
                      <span className="absolute top-1 right-1 w-4 h-4 bg-orange-600 text-white text-[10px] font-bold rounded-full flex items-center justify-center animate-pulse">
                        {unreadCount > 9 ? '9+' : unreadCount}
                      </span>
                    )}
                  </button>

                  {notifDropdownOpen && (
                    <div className="absolute right-0 mt-2 w-80 bg-white rounded-2xl shadow-xl border border-stone-100 py-2 z-50 animate-in fade-in slide-in-from-top-2 duration-150">
                      <div className="px-4 py-2 border-b border-stone-100 flex items-center justify-between">
                        <span className="text-sm font-semibold text-stone-800">Notifications</span>
                        <span className="text-xs text-stone-500">{notifications.length} updates</span>
                      </div>

                      {/* Push Notification Quick Status Banner */}
                      <div className="px-3 py-2 bg-stone-50 border-b border-stone-100 flex items-center justify-between text-[11px]">
                        {userProfile?.pushNotificationsEnabled ? (
                          <span className="text-emerald-700 font-semibold flex items-center gap-1.5">
                            <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
                            Browser Push Active
                          </span>
                        ) : (
                          <span className="text-stone-500 flex items-center gap-1.5">
                            <BellRing className="w-3.5 h-3.5 text-stone-400" />
                            Push Alerts Disabled
                          </span>
                        )}
                        <button
                          type="button"
                          onClick={() => {
                            setNotifDropdownOpen(false);
                            handleNav('settings');
                          }}
                          className="font-bold text-emerald-700 hover:text-emerald-800 hover:underline cursor-pointer"
                        >
                          {userProfile?.pushNotificationsEnabled ? 'Preferences' : 'Enable'}
                        </button>
                      </div>
                      <div className="max-h-72 overflow-y-auto divide-y divide-stone-50">
                        {notifications.length === 0 ? (
                          <div className="py-6 text-center text-xs text-stone-400">
                            No notifications yet
                          </div>
                        ) : (
                          notifications.map((notif) => (
                            <div
                              key={notif.id}
                              className={`p-3 text-xs hover:bg-emerald-50/50 cursor-pointer transition-colors ${
                                !notif.read ? 'bg-emerald-50/30 font-medium' : ''
                              }`}
                              onClick={() => {
                                markNotificationAsRead(notif.id);
                                if (notif.type === 'collection_request' || notif.link?.includes('volunteer')) {
                                  handleNav('volunteer');
                                } else if (notif.link) {
                                  handleNav('dashboard');
                                }
                              }}
                            >
                              <div className="flex items-start justify-between gap-1">
                                <span className="font-semibold text-emerald-900">{notif.title}</span>
                                {!notif.read && (
                                  <span className="w-2 h-2 rounded-full bg-orange-500 shrink-0 mt-1" />
                                )}
                              </div>
                              <p className="text-stone-600 mt-0.5 leading-relaxed">{notif.message}</p>
                              <span className="text-[10px] text-stone-400 mt-1 block">
                                {new Date(notif.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                              </span>
                            </div>
                          ))
                        )}
                      </div>
                    </div>
                  )}
                </div>

                {/* Profile menu */}
                <div className="flex items-center gap-2 pl-2 border-l border-stone-200">
                  <button
                    onClick={() => handleNav('profile')}
                    className="flex items-center gap-2 p-1.5 rounded-xl hover:bg-emerald-50 transition-colors"
                  >
                    <div className="w-8 h-8 rounded-full bg-emerald-100 text-emerald-800 flex items-center justify-center font-bold text-xs uppercase border border-emerald-200">
                      {userProfile?.displayName ? userProfile.displayName.charAt(0) : 'U'}
                    </div>
                    <div className="hidden md:block text-left text-xs">
                      <span className="font-semibold text-stone-800 block truncate max-w-[100px]">
                        {userProfile?.displayName || 'User'}
                      </span>
                      <span className="text-[10px] uppercase font-bold text-emerald-600">
                        {userProfile?.role || 'Member'}
                      </span>
                    </div>
                  </button>

                  <button
                    onClick={logout}
                    title="Sign Out"
                    className="p-2 text-stone-400 hover:text-red-600 hover:bg-red-50 rounded-xl transition-colors"
                  >
                    <LogOut className="w-4 h-4" />
                  </button>
                </div>
              </>
            ) : (
              <div className="flex items-center gap-2">
                <button
                  onClick={() => handleNav('auth')}
                  className="text-emerald-700 hover:text-emerald-800 font-medium text-sm px-3.5 py-2 rounded-xl hover:bg-emerald-50 transition-colors flex items-center gap-1.5"
                >
                  <LogIn className="w-4 h-4" />
                  Sign In
                </button>
                <button
                  onClick={() => handleNav('auth')}
                  className="bg-emerald-600 hover:bg-emerald-700 text-white font-medium text-sm px-4 py-2 rounded-xl shadow-xs transition-colors"
                >
                  Join Network
                </button>
              </div>
            )}
          </div>

          {/* Mobile menu trigger */}
          <div className="lg:hidden flex items-center gap-2">
            {currentUser && (
              <button
                onClick={() => setNotifDropdownOpen(!notifDropdownOpen)}
                className="p-2 text-stone-600 relative"
              >
                <Bell className="w-5 h-5" />
                {unreadCount > 0 && (
                  <span className="absolute top-1 right-1 w-3.5 h-3.5 bg-orange-600 text-white text-[9px] font-bold rounded-full flex items-center justify-center">
                    {unreadCount}
                  </span>
                )}
              </button>
            )}
            <button
              onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
              className="p-2 rounded-xl text-stone-600 hover:text-emerald-700 hover:bg-stone-100"
            >
              {mobileMenuOpen ? <X className="w-6 h-6" /> : <Menu className="w-6 h-6" />}
            </button>
          </div>
        </div>
      </div>

      {/* Mobile Drawer */}
      {mobileMenuOpen && (
        <div className="lg:hidden bg-white border-b border-stone-200 px-4 pt-2 pb-6 space-y-2 animate-in slide-in-from-top-2">
          {/* Mobile Language Switcher */}
          <div className="p-2.5 bg-stone-50 rounded-2xl border border-stone-200 mb-2">
            <span className="text-[10px] font-bold uppercase tracking-wider text-stone-500 block mb-1.5 flex items-center gap-1">
              <Globe className="w-3 h-3 text-emerald-600" />
              {t('nav.selectLanguage')}
            </span>
            <div className="grid grid-cols-2 gap-1.5">
              {availableLanguages.map((l) => (
                <button
                  key={l.code}
                  onClick={() => setLanguage(l.code)}
                  className={`px-2 py-1.5 rounded-xl text-xs font-semibold flex items-center justify-between transition-colors ${
                    language === l.code
                      ? 'bg-emerald-700 text-white shadow-2xs'
                      : 'bg-white border border-stone-200 text-stone-700 hover:bg-stone-100'
                  }`}
                >
                  <span className="flex items-center gap-1.5">
                    <span>{l.flag}</span>
                    <span>{l.nativeName}</span>
                  </span>
                  {language === l.code && <CheckCircle2 className="w-3 h-3 text-white" />}
                </button>
              ))}
            </div>
          </div>

          <button
            onClick={() => handleNav('browse')}
            className="w-full text-left px-3 py-2.5 rounded-xl font-medium text-stone-700 hover:bg-emerald-50 hover:text-emerald-800"
          >
            {t('nav.browse')}
          </button>
          <button
            onClick={() => handleNav('map')}
            className="w-full text-left px-3 py-2.5 rounded-xl font-medium text-stone-700 hover:bg-emerald-50 hover:text-emerald-800 flex items-center gap-2"
          >
            <MapPin className="w-4 h-4 text-emerald-600" />
            {t('nav.map')}
          </button>
          {currentUser && (
            <>
              <button
                onClick={() => handleNav('dashboard')}
                className="w-full text-left px-3 py-2.5 rounded-xl font-medium text-stone-700 hover:bg-emerald-50 hover:text-emerald-800"
              >
                {t('nav.dashboard')} ({userProfile?.role?.toUpperCase() || 'USER'})
              </button>
              <button
                onClick={() => handleNav('organizations')}
                className="w-full text-left px-3 py-2.5 rounded-xl font-medium text-stone-700 hover:bg-emerald-50 hover:text-emerald-800"
              >
                {t('nav.organizations')}
              </button>
              <button
                onClick={() => handleNav('profile')}
                className="w-full text-left px-3 py-2.5 rounded-xl font-medium text-stone-700 hover:bg-emerald-50 hover:text-emerald-800 flex items-center gap-2"
              >
                <User className="w-4 h-4 text-emerald-600" />
                {t('nav.profile')}
              </button>
            </>
          )}
          <button
            onClick={() => {
              if (!currentUser) {
                onSelectRoleBeforeLogin && onSelectRoleBeforeLogin('volunteer');
                handleNav('auth');
              } else {
                handleNav('volunteer');
              }
            }}
            className="w-full text-left px-3 py-2.5 rounded-xl font-medium text-stone-700 hover:bg-emerald-50 hover:text-emerald-800 flex items-center gap-2"
          >
            <Bike className="w-4 h-4 text-emerald-600" />
            <span>Volunteer & Food Rescue</span>
          </button>
          <button
            onClick={() => handleNav('impact')}
            className="w-full text-left px-3 py-2.5 rounded-xl font-medium text-stone-700 hover:bg-emerald-50 hover:text-emerald-800 flex items-center gap-2"
          >
            <BarChart3 className="w-4 h-4 text-emerald-600" />
            {t('nav.impact')}
          </button>
          {isAdmin && (
            <button
              onClick={() => handleNav('admin')}
              className="w-full text-left px-3 py-2.5 rounded-xl font-medium text-amber-900 bg-amber-50 hover:bg-amber-100 flex items-center gap-2"
            >
              <ShieldCheck className="w-4 h-4 text-amber-600" />
              {t('nav.admin')}
            </button>
          )}
          <button
            onClick={() => handleNav('about')}
            className="w-full text-left px-3 py-2.5 rounded-xl font-medium text-stone-700 hover:bg-emerald-50 hover:text-emerald-800"
          >
            {t('nav.about')}
          </button>

          {onOpenMithra && (
            <button
              onClick={() => {
                setMobileMenuOpen(false);
                onOpenMithra();
              }}
              className="w-full text-left px-3 py-2.5 rounded-xl font-bold text-emerald-900 bg-emerald-50 hover:bg-emerald-100 flex items-center gap-2 border border-emerald-200 cursor-pointer"
            >
              <Sparkles className="w-4 h-4 text-amber-500 animate-pulse" />
              <span>Ask Mithra AI Assistant</span>
            </button>
          )}

          <div className="pt-3 border-t border-stone-200">
            {currentUser ? (
              <div className="flex flex-col gap-2">
                <button
                  onClick={() => {
                    setMobileMenuOpen(false);
                    onOpenCreateDonation();
                  }}
                  className="w-full bg-emerald-600 text-white font-medium py-2.5 rounded-xl text-center shadow-xs"
                >
                  + {t('action.donateFood')}
                </button>
                <button
                  onClick={() => {
                    logout();
                    setMobileMenuOpen(false);
                  }}
                  className="w-full text-stone-600 py-2 rounded-xl text-center hover:bg-stone-100 text-sm font-medium"
                >
                  Sign Out ({currentUser.email})
                </button>
              </div>
            ) : (
              <button
                onClick={() => handleNav('auth')}
                className="w-full bg-emerald-600 text-white font-medium py-2.5 rounded-xl text-center shadow-xs"
              >
                Sign In / Register
              </button>
            )}
          </div>
        </div>
      )}
    </header>
  );
};
