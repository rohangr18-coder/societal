import {
  generateImpactCsv,
  buildMonthlyCategoryData,
  ImpactSummaryMetrics,
} from '../src/components/ImpactAnalyticsView';
import { Donation } from '../src/types';
import fs from 'fs';
import path from 'path';

console.log('🧪 Starting ImpactAnalyticsView CSV & Printable Export Validation...\n');

let passed = 0;
let total = 0;

function assert(condition: boolean, msg: string) {
  total++;
  if (!condition) {
    console.error(`❌ FAILED: ${msg}`);
    throw new Error(msg);
  } else {
    passed++;
    console.log(`  ✅ PASSED: ${msg}`);
  }
}

// 1. Mock Data Setup
const mockDonations: Donation[] = [
  {
    id: 'don-export-1',
    donorId: 'donor-catering-1',
    donorName: 'Grand Hyatt Catering',
    foodName: '60 Pax Biryani & Gravy, "Chef\'s Special"',
    category: 'Cooked Meals',
    description: 'Surplus buffet catering',
    quantity: 60,
    unit: 'servings',
    servings: 60,
    pickupDeadline: 'Today 6 PM',
    pickupAddress: 'Sector 29, City Center, New Delhi',
    latitude: 28.62,
    longitude: 77.21,
    storageType: 'Hot Holding (> 60°C)',
    packaging: 'Sealed stainless containers',
    status: 'delivered',
    createdAt: '2026-10-30T10:00:00Z',
    updatedAt: '2026-10-30T12:00:00Z',
  },
  {
    id: 'don-export-2',
    donorId: 'donor-bakery-1',
    donorName: 'Artisan Bakery',
    foodName: '40 Loaves of Multigrain Bread',
    category: 'Bakery & Bread',
    description: 'Fresh morning loaves',
    quantity: 40,
    unit: 'boxes',
    servings: 80,
    pickupDeadline: 'Today 8 PM',
    pickupAddress: 'South Extension, Delhi',
    latitude: 28.57,
    longitude: 77.22,
    storageType: 'Room Temperature (Dry)',
    packaging: 'Bakery paper wraps',
    status: 'delivered',
    createdAt: '2026-10-30T11:00:00Z',
    updatedAt: '2026-10-30T13:00:00Z',
  },
];

const mockMetrics: ImpactSummaryMetrics = {
  timeFilter: 'all',
  normalizedTotalKg: 56.0,
  servingsDelivered: 140,
  co2AvoidedKg: 140,
  waterSavedLiters: 56000,
  successRate: 100,
  totalDonations: 2,
  totalDelivered: 2,
  uniqueDonors: 2,
  uniqueNgos: 1,
  uniqueVolunteers: 2,
};

const monthlyData = buildMonthlyCategoryData(mockDonations);

// --- Test Suite 1: CSV Generation ---
console.log('--- 1. Testing generateImpactCsv Content & Formatting ---');
const csv = generateImpactCsv(mockDonations, mockMetrics, monthlyData);

assert(typeof csv === 'string' && csv.length > 200, 'generateImpactCsv returns a formatted CSV string');
assert(csv.includes('RESQBITE FOOD RESCUE NETWORK - VERIFIED IMPACT METRICS REPORT'), 'CSV contains official report header');
assert(csv.includes('Reporting Period,"ALL"'), 'CSV reflects uppercase timeframe filter');
assert(csv.includes('Total Food Diverted from Landfills,56.0,kg'), 'CSV includes normalized total kg metric');
assert(csv.includes('Meals & Portions Distributed,140,portions'), 'CSV includes portions distributed');
assert(csv.includes('Greenhouse Gas Mitigated,140,kg CO2e'), 'CSV includes CO2e mitigated');
assert(csv.includes('Agricultural Freshwater Conserved,56000,liters'), 'CSV includes water saved in liters');
assert(csv.includes('Rescue Logistics Success Rate,100,%'), 'CSV includes success rate');
assert(csv.includes('--- MONTHLY FOOD RESCUED BY CATEGORY (LAST 6 MONTHS) ---'), 'CSV includes 6-month breakdown section');
assert(csv.includes('--- INDIVIDUAL DONATION RESCUE RECORDS ---'), 'CSV includes individual donation records section');

// Verify escaping of quotes and commas
assert(csv.includes('""Chef\'s Special""'), 'CSV properly escapes internal double quotes in food name');
assert(csv.includes('"Grand Hyatt Catering"'), 'CSV wraps donor names with quotes');
assert(csv.includes('"Sector 29, City Center, New Delhi"'), 'CSV safely quotes addresses containing commas');

// --- Test Suite 2: Empty Donation Set Safety ---
console.log('\n--- 2. Testing generateImpactCsv with Empty Set ---');
const emptyMetrics: ImpactSummaryMetrics = {
  timeFilter: 'today',
  normalizedTotalKg: 0,
  servingsDelivered: 0,
  co2AvoidedKg: 0,
  waterSavedLiters: 0,
  successRate: 0,
  totalDonations: 0,
  totalDelivered: 0,
  uniqueDonors: 0,
  uniqueNgos: 0,
  uniqueVolunteers: 0,
};
const emptyMonthly = buildMonthlyCategoryData([]);
const emptyCsv = generateImpactCsv([], emptyMetrics, emptyMonthly);
assert(typeof emptyCsv === 'string' && emptyCsv.length > 100, 'Handles empty donation list safely without error');
assert(emptyCsv.includes('Reporting Period,"TODAY"'), 'Empty CSV correctly captures today filter');

// --- Test Suite 3: Component Integration & UI Elements ---
console.log('\n--- 3. Verifying Component Source Code & Printable Summary UI ---');
const compFile = path.resolve(process.cwd(), 'src/components/ImpactAnalyticsView.tsx');
const compSource = fs.readFileSync(compFile, 'utf-8');

assert(compSource.includes('handleExportCsv'), 'ImpactAnalyticsView defines handleExportCsv');
assert(compSource.includes('handlePrint'), 'ImpactAnalyticsView defines handlePrint');
assert(compSource.includes('window.print()'), 'ImpactAnalyticsView calls window.print()');
assert(compSource.includes('id="printable-impact-summary"'), 'ImpactAnalyticsView includes #printable-impact-summary container');
assert(compSource.includes('isPrintModalOpen'), 'ImpactAnalyticsView controls print preview modal with state');
assert(compSource.includes('no-print'), 'ImpactAnalyticsView tags non-printable controls with no-print class');
assert(compSource.includes('VERIFIED AUDIT REPORT'), 'Printable statement includes official audit badge');
assert(compSource.includes('UN SDG 2: Zero Hunger'), 'Printable statement aligns with UN SDG 2');
assert(compSource.includes('UN SDG 12: Responsible Consumption'), 'Printable statement aligns with UN SDG 12');
assert(compSource.includes('UN SDG 13: Climate Action'), 'Printable statement aligns with UN SDG 13');

// --- Test Suite 4: Print Media Query in CSS ---
console.log('\n--- 4. Verifying Global Print Styles in CSS ---');
const cssFile = path.resolve(process.cwd(), 'src/index.css');
const cssSource = fs.readFileSync(cssFile, 'utf-8');

assert(cssSource.includes('@media print'), 'src/index.css contains @media print rules');
assert(cssSource.includes('#printable-impact-summary'), 'src/index.css specifies #printable-impact-summary print selector');
assert(cssSource.includes('.no-print'), 'src/index.css hides .no-print elements during printing');

console.log(`\n🎉 All ${passed}/${total} Impact Export & Printable Summary tests passed successfully!\n`);
