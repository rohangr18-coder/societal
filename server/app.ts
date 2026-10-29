import express, { Request, Response, Router } from 'express';
import {
  handleCategorySuggestion,
  handleMatchInsights,
  handleMultilingualGuide,
  handleMithraChat,
} from './geminiApi.js';

export const app = express();

// Request payload limit & JSON parser
app.use(express.json({ limit: '1mb' }));

// Helper to send JSON response safely
const sendJson = (res: Response, status: number, data: any) => {
  res.setHeader('Content-Type', 'application/json');
  res.status(status).json(data);
};

// Create a dedicated API router
export const apiRouter = Router();

// GET /api/health
apiRouter.get('/health', (req: Request, res: Response) => {
  const hasGeminiKey = Boolean(
    process.env.GEMINI_API_KEY && process.env.GEMINI_API_KEY !== 'MY_GEMINI_API_KEY'
  );

  sendJson(res, 200, {
    status: 'ok',
    service: 'Food Rescue Network Backend',
    timestamp: new Date().toISOString(),
    geminiConfigured: hasGeminiKey,
  });
});

// POST /api/gemini/suggest-category
apiRouter.post('/gemini/suggest-category', async (req: Request, res: Response) => {
  try {
    const { foodName, description } = req.body || {};
    if (foodName && typeof foodName !== 'string') {
      return sendJson(res, 400, { error: 'foodName must be a string' });
    }
    if (description && typeof description !== 'string') {
      return sendJson(res, 400, { error: 'description must be a string' });
    }

    const safeFoodName = String(foodName || '').slice(0, 200);
    const safeDesc = String(description || '').slice(0, 1000);

    const result = await handleCategorySuggestion(safeFoodName, safeDesc);
    sendJson(res, 200, result);
  } catch (error: any) {
    sendJson(res, 500, { error: error.message || 'Internal Server Error' });
  }
});

// POST /api/gemini/match-insights
apiRouter.post('/gemini/match-insights', async (req: Request, res: Response) => {
  try {
    const body = req.body || {};
    const safeParams = {
      foodName: String(body.foodName || 'Surplus Food').slice(0, 200),
      category: String(body.category || 'Cooked Meals').slice(0, 100),
      quantity: String(body.quantity || '0').slice(0, 50),
      ngoName: String(body.ngoName || 'Community Shelter').slice(0, 150),
      ngoCapacity: Number(body.ngoCapacity) || 100,
      distanceKm: typeof body.distanceKm === 'number' ? body.distanceKm : undefined,
      pickupDeadline: String(body.pickupDeadline || 'ASAP').slice(0, 100),
    };

    const result = await handleMatchInsights(safeParams);
    sendJson(res, 200, result);
  } catch (error: any) {
    sendJson(res, 500, { error: error.message || 'Internal Server Error' });
  }
});

// POST /api/gemini/multilingual-guide
apiRouter.post('/gemini/multilingual-guide', async (req: Request, res: Response) => {
  try {
    const { language } = req.body || {};
    const safeLang = typeof language === 'string' ? language.slice(0, 50) : 'Hindi';
    const result = await handleMultilingualGuide(safeLang);
    sendJson(res, 200, result);
  } catch (error: any) {
    sendJson(res, 500, { error: error.message || 'Internal Server Error' });
  }
});

// POST /api/gemini/mithra-chat
apiRouter.post('/gemini/mithra-chat', async (req: Request, res: Response) => {
  try {
    const { message, history, userContext, platformSummary, language } = req.body || {};

    if (!message || typeof message !== 'string') {
      return sendJson(res, 400, { error: 'message is required and must be a string' });
    }

    const safeMessage = message.trim().slice(0, 2000);
    const safeHistory = Array.isArray(history) ? history.slice(-10) : [];
    const safeLang = typeof language === 'string' ? language.slice(0, 20) : 'en';

    const result = await handleMithraChat({
      message: safeMessage,
      history: safeHistory,
      userContext: userContext && typeof userContext === 'object' ? userContext : undefined,
      platformSummary: platformSummary && typeof platformSummary === 'object' ? platformSummary : undefined,
      language: safeLang,
    });

    sendJson(res, 200, result);
  } catch (error: any) {
    sendJson(res, 500, { error: error.message || 'Internal Server Error' });
  }
});

// Mount router on both /api (standard path) and root (in case serverless router strips /api prefix)
app.use('/api', apiRouter);
app.use(apiRouter);

export default app;
