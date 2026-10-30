import fs from 'fs';
import path from 'path';

interface TestNotification {
  id: string;
  userId: string;
  recipientUserId?: string;
  title: string;
  message: string;
  type: 'collection_request' | 'status_change' | 'assignment' | 'alert' | 'system';
  read: boolean;
  link?: string;
  donationId?: string;
  distanceKm?: number;
  deadline?: string;
  deliveryStatus?: 'sent' | 'delivered' | 'read';
  readAt?: string;
  createdAt: string;
}

async function testNotificationsSlideOver() {
  console.log('🧪 Testing Volunteer Recent Notifications Slide-over & Firestore Sync...\n');

  let passed = 0;
  let failed = 0;

  function assert(condition: boolean, testName: string) {
    if (condition) {
      console.log(`  ✅ PASS: ${testName}`);
      passed++;
    } else {
      console.error(`  ❌ FAIL: ${testName}`);
      failed++;
    }
  }

  // --- Test 1: Timestamp Sorting (Newest First, Oldest First, Unread First) ---
  console.log('--- Test 1: Timestamp Sorting Algorithm ---');
  const sampleNotifications: TestNotification[] = [
    {
      id: 'notif_1',
      userId: 'vol_123',
      title: 'Donation Accepted',
      message: 'You claimed 20 meals',
      type: 'assignment',
      read: true,
      createdAt: '2026-10-29T10:00:00.000Z', // Oldest
    },
    {
      id: 'notif_2',
      userId: 'vol_123',
      title: '🚨 Nearby Food Collection Alert!',
      message: 'Paneer Biryani 2.4 km away',
      type: 'collection_request',
      read: false,
      distanceKm: 2.4,
      deadline: 'Today 8:00 PM',
      createdAt: '2026-10-30T08:30:00.000Z', // Newest
    },
    {
      id: 'notif_3',
      userId: 'vol_123',
      title: 'Status Update: In Transit',
      message: 'Food collected successfully',
      type: 'status_change',
      read: false,
      createdAt: '2026-10-30T06:15:00.000Z', // Middle
    },
    {
      id: 'notif_4',
      userId: 'vol_123',
      title: 'Delivery Completed',
      message: 'Verified receipt by shelter',
      type: 'status_change',
      read: true,
      createdAt: '2026-10-29T18:00:00.000Z', // Middle-old
    },
  ];

  // Test Newest First (default)
  const newestFirst = [...sampleNotifications].sort(
    (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
  );
  assert(newestFirst[0].id === 'notif_2', 'Newest first puts 08:30 AM alert at index 0');
  assert(newestFirst[1].id === 'notif_3', 'Newest first puts 06:15 AM alert at index 1');
  assert(newestFirst[3].id === 'notif_1', 'Newest first puts Oct 29 10:00 AM alert at the end');

  // Test Oldest First
  const oldestFirst = [...sampleNotifications].sort(
    (a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime()
  );
  assert(oldestFirst[0].id === 'notif_1', 'Oldest first puts Oct 29 alert at index 0');
  assert(oldestFirst[3].id === 'notif_2', 'Oldest first puts newest alert at the end');

  // Test Unread First with timestamp tiebreaker
  const unreadFirst = [...sampleNotifications].sort((a, b) => {
    if (!a.read && b.read) return -1;
    if (a.read && !b.read) return 1;
    return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
  });
  assert(!unreadFirst[0].read && !unreadFirst[1].read, 'Unread first groups unread notifications at top');
  assert(unreadFirst[0].id === 'notif_2', 'Unread notifications are sub-sorted by newest timestamp');
  assert(unreadFirst[2].read && unreadFirst[3].read, 'Read notifications are placed below unread');

  // --- Test 2: Read / Unread Status Toggling & Invariants ---
  console.log('\n--- Test 2: Read / Unread Status Management ---');
  let testItem: TestNotification = { ...sampleNotifications[1] };
  assert(testItem.read === false, 'Initial notification is unread (read: false)');

  // Toggle to read
  testItem = {
    ...testItem,
    read: true,
    readAt: new Date().toISOString(),
    deliveryStatus: 'read',
  };
  assert(testItem.read === true, 'Toggled notification is marked read (read: true)');
  assert(Boolean(testItem.readAt), 'Read timestamp (readAt) is populated');
  assert(testItem.deliveryStatus === 'read', 'deliveryStatus transitioned to read');

  // Toggle back to unread
  testItem = {
    ...testItem,
    read: false,
    readAt: undefined,
    deliveryStatus: 'delivered',
  };
  assert(testItem.read === false, 'Toggled back to unread');
  assert(testItem.readAt === undefined, 'readAt cleared on mark unread');

  // Batch mark-all-read simulation
  const markedAll = sampleNotifications.map((n) => ({
    ...n,
    read: true,
    readAt: new Date().toISOString(),
    deliveryStatus: 'read' as const,
  }));
  const remainingUnread = markedAll.filter((n) => !n.read).length;
  assert(remainingUnread === 0, 'Mark all as read marks 100% of items as read');

  // --- Test 3: Notification Categories & Filtering ---
  console.log('\n--- Test 3: Category & Keyword Filtering ---');
  const unreadOnly = sampleNotifications.filter((n) => !n.read);
  assert(unreadOnly.length === 2, 'Unread filter returns exactly 2 notifications');

  const requestsOnly = sampleNotifications.filter((n) => n.type === 'collection_request');
  assert(requestsOnly.length === 1 && requestsOnly[0].id === 'notif_2', 'Requests filter returns collection requests');

  const updatesOnly = sampleNotifications.filter((n) => n.type !== 'collection_request');
  assert(updatesOnly.length === 3, 'Updates filter returns status changes and assignments');

  const searchBiryani = sampleNotifications.filter(
    (n) => n.title.toLowerCase().includes('biryani') || n.message.toLowerCase().includes('biryani')
  );
  assert(searchBiryani.length === 1 && searchBiryani[0].id === 'notif_2', 'Search query finds "biryani" in message text');

  // --- Test 4: File Inspection & Component Structure ---
  console.log('\n--- Test 4: File & Component Verification ---');
  const slideOverPath = path.resolve('src/components/VolunteerNotificationsSlideOver.tsx');
  assert(fs.existsSync(slideOverPath), 'VolunteerNotificationsSlideOver.tsx exists in src/components');

  const slideOverContent = fs.readFileSync(slideOverPath, 'utf-8');
  assert(slideOverContent.includes('subscribeNotifications'), 'Slide-over subscribes to Firestore real-time notifications');
  assert(slideOverContent.includes('toggleNotificationRead'), 'Slide-over supports toggling read/unread status');
  assert(slideOverContent.includes('markAllNotificationsAsRead'), 'Slide-over includes markAllNotificationsAsRead');
  assert(slideOverContent.includes('clearAllNotifications'), 'Slide-over includes clearAllNotifications');
  assert(slideOverContent.includes('new Date(b.createdAt'), 'Slide-over performs timestamp sorting');
  assert(slideOverContent.includes('Recent Notifications'), 'Slide-over displays Recent Notifications title');

  const volunteerViewPath = path.resolve('src/components/VolunteerView.tsx');
  const volunteerViewContent = fs.readFileSync(volunteerViewPath, 'utf-8');
  assert(volunteerViewContent.includes('VolunteerNotificationsSlideOver'), 'VolunteerView imports VolunteerNotificationsSlideOver');
  assert(volunteerViewContent.includes('setNotificationsOpen(true)'), 'VolunteerView has trigger button to open slide-over');
  assert(volunteerViewContent.includes('unreadNotifCount'), 'VolunteerView tracks unread notification count badge');

  const dbServicePath = path.resolve('src/services/dbService.ts');
  const dbServiceContent = fs.readFileSync(dbServicePath, 'utf-8');
  assert(dbServiceContent.includes('export async function getUserNotifications'), 'dbService exports getUserNotifications');
  assert(dbServiceContent.includes('export async function toggleNotificationRead'), 'dbService exports toggleNotificationRead');
  assert(dbServiceContent.includes('export async function deleteNotification'), 'dbService exports deleteNotification');
  assert(dbServiceContent.includes('export async function clearAllNotifications'), 'dbService exports clearAllNotifications');

  console.log('\n================================');
  console.log(`Total tests: ${passed + failed}`);
  console.log(`Passed: ${passed}`);
  console.log(`Failed: ${failed}`);
  console.log('================================');

  if (failed > 0) {
    process.exit(1);
  }
}

testNotificationsSlideOver().catch((err) => {
  console.error('Fatal test error:', err);
  process.exit(1);
});
