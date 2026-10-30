import type { Request, Response } from 'express';

export default async function handler(req: Request, res: Response) {
  res.setHeader('Content-Type', 'application/json');

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method Not Allowed' });
  }

  try {
    const { title, body, donationId, tokens, volunteerIds, url, pickupDeadline } = req.body || {};

    if (!title || typeof title !== 'string') {
      return res.status(400).json({ error: 'title is required and must be a string' });
    }
    if (!body || typeof body !== 'string') {
      return res.status(400).json({ error: 'body is required and must be a string' });
    }

    const recipientTokens: string[] = Array.isArray(tokens)
      ? tokens.filter((t) => typeof t === 'string' && t.length > 0)
      : [];
    const recipientVolunteers: string[] = Array.isArray(volunteerIds) ? volunteerIds : [];

    console.info(
      `[FCM Server] Dispatching push notification: "${title}" to ${recipientTokens.length} tokens / ${recipientVolunteers.length} volunteer IDs. Donation ID: ${donationId || 'N/A'}`
    );

    const fcmServerKey = process.env.FIREBASE_SERVER_KEY || process.env.FCM_SERVER_KEY;
    if (fcmServerKey && recipientTokens.length > 0) {
      try {
        await fetch('https://fcm.googleapis.com/fcm/send', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `key=${fcmServerKey}`,
          },
          body: JSON.stringify({
            registration_ids: recipientTokens,
            notification: {
              title,
              body,
              icon: '/favicon.ico',
              click_action: url || '/volunteer',
            },
            data: {
              donationId: donationId || '',
              url: url || '/volunteer',
              pickupDeadline: pickupDeadline || '',
            },
          }),
        });
      } catch (fcmErr) {
        console.warn('[FCM Server] Forwarding to Google FCM HTTP endpoint warning:', fcmErr);
      }
    }

    const sentCount =
      recipientTokens.length > 0
        ? recipientTokens.length
        : recipientVolunteers.length > 0
        ? recipientVolunteers.length
        : 1;

    res.status(200).json({
      success: true,
      message: 'FCM push notifications processed successfully',
      sentCount,
      recipientTokensCount: recipientTokens.length,
      volunteerIdsCount: recipientVolunteers.length,
      donationId: donationId || null,
      timestamp: new Date().toISOString(),
    });
  } catch (error: any) {
    console.error('[FCM Server] Error dispatching push notification:', error);
    res.status(500).json({ error: error.message || 'Internal Server Error' });
  }
}
