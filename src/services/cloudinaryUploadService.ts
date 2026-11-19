import { auth } from '../lib/firebase';

export const ALLOWED_DONATION_IMAGE_TYPES = [
  'image/jpeg',
  'image/png',
  'image/webp',
] as const;

export const ALLOWED_DONATION_IMAGE_ACCEPT = 'image/jpeg,image/png,image/webp';

export const MAX_DONATION_IMAGE_SIZE_BYTES = 5 * 1024 * 1024; // 5 MB

export interface DonationImageValidationResult {
  valid: boolean;
  error?: string;
}

export interface SignedUploadParamsResponse {
  success: boolean;
  uploadUrl?: string;
  cloudName?: string;
  apiKey?: string;
  timestamp?: number;
  signature?: string;
  folder?: string;
  publicId?: string;
  allowedFormats?: string;
  maxFileSizeBytes?: number;
  code?: string;
  error?: string;
}

export interface CloudinaryUploadResult {
  imageUrl: string;
  publicId: string;
  width?: number;
  height?: number;
  format?: string;
  bytes?: number;
}

/**
 * Client-side validation for donation photos prior to requesting a backend upload signature.
 */
export function validateDonationImageFile(file: File | null | undefined): DonationImageValidationResult {
  if (!file) {
    return { valid: false, error: 'Please choose an image file to upload.' };
  }

  const normalizedType = (file.type || '').trim().toLowerCase();
  if (!(ALLOWED_DONATION_IMAGE_TYPES as readonly string[]).includes(normalizedType)) {
    return {
      valid: false,
      error: 'Unsupported file type. Please upload a JPEG, PNG, or WebP image.',
    };
  }

  if (!Number.isFinite(file.size) || file.size <= 0) {
    return {
      valid: false,
      error: 'The selected image file is empty. Please choose another photo.',
    };
  }

  if (file.size > MAX_DONATION_IMAGE_SIZE_BYTES) {
    const maxMb = Math.round(MAX_DONATION_IMAGE_SIZE_BYTES / (1024 * 1024));
    return {
      valid: false,
      error: `Image is too large (${(file.size / (1024 * 1024)).toFixed(1)} MB). Maximum allowed size is ${maxMb} MB.`,
    };
  }

  return { valid: true };
}

/**
 * Uploads a validated File directly to Cloudinary using server-generated signed parameters.
 * Uses XMLHttpRequest to provide smooth upload progress updates.
 */
function postFormDataWithProgress(
  uploadUrl: string,
  formData: FormData,
  onProgress?: (percent: number) => void
): Promise<Record<string, any>> {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open('POST', uploadUrl, true);
    xhr.timeout = 60_000;

    xhr.upload.onprogress = (event) => {
      if (event.lengthComputable && onProgress) {
        const pct = Math.min(99, Math.max(1, Math.round((event.loaded / event.total) * 100)));
        onProgress(pct);
      }
    };

    xhr.onload = () => {
      let parsed: Record<string, any> = {};
      try {
        parsed = JSON.parse(xhr.responseText || '{}');
      } catch {
        // non-JSON response handled below
      }

      if (xhr.status >= 200 && xhr.status < 300) {
        onProgress?.(100);
        resolve(parsed);
      } else {
        const cloudErr = parsed?.error?.message || `Cloudinary upload failed (HTTP ${xhr.status}).`;
        reject(new Error(cloudErr));
      }
    };

    xhr.onerror = () => {
      reject(new Error('Network error while uploading image to Cloudinary. Please check your connection and try again.'));
    };

    xhr.ontimeout = () => {
      reject(new Error('Image upload timed out. Please try again with a smaller image or stronger connection.'));
    };

    xhr.send(formData);
  });
}

/**
 * Full secure donation image upload flow:
 * 1. Validates file type and size locally.
 * 2. Authenticates with Firebase ID token and requests signed upload parameters from /api/uploads/donation-image.
 * 3. Uploads directly to Cloudinary with the signed parameters (API secret stays strictly on the server).
 * 4. Returns the verified HTTPS Cloudinary image URL for storage in Firestore.
 */
export async function uploadDonationImageToCloudinary(
  file: File,
  onProgress?: (percent: number) => void
): Promise<CloudinaryUploadResult> {
  const validation = validateDonationImageFile(file);
  if (!validation.valid) {
    throw new Error(validation.error || 'Invalid image file.');
  }

  const currentUser = auth.currentUser;
  if (!currentUser) {
    throw new Error('You must be signed in to upload a donation photo.');
  }

  const idToken = await currentUser.getIdToken();
  if (!idToken) {
    throw new Error('Could not verify your login session. Please sign in again.');
  }

  onProgress?.(5);

  const signRes = await fetch('/api/uploads/donation-image', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${idToken}`,
    },
    body: JSON.stringify({
      fileName: file.name,
      fileType: file.type,
      fileSize: file.size,
    }),
  });

  const signedData = (await signRes.json().catch(() => ({}))) as SignedUploadParamsResponse;

  if (!signRes.ok || !signedData.success) {
    if (signRes.status === 401) {
      throw new Error('Your session expired. Please sign in again to upload images.');
    }
    if (signRes.status === 429) {
      throw new Error(signedData.error || 'Too many upload requests. Please wait a moment and try again.');
    }
    if (signRes.status === 503 && signedData.code === 'CLOUDINARY_NOT_CONFIGURED') {
      throw new Error('Photo upload is temporarily unavailable because Cloudinary server credentials are not configured yet.');
    }
    throw new Error(signedData.error || `Failed to authorize image upload (HTTP ${signRes.status}).`);
  }

  if (
    !signedData.uploadUrl ||
    !signedData.apiKey ||
    !signedData.timestamp ||
    !signedData.signature ||
    !signedData.folder ||
    !signedData.publicId ||
    !signedData.allowedFormats
  ) {
    throw new Error('Server returned incomplete upload authorization parameters.');
  }

  onProgress?.(15);

  const formData = new FormData();
  formData.append('file', file);
  formData.append('api_key', signedData.apiKey);
  formData.append('timestamp', String(signedData.timestamp));
  formData.append('signature', signedData.signature);
  formData.append('folder', signedData.folder);
  formData.append('public_id', signedData.publicId);
  formData.append('allowed_formats', signedData.allowedFormats);

  const cloudResult = await postFormDataWithProgress(
    signedData.uploadUrl,
    formData,
    (uploadPct) => {
      // Scale upload progress from 15% to 100%
      const mapped = Math.min(100, 15 + Math.round(uploadPct * 0.85));
      onProgress?.(mapped);
    }
  );

  const secureUrl = typeof cloudResult.secure_url === 'string' ? cloudResult.secure_url.trim() : '';
  if (!secureUrl || !secureUrl.startsWith('https://')) {
    throw new Error('Cloudinary did not return a valid secure image URL.');
  }

  return {
    imageUrl: secureUrl,
    publicId: String(cloudResult.public_id || signedData.publicId),
    width: typeof cloudResult.width === 'number' ? cloudResult.width : undefined,
    height: typeof cloudResult.height === 'number' ? cloudResult.height : undefined,
    format: typeof cloudResult.format === 'string' ? cloudResult.format : undefined,
    bytes: typeof cloudResult.bytes === 'number' ? cloudResult.bytes : undefined,
  };
}
