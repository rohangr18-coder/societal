import { handleCategorySuggestion, handleMatchInsights, handleMultilingualGuide, handleMithraChat } from '../server/geminiApi.js';

async function testBackendEndpoints() {
  console.log('🧪 Testing Gemini Backend Endpoints and Error Resilience...\n');

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

  // 1. Suggest Category Endpoint
  console.log('--- Test 1: Category & Packaging Suggestion ---');
  const catResult = await handleCategorySuggestion('Vegetable Biryani', 'Fresh surplus from wedding banquet');
  assert(typeof catResult === 'object' && catResult !== null, 'Suggest category returned an object');
  assert(typeof catResult.available === 'boolean', 'Contains availability boolean');
  assert(Boolean(catResult.suggestions?.category), `Category suggested: ${catResult.suggestions?.category}`);
  assert(Boolean(catResult.suggestions?.storageType), `Storage type suggested: ${catResult.suggestions?.storageType}`);
  assert(Boolean(catResult.suggestions?.packaging), `Packaging recommended: ${catResult.suggestions?.packaging}`);

  // 2. Match Insights Endpoint
  console.log('\n--- Test 2: AI Match Insights ---');
  const matchResult = await handleMatchInsights({
    foodName: '40 Loaves of Sourdough Bread',
    category: 'Bakery & Bread',
    quantity: '40 loaves',
    ngoName: 'Asha Community Shelter',
    ngoCapacity: 200,
    distanceKm: 3.2,
    pickupDeadline: 'Today 8 PM',
  });
  assert(typeof matchResult === 'object', 'Match insights returned an object');
  assert(typeof matchResult.available === 'boolean', 'Contains availability boolean');
  assert(typeof matchResult.insight === 'string' && matchResult.insight.length > 10, 'Insight explanation generated');

  // 3. Multilingual Guide Endpoint
  console.log('\n--- Test 3: Multilingual Safety Guide ---');
  const guideResult = await handleMultilingualGuide('Kannada');
  assert(typeof guideResult === 'object', 'Multilingual guide returned an object');
  assert(Array.isArray(guideResult.guidelines) && guideResult.guidelines.length > 0, 'Returned list of safety guidelines');

  // 4. Mithra AI Multi-Turn Conversation
  console.log('\n--- Test 4: Mithra AI Chatbot & Multi-Turn Support ---');
  const firstTurn = await handleMithraChat({
    message: 'How do I donate surplus food from my restaurant?',
    history: [],
    language: 'en',
    userContext: { role: 'DONOR', locationCity: 'Bengaluru' },
    platformSummary: { activeDonationsCount: 12, totalMealsRescued: 2500 },
  });
  assert(Boolean(firstTurn.text && firstTurn.text.length > 10), 'First turn generated helpful response');
  assert(Array.isArray(firstTurn.actions), 'Actions array returned');
  assert(firstTurn.actions.some(a => a.type === 'create_donation'), 'Contextually suggested create_donation action');

  // Follow-up turn with history
  const secondTurn = await handleMithraChat({
    message: 'What temperature should I keep the hot meals at?',
    history: [
      { role: 'user', parts: [{ text: 'How do I donate surplus food from my restaurant?' }] },
      { role: 'model', parts: [{ text: firstTurn.text }] },
    ],
    language: 'en',
    userContext: { role: 'DONOR' },
  });
  assert(Boolean(secondTurn.text && secondTurn.text.length > 10), 'Follow-up turn processed conversation history');
  assert(secondTurn.text.includes('60') || secondTurn.text.toLowerCase().includes('hot') || secondTurn.text.toLowerCase().includes('temperature'), 'Included thermal / temperature guidance');

  console.log(`\n========================================`);
  console.log(`Backend API Verification: ${passed} Passed, ${failed} Failed`);
  console.log(`========================================\n`);

  if (failed > 0) {
    process.exit(1);
  }
}

testBackendEndpoints().catch((err) => {
  console.error('Test crashed:', err);
  process.exit(1);
});
