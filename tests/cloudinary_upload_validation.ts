/**
 * Cloudinary Signed Image Upload & Security Validation Suite
 *
 * Verifies:
 * 1. Server-side file validation (MIME types, size bounds, extensions).
 * 2. Missing Cloudinary env vars returns 503 CLOUDINARY_NOT_CONFIGURED without leaking secrets.
 * 3. Unauthenticated POST /api/uploads/donation-image returns 401.
 * 4. Authenticated POST /api/uploads/donation-image returns valid Cloudinary SDK signed parameters.
 * 5. Cryptographic signature matches cloudinary.utils.api_sign_request exactly.
 * 6. CLOUDINARY_API_SECRET is NEVER returned in responses or referenced in frontend code.
 * 7. No duplicate upload endpoints exist in server/app.ts.
 * 8. Frontend CreateDonationModal integrates Cloudinary upload and persists imageUrl in Firestore payload.
 */

import fs from 'fs';
import path from 'path';
import { v2 as cloudinary } from 'cloudinary';
import { app } from '../server/app.js';
import {
  validateUploadRequest,
  generateSignedDonationUploadParams,
  MAX_IMAGE_FILE_SIZE_BYTES,
  DONATION_UPLOAD_FOLDER,
} from '../server/cloudinaryUpload.js';
import { normalizeDonationPayload } from '../src/utils/firestoreSanitizer.js';

function assert(condition: boolean, msg: string) {
  if (!condition) {
    throw new Error(`❌ Assertion Failed: ${msg}`);
  }
}

function makeMockRequest(
  appInstance: any,
  options: {
    method: string;
    url: string;
    headers?: Record<string, string>;
    body?: any;
  }
): Promise<{ statusCode: number; headers: Record<string, any>; body: any }> {
  return new Promise((resolve) => {
    let statusCode = 200;
    const responseHeaders: Record<string, any> = {};
    let responseBody: any = null;

    const req: any = {
      method: options.method,
      url: options.url,
      headers: {
        'content-type': 'application/json',
        ...(options.headers || {}),
      },
      body: options.body || {},
      connection: { remoteAddress: '127.0.0.1' },
      isTest: true,
    };

    const res: any = {
      statusCode: 200,
      headersSent: false,
      setHeader(name: string, value: any) {
        responseHeaders[name.toLowerCase()] = value;
        return this;
      },
      status(code: number) {
        statusCode = code;
        this.statusCode = code;
        return this;
      },
      json(data: any) {
        this.headersSent = true;
        responseBody = data;
        resolve({ statusCode, headers: responseHeaders, body: responseBody });
        return this;
      },
      send(data: any) {
        this.headersSent = true;
        responseBody = data;
        resolve({ statusCode, headers: responseHeaders, body: responseBody });
        return this;
      },
      end() {
        if (!this.headersSent) {
          this.headersSent = true;
          resolve({ statusCode, headers: responseHeaders, body: responseBody });
        }
        return this;
      },
    };

    appInstance(req, res);
  });
}

