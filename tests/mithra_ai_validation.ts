/**
 * Automated Verification Suite for Mithra AI Chatbot
 * Tests input sanitization, action token parsing, food safety compliance, and deterministic fallback reasoning.
 */

import { parseChatActions, handleMithraChat, handleMithraFallback } from '../server/geminiApi';

async function runMithraTests() {
  console.log('🤖 Running Mithra AI Chatbot Verification Suite...\n');

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

  // TEST 1: Action Token Parser
  console.log('--- Test Suite 1: Action Token Extraction & Text Cleaning ---');
  const sampleWithActions = `To donate food, click below:
[ACTION:create_donation:Donate Surplus Food]
You can also view the map:
[ACTION:open_map:Explore Live Rescue Map]`;

  const parsed = parseChatActions(sampleWithActions);
  assert(parsed.actions.length === 2, 'Parsed exactly 2 action tokens');
  assert(parsed.actions[0].type === 'create_donation', 'First action type is create_donation');
  assert(parsed.actions[0].label === 'Donate Surplus Food', 'First action label parsed correctly');
  assert(parsed.actions[1].type === 'open_map', 'Second action type is open_map');
  assert(!parsed.cleanText.includes('[ACTION:'), 'Action tokens stripped from cleaned display text');

  // TEST 2: Action with targetId
  console.log('\n--- Test Suite 2: Action with Target ID Parsing ---');
  const sampleWithTargetId = 'Check this donation: [ACTION:view_donation:don_abc123:Inspect Rice Batch]';
  const parsedTarget = parseChatActions(sampleWithTargetId);
  assert(parsedTarget.actions.length === 1, 'Parsed targetId action successfully');
  assert(parsedTarget.actions[0].type === 'view_donation', 'Targeted action type matches');
  assert(parsedTarget.actions[0].targetId === 'don_abc123', 'Target ID correctly extracted');
  assert(parsedTarget.actions[0].label === 'Inspect Rice Batch', 'Label correctly extracted');

  // TEST 3: Empty Message Handling
  console.log('\n--- Test Suite 3: Empty Input & Greeting Response ---');
  const emptyRes = await handleMithraChat({ message: '' });
  assert(emptyRes.available === true, 'Empty message returns available response');
  assert(emptyRes.text.includes('Mithra AI'), 'Greets user with Mithra AI identity');
  assert(emptyRes.actions.length > 0, 'Provides starter navigation actions');

  // TEST 4: Food Safety Advice & Non-Human Disclaimer (Fallback Engine)
  console.log('\n--- Test Suite 4: Food Safety Standards & Disclaimer ---');
  const safetyRes = handleMithraFallback('What are the food safety rules and temperature limits?');
  const safetyLower = safetyRes.text.toLowerCase();
  assert(
    safetyLower.includes('2 hours') ||
    safetyLower.includes('temperature') ||
    safetyLower.includes('danger') ||
    safetyLower.includes('60°c') ||
    safetyLower.includes('4°c'),
    'Explains food safety temperature guidelines (2-hour rule, hot/cold)'
  );
  assert(
    safetyLower.includes('notice') ||
    safetyLower.includes('verify') ||
    safetyLower.includes('inspect') ||
    safetyLower.includes('check'),
    'Includes food safety verification disclaimer'
  );

  // TEST 5: Google Maps and GPS Guidance (Fallback Engine)
  console.log('\n--- Test Suite 5: Google Maps & Real GPS Guidance ---');
  const mapRes = handleMithraFallback('How does the map work and how do I track with GPS?', undefined, {
    activeDonationsCount: 7,
    totalMealsRescued: 2150,
  });
  const mapLower = mapRes.text.toLowerCase();
  assert(
    mapLower.includes('location') ||
    mapLower.includes('gps') ||
    mapLower.includes('map'),
    'Explains browser geolocation and map'
  );
  assert(
    mapRes.actions && mapRes.actions.length > 0,
    'Provides interactive action recommendations'
  );

  // TEST 6: Role Guidance (NGO / Volunteer)
  console.log('\n--- Test Suite 6: Role Guidance (NGO / Volunteer) ---');
  const ngoRes = handleMithraFallback('How do NGOs claim food batches?', {
    role: 'NGO',
    organizationName: 'City Shelter Hope',
  });
  const ngoLower = ngoRes.text.toLowerCase();
  assert(
    ngoLower.includes('ngo') ||
    ngoLower.includes('shelter') ||
    ngoLower.includes('claim'),
    'Acknowledges NGO claiming role'
  );
  assert(
    ngoRes.actions && ngoRes.actions.length > 0,
    'Recommends interactive navigation actions'
  );

  // Summary
  console.log(`\n========================================`);
  console.log(`Mithra AI Tests Completed: ${passed} passed, ${failed} failed`);
  console.log(`========================================\n`);

  if (failed > 0) {
    process.exit(1);
  }
}

runMithraTests().catch((err) => {
  console.error('Fatal error running Mithra AI tests:', err);
  process.exit(1);
});
