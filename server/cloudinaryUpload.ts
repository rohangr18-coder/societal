import crypto from 'crypto';
import type { Request, Response } from 'express';
import { v2 as cloudinary } from 'cloudinary';

export const ALLOWED_IMAGE_MIME_TYPES = [
  'image/jpeg',
  'image/png',
  'image/webp',
] as const;

export const ALLOWED_IMAGE_FORMATS = ['jpg', 'jpeg', 'png', 'webp'] as const;

export const MAX_IMAGE_FILE_SIZE_BYTES = 5 * 1024 * 1024; // 5 MB

export const DONATION_UPLOAD_FOLDER = 'resqbite/donations';

export interface CloudinaryConfigResult {
  configured: boolean;
  cloudName: string;
  apiKey: string;
  apiSecret: string;
  missing: string[];
}

export interface UploadValidationInput {
  fileName?: unknown;
  fileType?: unknown;
  fileSize?: unknown;
}

export interface UploadValidationResult {
  valid: boolean;
  error?: string;
}

export interface SignedDonationUploadPayload {
  uploadUrl: string;
  cloudName: string;
  apiKey: string;
  timestamp: number;
  signature: string;
  folder: string;
  publicId: string;
  allowedFormats: string;
  maxFileSizeBytes: number;
}

/**
 * Reads Cloudinary credentials strictly from server-side environment variables.
 * Never reads VITE_* client env vars and never hardcodes secrets.
 */
export function getCloudinaryConfig(): CloudinaryConfigResult {
  const cloudName = (process.env.CLOUDINARY_CLOUD_NAME || '').trim();
  const apiKey = (process.env.CLOUDINARY_API_KEY || '').trim();
  const apiSecret = (process.env.CLOUDINARY_API_SECRET || '').trim();

  const missing: string[] = [];
  if (!cloudName) missing.push('CLOUDINARY_CLOUD_NAME');
  if (!apiKey) missing.push('CLOUDINARY_API_KEY');
  if (!apiSecret) missing.push('CLOUDINARY_API_SECRET');

  return {
    configured: missing.length === 0,
    cloudName,
    apiKey,
    apiSecret,
    missing,
  };
}

export function isCloudinaryConfigured(): boolean {
  return getCloudinaryConfig().configured;
}

/**
 * Validates incoming donation image upload metadata prior to signing.
 */
export function validateUploadRequest(input: UploadValidationInput): UploadValidationResult {
  const { fileName, fileType, fileSize } = input || {};

  if (typeof fileType !== 'string' || !fileType.trim()) {
    return {
      valid: false,
      error: 'Image MIME type (fileType) is required.',
    };
  }

  const normalizedMime = fileType.trim().toLowerCase();
  if (!(ALLOWED_IMAGE_MIME_TYPES as readonly string[]).includes(normalizedMime)) {
    return {
      valid: false,
      error: 'Unsupported image format. Please upload a JPEG, PNG, or WebP image.',
    };
  }

  if (typeof fileSize !== 'number' || !Number.isFinite(fileSize) || fileSize <= 0) {
    return {
      valid: false,
      error: 'A valid positive image file size (fileSize) in bytes is required.',
    };
  }

  if (fileSize > MAX_IMAGE_FILE_SIZE_BYTES) {
    const maxMb = Math.round(MAX_IMAGE_FILE_SIZE_BYTES / (1024 * 1024));
    return {
      valid: false,
      error: `Image exceeds the maximum allowed size of ${maxMb} MB.`,
    };
  }

  if (fileName !== undefined && fileName !== null) {
    if (typeof fileName !== 'string' || fileName.length > 255) {
      return {
        valid: false,
        error: 'Invalid fileName. Must be a string up to 255 characters.',
      };
    }

    const trimmedName = fileName.trim();
    if (trimmedName.includes('.')) {
      const ext = trimmedName.split('.').pop()?.toLowerCase() || '';
      if (ext && !(ALLOWED_IMAGE_FORMATS as readonly string[]).includes(ext)) {
        return {
          valid: false,
          error: 'Unsupported image file extension. Allowed extensions: .jpg, .jpeg, .png, .webp.',
        };
      }
    }
  }

  return { valid: true };
}