async function runTests() {
  console.log('🧪 Running Cloudinary Signed Upload Validation Suite...\n');

  let passed = 0;
  const check = (condition: boolean, label: string) => {
    assert(condition, label);
    console.log(`  ✅ PASS: ${label}`);
    passed++;
  };

  // Preserve original env vars
  const origCloudName = process.env.CLOUDINARY_CLOUD_NAME;
  const origApiKey = process.env.CLOUDINARY_API_KEY;
  const origApiSecret = process.env.CLOUDINARY_API_SECRET;

  try {
    // 1. Unit validation checks
    check(
      validateUploadRequest({ fileName: 'biryani.jpg', fileType: 'image/jpeg', fileSize: 1024 * 500 }).valid,
      'Accepts valid JPEG under 5 MB'
    );
    check(
      validateUploadRequest({ fileName: 'bread.png', fileType: 'image/png', fileSize: MAX_IMAGE_FILE_SIZE_BYTES }).valid,
      'Accepts valid PNG at exact 5 MB boundary'
    );
    check(
      validateUploadRequest({ fileName: 'fruit.webp', fileType: 'image/webp', fileSize: 2048 }).valid,
      'Accepts valid WebP image'
    );
    check(
      !validateUploadRequest({ fileName: 'doc.pdf', fileType: 'application/pdf', fileSize: 1024 }).valid,
      'Rejects non-image MIME type (application/pdf)'
    );
    check(
      !validateUploadRequest({ fileName: 'xss.svg', fileType: 'image/svg+xml', fileSize: 1024 }).valid,
      'Rejects SVG MIME type (image/svg+xml)'
    );
    check(
      !validateUploadRequest({ fileName: 'huge.jpg', fileType: 'image/jpeg', fileSize: MAX_IMAGE_FILE_SIZE_BYTES + 1 }).valid,
      'Rejects image larger than 5 MB'
    );
    check(
      !validateUploadRequest({ fileName: 'empty.png', fileType: 'image/png', fileSize: 0 }).valid,
      'Rejects 0-byte image'
    );
    check(
      !validateUploadRequest({ fileName: 'malware.exe', fileType: 'image/jpeg', fileSize: 1024 }).valid,
      'Rejects disallowed file extension (.exe)'
    );

    // 2. Unauthenticated request blocked with 401
    const unauthRes = await makeMockRequest(app, {
      method: 'POST',
      url: '/api/uploads/donation-image',
      body: { fileName: 'food.jpg', fileType: 'image/jpeg', fileSize: 250000 },
    });
    check(unauthRes.statusCode === 401, 'Rejects unauthenticated upload signature request with 401');

    // 3. Missing server env vars returns 503 CLOUDINARY_NOT_CONFIGURED
    delete process.env.CLOUDINARY_CLOUD_NAME;
    delete process.env.CLOUDINARY_API_KEY;
    delete process.env.CLOUDINARY_API_SECRET;

    const missingConfigRes = await makeMockRequest(app, {
      method: 'POST',
      url: '/api/uploads/donation-image',
      headers: { Authorization: 'Bearer mock-token-donor123-donor' },
      body: { fileName: 'food.jpg', fileType: 'image/jpeg', fileSize: 250000 },
    });
    check(missingConfigRes.statusCode === 503, 'Returns 503 when Cloudinary server env vars are missing');
    check(
      missingConfigRes.body?.code === 'CLOUDINARY_NOT_CONFIGURED',
      'Returns CLOUDINARY_NOT_CONFIGURED error code when unconfigured'
    );

    // 4. Configured server env vars -> valid signed parameters & cryptographic verification
    const TEST_CLOUD_NAME = 'pka1bn47';
    const TEST_API_KEY = 'test_cloudinary_api_key_12345';
    const TEST_API_SECRET = 'super_secret_server_only_value_98765';

    process.env.CLOUDINARY_CLOUD_NAME = TEST_CLOUD_NAME;
    process.env.CLOUDINARY_API_KEY = TEST_API_KEY;
    process.env.CLOUDINARY_API_SECRET = TEST_API_SECRET;

    // Invalid payload returns 400
    const invalidPayloadRes = await makeMockRequest(app, {
      method: 'POST',
      url: '/api/uploads/donation-image',
      headers: { Authorization: 'Bearer mock-token-donor123-donor' },
      body: { fileName: 'bad.gif', fileType: 'image/gif', fileSize: 10000 },
    });
    check(invalidPayloadRes.statusCode === 400, 'Rejects unsupported fileType via endpoint with 400');

    // Valid authenticated request returns 200 with valid signature
    const signedRes = await makeMockRequest(app, {
      method: 'POST',
      url: '/api/uploads/donation-image',
      headers: { Authorization: 'Bearer mock-token-donor123-donor' },
      body: { fileName: 'paneer_tray.jpg', fileType: 'image/jpeg', fileSize: 820000 },
    });
    check(signedRes.statusCode === 200 && signedRes.body?.success === true, 'Returns 200 with success=true for valid authenticated request');
    check(
      signedRes.body.uploadUrl === `https://api.cloudinary.com/v1_1/${TEST_CLOUD_NAME}/image/upload`,
      'Returns exact Cloudinary uploadUrl for configured cloud name'
    );
    check(signedRes.body.apiKey === TEST_API_KEY, 'Returns public API key for signed FormData upload');
    check(signedRes.body.folder === DONATION_UPLOAD_FOLDER, 'Locks upload folder to resqbite/donations');
    check(
      typeof signedRes.body.publicId === 'string' && signedRes.body.publicId.startsWith('donation_donor123_'),
      'Scopes generated publicId to authenticated donor UID'
    );

    // Recompute signature directly via Cloudinary SDK to confirm exact match
    const expectedSig = cloudinary.utils.api_sign_request(
      {
        allowed_formats: signedRes.body.allowedFormats,
        folder: signedRes.body.folder,
        public_id: signedRes.body.publicId,
        timestamp: signedRes.body.timestamp,
      },
      TEST_API_SECRET
    );
    check(signedRes.body.signature === expectedSig, 'Returned signature matches official Cloudinary SDK api_sign_request');

    // Secret must NEVER appear anywhere in response payload
    const serializedResp = JSON.stringify(signedRes.body);
    check(!serializedResp.includes(TEST_API_SECRET), 'Response payload never exposes CLOUDINARY_API_SECRET');
    check(!('apiSecret' in signedRes.body) && !('api_secret' in signedRes.body), 'Response object has no secret fields');

    // Deterministic generator check
    const gen = generateSignedDonationUploadParams({ userId: 'uid_abc', nowSeconds: 1700000000 });
    check(gen.timestamp === 1700000000 && gen.cloudName === TEST_CLOUD_NAME, 'generateSignedDonationUploadParams works deterministically');

    // 5. Firestore donation payload stores Cloudinary URL cleanly
    const normalized = normalizeDonationPayload({
      donorId: 'donor123',
      donorName: 'Test Donor',
      foodName: 'Surplus Rice & Dal',
      category: 'Cooked Meals',
      description: 'Freshly prepared',
      quantity: 25,
      unit: 'servings',
      pickupDeadline: '2026-12-01 before 18:00',
      pickupDate: '2026-12-01',
      availableFrom: '14:00',
      availableUntil: '18:00',
      collectionDeadline: '2026-12-01T18:00:00',
      pickupAddress: '123 Main St',
      latitude: 28.61,
      longitude: 77.2,
      storageType: 'Hot Holding (> 60°C)',
      packaging: 'Sealed food-grade containers',
      imageUrl: `https://res.cloudinary.com/${TEST_CLOUD_NAME}/image/upload/v1700000000/resqbite/donations/donation_donor123.jpg`,
      status: 'available',
    });
    check(
      normalized.imageUrl === `https://res.cloudinary.com/${TEST_CLOUD_NAME}/image/upload/v1700000000/resqbite/donations/donation_donor123.jpg`,
      'Firestore donation payload preserves returned Cloudinary secure_url'
    );

    // 6. Static security audit across frontend & server source files
    const srcDir = path.resolve(process.cwd(), 'src');
    const scanFiles = (dir: string): string[] => {
      const results: string[] = [];
      for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
        const full = path.join(dir, entry.name);
        if (entry.isDirectory()) {
          results.push(...scanFiles(full));
        } else if (/\.(ts|tsx|js|jsx)$/.test(entry.name)) {
          results.push(full);
        }
      }
      return results;
    };

    const frontendFiles = scanFiles(srcDir);
    let frontendHasSecretRef = false;
    let frontendHasViteCloudinary = false;
    let frontendImportsCloudinarySdk = false;
    for (const file of frontendFiles) {
      const content = fs.readFileSync(file, 'utf-8');
      if (content.includes('CLOUDINARY_API_SECRET')) frontendHasSecretRef = true;
      if (content.includes('VITE_CLOUDINARY')) frontendHasViteCloudinary = true;
      if (/from\s+['"]cloudinary['"]/.test(content)) frontendImportsCloudinarySdk = true;
    }
    check(!frontendHasSecretRef, 'Frontend source never references CLOUDINARY_API_SECRET');
    check(!frontendHasViteCloudinary, 'Frontend source never uses client-exposed VITE_CLOUDINARY_* env vars');
    check(!frontendImportsCloudinarySdk, 'Frontend source never imports Node.js cloudinary SDK');

    const serverAppSrc = fs.readFileSync(path.resolve(process.cwd(), 'server/app.ts'), 'utf-8');
    const uploadEndpointMatches = serverAppSrc.match(/apiRouter\.post\(['"]\/uploads\//g) || [];
    check(uploadEndpointMatches.length === 1, 'Exactly one upload endpoint is registered in server/app.ts (no duplicates)');

    const modalSrc = fs.readFileSync(path.resolve(process.cwd(), 'src/components/CreateDonationModal.tsx'), 'utf-8');
    check(
      modalSrc.includes('uploadDonationImageToCloudinary'),
      'CreateDonationModal uses uploadDonationImageToCloudinary'
    );

    console.log(`\n🎉 Cloudinary Upload Validation Complete: ${passed} Passed, 0 Failed\n`);
  } finally {
    if (origCloudName === undefined) delete process.env.CLOUDINARY_CLOUD_NAME;
    else process.env.CLOUDINARY_CLOUD_NAME = origCloudName;

    if (origApiKey === undefined) delete process.env.CLOUDINARY_API_KEY;
    else process.env.CLOUDINARY_API_KEY = origApiKey;

    if (origApiSecret === undefined) delete process.env.CLOUDINARY_API_SECRET;
    else process.env.CLOUDINARY_API_SECRET = origApiSecret;
  }
}

runTests().catch((err) => {
  console.error('❌ Cloudinary test suite failed:', err);
  process.exit(1);
});
