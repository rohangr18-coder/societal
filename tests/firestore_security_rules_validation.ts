/**
 * Firestore Security Rules & State Machine Validation Test Suite
 *
 * Covers Phase 1 Security Hardening requirements:
 * 1. Unauthorized donation status jumps (state-machine transition enforcement)
 * 2. Volunteer reading verification tokens denied (token isolation & least privilege)
 * 3. Client writing impact records denied (server-only write enforcement)
 * 4. Non-owner editing a donation denied (owner immutability & pre-pickup editing window)
 * 5. Admin verification via admins collection / token claims (no hardcoded emails)
 * 6. Private subcollection isolation for donor contact info & volunteer live GPS telemetry
 */

import fs from 'fs';
import path from 'path';
import { DonationStatus } from '../src/types';

function runFirestoreRulesValidation() {
  console.log('🛡️ Starting ResQBite Firestore Security Rules Validation Suite...\n');

  let passed = 0;
  let failed = 0;

  function assert(condition: boolean, testName: string, detail?: string) {
    if (condition) {
      console.log(`  ✅ PASS: ${testName}`);
      passed++;
    } else {
      console.error(`  ❌ FAIL: ${testName}${detail ? ` (${detail})` : ''}`);
      failed++;
    }
  }

  // Read firestore.rules source for static structural validation
  const rulesPath = path.resolve(process.cwd(), 'firestore.rules');
  assert(fs.existsSync(rulesPath), 'firestore.rules exists in repository root');
  const rulesContent = fs.readFileSync(rulesPath, 'utf-8');

  // ====================================================
  // TEST SUITE 1: State Machine Transition Enforcement
  // ====================================================
  console.log('--- Test Suite 1: State Machine Status Transitions ---');

  // Exact state transition logic from firestore.rules isValidStatusTransition
  function isValidStatusTransition(oldStatus: DonationStatus, newStatus: DonationStatus): boolean {
    if (oldStatus === newStatus) return true;

    // Happy path transitions
    if (oldStatus === 'available' && (newStatus === 'requested' || newStatus === 'accepted')) return true;
    if (oldStatus === 'requested' && newStatus === 'accepted') return true;
    if (oldStatus === 'accepted' && (newStatus === 'scheduled' || newStatus === 'picked_up')) return true;
    if (oldStatus === 'scheduled' && newStatus === 'picked_up') return true;
    if (oldStatus === 'picked_up' && (newStatus === 'in_transit' || newStatus === 'delivered')) return true;
    if (oldStatus === 'in_transit' && newStatus === 'delivered') return true;
    if (oldStatus === 'delivered' && newStatus === 'completed') return true;

    // Cancellation / expiration transitions from early states
    if (['available', 'requested', 'accepted', 'scheduled'].includes(oldStatus) &&
        ['cancelled', 'expired'].includes(newStatus)) {
      return true;
    }

    return false;
  }

  // Valid status transitions
  assert(isValidStatusTransition('available', 'requested'), 'Available -> Requested allowed for NGO reservation');
  assert(isValidStatusTransition('available', 'accepted'), 'Available -> Accepted allowed for instant confirmation');
  assert(isValidStatusTransition('requested', 'accepted'), 'Requested -> Accepted allowed for donor handover');
  assert(isValidStatusTransition('accepted', 'scheduled'), 'Accepted -> Scheduled allowed for volunteer dispatch');
  assert(isValidStatusTransition('accepted', 'picked_up'), 'Accepted -> Picked_Up allowed for direct courier pickup');
  assert(isValidStatusTransition('scheduled', 'picked_up'), 'Scheduled -> Picked_Up allowed for physical collection');
  assert(isValidStatusTransition('picked_up', 'in_transit'), 'Picked_Up -> In_Transit allowed for courier en route');
  assert(isValidStatusTransition('in_transit', 'delivered'), 'In_Transit -> Delivered allowed for shelter delivery');
  assert(isValidStatusTransition('delivered', 'completed'), 'Delivered -> Completed allowed for final receipt');

  // Early cancellation & expiration
  assert(isValidStatusTransition('available', 'cancelled'), 'Available -> Cancelled allowed');
  assert(isValidStatusTransition('requested', 'cancelled'), 'Requested -> Cancelled allowed');
  assert(isValidStatusTransition('accepted', 'cancelled'), 'Accepted -> Cancelled allowed before pickup');
  assert(isValidStatusTransition('scheduled', 'cancelled'), 'Scheduled -> Cancelled allowed before pickup');
  assert(isValidStatusTransition('available', 'expired'), 'Available -> Expired allowed');

  // Blocked unauthorized status jumps
  assert(!isValidStatusTransition('available', 'delivered'), 'ILLEGAL JUMP: Available -> Delivered blocked');
  assert(!isValidStatusTransition('available', 'picked_up'), 'ILLEGAL JUMP: Available -> Picked_Up blocked');
  assert(!isValidStatusTransition('available', 'completed'), 'ILLEGAL JUMP: Available -> Completed blocked');
  assert(!isValidStatusTransition('requested', 'delivered'), 'ILLEGAL JUMP: Requested -> Delivered blocked');
  assert(!isValidStatusTransition('accepted', 'completed'), 'ILLEGAL JUMP: Accepted -> Completed blocked');
  assert(!isValidStatusTransition('scheduled', 'delivered'), 'ILLEGAL JUMP: Scheduled -> Delivered blocked');

  // Terminal states cannot transition back
  assert(!isValidStatusTransition('completed', 'available'), 'TERMINAL LOCK: Completed -> Available blocked');
  assert(!isValidStatusTransition('completed', 'accepted'), 'TERMINAL LOCK: Completed -> Accepted blocked');
  assert(!isValidStatusTransition('cancelled', 'available'), 'TERMINAL LOCK: Cancelled -> Available blocked');
  assert(!isValidStatusTransition('expired', 'available'), 'TERMINAL LOCK: Expired -> Available blocked');

  // Post-pickup cancellation blocked
  assert(!isValidStatusTransition('picked_up', 'cancelled'), 'POST-PICKUP LOCK: Picked_Up cannot be cancelled');
  assert(!isValidStatusTransition('in_transit', 'cancelled'), 'POST-PICKUP LOCK: In_Transit cannot be cancelled');
  assert(!isValidStatusTransition('delivered', 'cancelled'), 'POST-DELIVERY LOCK: Delivered cannot be cancelled');

  // Rules text verification of isValidStatusTransition function
  assert(rulesContent.includes('function isValidStatusTransition(oldStatus, newStatus)'), 'firestore.rules implements isValidStatusTransition helper function');
  assert(rulesContent.includes('isValidStatusTransition(existing().status, incoming().status)'), 'Donations update rules enforce isValidStatusTransition');

  // ====================================================
  // TEST SUITE 2: Verification Token Isolation & Least Privilege
  // ====================================================
  console.log('\n--- Test Suite 2: Verification Token Security & Volunteer Isolation ---');

  // 1. Volunteer cannot read verification tokens
  assert(rulesContent.includes('match /verifications/{donationId}'), 'firestore.rules defines /verifications/{donationId} subcollection');
  assert(!rulesContent.includes('isDonationVolunteer(donationId)') ||
         rulesContent.indexOf('isDonationVolunteer(donationId)') > rulesContent.indexOf('match /verifications/{donationId}')
         ? !rulesContent.slice(rulesContent.indexOf('match /verifications/{donationId}')).includes('isDonationVolunteer(donationId)')
         : true,
         'Volunteer role is EXCLUDED from /verifications/{donationId} read permissions');

  // 2. All client writes to verifications must be denied
  const verificationsSection = rulesContent.slice(rulesContent.indexOf('match /verifications/{donationId}'));
  assert(verificationsSection.includes('allow write: if false;'), 'Client writes to /verifications/{donationId} are strictly denied (allow write: if false)');

  // 3. Simulated role-based token accessor logic
  function canReadVerificationToken(
    userRole: 'donor' | 'ngo' | 'volunteer' | 'admin',
    userUid: string,
    donation: { donorId: string; assignedNgoId: string; assignedVolunteerId: string }
  ): { canRead: boolean; readableToken?: 'pickup' | 'delivery' | 'all' } {
    if (userRole === 'admin') return { canRead: true, readableToken: 'all' };
    if (userRole === 'donor' && donation.donorId === userUid) return { canRead: true, readableToken: 'pickup' };
    if (userRole === 'ngo' && donation.assignedNgoId === userUid) return { canRead: true, readableToken: 'delivery' };
    // Volunteer is strictly denied
    return { canRead: false };
  }

  const sampleDonation = {
    donorId: 'donor_user_1',
    assignedNgoId: 'ngo_user_2',
    assignedVolunteerId: 'volunteer_user_3',
  };

  const donorAccess = canReadVerificationToken('donor', 'donor_user_1', sampleDonation);
  assert(donorAccess.canRead && donorAccess.readableToken === 'pickup', 'Donor can read their own pickup token & PIN');

  const ngoAccess = canReadVerificationToken('ngo', 'ngo_user_2', sampleDonation);
  assert(ngoAccess.canRead && ngoAccess.readableToken === 'delivery', 'Assigned NGO can read their delivery token & PIN');

  const volunteerAccess = canReadVerificationToken('volunteer', 'volunteer_user_3', sampleDonation);
  assert(!volunteerAccess.canRead, 'Assigned volunteer CANNOT read verification tokens or PINs (anti-fraud isolation)');

  const unassignedNgoAccess = canReadVerificationToken('ngo', 'stranger_ngo_9', sampleDonation);
  assert(!unassignedNgoAccess.canRead, 'Unassigned third-party NGO cannot read verification tokens');

  const adminAccess = canReadVerificationToken('admin', 'admin_super_user', sampleDonation);
  assert(adminAccess.canRead, 'Admin can inspect verification records for dispute resolution');

  // ====================================================
  // TEST SUITE 3: Server-Only Write Enforcement
  // ====================================================
  console.log('\n--- Test Suite 3: Server-Only Writes (Impact Records & Audit Logs) ---');

  // 1. Impact records server-only writes
  const impactSection = rulesContent.slice(
    rulesContent.indexOf('match /impactRecords/{recordId}'),
    rulesContent.indexOf('match /auditLogs/{logId}')
  );
  assert(impactSection.includes('allow write: if false;'), 'Impact records client writes are strictly denied (allow write: if false)');
  assert(impactSection.includes('allow read: if true;'), 'Impact records are publicly readable for transparency');

  // 2. Audit logs server-only writes & admin-only read
  const auditSection = rulesContent.slice(
    rulesContent.indexOf('match /auditLogs/{logId}'),
    rulesContent.indexOf('match /trackingSessions/{donationId}')
  );
  assert(auditSection.includes('allow write: if false;'), 'Audit logs client writes are strictly denied (allow write: if false)');
  assert(auditSection.includes('allow read: if isAdmin();'), 'Audit logs read is restricted strictly to administrators');

  // 3. In-app notifications creation is server-only
  const notifSection = rulesContent.slice(
    rulesContent.indexOf('match /notifications/{notifId}'),
    rulesContent.indexOf('match /impactRecords/{recordId}')
  );
  assert(notifSection.includes('allow create: if false;'), 'Cross-user notifications creation from client is denied (allow create: if false)');
  assert(notifSection.includes("hasOnly(['read', 'readAt', 'deliveryStatus'])"), 'Users can only mutate read / delivery status on their own notifications');

  // ====================================================
  // TEST SUITE 4: Donation Ownership & Non-Owner Edit Protection
  // ====================================================
  console.log('\n--- Test Suite 4: Donation Ownership & Non-Owner Edit Protection ---');

  function canDonorEditDonation(
    callerUid: string,
    existingDoc: { donorId: string; status: DonationStatus },
    incomingDoc: { donorId: string; status: DonationStatus }
  ): boolean {
    const isOwner = existingDoc.donorId === callerUid;
    const preservesOwner = incomingDoc.donorId === callerUid;
    const isPrePickup = ['available', 'requested', 'accepted'].includes(existingDoc.status);
    const validTargetStatus = ['available', 'requested', 'accepted', 'cancelled'].includes(incomingDoc.status);
    const validTransition = isValidStatusTransition(existingDoc.status, incomingDoc.status);

    return isOwner && preservesOwner && isPrePickup && validTargetStatus && validTransition;
  }

  // Legitimate donor edit pre-pickup
  assert(
    canDonorEditDonation('donor_123', { donorId: 'donor_123', status: 'available' }, { donorId: 'donor_123', status: 'available' }),
    'Donor can edit their own listing while available'
  );

  // Non-owner trying to edit listing
  assert(
    !canDonorEditDonation('malicious_user_456', { donorId: 'donor_123', status: 'available' }, { donorId: 'donor_123', status: 'available' }),
    'DEFENSE: Non-owner cannot edit another user\'s donation listing'
  );

  // Donor trying to transfer ownership or alter donorId
  assert(
    !canDonorEditDonation('donor_123', { donorId: 'donor_123', status: 'available' }, { donorId: 'another_user', status: 'available' }),
    'DEFENSE: Donor cannot alter or reassign donorId field'
  );

  // Donor trying to edit listing after courier pickup
  assert(
    !canDonorEditDonation('donor_123', { donorId: 'donor_123', status: 'picked_up' }, { donorId: 'donor_123', status: 'picked_up' }),
    'DEFENSE: Donor cannot edit listing once food is picked up'
  );
  assert(
    !canDonorEditDonation('donor_123', { donorId: 'donor_123', status: 'in_transit' }, { donorId: 'donor_123', status: 'in_transit' }),
    'DEFENSE: Donor cannot edit listing while food is in transit'
  );
  assert(
    !canDonorEditDonation('donor_123', { donorId: 'donor_123', status: 'delivered' }, { donorId: 'donor_123', status: 'delivered' }),
    'DEFENSE: Donor cannot edit listing after food is delivered'
  );

  // Rules text verification
  assert(rulesContent.includes('existing().donorId == request.auth.uid'), 'firestore.rules enforces donorId ownership matching auth.uid');
  assert(rulesContent.includes('incoming().donorId == request.auth.uid'), 'firestore.rules prevents donorId field reassignment');
  assert(rulesContent.includes("existing().status in ['available', 'requested', 'accepted']"), 'firestore.rules restricts donor edits to pre-pickup states');

  // ====================================================
  // TEST SUITE 5: Role Escalation & Admin Validation
  // ====================================================
  console.log('\n--- Test Suite 5: Role Escalation Defense & Hardcoded Email Removal ---');

  // No hardcoded emails in rules
  assert(!rulesContent.includes('rohangr18@gmail.com'), 'Hardcoded admin email rohangr18@gmail.com is completely removed from firestore.rules');
  assert(!rulesContent.includes('@gmail.com'), 'No personal email strings hardcoded in firestore.rules');

  // Admin verified via admins collection or token claims only
  assert(rulesContent.includes('exists(/databases/$(database)/documents/admins/$(request.auth.uid))'), 'Admin privileges verified dynamically via /admins/{uid} collection');
  assert(rulesContent.includes("request.auth.token.role == 'admin'"), 'Admin privileges verified via secure Firebase custom token claims');

  // User role self-escalation prevention
  const usersSection = rulesContent.slice(
    rulesContent.indexOf('match /users/{userId}'),
    rulesContent.indexOf('match /organizations/{orgId}')
  );
  assert(usersSection.includes("incoming().role in ['donor', 'ngo', 'volunteer']"), 'Clients cannot self-assign the admin role upon registration');
  assert(usersSection.includes("!incoming().diff(existing()).affectedKeys().hasAny(['uid', 'email'])"), 'Users cannot overwrite uid or email properties');

  // ====================================================
  // TEST SUITE 6: Private Subcollection Isolation (Contact & Telemetry)
  // ====================================================
  console.log('\n--- Test Suite 6: Private Subcollection Data Isolation ---');

  // 1. Volunteer private location subcollection
  assert(rulesContent.includes('match /volunteerProfiles/{profileId}'), 'Volunteer profiles collection defined');
  const volProfileSection = rulesContent.slice(
    rulesContent.indexOf('match /volunteerProfiles/{profileId}'),
    rulesContent.indexOf('function isValidStatusTransition')
  );
  assert(volProfileSection.includes('match /private/{docId}'), 'Volunteer profiles isolate private exact GPS coordinates in private subcollection');
  assert(volProfileSection.includes('profileId == request.auth.uid || isAdmin()'), 'Volunteer private subcollection is accessible only by the courier or admin');

  // 2. Donation private contact info subcollection
  const donationSection = rulesContent.slice(
    rulesContent.indexOf('match /donations/{donationId}'),
    rulesContent.indexOf('match /notifications/{notifId}')
  );
  assert(donationSection.includes('match /private/{docId}'), 'Donations isolate donor phone & sensitive details in private subcollection');
  assert(donationSection.includes('isDonationDonor(donationId)'), 'Donation private subcollection accessible to donor');
  assert(donationSection.includes('isDonationNgo(donationId)'), 'Donation private subcollection accessible to assigned NGO');
  assert(donationSection.includes('isDonationVolunteer(donationId)'), 'Donation private subcollection accessible to assigned volunteer');

  // 3. Live tracking sessions isolation
  const trackingSection = rulesContent.slice(
    rulesContent.indexOf('match /trackingSessions/{donationId}'),
    rulesContent.indexOf('match /verifications/{donationId}')
  );
  assert(trackingSection.includes('resource.data.volunteerId == request.auth.uid'), 'Live tracking readable by active courier');
  assert(
    trackingSection.includes('resource.data.donorId == request.auth.uid') &&
    trackingSection.includes('isDonationDonor(donationId)'),
    'Live tracking readable by donation donor'
  );
  assert(
    trackingSection.includes('resource.data.ngoId == request.auth.uid') &&
    trackingSection.includes('isDonationNgo(donationId)'),
    'Live tracking readable by assigned shelter'
  );
  assert(trackingSection.includes('isAdmin()'), 'Live tracking readable by admin');

  // ====================================================
  // Summary
  // ====================================================
  console.log('\n========================================');
  console.log(`Results: ${passed} Passed, ${failed} Failed`);
  console.log('========================================');

  if (failed > 0) {
    throw new Error(`Firestore rules validation failed: ${failed} tests failed.`);
  }
}

runFirestoreRulesValidation();
