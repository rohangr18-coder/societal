import {
  computeSafeUntil,
  getSafeHoursAllowed,
  getStorageTier,
  isDonationExpired,
  normalizeTimestamp,
} from '../src/utils/foodSafety.js';
import {
  scanAndExpireOverdueDonations,
  startExpirationCron,
  stopExpirationCron,
  getExpirationJobStatus,
} from '../server/expirationJob.js';
import app from '../server/app.js';
import fs from 'fs';
import path from 'path';

export async function runScheduledExpirationJobValidation(): Promise<void> {
  console.log('🧪 Starting ResQBite Scheduled Food Safety & Expiration Job Validation...\n');

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

  // ============================================================
  // Suite 1: Food Safety Calculations & 2-Hour Danger Zone Rule
  // ============================================================
  console.log('--- Suite 1: Food Safety Category & Storage Calculations ---');

  // Test Storage Tiers
  assert(getStorageTier('Room Temperature (Dry)') === 'ambient', 'Room Temperature classified as ambient');
  assert(getStorageTier('Ambient / None') === 'ambient', 'Ambient classified as ambient');
  assert(getStorageTier('Hot Holding (> 60°C)') === 'hot_holding', 'Hot holding classified as hot_holding');
  assert(getStorageTier('Refrigerated (0-4°C)') === 'refrigerated', 'Refrigerated classified as refrigerated');
  assert(getStorageTier('Frozen (< -18°C)') === 'frozen', 'Frozen classified as frozen');

  // Test 2-Hour Rule for Cooked Meals outside temperature holding
  const cookedAmbient = getSafeHoursAllowed('Cooked Meals', 'Room Temperature (Dry)');
  assert(cookedAmbient.hours === 2, 'Cooked Meals at room temperature enforces strict 2-Hour Rule');
  assert(cookedAmbient.isCookedOutsideHolding === true, 'Flags cooked meals outside holding as danger zone');
  assert(cookedAmbient.temperatureCategory === 'danger_zone', 'Category is danger_zone');

  const cookedHot = getSafeHoursAllowed('Cooked Meals', 'Hot Holding (> 60°C)');
  assert(cookedHot.hours === 4, 'Cooked Meals under hot holding allows up to 4 hours');
  assert(cookedHot.isCookedOutsideHolding === false, 'Hot holding is not outside holding');

  const cookedCold = getSafeHoursAllowed('Cooked Meals', 'Refrigerated (0-4°C)');
  assert(cookedCold.hours === 24, 'Cooked Meals refrigerated allows 24 hours');

  const cookedFrozen = getSafeHoursAllowed('Cooked Meals', 'Frozen (< -18°C)');
  assert(cookedFrozen.hours === 168, 'Cooked Meals frozen allows 168 hours (7 days)');

  // Dairy, Produce, Bakery, Packaged
  const dairyAmbient = getSafeHoursAllowed('Dairy & Eggs', 'Room Temperature');
  assert(dairyAmbient.hours === 4, 'Dairy & Eggs at room temp allows 4 hours');

  const dairyChilled = getSafeHoursAllowed('Dairy & Eggs', 'Refrigerated');
  assert(dairyChilled.hours === 48, 'Dairy & Eggs refrigerated allows 48 hours');

  const produceAmbient = getSafeHoursAllowed('Fresh Produce & Fruits', 'Room Temperature');
  assert(produceAmbient.hours === 24, 'Fresh Produce at room temp allows 24 hours');

  const produceChilled = getSafeHoursAllowed('Fresh Produce & Fruits', 'Refrigerated');
  assert(produceChilled.hours === 72, 'Fresh Produce refrigerated allows 72 hours');

  const bakery = getSafeHoursAllowed('Bakery & Bread', 'Room Temperature');
  assert(bakery.hours === 24, 'Bakery & Bread allows 24 hours');

  const packaged = getSafeHoursAllowed('Packaged & Canned Goods', 'Room Temperature');
  assert(packaged.hours === 168, 'Packaged goods allows 7 days');

  // computeSafeUntil computation from base preparedAt
  const basePrep = new Date('2026-11-01T10:00:00.000Z');
  const safeCalc = computeSafeUntil({
    category: 'Cooked Meals',
    storageType: 'Room Temperature',
    preparedAt: basePrep.toISOString(),
  });
  const expectedSafeUntil = new Date('2026-11-01T12:00:00.000Z').getTime();
  assert(safeCalc.safeUntilTimestamp === expectedSafeUntil, 'computeSafeUntil accurately adds 2 hours to preparedAt');
  assert(safeCalc.safeUntilIso === '2026-11-01T12:00:00.000Z', 'safeUntilIso matches ISO string');
  assert(safeCalc.isCookedOutsideHolding === true, 'isCookedOutsideHolding is true for room temperature cooked food');

  // ============================================================
  // Suite 2: Expiration Evaluation (isDonationExpired)
  // ============================================================
  console.log('\n--- Suite 2: isDonationExpired Rule Evaluation ---');

  // Active cooked meal prepared 1 hour ago (not expired)
  const oneHourAgo = new Date(Date.now() - 1 * 60 * 60 * 1000).toISOString();
  const checkActive = isDonationExpired({
    category: 'Cooked Meals',
    storageType: 'Room Temperature',
    preparedAt: oneHourAgo,
    status: 'available',
  });
  assert(checkActive.isExpired === false, 'Cooked meal 1 hour into 2-hour window is NOT expired');
  assert(checkActive.remainingMinutes > 50 && checkActive.remainingMinutes <= 60, 'Accurately computes ~59 minutes remaining');

  // Overdue cooked meal prepared 3 hours ago (expired under 2-hour rule)
  const threeHoursAgo = new Date(Date.now() - 3 * 60 * 60 * 1000).toISOString();
  const checkExpired = isDonationExpired({
    category: 'Cooked Meals',
    storageType: 'Room Temperature',
    preparedAt: threeHoursAgo,
    status: 'available',
  });
  assert(checkExpired.isExpired === true, 'Cooked meal 3 hours old at room temp is EXPIRED');
  assert(checkExpired.isCookedPerishable === true, 'Correctly flags perishable cooked food');

  // Explicit safeUntil in the past
  const pastSafeUntil = new Date(Date.now() - 10 * 60 * 1000).toISOString();
  const checkExplicitPast = isDonationExpired({
    safeUntil: pastSafeUntil,
    status: 'available',
  });
  assert(checkExplicitPast.isExpired === true, 'Explicit past safeUntil is EXPIRED');

  // Explicit collectionDeadline earlier than safeUntil
  const earlyDeadline = new Date(Date.now() - 5 * 60 * 1000).toISOString();
  const checkEarlyDeadline = isDonationExpired({
    safeUntil: new Date(Date.now() + 2 * 60 * 60 * 1000).toISOString(),
    collectionDeadline: earlyDeadline,
    status: 'available',
  });
  assert(checkEarlyDeadline.isExpired === true, 'Passed collectionDeadline marks item as expired even if safeUntil was later');

  // Already expired status
  const checkStatusExpired = isDonationExpired({ status: 'expired' });
  assert(checkStatusExpired.isExpired === true, 'Status "expired" returns isExpired: true immediately');

  // ============================================================
  // Suite 3: Server Scheduled Job Execution & Simulation
  // ============================================================
  console.log('\n--- Suite 3: Server Expiration Job Execution ---');

  // Run scanAndExpireOverdueDonations
  const scanResult = await scanAndExpireOverdueDonations();
  assert(typeof scanResult === 'object' && scanResult !== null, 'scanAndExpireOverdueDonations returned result object');
  assert(typeof scanResult.scannedCount === 'number', `Scanned ${scanResult.scannedCount} active donations`);
  assert(typeof scanResult.expiredCount === 'number', `Expired ${scanResult.expiredCount} items`);
  assert(Array.isArray(scanResult.expiredDonationIds), 'Contains expiredDonationIds array');

  // Test background cron start / stop / status
  assert(typeof startExpirationCron === 'function', 'startExpirationCron is exported');
  assert(typeof stopExpirationCron === 'function', 'stopExpirationCron is exported');
  assert(typeof getExpirationJobStatus === 'function', 'getExpirationJobStatus is exported');

  // Start cron with 10s interval
  startExpirationCron(10000);
  const statusRunning = getExpirationJobStatus();
  assert(statusRunning.isRunning === true, 'Job status reports isRunning: true after startExpirationCron');
  assert(statusRunning.intervalMs === 10000, 'Job interval set to 10000ms');

  // Stop cron
  stopExpirationCron();
  const statusStopped = getExpirationJobStatus();
  assert(statusStopped.isRunning === false, 'Job status reports isRunning: false after stopExpirationCron');

  // ============================================================
  // Suite 4: API Endpoints Validation
  // ============================================================
  console.log('\n--- Suite 4: Expiration Job Express Endpoints ---');

  // Test GET /api/jobs/expiration-status
  let statusResp: any = null;
  const mockReq1: any = { method: 'GET', url: '/api/jobs/expiration-status', headers: {}, isTest: true };
  const mockRes1: any = {
    statusCode: 200,
    setHeader: () => {},
    status(code: number) { this.statusCode = code; return this; },
    json(data: any) { statusResp = data; return this; },
  };
  await (app as any).handle(mockReq1, mockRes1, () => {});
  assert(mockRes1.statusCode === 200, 'GET /api/jobs/expiration-status returned HTTP 200');
  assert(statusResp && statusResp.status === 'ok', 'Status endpoint returned status: ok');
  assert(typeof statusResp.intervalMs === 'number', 'Status endpoint returns intervalMs');

  // Test POST /api/jobs/expire-donations
  let triggerResp: any = null;
  const mockReq2: any = {
    method: 'POST',
    url: '/api/jobs/expire-donations',
    headers: { 'Content-Type': 'application/json' },
    body: {},
    isTest: true,
  };
  const mockRes2: any = {
    statusCode: 200,
    setHeader: () => {},
    status(code: number) { this.statusCode = code; return this; },
    json(data: any) { triggerResp = data; return this; },
  };
  await (app as any).handle(mockReq2, mockRes2, () => {});
  assert(mockRes2.statusCode === 200, 'POST /api/jobs/expire-donations returned HTTP 200');
  assert(triggerResp && triggerResp.success === true, 'Scan endpoint executed successfully');
  assert(typeof triggerResp.scannedCount === 'number', 'Scan endpoint returns scannedCount');
  assert(Array.isArray(triggerResp.expiredDonationIds), 'Scan endpoint returns expiredDonationIds list');

  // ============================================================
  // Suite 5: Source Code & Architectural Hardening Verification
  // ============================================================
  console.log('\n--- Suite 5: Codebase Verification for Phase 3 Requirements ---');

  const typesContent = fs.readFileSync(path.join(process.cwd(), 'src/types.ts'), 'utf-8');
  assert(typesContent.includes('preparedAt?: string'), 'src/types.ts defines preparedAt in Donation');
  assert(typesContent.includes('safeUntil?: string'), 'src/types.ts defines safeUntil in Donation');
  assert(typesContent.includes('expiredAt?: string'), 'src/types.ts defines expiredAt in Donation');

  const blueprintContent = fs.readFileSync(path.join(process.cwd(), 'firebase-blueprint.json'), 'utf-8');
  assert(blueprintContent.includes('"preparedAt"'), 'firebase-blueprint.json includes preparedAt');
  assert(blueprintContent.includes('"safeUntil"'), 'firebase-blueprint.json includes safeUntil');
  assert(blueprintContent.includes('"expiredAt"'), 'firebase-blueprint.json includes expiredAt');

  const dbServiceContent = fs.readFileSync(path.join(process.cwd(), 'src/services/dbService.ts'), 'utf-8');
  assert(dbServiceContent.includes('computeSafeUntil'), 'dbService imports computeSafeUntil');
  assert(dbServiceContent.includes('isDonationExpired'), 'dbService imports isDonationExpired');
  assert(dbServiceContent.includes('safeUntil: data.safeUntil || computedSafety.safeUntilIso'), 'dbService auto-computes safeUntil in createDonation');
  assert(dbServiceContent.includes('Food Safety Notice: This donation has passed its safe consumption threshold'), 'claimDonationByNgo blocks claiming expired items');
  assert(dbServiceContent.includes('Food Safety Alert: This food collection request has passed its safe consumption threshold'), 'acceptCollectionTaskByVolunteer blocks expired items');

  const modalContent = fs.readFileSync(path.join(process.cwd(), 'src/components/DonationDetailModal.tsx'), 'utf-8');
  assert(modalContent.includes('safeUntil={donation.safeUntil}'), 'DonationDetailModal passes safeUntil to countdown timer');
  assert(modalContent.includes('isDonationExpired(donation)'), 'DonationDetailModal evaluates food safety expiration');
  assert(modalContent.includes('Food Safety Guard: Item has expired and can no longer be claimed'), 'DonationDetailModal blocks claims when expired');

  const createModalContent = fs.readFileSync(path.join(process.cwd(), 'src/components/CreateDonationModal.tsx'), 'utf-8');
  assert(createModalContent.includes('computeSafeUntil'), 'CreateDonationModal computes live safeUntil');
  assert(createModalContent.includes('2-Hour Food Safety Rule Enforced'), 'CreateDonationModal displays 2-Hour Food Safety Rule indicator');
  assert(createModalContent.includes('safeUntil: foodSafetyCalc.safeUntilIso'), 'CreateDonationModal saves safeUntil');

  const serverJobContent = fs.readFileSync(path.join(process.cwd(), 'server/expirationJob.ts'), 'utf-8');
  assert(serverJobContent.includes('where(\'status\', \'in\', activeStatuses)'), 'Scheduled job queries active uncollected donations');
  assert(serverJobContent.includes('recipientUserId: data.donorId'), 'Scheduled job notifies original donor with dedicated recipientUserId');
  assert(serverJobContent.includes('Food Safety Notice: Donation Expired'), 'Donor notification includes food safety notice');
  assert(serverJobContent.includes('DONATION_EXPIRED_SCHEDULED'), 'Scheduled job writes server-side audit logs');
  assert(serverJobContent.includes('activeAssignmentId: \'\''), 'Scheduled job releases assigned courier active assignment');

  console.log(`\n========================================`);
  console.log(`Results: ${passed} Passed, ${failed} Failed`);
  console.log(`========================================`);

  if (failed > 0) {
    throw new Error(`${failed} tests failed in Scheduled Expiration Job validation!`);
  }
  console.log('🎉 All Scheduled Food Safety & Expiration Job tests passed successfully!\n');
}

// Auto-run if executed directly via CLI
if (process.argv[1] && process.argv[1].endsWith('scheduled_expiration_job_validation.ts')) {
  runScheduledExpirationJobValidation().catch((err) => {
    console.error('Fatal error in validation runner:', err);
    process.exit(1);
  });
}
