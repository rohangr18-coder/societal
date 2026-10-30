import React, { useState, useEffect, useMemo } from 'react';
import {
  X,
  Bell,
  BellOff,
  Check,
  CheckCheck,
  Trash2,
  RotateCw,
  Bike,
  AlertTriangle,
  Clock,
  MapPin,
  ArrowRight,
  Filter,
  Search,
  Eye,
  EyeOff,
  Sparkles,
  ShieldAlert,
  Info,
  Calendar,
  ExternalLink,
} from 'lucide-react';
import { InAppNotification, Donation } from '../types';
import {
  subscribeNotifications,
  getUserNotifications,
  markNotificationAsRead,
  toggleNotificationRead,
  deleteNotification,
  markAllNotificationsAsRead,
  clearAllNotifications,
} from '../services/dbService';

interface VolunteerNotificationsSlideOverProps {
  isOpen: boolean;
  onClose: () => void;
  userId: string;
  donations?: Donation[];
  onSelectDonation?: (donation: Donation) => void;
  onNavigateTab?: (tab: string) => void;
}

export const VolunteerNotificationsSlideOver: React.FC<VolunteerNotificationsSlideOverProps> = ({
  isOpen,
  onClose,
  userId,
  donations = [],
  onSelectDonation,
  onNavigateTab,
}) => {
  const [notifications, setNotifications] = useState<InAppNotification[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [refreshing, setRefreshing] = useState<boolean>(false);
  const [filter, setFilter] = useState<'all' | 'unread' | 'requests' | 'updates'>('all');
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [sortOrder, setSortOrder] = useState<'newest' | 'oldest' | 'unread_first'>('newest');
  const [processingId, setProcessingId] = useState<string | null>(null);
  const [markingAll, setMarkingAll] = useState<boolean>(false);
  const [showClearConfirm, setShowClearConfirm] = useState<boolean>(false);
  const [clearing, setClearing] = useState<boolean>(false);

  // Subscribe to real-time notifications from Firestore
  useEffect(() => {
    if (!userId) {
      setNotifications([]);
      setLoading(false);
      return;
    }

    setLoading(true);
    const unsubscribe = subscribeNotifications(userId, (notifs) => {
      setNotifications(notifs);
      setLoading(false);
    });

    return () => {
      if (typeof unsubscribe === 'function') {
        unsubscribe();
      }
    };
  }, [userId]);

  // Handle ESC key press to close panel
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && isOpen) {
        onClose();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, onClose]);

  // Prevent background scrolling when slide-over is open
  useEffect(() => {
    if (isOpen) {
      document.body.style.overflow = 'hidden';
    } else {
      document.body.style.overflow = '';
    }
    return () => {
      document.body.style.overflow = '';
    };
  }, [isOpen]);

  // Manual refresh query
  const handleRefresh = async () => {
    if (!userId || refreshing) return;
    setRefreshing(true);
    try {
      const fresh = await getUserNotifications(userId);
      setNotifications(fresh);
    } catch (err) {
      console.warn('Could not refresh notifications:', err);
    } finally {
      setRefreshing(false);
    }
  };

  // Toggle single notification read / unread
  const handleToggleRead = async (e: React.MouseEvent, notif: InAppNotification) => {
    e.stopPropagation();
    setProcessingId(notif.id);
    try {
      await toggleNotificationRead(notif.id, !notif.read);
      setNotifications((prev) =>
        prev.map((n) =>
          n.id === notif.id
            ? {
                ...n,
                read: !notif.read,
                readAt: !notif.read ? new Date().toISOString() : undefined,
                deliveryStatus: !notif.read ? 'read' : 'delivered',
              }
            : n
        )
      );
    } catch (err) {
      console.error('Error toggling read status:', err);
    } finally {
      setProcessingId(null);
    }
  };

  // Delete single notification
  const handleDelete = async (e: React.MouseEvent, id: string) => {
    e.stopPropagation();
    setProcessingId(id);
    try {
      await deleteNotification(id);
      setNotifications((prev) => prev.filter((n) => n.id !== id));
    } catch (err) {
      console.error('Error deleting notification:', err);
    } finally {
      setProcessingId(null);
    }
  };

  // Mark all as read
  const handleMarkAllRead = async () => {
    if (!userId || markingAll) return;
    setMarkingAll(true);
    try {
      await markAllNotificationsAsRead(userId);
      setNotifications((prev) =>
        prev.map((n) => ({
          ...n,
          read: true,
          readAt: new Date().toISOString(),
          deliveryStatus: 'read',
        }))
      );
    } catch (err) {
      console.error('Error marking all as read:', err);
    } finally {
      setMarkingAll(false);
    }
  };

  // Clear all notifications
  const handleClearAll = async () => {
    if (!userId || clearing) return;
    setClearing(true);
    try {
      await clearAllNotifications(userId);
      setNotifications([]);
      setShowClearConfirm(false);
    } catch (err) {
      console.error('Error clearing notifications:', err);
    } finally {
      setClearing(false);
    }
  };

  // Action click on notification (navigate or select donation)
  const handleNotificationAction = (notif: InAppNotification) => {
    // Auto mark as read when clicked
    if (!notif.read) {
      markNotificationAsRead(notif.id).catch(console.warn);
      setNotifications((prev) =>
        prev.map((n) => (n.id === notif.id ? { ...n, read: true, deliveryStatus: 'read' } : n))
      );
    }

    // Try finding matching donation
    if (notif.donationId && donations.length > 0) {
      const match = donations.find((d) => d.id === notif.donationId);
      if (match && onSelectDonation) {
        onSelectDonation(match);
        onClose();
        return;
      }
    }

    // If type is collection_request, navigate to available collections
    if (notif.type === 'collection_request' && onNavigateTab) {
      onNavigateTab('available');
      onClose();
      return;
    }

    // If type is status_change or assignment, navigate to active runs
    if (['status_change', 'assignment'].includes(notif.type) && onNavigateTab) {
      onNavigateTab('active');
      onClose();
      return;
    }
  };

  // Counts for pills
  const unreadCount = useMemo(
    () => notifications.filter((n) => !n.read).length,
    [notifications]
  );
  const requestCount = useMemo(
    () => notifications.filter((n) => n.type === 'collection_request').length,
    [notifications]
  );
  const updateCount = useMemo(
    () => notifications.filter((n) => n.type !== 'collection_request').length,
    [notifications]
  );

  // Filtered & Sorted notifications
  const displayedNotifications = useMemo(() => {
    let result = [...notifications];

    // Filter by category
    if (filter === 'unread') {
      result = result.filter((n) => !n.read);
    } else if (filter === 'requests') {
      result = result.filter((n) => n.type === 'collection_request');
    } else if (filter === 'updates') {
      result = result.filter((n) => n.type !== 'collection_request');
    }

    // Filter by search query
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase().trim();
      result = result.filter(
        (n) =>
          n.title?.toLowerCase().includes(q) ||
          n.message?.toLowerCase().includes(q) ||
          n.deadline?.toLowerCase().includes(q)
      );
    }

    // Timestamp sorting
    result.sort((a, b) => {
      if (sortOrder === 'unread_first') {
        if (!a.read && b.read) return -1;
        if (a.read && !b.read) return 1;
        // tie-breaker: newest first
        return new Date(b.createdAt || 0).getTime() - new Date(a.createdAt || 0).getTime();
      }
      if (sortOrder === 'oldest') {
        return new Date(a.createdAt || 0).getTime() - new Date(b.createdAt || 0).getTime();
      }
      // default: newest first
      return new Date(b.createdAt || 0).getTime() - new Date(a.createdAt || 0).getTime();
    });

    return result;
  }, [notifications, filter, searchQuery, sortOrder]);

  // Relative timestamp helper
  const formatRelativeTime = (isoString?: string): string => {
    if (!isoString) return 'Recent';
    const timestamp = new Date(isoString).getTime();
    if (isNaN(timestamp)) return 'Recent';
    const diffMs = Date.now() - timestamp;
    const diffSec = Math.floor(diffMs / 1000);
    const diffMin = Math.floor(diffSec / 60);
    const diffHour = Math.floor(diffMin / 60);
    const diffDay = Math.floor(diffHour / 24);

    if (diffSec < 60) return 'Just now';
    if (diffMin < 60) return `${diffMin}m ago`;
    if (diffHour < 24) return `${diffHour}h ago`;
    if (diffDay === 1) return 'Yesterday';
    if (diffDay < 7) return `${diffDay}d ago`;

    return new Date(timestamp).toLocaleDateString(undefined, {
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  };

  // Notification Icon helper
  const renderNotificationIcon = (notif: InAppNotification) => {
    switch (notif.type) {
      case 'collection_request':
        return (
          <div className="w-10 h-10 rounded-2xl bg-amber-100 text-amber-800 flex items-center justify-center shrink-0 shadow-xs">
            <AlertTriangle className="w-5 h-5 text-amber-600" />
          </div>
        );
      case 'assignment':
        return (
          <div className="w-10 h-10 rounded-2xl bg-emerald-100 text-emerald-800 flex items-center justify-center shrink-0 shadow-xs">
            <Bike className="w-5 h-5 text-emerald-600" />
          </div>
        );
      case 'status_change':
        return (
          <div className="w-10 h-10 rounded-2xl bg-blue-100 text-blue-800 flex items-center justify-center shrink-0 shadow-xs">
            <Clock className="w-5 h-5 text-blue-600" />
          </div>
        );
      case 'alert':
        return (
          <div className="w-10 h-10 rounded-2xl bg-rose-100 text-rose-800 flex items-center justify-center shrink-0 shadow-xs">
            <ShieldAlert className="w-5 h-5 text-rose-600" />
          </div>
        );
      default:
        return (
          <div className="w-10 h-10 rounded-2xl bg-stone-100 text-stone-700 flex items-center justify-center shrink-0 shadow-xs">
            <Bell className="w-5 h-5 text-emerald-600" />
          </div>
        );
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 overflow-hidden" role="dialog" aria-modal="true" aria-labelledby="slide-over-title">
      {/* Background backdrop */}
      <div
        className="fixed inset-0 bg-stone-900/60 backdrop-blur-xs transition-opacity duration-300 animate-in fade-in"
        onClick={onClose}
        aria-hidden="true"
      />

      <div className="fixed inset-y-0 right-0 max-w-full flex pl-10">
        <div className="w-screen max-w-md sm:max-w-lg bg-white shadow-2xl flex flex-col h-full animate-in slide-in-from-right duration-300">
          {/* Header */}
          <div className="p-5 sm:p-6 border-b border-stone-100 bg-stone-50/80 shrink-0">
            <div className="flex items-center justify-between gap-4">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-2xl bg-emerald-600 text-white flex items-center justify-center shadow-xs">
                  <Bell className="w-5 h-5" />
                </div>
                <div>
                  <h2 id="slide-over-title" className="text-lg font-black text-stone-900 tracking-tight flex items-center gap-2">
                    Recent Notifications
                    {unreadCount > 0 && (
                      <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-black bg-emerald-600 text-white">
                        {unreadCount} new
                      </span>
                    )}
                  </h2>
                  <p className="text-xs text-stone-500">
                    Real-time collection requests and pickup telemetry
                  </p>
                </div>
              </div>

              <div className="flex items-center gap-1.5">
                <button
                  onClick={handleRefresh}
                  disabled={refreshing}
                  title="Refresh from Firestore"
                  className="p-2 text-stone-400 hover:text-stone-700 hover:bg-stone-200/60 rounded-xl transition-colors cursor-pointer"
                  aria-label="Refresh notifications"
                >
                  <RotateCw className={`w-4 h-4 ${refreshing ? 'animate-spin text-emerald-600' : ''}`} />
                </button>
                <button
                  onClick={onClose}
                  className="p-2 text-stone-400 hover:text-stone-700 hover:bg-stone-200/60 rounded-xl transition-colors cursor-pointer"
                  aria-label="Close notifications panel"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>
            </div>

            {/* Quick Action Bar */}
            <div className="mt-4 pt-4 border-t border-stone-200/60 flex items-center justify-between gap-2">
              <div className="flex items-center gap-2 text-xs text-stone-600">
                <span className="font-semibold text-stone-800">{notifications.length}</span> Total Alerts
                {unreadCount > 0 && (
                  <span className="text-emerald-700 font-bold">({unreadCount} unread)</span>
                )}
              </div>

              <div className="flex items-center gap-2">
                {unreadCount > 0 && (
                  <button
                    onClick={handleMarkAllRead}
                    disabled={markingAll}
                    className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold text-emerald-700 bg-emerald-50 hover:bg-emerald-100 border border-emerald-200 transition-colors cursor-pointer"
                  >
                    <CheckCheck className="w-3.5 h-3.5" />
                    <span>{markingAll ? 'Updating...' : 'Mark all read'}</span>
                  </button>
                )}

                {notifications.length > 0 && (
                  <button
                    onClick={() => setShowClearConfirm(true)}
                    className="inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs font-semibold text-stone-500 hover:text-rose-600 hover:bg-rose-50 transition-colors cursor-pointer"
                    title="Clear notification history"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                    <span className="hidden sm:inline">Clear</span>
                  </button>
                )}
              </div>
            </div>

            {/* Confirmation Banner for Clear All */}
            {showClearConfirm && (
              <div className="mt-3 p-3 bg-rose-50 border border-rose-200 rounded-xl text-xs flex items-center justify-between gap-3 animate-in fade-in">
                <span className="text-rose-900 font-medium">Delete all notification history?</span>
                <div className="flex items-center gap-2">
                  <button
                    onClick={handleClearAll}
                    disabled={clearing}
                    className="px-2.5 py-1 bg-rose-600 text-white rounded-lg font-bold hover:bg-rose-700 cursor-pointer"
                  >
                    {clearing ? 'Clearing...' : 'Confirm'}
                  </button>
                  <button
                    onClick={() => setShowClearConfirm(false)}
                    className="px-2 py-1 text-stone-600 hover:bg-stone-200 rounded-lg cursor-pointer"
                  >
                    Cancel
                  </button>
                </div>
              </div>
            )}
          </div>

          {/* Filter Bar, Search, and Sort Controls */}
          <div className="px-5 py-3 border-b border-stone-100 bg-white space-y-3 shrink-0">
            {/* Search Input */}
            <div className="relative">
              <Search className="w-4 h-4 text-stone-400 absolute left-3 top-1/2 -translate-y-1/2" />
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Search food, location, alert type..."
                className="w-full pl-9 pr-8 py-2 rounded-xl text-xs bg-stone-100 border-none focus:ring-2 focus:ring-emerald-500 focus:bg-white transition-all text-stone-800 placeholder-stone-400"
              />
              {searchQuery && (
                <button
                  onClick={() => setSearchQuery('')}
                  className="absolute right-2.5 top-1/2 -translate-y-1/2 text-stone-400 hover:text-stone-700"
                >
                  <X className="w-3.5 h-3.5" />
                </button>
              )}
            </div>

            {/* Category Filter Pills & Sort Selector */}
            <div className="flex items-center justify-between gap-2">
              <div className="flex items-center gap-1.5 overflow-x-auto pb-1 scrollbar-none">
                <button
                  onClick={() => setFilter('all')}
                  className={`px-2.5 py-1 rounded-lg text-xs font-bold transition-all whitespace-nowrap cursor-pointer ${
                    filter === 'all'
                      ? 'bg-stone-900 text-white'
                      : 'bg-stone-100 text-stone-600 hover:bg-stone-200'
                  }`}
                >
                  All ({notifications.length})
                </button>
                <button
                  onClick={() => setFilter('unread')}
                  className={`px-2.5 py-1 rounded-lg text-xs font-bold transition-all whitespace-nowrap cursor-pointer ${
                    filter === 'unread'
                      ? 'bg-emerald-600 text-white'
                      : 'bg-stone-100 text-stone-600 hover:bg-stone-200'
                  }`}
                >
                  Unread ({unreadCount})
                </button>
                <button
                  onClick={() => setFilter('requests')}
                  className={`px-2.5 py-1 rounded-lg text-xs font-bold transition-all whitespace-nowrap cursor-pointer ${
                    filter === 'requests'
                      ? 'bg-amber-600 text-white'
                      : 'bg-stone-100 text-stone-600 hover:bg-stone-200'
                  }`}
                >
                  Requests ({requestCount})
                </button>
                <button
                  onClick={() => setFilter('updates')}
                  className={`px-2.5 py-1 rounded-lg text-xs font-bold transition-all whitespace-nowrap cursor-pointer ${
                    filter === 'updates'
                      ? 'bg-blue-600 text-white'
                      : 'bg-stone-100 text-stone-600 hover:bg-stone-200'
                  }`}
                >
                  Updates ({updateCount})
                </button>
              </div>

              {/* Timestamp Sort Toggle */}
              <select
                value={sortOrder}
                onChange={(e) => setSortOrder(e.target.value as any)}
                className="text-xs bg-stone-100 border-none rounded-lg px-2 py-1 font-semibold text-stone-700 cursor-pointer focus:ring-1 focus:ring-emerald-500 shrink-0"
              >
                <option value="newest">Newest First</option>
                <option value="oldest">Oldest First</option>
                <option value="unread_first">Unread First</option>
              </select>
            </div>
          </div>

          {/* Notifications Scroll List */}
          <div className="flex-1 overflow-y-auto p-5 sm:p-6 space-y-3.5 bg-stone-50/50">
            {loading ? (
              <div className="py-16 text-center space-y-3">
                <div className="w-8 h-8 border-3 border-emerald-600 border-t-transparent rounded-full animate-spin mx-auto" />
                <p className="text-xs text-stone-500 font-medium">Loading notifications from Firestore...</p>
              </div>
            ) : displayedNotifications.length === 0 ? (
              <div className="py-16 text-center space-y-3">
                <div className="w-14 h-14 rounded-full bg-stone-100 text-stone-400 flex items-center justify-center mx-auto">
                  <BellOff className="w-7 h-7" />
                </div>
                <div className="space-y-1">
                  <h3 className="text-sm font-bold text-stone-800">
                    {filter === 'unread'
                      ? 'All caught up!'
                      : searchQuery
                      ? 'No matching notifications'
                      : 'No notifications yet'}
                  </h3>
                  <p className="text-xs text-stone-500 max-w-xs mx-auto">
                    {filter === 'unread'
                      ? 'You have read all collection alerts and status updates.'
                      : searchQuery
                      ? 'Try clearing your search term or selecting another filter category.'
                      : 'When new food donations are posted within your 10 km radius or pickup milestones update, alerts will appear here in real time.'}
                  </p>
                </div>
                {(filter !== 'all' || searchQuery) && (
                  <button
                    onClick={() => {
                      setFilter('all');
                      setSearchQuery('');
                    }}
                    className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-white border border-stone-200 rounded-xl text-xs font-bold text-stone-700 hover:bg-stone-50 shadow-2xs cursor-pointer"
                  >
                    Reset Filters
                  </button>
                )}
              </div>
            ) : (
              displayedNotifications.map((notif) => {
                const isUnread = !notif.read;
                const isProcessing = processingId === notif.id;

                return (
                  <div
                    key={notif.id}
                    onClick={() => handleNotificationAction(notif)}
                    className={`group relative p-4 rounded-2xl border transition-all duration-200 cursor-pointer ${
                      isUnread
                        ? 'bg-white border-emerald-200 shadow-sm hover:border-emerald-400 hover:shadow-md ring-1 ring-emerald-500/10'
                        : 'bg-white/80 border-stone-200/80 hover:bg-white hover:border-stone-300'
                    }`}
                  >
                    {/* Unread Accent Pill */}
                    {isUnread && (
                      <span className="absolute -top-1.5 -left-1.5 flex h-3.5 w-3.5">
                        <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
                        <span className="relative inline-flex rounded-full h-3.5 w-3.5 bg-emerald-600 border-2 border-white"></span>
                      </span>
                    )}

                    <div className="flex items-start gap-3.5">
                      {/* Icon */}
                      {renderNotificationIcon(notif)}

                      {/* Content */}
                      <div className="flex-1 min-w-0">
                        <div className="flex items-start justify-between gap-2">
                          <h4
                            className={`text-xs sm:text-sm tracking-tight leading-snug line-clamp-2 ${
                              isUnread ? 'font-black text-stone-900' : 'font-semibold text-stone-700'
                            }`}
                          >
                            {notif.title}
                          </h4>

                          {/* Timestamp */}
                          <span
                            className="text-[11px] font-semibold text-stone-400 shrink-0 whitespace-nowrap"
                            title={notif.createdAt ? new Date(notif.createdAt).toLocaleString() : undefined}
                          >
                            {formatRelativeTime(notif.createdAt)}
                          </span>
                        </div>

                        {/* Message body */}
                        <p className="mt-1 text-xs text-stone-600 leading-relaxed">
                          {notif.message}
                        </p>

                        {/* Metadata Pills: Distance & Deadline */}
                        {(notif.distanceKm !== undefined || notif.deadline) && (
                          <div className="mt-2.5 flex flex-wrap items-center gap-2">
                            {notif.distanceKm !== undefined && (
                              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-lg bg-emerald-50 text-emerald-800 text-[11px] font-bold border border-emerald-100">
                                <MapPin className="w-3 h-3 text-emerald-600" />
                                <span>~{notif.distanceKm.toFixed(1)} km</span>
                              </span>
                            )}

                            {notif.deadline && (
                              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-lg bg-amber-50 text-amber-800 text-[11px] font-bold border border-amber-100">
                                <Clock className="w-3 h-3 text-amber-600" />
                                <span>{notif.deadline}</span>
                              </span>
                            )}

                            {notif.deliveryStatus && (
                              <span
                                className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-lg text-[10px] font-bold uppercase tracking-wider ${
                                  notif.deliveryStatus === 'read'
                                    ? 'bg-stone-100 text-stone-600'
                                    : 'bg-blue-50 text-blue-700'
                                }`}
                              >
                                {notif.deliveryStatus}
                              </span>
                            )}
                          </div>
                        )}

                        {/* Action Toolbar */}
                        <div className="mt-3 pt-2.5 border-t border-stone-100 flex items-center justify-between gap-2">
                          {/* Main CTA */}
                          <div className="flex items-center gap-1.5 text-xs font-bold text-emerald-700 group-hover:text-emerald-800">
                            <span>{notif.type === 'collection_request' ? 'View Request' : 'Inspect'}</span>
                            <ArrowRight className="w-3.5 h-3.5 group-hover:translate-x-0.5 transition-transform" />
                          </div>

                          {/* Quick controls */}
                          <div className="flex items-center gap-1 opacity-80 group-hover:opacity-100 transition-opacity">
                            {/* Toggle Read/Unread Button */}
                            <button
                              onClick={(e) => handleToggleRead(e, notif)}
                              disabled={isProcessing}
                              className={`p-1.5 rounded-lg transition-colors cursor-pointer ${
                                isUnread
                                  ? 'text-stone-400 hover:text-emerald-700 hover:bg-emerald-50'
                                  : 'text-stone-400 hover:text-stone-700 hover:bg-stone-100'
                              }`}
                              title={isUnread ? 'Mark as read' : 'Mark as unread'}
                            >
                              {isUnread ? (
                                <Check className="w-3.5 h-3.5" />
                              ) : (
                                <EyeOff className="w-3.5 h-3.5" />
                              )}
                            </button>

                            {/* Delete Button */}
                            <button
                              onClick={(e) => handleDelete(e, notif.id)}
                              disabled={isProcessing}
                              className="p-1.5 text-stone-400 hover:text-rose-600 hover:bg-rose-50 rounded-lg transition-colors cursor-pointer"
                              title="Delete notification"
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                            </button>
                          </div>
                        </div>
                      </div>
                    </div>
                  </div>
                );
              })
            )}
          </div>

          {/* Footer note */}
          <div className="p-4 border-t border-stone-200 bg-stone-50/90 text-center shrink-0">
            <p className="text-[11px] text-stone-500 flex items-center justify-center gap-1.5">
              <Sparkles className="w-3.5 h-3.5 text-emerald-600" />
              <span>Synced directly with your private Firestore notifications database</span>
            </p>
          </div>
        </div>
      </div>
    </div>
  );
};
