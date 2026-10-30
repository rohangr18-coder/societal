import {
  parsePickupDeadline,
  computeCountdown,
} from '../src/components/PickupCountdownTimer';
import fs from 'fs';
import path from 'path';

console.log('🧪 Starting PickupCountdownTimer Dynamic Countdown & Red Urgency Validation...');

let passed = 0;
let total = 0;

function assert(condition: boolean, msg: string) {
  total++;
  if (!condition) {
    console.error(`❌ FAILED: ${msg}`);
    throw new Error(msg);
  } else {
    passed++;
    console.log(`✅ PASSED: ${msg}`);
  }
}

// --- Test 1: Deadline Parsing ---
console.log('\n--- 1. Testing parsePickupDeadline ---');
const isoDeadline = '2026-10-30T18:00:00.000Z';
const parsedIso = parsePickupDeadline(isoDeadline);
assert(parsedIso !== null && parsedIso === new Date(isoDeadline).getTime(), 'Parses direct ISO deadline');

const formattedDeadline = '2026-10-30 before 18:30 (Asia/Kolkata)';
const parsedFormatted = parsePickupDeadline(formattedDeadline);
assert(parsedFormatted !== null, 'Parses custom formatted string with date and time');

const collectionDeadline = '2026-10-30T19:00:00';
const parsedCollection = parsePickupDeadline('Today before 6:00 PM', collectionDeadline);
assert(parsedCollection !== null && parsedCollection === new Date(collectionDeadline).getTime(), 'Prioritizes collectionDeadline when available');

const relativeToday = parsePickupDeadline('Today before 8:00 PM');
assert(relativeToday !== null, 'Parses relative Today string');

const relativeTomorrow = parsePickupDeadline('Tomorrow before 12:00 PM');
assert(relativeTomorrow !== null && relativeTomorrow > (relativeToday || 0), 'Tomorrow deadline is in the future compared to Today');

// --- Test 2: Dynamic Countdown Calculations ---
console.log('\n--- 2. Testing computeCountdown Calculations ---');
const now = Date.now();

// 2.1: 45 minutes remaining (under 60 minutes)
const under60Target = now + 45 * 60 * 1000 + 30 * 1000; // 45m 30s
const resUnder60 = computeCountdown(under60Target, now);

assert(resUnder60.isExpired === false, '45 mins remaining is not expired');
assert(resUnder60.isUnder60Minutes === true, '45 mins remaining correctly identified as isUnder60Minutes: true');
assert(resUnder60.urgencyLevel === 'urgent_red', 'Urgency level is urgent_red when under 60 minutes');
assert(resUnder60.hours === 0, 'Hours is 0');
assert(resUnder60.minutes === 45, 'Minutes is 45');
assert(resUnder60.seconds === 30, 'Seconds is 30');
assert(resUnder60.digitalClock === '00:45:30', 'Digital clock formatted as 00:45:30');
assert(resUnder60.formattedTime === '45m 30s', 'Formatted time string is 45m 30s');

// 2.2: 59 minutes remaining (edge case: strictly under 60 minutes)
const fiftyNineTarget = now + 59 * 60 * 1000;
const resFiftyNine = computeCountdown(fiftyNineTarget, now);
assert(resFiftyNine.isUnder60Minutes === true, '59 mins remaining is under 60 minutes');
assert(resFiftyNine.urgencyLevel === 'urgent_red', '59 mins remaining is color-coded red (urgent_red)');

// 2.3: 75 minutes remaining (over 60 minutes -> caution amber, NOT red)
const over60Target = now + 75 * 60 * 1000; // 1h 15m
const resOver60 = computeCountdown(over60Target, now);
assert(resOver60.isUnder60Minutes === false, '75 mins remaining is NOT under 60 minutes');
assert(resOver60.urgencyLevel !== 'urgent_red', '75 mins remaining is NOT urgent_red');
assert(resOver60.urgencyLevel === 'caution_amber', '75 mins remaining is caution_amber');
assert(resOver60.hours === 1, 'Hours is 1');
assert(resOver60.minutes === 15, 'Minutes is 15');
assert(resOver60.digitalClock === '01:15:00', 'Digital clock formatted as 01:15:00');

// 2.4: 8 hours remaining (safe green)
const safeTarget = now + 8 * 60 * 60 * 1000;
const resSafe = computeCountdown(safeTarget, now);
assert(resSafe.isUnder60Minutes === false, '8 hours remaining is NOT under 60 minutes');
assert(resSafe.urgencyLevel === 'safe_green', '8 hours remaining is safe_green');
assert(resSafe.hours === 8, 'Hours is 8');

// 2.5: Expired window (deadline passed)
const expiredTarget = now - 5 * 60 * 1000;
const resExpired = computeCountdown(expiredTarget, now);
assert(resExpired.isExpired === true, 'Past deadline marked as expired');
assert(resExpired.isUnder60Minutes === true, 'Expired deadline is flagged as under 60 mins');
assert(resExpired.urgencyLevel === 'expired', 'Urgency level is expired');
assert(resExpired.digitalClock === '00:00:00', 'Expired digital clock is 00:00:00');

// --- Test 3: Color-Coding Verification in Component Source Code ---
console.log('\n--- 3. Verifying Component Red Color-Coding Logic ---');
const countdownSourcePath = path.resolve(process.cwd(), 'src/components/PickupCountdownTimer.tsx');
const countdownSource = fs.readFileSync(countdownSourcePath, 'utf-8');

assert(countdownSource.includes('isUnder60Minutes'), 'Source checks for isUnder60Minutes condition');
assert(countdownSource.includes('text-red-600') || countdownSource.includes('text-red-700'), 'Source applies text-red-600/700 styling');
assert(countdownSource.includes('bg-red-50') || countdownSource.includes('bg-red-100'), 'Source applies red background styling');
assert(countdownSource.includes('border-red-300') || countdownSource.includes('border-red-200'), 'Source applies red border styling');
assert(countdownSource.includes('setInterval'), 'Source uses interval timer for dynamic updates');
assert(countdownSource.includes('clearInterval'), 'Source cleans up interval on unmount');

// --- Test 4: DonationDetailModal Integration ---
console.log('\n--- 4. Verifying DonationDetailModal Integration ---');
const modalSourcePath = path.resolve(process.cwd(), 'src/components/DonationDetailModal.tsx');
const modalSource = fs.readFileSync(modalSourcePath, 'utf-8');

assert(modalSource.includes('PickupCountdownTimer'), 'DonationDetailModal imports PickupCountdownTimer');
assert(modalSource.includes('<PickupCountdownTimer'), 'DonationDetailModal renders PickupCountdownTimer');
assert(modalSource.includes("variant=\"banner\""), 'DonationDetailModal renders hero countdown banner');
assert(modalSource.includes("variant=\"inline\""), 'DonationDetailModal renders inline countdown badge in pickup window');

console.log(`\n🎉 All ${passed}/${total} PickupCountdownTimer tests passed successfully!`);
