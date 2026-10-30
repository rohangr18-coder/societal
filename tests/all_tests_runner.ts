/**
 * Consolidated Fast Test Runner
 * Runs all validation suites sequentially within a single Node.js process,
 * eliminating the overhead of 13 separate Node/TypeScript VM cold-starts.
 */

async function main() {
  console.log('🚀 Running Consolidated ResQBite Test Runner...\n');
  const startTime = Date.now();

  const testFiles = [
    './workflow_validation.ts',
    './volunteer_workflow_validation.ts',
    './role_selection_workflow_validation.ts',
    './mithra_ai_validation.ts',
    './api_endpoint_validation.ts',
    './fcm_push_notification_validation.ts',
    './notifications_slideover_validation.ts',
    './volunteer_cluster_map_validation.ts',
    './profile_push_toggle_validation.ts',
    './rescue_timeline_validation.ts',
    './browse_filtering_sidebar_validation.ts',
    './pickup_countdown_timer_validation.ts',
    './impact_recharts_barchart_validation.ts',
  ];

  for (const file of testFiles) {
    try {
      console.log(`\n========================================`);
      console.log(`▶ Running ${file}...`);
      console.log(`========================================`);
      await import(file);
    } catch (err: any) {
      console.error(`\n❌ Error in ${file}:`, err);
      process.exit(1);
    }
  }

  const durationSec = ((Date.now() - startTime) / 1000).toFixed(2);
  console.log(`\n🎉 ALL 13 TEST SUITES PASSED SUCCESSFULLY in ${durationSec}s!`);
}

main().catch((err) => {
  console.error('Fatal test runner error:', err);
  process.exit(1);
});
