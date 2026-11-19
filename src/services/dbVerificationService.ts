import { doc, getDoc } from 'firebase/firestore';
import { db, auth } from '../lib/firebase';
import { VerificationRecord } from '../types';

async function getAuthHeaders(): Promise<Record<string, string>> {
  const idToken = await auth.currentUser?.getIdToken();
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
  };
  if (idToken) {
    headers['Authorization'] = `Bearer ${idToken}`;
  }
  return headers;
}

function tryParseJson(rawText: string): { valid: boolean; data: any } {
  if (!rawText) return { valid: false, data: null };
  try {
    return { valid: true, data: JSON.parse(rawText) };
  } catch {
    return { valid: false, data: null };
  }
}

export async function getOrCreateVerification(donationId: string): Promise<VerificationRecord> {
  const headers = await getAuthHeaders();
  const response = await fetch(`/api/verify/${encodeURIComponent(donationId)}/token`, {
    method: 'GET',
    headers,
  });

  const rawText = await response.text();
  const { valid, data } = tryParseJson(rawText);

  if (!valid) {
    throw new Error(
      `Failed to load verification code (HTTP ${response.status}). Server returned an unexpected response.`
    );
  }

  if (!response.ok) {
    const serverMsg = data?.message || data?.error || `Failed to load verification code (HTTP ${response.status}).`;
    throw new Error(`${serverMsg} (HTTP ${response.status})`);
  }

  return {
    donationId,
    pickupToken: data.pickupToken || '',
    pickupPin: data.pickupPin || '',
    deliveryToken: data.deliveryToken || '',
    deliveryPin: data.deliveryPin || '',
    pickupUsed: Boolean(data.pickupUsed),
    deliveryUsed: Boolean(data.deliveryUsed),
    createdAt: data.createdAt || new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };
}

export async function generateVerificationOtp(
  donationId: string,
  mode: 'pickup' | 'delivery'
): Promise<{ otp: string; expiresAt: string; expiresInSeconds: number }> {
  const headers = await getAuthHeaders();
  const response = await fetch(`/api/verify/${encodeURIComponent(donationId)}/otp`, {
    method: 'POST',
    headers,
    body: JSON.stringify({ mode }),
  });

  const rawText = await response.text();
  const { valid, data } = tryParseJson(rawText);

  if (!valid) {
    throw new Error(
      `Failed to generate OTP (HTTP ${response.status}). Server returned an unexpected response.`
    );
  }

  if (!response.ok || !data?.success || !data?.otp) {
    const serverMsg = data?.message || data?.error || `Failed to generate OTP (HTTP ${response.status}).`;
    throw new Error(serverMsg);
  }

  return {
    otp: String(data.otp),
    expiresAt: String(data.expiresAt),
    expiresInSeconds: Number(data.expiresInSeconds || 600),
  };
}

export async function verifyPickupWithToken(
  donationId: string,
  tokenOrPin: string,
  volunteerId: string,
  volunteerName: string
): Promise<{ success: boolean; message: string }> {
  try {
    const headers = await getAuthHeaders();
    const response = await fetch('/api/verify/pickup', {
      method: 'POST',
      headers,
      body: JSON.stringify({
        donationId,
        tokenOrPin,
        volunteerId,
        volunteerName,
      }),
    });

    const rawText = await response.text();
    const { valid, data } = tryParseJson(rawText);

    if (!valid) {
      return {
        success: false,
        message: `Pickup verification failed (HTTP ${response.status}). Server returned an unexpected response.`,
      };
    }

    if (response.ok && data?.success) {
      return {
        success: true,
        message: data.message || 'Pickup successfully verified! Food is now marked as in transit.',
      };
    }

    return {
      success: false,
      message: data?.message || data?.error || `Pickup verification failed (HTTP ${response.status}).`,
    };
  } catch (error: any) {
    return {
      success: false,
      message: error?.message || 'Network error verifying pickup token.',
    };
  }
}

export async function verifyDeliveryWithToken(
  donationId: string,
  tokenOrPin: string,
  verifierId: string,
  verifierName: string
): Promise<{ success: boolean; message: string }> {
  try {
    const headers = await getAuthHeaders();
    const response = await fetch('/api/verify/delivery', {
      method: 'POST',
      headers,
      body: JSON.stringify({
        donationId,
        tokenOrPin,
        verifierId,
        verifierName,
      }),
    });

    const rawText = await response.text();
    const { valid, data } = tryParseJson(rawText);

    if (!valid) {
      return {
        success: false,
        message: `Delivery verification failed (HTTP ${response.status}). Server returned an unexpected response.`,
      };
    }

    if (response.ok && data?.success) {
      return {
        success: true,
        message: data.message || 'Delivery successfully verified! Donation marked as delivered and impact recorded.',
      };
    }

    return {
      success: false,
      message: data?.message || data?.error || `Delivery verification failed (HTTP ${response.status}).`,
    };
  } catch (error: any) {
    return {
      success: false,
      message: error?.message || 'Network error verifying delivery token.',
    };
  }
}

/**
 * Retrieves donor contact information from the secure private subcollection.
 * Accessible only by donor, assigned NGO, assigned volunteer, or admin per firestore.rules.
 */
export async function getDonationPrivateContact(
  donationId: string
): Promise<{ pickupAddress?: string; donorPhone?: string; donorEmail?: string } | null> {
  try {
    const snap = await getDoc(doc(db, 'donations', donationId, 'private', 'contact'));
    if (snap.exists()) {
      return snap.data() as { pickupAddress?: string; donorPhone?: string; donorEmail?: string };
    }
  } catch (err) {
    console.warn('[dbVerificationService] Could not read donation private contact:', err);
  }
  return null;
}
