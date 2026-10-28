# ResQBite — Food Rescue Network 🍲

A full-stack, enterprise-grade, responsive platform connecting restaurants, hotels, college canteens, hostels, supermarkets, event organizers, and households with surplus edible food to verified NGOs, shelters, community kitchens, and volunteer couriers.

Designed for real societal impact, engineering college capstone presentations, and hackathon demonstrations (Smart India Hackathon style).

---

## 🌟 Upgraded Core Features

### 1. 🤖 Mithra AI — Intelligent Food Rescue Companion
- **Tagline**: *"Your intelligent companion for food rescue."*
- **Floating & Expandable Interface**: Smooth chat drawer with conversation history, suggested starter questions, typing indicators, and one-click quick actions.
- **Multilingual Intelligence**: Full native understanding and conversational responses in **English**, **Kannada (ಕನ್ನಡ)**, **Hindi (हिन्दी)**, and **Tamil (தமிழ்)**.
- **Zero-Slop Food Safety Rules**: Strictly enforces the **2-Hour Temperature Danger Zone** standard (5°C to 60°C), sensory evaluation checks, clean food-grade packing guidelines, and non-human disclaimers.
- **Graceful Deterministic Fallback**: If the Gemini API key is not configured or network latency exceeds 15s, Mithra seamlessly falls back to a deterministic rule-based engine without breaking user workflows.

### 2. ⚡ AI Smart Donation-to-NGO Matching
- **Deterministic Multi-Factor Scoring**:
  - **Proximity**: Real-time Haversine distance calculations from actual coordinates (under 5 km priority, 15 km transit coverage).
  - **Intake Capacity**: Matches NGO daily meal slots (e.g. 150 meals/day) against donation portion count.
  - **Perishability Turnaround**: Urgent 2-hour dispatch for cooked/dairy items; scheduled distribution for raw produce & bakery.
  - **Verification Status**: Verification bonus for partner NGOs with verified regulatory filings.
- **Transparent Explanations**: Grounded strictly in database facts (e.g., *"This NGO is recommended because it is verified, located ~2.4 km away, has reported daily capacity of 150 meals, and can safely receive this batch within the required timeframe."*).
- **Concurrency & Duplicate Claim Safeguards**: Uses atomic Firestore transactions (`runTransaction`) and `claimLock` fields to prevent simultaneous claims by multiple organizations.

### 3. 📍 Google Maps & Consent-Based Live GPS Tracking
- **Interactive Google Maps Platform**: Built with the official Google Maps JavaScript API via `@vis.gl/react-google-maps`.
- **Real Device GPS Geolocation**:
  - Uses `navigator.geolocation.getCurrentPosition()` and `watchPosition()` with `enableHighAccuracy: true`.
  - Displays actual device latitude, longitude, and reported accuracy radius (e.g. `±6m`).
  - Never fabricates coordinates or substitutes random city centers when GPS is unavailable.
- **Consent-Based Volunteer Broadcasting**:
  - Explicit consent modal required before courier coordinates are streamed.
  - Live session recorded in `trackingSessions/{donationId}` with rate-limiting and automatic cleanup when delivered or stopped.
  - Recenter, live marker animation, and 1-click turn-by-turn navigation via Google Maps directions.

### 4. 🔐 Cryptographic QR-Code Handover Verification
- **Dual-Stage Cryptographic Tokens**:
  - Stage 1: **Pickup Handover** (Donor displays QR -> Volunteer scans with camera).
  - Stage 2: **Delivery Receipt** (Shelter displays QR -> Volunteer scans to confirm receipt).
- **Replay Attack Defense**: Tokens are single-use (`pickupUsed: true`, `deliveryUsed: true`) and checked atomically via Firestore transactions.
- **Hardware Fallback**: If device camera is unavailable or permission is denied, a secure 6-digit PIN can be typed manually to confirm handover.

### 5. 📊 Verified Food Impact Dashboard
- **Calculated Exclusively from Authentic Records**:
  - Total donations created and delivered.
  - Food quantities categorized cleanly by unit (kg, portions, boxes).
  - Active donors, verified NGOs, and volunteer couriers.
  - Rescue success rate (delivered vs. resolved).
- **Date Filters**: Filter by **All Time**, **Past 30 Days**, **Past 7 Days**, or **Today**.
- **Visual Analytics**: Interactive SVG breakdown charts for status distribution and surplus food categories.
- **Transparent Environmental Equivalencies**:
  - *CO₂e Mitigated*: 2.5 kg CO₂e prevented per kg organic food diverted from landfill anaerobic decay (UN FAO model).
  - *Freshwater Conserved*: Embodied irrigation and processing water estimated at 1,000 liters / kg.

### 6. 🌐 Multilingual Localization (English, Kannada, Hindi, Tamil)
- **Instant Language Switching**: Toggle between **English**, **Kannada (ಕನ್ನಡ)**, **Hindi (हिन्दी)**, and **Tamil (தமிழ்)** via the persistent header dropdown.
- **Unified Translation Dictionary**: Translates navigation, action buttons, donation statuses, safety rules, QR prompts, tracking telemetries, and Mithra AI suggestions.
- **Profile Synchronization**: Remembers preferred language across browser sessions and syncs to user profile in Firestore.

