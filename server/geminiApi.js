import { GoogleGenAI } from "@google/genai";
import dotenv from "dotenv";
dotenv.config();
function getGenAI() {
  const apiKey = process.env.GEMINI_API_KEY || process.env.API_KEY || process.env.GOOGLE_API_KEY;
  if (!apiKey || apiKey === "MY_GEMINI_API_KEY") {
    return null;
  }
  return new GoogleGenAI({
    apiKey,
    httpOptions: {
      headers: {
        "User-Agent": "aistudio-build"
      }
    }
  });
}
async function handleCategorySuggestion(foodName, description) {
  const ai = getGenAI();
  if (!ai) {
    return {
      available: false,
      message: "Gemini API key is not configured in environment. Using standard categories.",
      suggestions: {
        category: "Cooked Meals",
        storageType: "Refrigerated (0-4\xB0C)",
        packaging: "Sealed food-grade containers",
        allergens: "Check ingredients carefully"
      }
    };
  }
  try {
    const prompt = `You are an expert food safety and logistics assistant for Food Rescue Network.
A donor wants to donate surplus food.
Food Name: "${foodName}"
Description: "${description}"

Analyze this food and return a JSON object with:
- "category": One of ["Cooked Meals", "Bakery & Bread", "Fresh Produce & Fruits", "Dairy & Eggs", "Packaged & Canned Goods", "Beverages", "Raw Ingredients"]
- "storageType": One of ["Room Temperature (Dry)", "Refrigerated (0-4\xB0C)", "Frozen (< -18\xB0C)", "Hot Holding (> 60\xB0C)"]
- "packaging": Recommended packaging (e.g., "Sealed foil trays", "Food-grade air-tight containers", "Crates with breathable wrap")
- "commonAllergens": A comma-separated list of probable allergens to verify (e.g., "Dairy, Gluten, Nuts")
- "handlingTips": Brief 1-2 sentence recommendation for safe transport.

NOTE: Output pure JSON only. Do not invent safety certifications.`;
    const response = await ai.models.generateContent({
      model: "gemini-3.1-flash-lite",
      contents: prompt,
      config: {
        responseMimeType: "application/json"
      }
    });
    const text = response.text || "{}";
    const parsed = JSON.parse(text);
    return {
      available: true,
      suggestions: parsed
    };
  } catch (err) {
    console.warn("Gemini Suggestion warning:", err?.message || err);
    return {
      available: false,
      error: err.message,
      suggestions: {
        category: "Cooked Meals",
        storageType: "Refrigerated (0-4\xB0C)",
        packaging: "Sealed food-grade containers",
        allergens: "None reported"
      }
    };
  }
}
async function handleMatchInsights(params) {
  const ai = getGenAI();
  if (!ai) {
    return {
      available: false,
      message: "Gemini AI not configured. Showing deterministic matching score.",
      insight: `Deterministic Match: ${params.ngoName} has capacity for ${params.ngoCapacity} meals/day, suitable for ${params.quantity} of ${params.foodName}. Distance: ~${params.distanceKm ?? "nearby"} km.`
    };
  }
  try {
    const prompt = `You are a logistics matching evaluator for Food Rescue Network.
Donation:
- Food: ${params.foodName} (${params.category})
- Quantity: ${params.quantity}
- Pickup Deadline: ${params.pickupDeadline}

Candidate Organization:
- Name: ${params.ngoName}
- Daily Meal Capacity: ${params.ngoCapacity} meals
- Estimated Distance: ${params.distanceKm ?? "within coverage"} km

Provide a concise, objective explanation (2-3 sentences max) evaluating why this NGO is a suitable recipient, considering volume compatibility, timing, and distribution efficiency. Do not guarantee food safety. Output JSON with field "explanation" and "matchRating" ("High", "Moderate", "Standard").`;
    const response = await ai.models.generateContent({
      model: "gemini-3.1-flash-lite",
      contents: prompt,
      config: {
        responseMimeType: "application/json"
      }
    });
    const parsed = JSON.parse(response.text || "{}");
    return {
      available: true,
      insight: parsed.explanation,
      matchRating: parsed.matchRating || "High"
    };
  } catch (err) {
    return {
      available: false,
      error: err.message,
      insight: `Logistics Match: ${params.ngoName} has reported capacity to receive ${params.quantity} of ${params.foodName}.`
    };
  }
}
async function handleMultilingualGuide(targetLanguage) {
  const ai = getGenAI();
  if (!ai) {
    return {
      available: false,
      language: targetLanguage,
      guidelines: [
        "1. Inspect food temperature and integrity before dispatch.",
        "2. Keep cooked hot food above 60\xB0C and cold perishable food below 4\xB0C during transport.",
        "3. Use sealed clean containers and sanitize handling equipment.",
        "4. Maintain delivery logs and verify receipt signatures."
      ]
    };
  }
  try {
    const prompt = `Translate and adapt the following 4 food rescue logistics rules into ${targetLanguage}:
1. Inspect food temperature and integrity before dispatch.
2. Keep cooked hot food above 60\xB0C and cold perishable food below 4\xB0C during transport.
3. Use sealed clean containers and sanitize handling equipment.
4. Maintain delivery logs and verify receipt upon handover.

Return JSON with format: { "language": "${targetLanguage}", "guidelines": ["rule 1", "rule 2", "rule 3", "rule 4"] }`;
    const response = await ai.models.generateContent({
      model: "gemini-3.1-flash-lite",
      contents: prompt,
      config: {
        responseMimeType: "application/json"
      }
    });
    const parsed = JSON.parse(response.text || "{}");
    return {
      available: true,
      language: parsed.language || targetLanguage,
      guidelines: parsed.guidelines || []
    };
  } catch (err) {
    return {
      available: false,
      error: err.message,
      language: targetLanguage,
      guidelines: [
        "1. Inspect food temperature and packaging before dispatch.",
        "2. Keep perishable items chilled and hot food protected.",
        "3. Transport in sealed food-grade containers.",
        "4. Log delivery and confirm handover with recipient."
      ]
    };
  }
}
function parseChatActions(rawText) {
  const actions = [];
  const actionRegex = /\[ACTION:([a-zA-Z0-9_]+)(?::([^:\]\n]+))?(?::([^\]\n]+))?\]/g;
  let match;
  while ((match = actionRegex.exec(rawText)) !== null) {
    const type = match[1];
    let label = "";
    let targetId = void 0;
    if (match[3]) {
      targetId = match[2];
      label = match[3];
    } else if (match[2]) {
      label = match[2];
    } else {
      label = type.replace(/_/g, " ");
    }
    actions.push({ type, label, targetId });
  }
  const cleanText = rawText.replace(actionRegex, "").trim();
  return { cleanText, actions };
}
function getSmartDefaultActions(query, role) {
  const q = query.toLowerCase();
  const actions = [];
  if (q.includes("donate") || q.includes("surplus") || q.includes("give") || q.includes("food") || role === "Donor") {
    actions.push({ type: "create_donation", label: "Donate Surplus Food" });
  }
  if (q.includes("map") || q.includes("gps") || q.includes("location") || q.includes("near") || q.includes("where")) {
    actions.push({ type: "open_map", label: "Explore Live Map" });
  }
  if (q.includes("browse") || q.includes("claim") || q.includes("list") || q.includes("available") || role === "NGO") {
    actions.push({ type: "browse", label: "Browse Surplus Food" });
  }
  if (q.includes("impact") || q.includes("stat") || q.includes("meal") || q.includes("carbon")) {
    actions.push({ type: "impact", label: "View Impact Numbers" });
  }
  if (q.includes("profile") || q.includes("role") || q.includes("account")) {
    actions.push({ type: "profile", label: "View Profile" });
  }
  if (actions.length === 0) {
    actions.push(
      { type: "create_donation", label: "Donate Food" },
      { type: "open_map", label: "Explore Live Map" },
      { type: "browse", label: "Browse Food" }
    );
  }
  return actions.slice(0, 3);
}
function handleMithraFallback(message, userContext, platformSummary, language = "en") {
  const q = message.toLowerCase();
  const role = userContext?.role || "Guest";
  const activeCount = platformSummary?.activeDonationsCount ?? 0;
  const mealsRescued = platformSummary?.totalMealsRescued ?? 0;
  let text = "";
  const actions = [];
  if (q.includes("safety") || q.includes("temp") || q.includes("spoil") || q.includes("hygiene") || q.includes("rule") || q.includes("fssai")) {
    text = `### Food Safety & Rescue Guidelines
Here are key safety rules to ensure surplus food is safe for consumption:
- **Temperature Danger Zone**: Cooked food between 5\xB0C and 60\xB0C must not sit for more than **2 hours** before chilling or consumption.
- **Hot Holding**: Keep hot cooked meals consistently above **60\xB0C**.
- **Cold Storage**: Perishable items must be refrigerated at **0\xB0C \u2013 4\xB0C**.
- **Safe Packaging**: Use food-grade, airtight containers or clean foil trays. Label preparation time clearly.
- **Sensory Verification**: Check for unusual smell, discoloration, or altered texture prior to acceptance.

*Safety Notice: Mithra AI provides standardized logistics best practices. Always perform visual and temperature checks before distribution.*`;
    actions.push(
      { type: "create_donation", label: "Donate Safe Food" },
      { type: "open_map", label: "View Map" }
    );
  } else if (q.includes("donate") || q.includes("give") || q.includes("post") || q.includes("excess") || q.includes("list")) {
    text = `### How to Donate Surplus Food
Donating surplus food on ResQBite is fast and verified:
1. Click **"Donate Surplus Food"** or navigate to the Donate tab.
2. Enter the food name, category (e.g. Cooked Meals, Bakery, Produce), and estimated portions.
3. Specify the preparation time, storage type (chilled, hot, dry), and safe pickup deadline.
4. Set your pickup address or tap **"Use My Current Location"** for pinpoint GPS accuracy.
5. Submit to notify nearby verified NGOs and volunteer drivers in real time!`;
    actions.push(
      { type: "create_donation", label: "Start Donation Form" },
      { type: "open_map", label: "Check Nearby Drop-offs" }
    );
  } else if (q.includes("map") || q.includes("gps") || q.includes("direction") || q.includes("route") || q.includes("near")) {
    text = `### Google Maps & Real GPS Tracking
ResQBite integrates directly with Google Maps Platform and high-accuracy device GPS:
- **Your Location**: Click **"Use My Current Location"** to center the map on your exact device coordinates.
- **Pickup Markers**: Green pins show available surplus food, orange pins show claimed pickups underway, and blue pins show verified partner shelters.
- **Directions**: Click any pin or donation card to calculate the route and distance.
- Currently, there are **${activeCount} active surplus food batches** waiting for rescue!`;
    actions.push(
      { type: "open_map", label: "Open Google Map" },
      { type: "browse", label: "View Listings List" }
    );
  } else if (q.includes("claim") || q.includes("ngo") || q.includes("shelter") || q.includes("volunteer") || q.includes("deliver")) {
    text = `### NGO Claiming & Volunteer Deliveries
- **Verified NGOs & Shelters**: You can browse the real-time food feed, check allergens and portion counts, and click **"Claim Donation"** to reserve the batch.
- **Volunteers**: Once claimed, volunteers can accept transport tasks, navigate to the donor location via GPS, verify the package, and confirm safe handover at the shelter.
- You are currently signed in as **${role}**.`;
    actions.push(
      { type: "browse", label: "Browse Food Feed" },
      { type: "dashboard", label: "Go to My Dashboard" }
    );
  } else if (q.includes("impact") || q.includes("metric") || q.includes("stat") || q.includes("environment") || q.includes("carbon")) {
    text = `### Live ResQBite Community Impact
- **Meals Rescued**: Over **${mealsRescued} meals** diverted to those in need.
- **Active Surpluses Available Right Now**: **${activeCount} batches**.
- Every meal rescued prevents organic landfill emissions and supports sustainable food distribution!`;
    actions.push(
      { type: "impact", label: "View Full Impact Report" },
      { type: "browse", label: "Browse Active Batches" }
    );
  } else {
    text = `Hello! I am **Mithra AI**, your intelligent companion for food rescue.

Here is what you can do on ResQBite:
- **Donors**: List surplus meals with shelf-life and exact GPS pickup coordinates.
- **NGOs & Shelters**: Claim verified food matching your daily meal requirements.
- **Volunteers**: Pick up and deliver food using Google Maps routing.
- **Food Safety**: Ask me about temperature safety windows, food-grade packing, and shelf-life guidelines.

Currently, our platform has **${activeCount} active surplus batches** and **${mealsRescued} meals rescued**. How would you like to contribute today?`;
    actions.push(
      { type: "create_donation", label: "Donate Food" },
      { type: "open_map", label: "Explore Live Map" },
      { type: "browse", label: "Browse Surplus" }
    );
  }
  const activeKey = process.env.GEMINI_API_KEY || process.env.API_KEY || process.env.GOOGLE_API_KEY;
  const apiKeySet = Boolean(activeKey && activeKey !== "MY_GEMINI_API_KEY");
  const footerNote = !apiKeySet ? "\n\n*(Note: Mithra AI is running in deterministic mode. To enable real-time Gemini model reasoning, your GEMINI_API_KEY is configured in the AI Studio Secrets panel.)*" : "";
  return {
    available: true,
    text: text + footerNote,
    actions,
    isFallback: !apiKeySet
  };
}
async function handleMithraChat(params) {
  const rawMsg = (params.message || "").trim();
  const userLang = params.language || "en";
  if (!rawMsg) {
    const greetingText = userLang === "kn" ? "\u0CA8\u0CAE\u0CB8\u0CCD\u0C95\u0CBE\u0CB0! \u0CA8\u0CBE\u0CA8\u0CC1 **\u0CAE\u0CBF\u0CA4\u0CCD\u0CB0 \u0C8E\u0C90**, \u0C86\u0CB9\u0CBE\u0CB0 \u0CB0\u0C95\u0CCD\u0CB7\u0CA3\u0CC6\u0CAF\u0CB2\u0CCD\u0CB2\u0CBF \u0CA8\u0CBF\u0CAE\u0CCD\u0CAE \u0CAC\u0CC1\u0CA6\u0CCD\u0CA7\u0CBF\u0CB5\u0C82\u0CA4 \u0C92\u0CA1\u0CA8\u0CBE\u0CA1\u0CBF. \u0C87\u0C82\u0CA6\u0CC1 \u0CA8\u0CBE\u0CA8\u0CC1 \u0CA8\u0CBF\u0CAE\u0C97\u0CC6 \u0CB9\u0CC7\u0C97\u0CC6 \u0CB8\u0CB9\u0CBE\u0CAF \u0CAE\u0CBE\u0CA1\u0CAC\u0CB9\u0CC1\u0CA6\u0CC1?" : userLang === "hi" ? "\u0928\u092E\u0938\u094D\u0924\u0947! \u092E\u0948\u0902 **\u092E\u093F\u0924\u094D\u0930\u093E \u090F\u0906\u0908** \u0939\u0942\u0901, \u0905\u0928\u094D\u0928 \u0930\u0915\u094D\u0937\u093E \u092E\u0947\u0902 \u0906\u092A\u0915\u093E \u092C\u0941\u0926\u094D\u0927\u093F\u092E\u093E\u0928 \u0938\u093E\u0925\u0940\u0964 \u0906\u091C \u092E\u0948\u0902 \u0906\u092A\u0915\u0940 \u0915\u094D\u092F\u093E \u092E\u0926\u0926 \u0915\u0930 \u0938\u0915\u0924\u093E \u0939\u0942\u0901?" : userLang === "ta" ? "\u0BB5\u0BA3\u0B95\u0BCD\u0B95\u0BAE\u0BCD! \u0BA8\u0BBE\u0BA9\u0BCD **\u0BAE\u0BBF\u0BA4\u0BCD\u0BB0\u0BBE \u0B8F\u0B90**, \u0B89\u0BA3\u0BB5\u0BC1 \u0BAE\u0BC0\u0B9F\u0BCD\u0BAA\u0BBF\u0BB2\u0BCD \u0B89\u0B99\u0BCD\u0B95\u0BB3\u0BCD \u0BAA\u0BC1\u0BA4\u0BCD\u0BA4\u0BBF\u0B9A\u0BBE\u0BB2\u0BBF \u0BA4\u0BCB\u0BB4\u0BA9\u0BCD. \u0B87\u0BA9\u0BCD\u0BB1\u0BC1 \u0B89\u0B99\u0BCD\u0B95\u0BB3\u0BC1\u0B95\u0BCD\u0B95\u0BC1 \u0B8E\u0BB5\u0BCD\u0BB5\u0BBE\u0BB1\u0BC1 \u0B89\u0BA4\u0BB5 \u0BAE\u0BC1\u0B9F\u0BBF\u0BAF\u0BC1\u0BAE\u0BCD?" : "Hello! I am **Mithra AI**, your food rescue companion. How can I assist you today? You can ask about donating food, safety rules, real-time GPS maps, or claiming surplus.";
    return {
      available: true,
      text: greetingText,
      actions: [
        { type: "create_donation", label: "Donate Surplus Food" },
        { type: "open_map", label: "Explore Live Map" },
        { type: "browse", label: "Browse Food Listings" }
      ],
      isFallback: false
    };
  }
  const sanitizedMessage = rawMsg.slice(0, 1e3);
  const ai = getGenAI();
  if (!ai) {
    return handleMithraFallback(sanitizedMessage, params.userContext, params.platformSummary, userLang);
  }
  try {
    const userRole = params.userContext?.role || "Guest";
    const org = params.userContext?.organizationName ? ` (${params.userContext.organizationName})` : "";
    const city = params.userContext?.locationCity || "Nearby";
    const activeCount = params.platformSummary?.activeDonationsCount ?? 0;
    const rescuedMeals = params.platformSummary?.totalMealsRescued ?? 0;
    const pendingDeliveries = params.platformSummary?.pendingDeliveriesCount ?? 0;
    const foodTypes = (params.platformSummary?.recentFoodTypes || []).slice(0, 5).join(", ") || "Cooked meals, groceries, bakery items";
    const langMap = {
      en: "English",
      kn: "Kannada (\u0C95\u0CA8\u0CCD\u0CA8\u0CA1)",
      hi: "Hindi (\u0939\u093F\u0928\u094D\u0926\u0940)",
      ta: "Tamil (\u0BA4\u0BAE\u0BBF\u0BB4\u0BCD)"
    };
    const targetLanguageName = langMap[userLang] || "English";
    const systemInstruction = `You are "Mithra AI" \u2014 an intelligent, empathetic, concise, and safety-conscious assistant built directly into the Food Rescue Network (branded as ResQBite).
Your Tagline: "Your intelligent companion for food rescue."

CRITICAL MULTILINGUAL INSTRUCTION:
The user has chosen to communicate in: "${targetLanguageName}".
You MUST compose your full response in ${targetLanguageName}. If Kannada, write fluent Kannada script (\u0C95\u0CA8\u0CCD\u0CA8\u0CA1). If Hindi, write natural Hindi (\u0939\u093F\u0928\u094D\u0926\u0940). If Tamil, write Tamil (\u0BA4\u0BAE\u0BBF\u0BB4\u0BCD). If English, write English.
When including [ACTION:...], retain the action identifier in English (e.g. [ACTION:create_donation:...]), but you may translate the label inside the token to ${targetLanguageName}.

CRITICAL SAFETY & TRUTHFULNESS RULES:
1. NEVER claim to be human or a certified food-safety inspector, physician, or government health officer.
2. For any food shelf-life or consumption safety questions, provide recognized standard food safety guidelines (e.g. 2-hour room-temperature danger zone between 5\xB0C and 60\xB0C, clean food-grade packing, sensory checks for sour smell or slime) AND always include a quick disclaimer: "Always perform sensory inspection and verify storage temperature before distribution."
3. GROUND ANSWERS IN PLATFORM CAPABILITIES:
   - Current user role: ${userRole}${org} in ${city}.
   - Live platform status: ${activeCount} active surplus donations ready for pickup, ${rescuedMeals} meals rescued to date, ${pendingDeliveries} volunteer pickups underway.
   - Recent food types available: ${foodTypes}.
   - Google Maps & GPS: The app has interactive Google Maps with real device GPS geolocation (via browser Geolocation API with high accuracy). Users can click "Use My Current Location" or "Explore Map".
   - Roles:
     * Donors (Hotels, restaurants, caterers, households): Can list surplus with quantity, expiry window, food temperature, packaging type, and photo.
     * NGOs / Shelters: Can browse verified listings, claim food, and coordinate delivery.
     * Volunteers: Can claim pickup runs, track route on Google Maps, and log delivery confirmations.
     * Admins: Can verify partner organizations and audit rescue logs.

4. SHORTCUT ACTION TOKENS:
When recommending an action or next step to the user, include relevant action tokens anywhere in your response. The client UI will parse them into interactive one-click buttons.
Format:
- [ACTION:create_donation:Donate Surplus Food]
- [ACTION:open_map:Explore Live Rescue Map]
- [ACTION:browse:Browse Surplus Listings]
- [ACTION:dashboard:Go to Dashboard]
- [ACTION:impact:View Verified Impact]
- [ACTION:organizations:Partner Organizations]
- [ACTION:profile:Manage Profile]
- [ACTION:seed_demo:Load Sample Data]

5. STYLE:
- Keep answers concise, actionable, and friendly (2-3 short paragraphs or bulleted steps).
- Use Markdown formatting (bold keywords, bullets) for scannability.
- Never output fabricated real-time data that contradicts the platform numbers above.`;
    const contents = [];
    if (params.history && Array.isArray(params.history)) {
      const recentHistory = params.history.slice(-8);
      for (const h of recentHistory) {
        if (h && h.parts && h.parts[0]?.text) {
          contents.push({
            role: h.role === "model" ? "model" : "user",
            parts: [{ text: h.parts[0].text }]
          });
        }
      }
    }
    contents.push({
      role: "user",
      parts: [{ text: sanitizedMessage }]
    });
    const generatePromise = ai.models.generateContent({
      model: "gemini-3.1-flash-lite",
      contents,
      config: {
        systemInstruction,
        temperature: 0.7,
        maxOutputTokens: 600
      }
    });
    let timerId;
    const timeoutPromise = new Promise((_, reject) => {
      timerId = setTimeout(() => reject(new Error("Gemini API call timed out after 15s")), 15e3);
    });
    try {
      const response = await Promise.race([generatePromise, timeoutPromise]);
      if (timerId) clearTimeout(timerId);
      const rawReply = response.text || "I am ready to help you with your food rescue mission!";
      const { cleanText, actions } = parseChatActions(rawReply);
      let finalActions = actions;
      if (finalActions.length === 0) {
        finalActions = getSmartDefaultActions(sanitizedMessage, userRole);
      }
      return {
        available: true,
        text: cleanText,
        actions: finalActions,
        isFallback: false
      };
    } finally {
      if (timerId) clearTimeout(timerId);
    }
  } catch (error) {
    console.warn("Mithra AI Gemini fallback engaged:", error?.message || error);
    const fallback = handleMithraFallback(sanitizedMessage, params.userContext, params.platformSummary, userLang);
    return {
      ...fallback,
      isFallback: true,
      errorDetail: error?.message || "Gemini service temporarily unavailable"
    };
  }
}
export {
  handleCategorySuggestion,
  handleMatchInsights,
  handleMithraChat,
  handleMithraFallback,
  handleMultilingualGuide,
  parseChatActions
};
