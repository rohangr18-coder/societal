export type UserRole = 'donor' | 'ngo' | 'volunteer' | 'admin';

export type DonationStatus =
  | 'available'
  | 'requested'
  | 'accepted'
  | 'scheduled'
  | 'picked_up'
  | 'delivered'
  | 'cancelled'
  | 'expired';

export interface TimelineEntry {
  status: DonationStatus;
  timestamp: string;
  actorName: string;
  actorId?: string;
  note?: string;
}

export interface UserProfile {
  uid: string;
  email: string;
  displayName: string;
  role: UserRole;
  phoneNumber?: string;
  organizationId?: string;
  preferredLanguage?: 'en' | 'kn' | 'hi' | 'ta';
  createdAt: string;
  updatedAt: string;
}

export interface Donation {
  id: string;
  donorId: string;
  donorName: string;
  foodName: string;
  category: string;
  description: string;
  quantity: number;
  unit: string;
  servings?: number;
  prepTime?: string;
  pickupDeadline: string;
  pickupAddress: string;
  latitude: number;
  longitude: number;
  storageType: string;
  packaging: string;
  allergens?: string;
  imageUrl?: string;
  status: DonationStatus;
  assignedNgoId?: string;
  assignedNgoName?: string;
  assignedVolunteerId?: string;
  assignedVolunteerName?: string;
  claimLock?: string;
  timeline?: TimelineEntry[];
  createdAt: string;
  updatedAt: string;
}

export interface Organization {
  id: string;
  ownerUid: string;
  name: string;
  registrationNumber: string;
  type: string;
  contactEmail: string;
  contactPhone: string;
  address: string;
  city: string;
  capacityDailyMeals: number;
  verificationStatus: 'pending' | 'verified' | 'rejected';
  verificationNotes?: string;
  documentUrl?: string;
  createdAt: string;
  updatedAt: string;
}

export interface VolunteerProfile {
  id: string;
  userId: string;
  fullName: string;
  phone: string;
  vehicleType: string;
  serviceArea: string;
  isAvailable: boolean;
  totalPickups: number;
  activeAssignmentId?: string;
  createdAt: string;
  updatedAt: string;
}

export interface InAppNotification {
  id: string;
  userId: string;
  title: string;
  message: string;
  type: 'request' | 'status_change' | 'assignment' | 'alert' | 'system';
  read: boolean;
  link?: string;
  createdAt: string;
}

export interface ImpactRecord {
  id: string;
  donationId: string;
  foodName: string;
  quantityKg: number;
  estimatedMeals: number;
  donorId: string;
  ngoId: string;
  volunteerId?: string;
  deliveredAt: string;
}

export interface AuditLog {
  id: string;
  action: string;
  performedBy: string;
  targetId?: string;
  details: string;
  timestamp: string;
}

export type ChatActionType =
  | 'create_donation'
  | 'open_map'
  | 'browse'
  | 'dashboard'
  | 'impact'
  | 'profile'
  | 'organizations'
  | 'about'
  | 'view_donation'
  | 'seed_demo';

export interface ChatAction {
  type: ChatActionType;
  label: string;
  targetId?: string;
  description?: string;
}

export interface ChatMessage {
  id: string;
  sender: 'user' | 'mithra';
  text: string;
  timestamp: string;
  actions?: ChatAction[];
  isError?: boolean;
  isFallback?: boolean;
}

export type SupportedLanguage = 'en' | 'kn' | 'hi' | 'ta';

export interface VerificationRecord {
  donationId: string;
  pickupToken: string;
  deliveryToken: string;
  pickupPin: string; // 6-digit short fallback PIN
  deliveryPin: string; // 6-digit short fallback PIN
  pickupUsed: boolean;
  deliveryUsed: boolean;
  pickedUpAt?: string;
  pickedUpBy?: string;
  pickedUpByName?: string;
  deliveredAt?: string;
  deliveredBy?: string;
  deliveredByName?: string;
  createdAt: string;
  updatedAt: string;
}

export type LiveTrackingStatus =
  | 'in_transit'
  | 'arrived_at_pickup'
  | 'en_route_to_shelter'
  | 'completed'
  | 'stopped';

export interface LiveTrackingSession {
  donationId: string;
  volunteerId: string;
  volunteerName: string;
  latitude: number;
  longitude: number;
  accuracy: number;
  status: LiveTrackingStatus;
  destinationLat?: number;
  destinationLng?: number;
  destinationAddress?: string;
  heading?: number | null;
  speed?: number | null;
  lastUpdatedAt: string;
}

export interface SmartMatchResult {
  ngo: Organization;
  donation: Donation;
  score: number;
  distanceKm: number;
  categoryMatch: boolean;
  capacityMatch: boolean;
  deadlineMatch: boolean;
  reasons: string[];
  summaryExplanation: string;
}

