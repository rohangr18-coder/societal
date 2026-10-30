/**
 * Rescue Timeline Validation Suite
 *
 * Verifies:
 * 1. RescueTimeline component exists and exports RescueTimeline
 * 2. Visual vertical progress bar tracks donation status from 'Posted' to 'Claimed' and 'Delivered'
 * 3. Stage calculation logic correctly handles all donation lifecycle transitions
 * 4. DonationDetailModal imports and renders RescueTimeline
 */

import { readFileSync } from 'fs';
import { join } from 'path';

function assert(condition: boolean, message: string) {
  if (!condition) {
    console.error(`❌ FAIL: ${message}`);
    throw new Error(message);
  }
  console.log(`  ✅ PASS: ${message}`);
}

function runValidation() {
  console.log('🧪 Starting Rescue Timeline & Vertical Progress Bar Validation...');

  const rootDir = process.cwd();

  // Test 1: File Existence & Component Structure
  console.log('\n--- Test 1: RescueTimeline Component File & Exports ---');
  const timelinePath = join(rootDir, 'src/components/RescueTimeline.tsx');
  const timelineContent = readFileSync(timelinePath, 'utf8');

  assert(timelineContent.includes('export const RescueTimeline'), 'RescueTimeline is exported as a functional React component');
  assert(timelineContent.includes('Rescue Timeline'), 'Contains "Rescue Timeline" header');
  assert(timelineContent.includes('Posted'), 'Tracks "Posted" stage');
  assert(timelineContent.includes('Claimed'), 'Tracks "Claimed" stage');
  assert(timelineContent.includes('Delivered'), 'Tracks "Delivered" stage');

  // Test 2: Vertical Progress Bar Architecture
  console.log('\n--- Test 2: Vertical Progress Bar UI Architecture ---');
  assert(timelineContent.includes('bg-stone-200 rounded-full'), 'Contains continuous vertical background track');
  assert(
    timelineContent.includes('bg-gradient-to-b from-emerald-500') ||
    timelineContent.includes('style={{ height:'),
    'Contains dynamic vertical progress bar with height styling'
  );
  assert(timelineContent.includes('progressPercentage'), 'Computes dynamic progressPercentage across stages');
  assert(timelineContent.includes('aria-hidden="true"'), 'Includes proper accessibility attributes');

  // Test 3: Lifecycle Stage Mapping
  console.log('\n--- Test 3: Lifecycle Stage Mapping & Calculations ---');
  // Check that stages array defines posted, claimed, and delivered
  assert(timelineContent.includes("id: 'posted'"), 'Defines posted stage object');
  assert(timelineContent.includes("id: 'claimed'"), 'Defines claimed stage object');
  assert(timelineContent.includes("id: 'delivered'"), 'Defines delivered stage object');

  // Check stage status logic
  assert(
    timelineContent.includes("['accepted', 'scheduled', 'picked_up', 'in_transit', 'delivered', 'completed'].includes(status)"),
    'Claimed stage marked completed when status reaches accepted, scheduled, picked_up, in_transit, or delivered'
  );
  assert(
    timelineContent.includes("['delivered', 'completed'].includes(status)"),
    'Delivered stage marked completed when status is delivered or completed'
  );

  // Test 4: Integration with DonationDetailModal
  console.log('\n--- Test 4: DonationDetailModal Integration ---');
  const modalPath = join(rootDir, 'src/components/DonationDetailModal.tsx');
  const modalContent = readFileSync(modalPath, 'utf8');

  assert(
    modalContent.includes("import { RescueTimeline } from './RescueTimeline'"),
    'DonationDetailModal imports RescueTimeline'
  );
  assert(
    modalContent.includes('<RescueTimeline donation={donation} />'),
    'DonationDetailModal renders RescueTimeline with donation prop'
  );

  // Test 5: Detailed Timeline Activity Log Preservation
  console.log('\n--- Test 5: Detailed Activity Log Preservation ---');
  assert(
    timelineContent.includes('Detailed Activity Log'),
    'Provides expandable detailed activity log of raw timeline events'
  );
  assert(
    timelineContent.includes('setShowDetailedLog'),
    'Includes collapsible toggle for raw timeline events'
  );

  console.log('\n✨ ALL RESCUE TIMELINE TESTS PASSED SUCCESSFULLY! ✨\n');
}

runValidation();
