import {
  buildMonthlyCategoryData,
  MonthlyCategoryData,
} from '../src/components/ImpactAnalyticsView';
import { Donation } from '../src/types';
import fs from 'fs';
import path from 'path';

console.log('🧪 Starting ImpactAnalyticsView Recharts Bar Chart Validation...');

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

// --- Test 1: 6-Month Data Generation ---
console.log('\n--- 1. Testing buildMonthlyCategoryData 6-Month Generation ---');
const emptyMonthly = buildMonthlyCategoryData([]);
assert(Array.isArray(emptyMonthly), 'buildMonthlyCategoryData returns an array');
assert(emptyMonthly.length === 6, 'Returns exactly 6 months of data');

// Verify chronological ordering
for (let i = 0; i < emptyMonthly.length - 1; i++) {
  assert(
    emptyMonthly[i].monthKey < emptyMonthly[i + 1].monthKey,
    `Month at index ${i} (${emptyMonthly[i].monthKey}) is before index ${i + 1} (${emptyMonthly[i + 1].monthKey})`
  );
}

// --- Test 2: Category Breakdown Fields ---
console.log('\n--- 2. Testing Category Breakdown Properties ---');
emptyMonthly.forEach((m, idx) => {
  assert(typeof m.monthKey === 'string' && m.monthKey.length === 7, `Month ${idx} has valid monthKey YYYY-MM`);
  assert(typeof m.monthLabel === 'string' && m.monthLabel.length > 0, `Month ${idx} has monthLabel`);
  assert(typeof m.cookedMeals === 'number' && m.cookedMeals >= 0, `Month ${idx} has non-negative cookedMeals`);
  assert(typeof m.produce === 'number' && m.produce >= 0, `Month ${idx} has non-negative produce`);
  assert(typeof m.bakery === 'number' && m.bakery >= 0, `Month ${idx} has non-negative bakery`);
  assert(typeof m.dairy === 'number' && m.dairy >= 0, `Month ${idx} has non-negative dairy`);
  assert(typeof m.packagedGoods === 'number' && m.packagedGoods >= 0, `Month ${idx} has non-negative packagedGoods`);
  assert(typeof m.other === 'number' && m.other >= 0, `Month ${idx} has non-negative other`);
  assert(
    m.total === m.cookedMeals + m.produce + m.bakery + m.dairy + m.packagedGoods + m.other,
    `Month ${idx} total matches sum of all categories`
  );
});

// --- Test 3: Layering Live Donations ---
console.log('\n--- 3. Testing Real Donation Aggregation Into Months ---');
const now = new Date();
const currentMonthKey = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;

const mockDonations: Donation[] = [
  {
    id: 'don-cook-1',
    donorId: 'donor-1',
    donorName: 'Spice Palace',
    foodName: 'Vegetable Biryani Pots',
    category: 'Cooked Meals',
    description: 'Hot fresh catering surplus',
    quantity: 45,
    unit: 'servings',
    servings: 45,
    pickupDeadline: 'Today 6 PM',
    pickupAddress: 'Indiranagar, Bangalore',
    latitude: 12.97,
    longitude: 77.59,
    storageType: 'Hot',
    packaging: 'Insulated',
    status: 'delivered',
    createdAt: now.toISOString(),
    updatedAt: now.toISOString(),
  },
  {
    id: 'don-prod-1',
    donorId: 'donor-2',
    donorName: 'Green Organic Farm',
    foodName: 'Fresh Spinach & Tomatoes',
    category: 'Fresh Produce & Fruits',
    description: 'Organic surplus',
    quantity: 60,
    unit: 'kg',
    servings: 150,
    pickupDeadline: 'Today 7 PM',
    pickupAddress: 'Hebbal, Bangalore',
    latitude: 13.03,
    longitude: 77.59,
    storageType: 'Ambient',
    packaging: 'Crates',
    status: 'delivered',
    createdAt: now.toISOString(),
    updatedAt: now.toISOString(),
  },
];

const populatedMonthly = buildMonthlyCategoryData(mockDonations);
const currentMonthData = populatedMonthly.find((m) => m.monthKey === currentMonthKey);
const baselineCurrentMonth = emptyMonthly.find((m) => m.monthKey === currentMonthKey);

assert(Boolean(currentMonthData), 'Found current month bucket in populated data');
assert(Boolean(baselineCurrentMonth), 'Found baseline current month bucket');

if (currentMonthData && baselineCurrentMonth) {
  assert(
    currentMonthData.cookedMeals === baselineCurrentMonth.cookedMeals + 45,
    `Current month cookedMeals increased by exactly 45 (from ${baselineCurrentMonth.cookedMeals} to ${currentMonthData.cookedMeals})`
  );
  assert(
    currentMonthData.produce === baselineCurrentMonth.produce + 150,
    `Current month produce increased by 150 servings (from ${baselineCurrentMonth.produce} to ${currentMonthData.produce})`
  );
  assert(
    currentMonthData.total === baselineCurrentMonth.total + 195,
    `Current month total increased by 195 (from ${baselineCurrentMonth.total} to ${currentMonthData.total})`
  );
}

// --- Test 4: Verifying Recharts Library Usage in Component ---
console.log('\n--- 4. Verifying Recharts Usage in ImpactAnalyticsView.tsx ---');
const compPath = path.resolve(process.cwd(), 'src/components/ImpactAnalyticsView.tsx');
const compSource = fs.readFileSync(compPath, 'utf-8');

assert(compSource.includes("from 'recharts'"), 'Imports from recharts library');
assert(compSource.includes('<BarChart'), 'Renders Recharts BarChart component');
assert(compSource.includes('<Bar'), 'Renders Recharts Bar components');
assert(compSource.includes('<XAxis'), 'Renders Recharts XAxis');
assert(compSource.includes('<YAxis'), 'Renders Recharts YAxis');
assert(compSource.includes('<CartesianGrid'), 'Renders Recharts CartesianGrid');
assert(compSource.includes('<Tooltip'), 'Renders Recharts Tooltip');
assert(compSource.includes('<Legend'), 'Renders Recharts Legend');
assert(compSource.includes('<ResponsiveContainer'), 'Renders Recharts ResponsiveContainer');

// --- Test 5: Verifying Title & Categories Rendered ---
console.log('\n--- 5. Verifying Title & Categories in Component ---');
assert(compSource.includes('Monthly Food Rescued'), 'Contains "Monthly Food Rescued" chart title');
assert(compSource.includes('Cooked Meals'), 'Visualizes Cooked Meals category');
assert(compSource.includes('Produce'), 'Visualizes Produce category');
assert(compSource.includes('Bakery & Bread'), 'Visualizes Bakery category');
assert(compSource.includes('Last 6 Months'), 'Explicitly notes Last 6 Months timeframe');

console.log(`\n🎉 All ${passed}/${total} ImpactAnalyticsView Recharts tests passed successfully!`);
