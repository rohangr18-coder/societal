import { Request, Response } from 'express';
import { adminDb } from './firebaseAdmin.js';
import { isDonationExpired } from '../src/utils/foodSafety.js';

// In-memory test store for mock/unit test environments
export const testDonationsStore = new Map<string, any>();
export const testVolunteerProfilesStore = new Map<string, any>();
export const testAuditLogsStore: any[] = [];
export const testNotificationsStore: any[] = [];

export async function handleAcceptVolunteerDonation(req: Request, res: Response): Promise<void> {
  const sendJson = (status: number, data: any) => {
    res.setHeader('Content-Type', 'application/json');
    res.status(status).json(data);
  };

  try {
    const user = (req as any).user;
    if (!user || !user.uid) {
      return sendJson(401, { success: false, error: 'Authentication required to accept food donations.' });
    }

    const { donationId, volunteerName, volunteerPhone } = req.body || {};
    if (!donationId || typeof donationId !== 'string') {
      return sendJson(400, { success: false, error: 'donationId is required.' });
    }

    const volunteerUid = user.uid;
    const actorName = String(
      volunteerName || user.name || user.email?.split('@')[0] || 'Volunteer Courier'
    );
    const contactPhone = String(volunteerPhone || '');

    // Handle mock/test mode
    const isTest = (req as any).isTest === true || process.env.NODE_ENV === 'test';
    if (isTest && (testDonationsStore.size > 0 || testDonationsStore.has(donationId))) {
      const donation = testDonationsStore.get(donationId);
      if (!donation) {
        return sendJson(404, { success: false, message: 'Donation record not found.' });
      }

      if (donation.assignedVolunteerId === volunteerUid && donation.status === 'accepted') {
        return sendJson(409, {
          success: false,
          message: 'You have already accepted this collection request.',
        });
      }

      if (donation.assignedVolunteerId && donation.assignedVolunteerId !== volunteerUid) {
        return sendJson(409, {
          success: false,
          message: 'Another volunteer courier has already accepted this collection request.',
        });
      }

      if (donation.status !== 'available' && donation.status !== 'requested') {
        return sendJson(409, {
          success: false,
          message: `This collection request is no longer available (current status: ${String(donation.status).toUpperCase()}). Another volunteer or NGO may have claimed it.`,
        });
      }

      const safetyCheck = isDonationExpired(donation);
      if (safetyCheck.isExpired) {
        return sendJson(400, {
          success: false,
          message: 'Food Safety Alert: This food collection request has passed its safe consumption threshold and cannot be accepted.',
        });
      }

      const now = new Date().toISOString();
      const nextStatus = 'accepted';
      const timeline = Array.isArray(donation.timeline) ? [...donation.timeline] : [];
      timeline.push({
        status: nextStatus,
        timestamp: now,
        actorName,
        actorId: volunteerUid,
        note: `Volunteer courier ${actorName} accepted collection request. En route for pickup.`,
      });

      const updated = {
        ...donation,
        status: nextStatus,
        assignedVolunteerId: volunteerUid,
        assignedVolunteerName: actorName,
        assignedVolunteerPhone: contactPhone,
        acceptedAt: now,
        claimLock: volunteerUid,
        updatedAt: now,
        timeline,
      };

      testDonationsStore.set(donationId, updated);
      testVolunteerProfilesStore.set(volunteerUid, {
        ...(testVolunteerProfilesStore.get(volunteerUid) || {}),
        userId: volunteerUid,
        fullName: actorName,
        activeAssignmentId: donationId,
        updatedAt: now,
      });

      if (donation.donorId) {
        testNotificationsStore.push({
          id: `notif_${Date.now()}`,
          userId: donation.donorId,
          recipientUserId: donation.donorId,
          title: 'Volunteer Accepted Collection',
          message: `${actorName} has accepted your donation "${donation.foodName || 'Food Donation'}" and is scheduled for pickup.`,
          type: 'assignment',
          link: '/dashboard',
          donationId,
          deliveryStatus: 'delivered',
          read: false,
          createdAt: now,
        });
      }

      testAuditLogsStore.push({
        id: `audit_${Date.now()}`,
        action: 'COLLECTION_ACCEPTED_BY_VOLUNTEER',
        performedBy: volunteerUid,
        targetId: donationId,
        details: `Volunteer ${actorName} (${volunteerUid}) accepted collection for "${donation.foodName || donationId}"`,
        timestamp: now,
      });

      return sendJson(200, {
        success: true,
        message: 'Collection request accepted! You are now assigned to pickup this food.',
        donation: updated,
      });
    }

    // Production execution: Firestore runTransaction
    const firestore = adminDb();
    const result = await firestore.runTransaction(async (tx) => {
      const donRef = firestore.collection('donations').doc(donationId);
      const donSnap = await tx.get(donRef);

      if (!donSnap.exists) {
        const err: any = new Error('Donation record not found.');
        err.statusCode = 404;
        throw err;
      }

      const donation = donSnap.data() as any;

      // Check if already claimed by this volunteer
      if (donation.assignedVolunteerId === volunteerUid && donation.status === 'accepted') {
        const err: any = new Error('You have already accepted this collection request.');
        err.statusCode = 409;
        throw err;
      }

      // Check collision if already claimed by another volunteer
      if (donation.assignedVolunteerId && donation.assignedVolunteerId !== volunteerUid) {
        const err: any = new Error('Another volunteer courier has already accepted this collection request.');
        err.statusCode = 409;
        throw err;
      }

      // Safe state check: can only accept if available or requested
      if (donation.status !== 'available' && donation.status !== 'requested') {
        const err: any = new Error(
          `This collection request is no longer available (current status: ${String(donation.status).toUpperCase()}). Another volunteer or NGO may have claimed it.`
        );
        err.statusCode = 409;
        throw err;
      }

      // Strict food safety expiration check
      const safetyCheck = isDonationExpired(donation);
      if (safetyCheck.isExpired) {
        const err: any = new Error(
          'Food Safety Alert: This food collection request has passed its safe consumption threshold and cannot be accepted.'
        );
        err.statusCode = 400;
        throw err;
      }

      const now = new Date().toISOString();
      const nextStatus = 'accepted';
      const timeline = Array.isArray(donation.timeline) ? [...donation.timeline] : [];
      timeline.push({
        status: nextStatus,
        timestamp: now,
        actorName,
        actorId: volunteerUid,
        note: `Volunteer courier ${actorName} accepted collection request. En route for pickup.`,
      });

      const updateData: Record<string, any> = {
        status: nextStatus,
        assignedVolunteerId: volunteerUid,
        assignedVolunteerName: actorName,
        assignedVolunteerPhone: contactPhone,
        acceptedAt: now,
        claimLock: volunteerUid,
        updatedAt: now,
        timeline,
      };

      tx.update(donRef, updateData);

      // Update volunteer profile's active assignment (include required userId & fullName for create/merge)
      const volRef = firestore.collection('volunteerProfiles').doc(volunteerUid);
      tx.set(
        volRef,
        {
          userId: volunteerUid,
          fullName: actorName,
          activeAssignmentId: donationId,
          updatedAt: now,
        },
        { merge: true }
      );

      // Create donor in-app notification atomically inside the same transaction
      if (donation.donorId) {
        const donorNotifRef = firestore.collection('notifications').doc();
        tx.set(donorNotifRef, {
          id: donorNotifRef.id,
          userId: donation.donorId,
          recipientUserId: donation.donorId,
          title: 'Volunteer Accepted Collection',
          message: `${actorName} has accepted your donation "${donation.foodName || 'Food Donation'}" and is scheduled for pickup.`,
          type: 'assignment',
          link: '/dashboard',
          donationId,
          deliveryStatus: 'delivered',
          read: false,
          createdAt: now,
        });
      }

      // Audit log: Server-side atomic record creation
      const auditRef = firestore.collection('auditLogs').doc();
      tx.set(auditRef, {
        id: auditRef.id,
        action: 'COLLECTION_ACCEPTED_BY_VOLUNTEER',
        performedBy: volunteerUid,
        targetId: donationId,
        details: `Volunteer ${actorName} (${volunteerUid}) accepted collection for "${donation.foodName || donationId}"`,
        timestamp: now,
      });

      return {
        id: donationId,
        ...donation,
        ...updateData,
      };
    });

    // Post-transaction NGO notification (if an NGO had already claimed this donation)
    if (result && result.assignedNgoId) {
      const notifRef = firestore.collection('notifications').doc();
      notifRef.set({
        id: notifRef.id,
        userId: result.assignedNgoId,
        recipientUserId: result.assignedNgoId,
        title: 'Volunteer Courier En Route',
        message: `${actorName} is collecting food donation "${result.foodName || 'Food Donation'}" for delivery.`,
        type: 'status_change',
        link: '/dashboard',
        donationId,
        deliveryStatus: 'delivered',
        read: false,
        createdAt: new Date().toISOString(),
      }).catch((e) => console.warn('[accept-volunteer] NGO in-app notification notice:', e));
    }

    return sendJson(200, {
      success: true,
      message: 'Collection request accepted! You are now assigned to pickup this food.',
      donation: result,
    });
  } catch (err: any) {
    if (err?.statusCode && err.statusCode >= 400 && err.statusCode < 500) {
      return sendJson(err.statusCode, {
        success: false,
        message: err.message || 'Error processing collection acceptance.',
      });
    }

    console.error('[accept-volunteer] Server transaction failed:', err);
    return sendJson(503, {
      success: false,
      code: 'ADMIN_UNAVAILABLE',
      message: 'Server could not complete the request, falling back',
    });
  }
}