---

## 🛠️ Technology Stack

| Layer | Technologies |
|---|---|
| **Frontend Framework** | React 19, TypeScript, Tailwind CSS, Vite |
| **Icons & Animations** | Lucide React, Motion |
| **Mapping Engine** | Google Maps JavaScript API, `@vis.gl/react-google-maps` |
| **Authentication & Database** | Firebase Authentication, Cloud Firestore |
| **AI Reasoning** | Google Gemini API (`gemini-3.8-flash` via `@google/genai`) |
| **Cryptographic QR** | `qrcode` SVG/Canvas rendering, Browser Camera MediaDevices API |
| **Backend & Routing** | Express.js, TypeScript (`tsx`) |

---

## 📋 Comprehensive Setup & Deployment Guide

### 1. Firebase Project Setup
1. Go to the [Firebase Console](https://console.firebase.google.com/) and create a project (e.g. `resqbite-network`).
2. **Authentication**:
   - Navigate to **Authentication** > **Sign-in method**.
   - Enable **Email/Password**.
   - (Optional) Enable **Google Sign-in** and add your authorized domain.
3. **Cloud Firestore**:
   - Click **Create database** in Production Mode.
   - Choose a region close to your primary users (e.g. `asia-south1` or `us-central1`).
4. **Deploy Security Rules**:
   - The security rules are maintained in `firestore.rules`.
   - Deploy using Firebase CLI:
     ```bash
     firebase deploy --only firestore:rules
     ```

### 2. Google Maps Platform Setup
1. Open the [Google Cloud Console](https://console.cloud.google.com/).
2. Enable the required APIs:
   - **Maps JavaScript API** (Interactive map, Advanced Markers)
   - **Places API (New)** (Place search & autocomplete)
   - **Geocoding API** (Reverse coordinate resolution)
   - **Routes API** (Directions and navigation links)
3. Under **APIs & Services** > **Credentials**, create an API key.
4. **Security Restrictions (Production Recommended)**:
   - *Application Restrictions*: Select **Websites (HTTP referrers)** and add your domain (e.g., `https://*.run.app/*`, `http://localhost:3000/*`).
   - *API Restrictions*: Restrict key strictly to Maps JavaScript API, Places API, and Geocoding API.
5. Add to your `.env`:
   ```env
   VITE_GOOGLE_MAPS_API_KEY="YOUR_RESTRICTED_GOOGLE_MAPS_KEY"
   ```

### 3. Google Gemini API Setup
1. Get a Gemini API key from [Google AI Studio](https://aistudio.google.com/).
2. Add to `.env`:
   ```env
   GEMINI_API_KEY="YOUR_GEMINI_API_KEY"
   ```
3. Mithra AI uses `gemini-3.8-flash` with a 15-second graceful timeout and automatic fallback to local rule engines if offline or unconfigured.

### 4. Running Locally
```bash
# Install all dependencies
npm install

# Start the local development server on port 3000
npm run dev

# Run automated tests
npm test

# Check TypeScript type safety
npm run lint

# Compile production build
npm run build
```

### 5. Multi-Device & Mobile GPS / Camera Testing
1. **HTTPS Requirement**: Modern browsers only grant Geolocation and Camera access over HTTPS or `localhost`.
2. **Testing on Android**:
   - Open Chrome on Android and visit the hosted URL.
   - Tap **"Use My Current Location"** -> allow "Precise Location".
   - When acting as volunteer courier, tap **"Live GPS Tracking"** -> click **"Agree & Start Broadcasting"** to stream live device telemetry.
   - Tap **"Scan Pickup Handover QR"** to test native camera barcode detection, or test the 6-digit PIN input fallback.
3. **Multi-User Testing**:
   - Open an Incognito window or separate browser profile.
   - Sign in as **Donor** in Window 1 and post a donation.
   - Sign in as **NGO** in Window 2 and click **"Smart Match"** -> claim the donation.
   - Sign in as **Volunteer** in Window 3 -> start live tracking -> verify pickup via QR.
   - Watch Firestore real-time subscriptions update all three browser windows instantly without refreshing!

---

## 🧪 Automated Test Verification

The project includes two comprehensive test suites run via `npm test`:

1. **`tests/workflow_validation.ts`** (30 test assertions):
   - Haversine distance calculations and zero-distance edge cases.
   - Donation status state-machine transitions (valid and invalid shortcuts).
   - Atomic concurrency duplicate-claim safeguards (`claimLock`).
   - Impact calculation methodology (unit normalization and meal equivalents).
   - AI Smart Matching algorithm ranking and transparent explanation generation.
   - QR verification token validation, one-time use, and replay attack defense.
   - Multilingual dictionary completeness across English, Kannada, Hindi, and Tamil.

2. **`tests/mithra_ai_validation.ts`** (18 test assertions):
   - Action token extraction and clean text formatting.
   - Empty input handling and assistant persona greetings.
   - Food safety temperature standards (2-hour rule, hot/cold holding) and disclaimers.
   - Google Maps GPS instructions and navigation action recommendations.
   - Multi-role guidance for NGOs and Volunteers.

**Total Verified**: **48 passing tests, 0 failures**.
