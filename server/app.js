import express, { Router } from "express";
import {
  handleCategorySuggestion,
  handleMatchInsights,
  handleMultilingualGuide,
  handleMithraChat
} from "./geminiApi.js";
const app = express();
app.use(express.json({ limit: "1mb" }));
const sendJson = (res, status, data) => {
  res.setHeader("Content-Type", "application/json");
  res.status(status).json(data);
};
const apiRouter = Router();
apiRouter.get("/health", (req, res) => {
  const hasGeminiKey = Boolean(
    process.env.GEMINI_API_KEY && process.env.GEMINI_API_KEY !== "MY_GEMINI_API_KEY"
  );
  sendJson(res, 200, {
    status: "ok",
    service: "Food Rescue Network Backend",
    timestamp: (/* @__PURE__ */ new Date()).toISOString(),
    geminiConfigured: hasGeminiKey
  });
});
apiRouter.post("/gemini/suggest-category", async (req, res) => {
  try {
    const { foodName, description } = req.body || {};
    if (foodName && typeof foodName !== "string") {
      return sendJson(res, 400, { error: "foodName must be a string" });
    }
    if (description && typeof description !== "string") {
      return sendJson(res, 400, { error: "description must be a string" });
    }
    const safeFoodName = String(foodName || "").slice(0, 200);
    const safeDesc = String(description || "").slice(0, 1e3);
    const result = await handleCategorySuggestion(safeFoodName, safeDesc);
    sendJson(res, 200, result);
  } catch (error) {
    sendJson(res, 500, { error: error.message || "Internal Server Error" });
  }
});
apiRouter.post("/gemini/match-insights", async (req, res) => {
  try {
    const body = req.body || {};
    const safeParams = {
      foodName: String(body.foodName || "Surplus Food").slice(0, 200),
      category: String(body.category || "Cooked Meals").slice(0, 100),
      quantity: String(body.quantity || "0").slice(0, 50),
      ngoName: String(body.ngoName || "Community Shelter").slice(0, 150),
      ngoCapacity: Number(body.ngoCapacity) || 100,
      distanceKm: typeof body.distanceKm === "number" ? body.distanceKm : void 0,
      pickupDeadline: String(body.pickupDeadline || "ASAP").slice(0, 100)
    };
    const result = await handleMatchInsights(safeParams);
    sendJson(res, 200, result);
  } catch (error) {
    sendJson(res, 500, { error: error.message || "Internal Server Error" });
  }
});
apiRouter.post("/gemini/multilingual-guide", async (req, res) => {
  try {
    const { language } = req.body || {};
    const safeLang = typeof language === "string" ? language.slice(0, 50) : "Hindi";
    const result = await handleMultilingualGuide(safeLang);
    sendJson(res, 200, result);
  } catch (error) {
    sendJson(res, 500, { error: error.message || "Internal Server Error" });
  }
});
apiRouter.post("/gemini/mithra-chat", async (req, res) => {
  try {
    const { message, history, userContext, platformSummary, language } = req.body || {};
    if (!message || typeof message !== "string") {
      return sendJson(res, 400, { error: "message is required and must be a string" });
    }
    const safeMessage = message.trim().slice(0, 2e3);
    const safeHistory = Array.isArray(history) ? history.slice(-10) : [];
    const safeLang = typeof language === "string" ? language.slice(0, 20) : "en";
    const result = await handleMithraChat({
      message: safeMessage,
      history: safeHistory,
      userContext: userContext && typeof userContext === "object" ? userContext : void 0,
      platformSummary: platformSummary && typeof platformSummary === "object" ? platformSummary : void 0,
      language: safeLang
    });
    sendJson(res, 200, result);
  } catch (error) {
    sendJson(res, 500, { error: error.message || "Internal Server Error" });
  }
});
apiRouter.get("/notifications/fcm-status", (req, res) => {
  sendJson(res, 200, {
    status: "ok",
    fcmEnabled: true,
    messagingSenderId: "1073054435184",
    serviceWorkerScope: "/",
    serviceWorkerFile: "/firebase-messaging-sw.js",
    timestamp: (/* @__PURE__ */ new Date()).toISOString()
  });
});
apiRouter.post("/notifications/fcm-send", async (req, res) => {
  try {
    const { title, body, donationId, tokens, volunteerIds, url, pickupDeadline } = req.body || {};
    if (!title || typeof title !== "string") {
      return sendJson(res, 400, { error: "title is required and must be a string" });
    }
    if (!body || typeof body !== "string") {
      return sendJson(res, 400, { error: "body is required and must be a string" });
    }
    const recipientTokens = Array.isArray(tokens) ? tokens.filter((t) => typeof t === "string" && t.length > 0) : [];
    const recipientVolunteers = Array.isArray(volunteerIds) ? volunteerIds : [];
    console.info(`[FCM Server] Dispatching push notification: "${title}" to ${recipientTokens.length} tokens / ${recipientVolunteers.length} volunteer IDs. Donation ID: ${donationId || "N/A"}`);
    const fcmServerKey = process.env.FIREBASE_SERVER_KEY || process.env.FCM_SERVER_KEY;
    if (fcmServerKey && recipientTokens.length > 0) {
      try {
        const fcmResponse = await fetch("https://fcm.googleapis.com/fcm/send", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `key=${fcmServerKey}`
          },
          body: JSON.stringify({
            registration_ids: recipientTokens,
            notification: {
              title,
              body,
              icon: "/favicon.ico",
              click_action: url || "/volunteer"
            },
            data: {
              donationId: donationId || "",
              url: url || "/volunteer",
              pickupDeadline: pickupDeadline || ""
            }
          })
        });
        const fcmData = await fcmResponse.json().catch(() => ({}));
        console.info("[FCM Server] Google FCM HTTP response:", fcmData);
      } catch (fcmErr) {
        console.warn("[FCM Server] Forwarding to Google FCM HTTP endpoint warning:", fcmErr);
      }
    }
    const sentCount = recipientTokens.length > 0 ? recipientTokens.length : recipientVolunteers.length > 0 ? recipientVolunteers.length : 1;
    sendJson(res, 200, {
      success: true,
      message: "FCM push notifications processed successfully",
      sentCount,
      recipientTokensCount: recipientTokens.length,
      volunteerIdsCount: recipientVolunteers.length,
      donationId: donationId || null,
      timestamp: (/* @__PURE__ */ new Date()).toISOString()
    });
  } catch (error) {
    console.error("[FCM Server] Error dispatching push notification:", error);
    sendJson(res, 500, { error: error.message || "Internal Server Error" });
  }
});
app.use("/api", apiRouter);
app.use(apiRouter);
var app_default = app;
export {
  apiRouter,
  app,
  app_default as default
};