/**
 * Generates Cloudinary signed upload parameters using the official Node.js SDK.
 * Keeps CLOUDINARY_API_SECRET strictly on the server; never returns it.
 */
export function generateSignedDonationUploadParams(params: {
  userId: string;
  nowSeconds?: number;
}): SignedDonationUploadPayload {
  const config = getCloudinaryConfig();
  if (!config.configured) {
    throw new Error('CLOUDINARY_NOT_CONFIGURED');
  }

  cloudinary.config({
    cloud_name: config.cloudName,
    api_key: config.apiKey,
    api_secret: config.apiSecret,
    secure: true,
  });

  const timestamp =
    typeof params.nowSeconds === 'number' && Number.isFinite(params.nowSeconds)
      ? Math.floor(params.nowSeconds)
      : Math.floor(Date.now() / 1000);

  const safeUid = (params.userId || 'donor').replace(/[^a-zA-Z0-9_-]/g, '').slice(0, 24) || 'donor';
  const randomSuffix = crypto.randomBytes(6).toString('hex');
  const publicId = `donation_${safeUid}_${timestamp}_${randomSuffix}`;
  const allowedFormats = ALLOWED_IMAGE_FORMATS.join(',');

  // Every parameter included here (except file, api_key, cloud_name, resource_type)
  // must be forwarded identically by the client in the FormData upload request.
  const paramsToSign: Record<string, string | number> = {
    allowed_formats: allowedFormats,
    folder: DONATION_UPLOAD_FOLDER,
    public_id: publicId,
    timestamp,
  };

  const signature = cloudinary.utils.api_sign_request(paramsToSign, config.apiSecret);

  return {
    uploadUrl: `https://api.cloudinary.com/v1_1/${encodeURIComponent(config.cloudName)}/image/upload`,
    cloudName: config.cloudName,
    apiKey: config.apiKey,
    timestamp,
    signature,
    folder: DONATION_UPLOAD_FOLDER,
    publicId,
    allowedFormats,
    maxFileSizeBytes: MAX_IMAGE_FILE_SIZE_BYTES,
  };
}

/**
 * Express handler for POST /api/uploads/donation-image
 * Validates authenticated caller + image metadata and returns signed Cloudinary upload parameters.
 */
export async function handleDonationImageUploadSignature(req: Request, res: Response) {
  const sendJson = (status: number, data: Record<string, unknown>) => {
    res.setHeader('Content-Type', 'application/json');
    res.status(status).json(data);
  };

  try {
    const user = (req as any).user as { uid?: string } | undefined;
    if (!user?.uid) {
      return sendJson(401, {
        success: false,
        error: 'Unauthorized: Please sign in to upload a food donation image.',
      });
    }

    const validation = validateUploadRequest(req.body || {});
    if (!validation.valid) {
      return sendJson(400, {
        success: false,
        error: validation.error || 'Invalid image upload request.',
      });
    }

    const config = getCloudinaryConfig();
    if (!config.configured) {
      console.error(
        `[Cloudinary Upload] Missing server environment variables: ${config.missing.join(', ')}`
      );
      return sendJson(503, {
        success: false,
        code: 'CLOUDINARY_NOT_CONFIGURED',
        error: 'Image upload service is not configured on the server. Please contact the administrator.',
      });
    }

    const signed = generateSignedDonationUploadParams({ userId: user.uid });

    return sendJson(200, {
      success: true,
      ...signed,
    });
  } catch (err: any) {
    console.error('[Cloudinary Upload] Failed to generate signed upload parameters:', err?.message || err);
    return sendJson(500, {
      success: false,
      error: 'Failed to prepare secure image upload. Please try again.',
    });
  }
}
