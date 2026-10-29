import type { Request, Response } from 'express';
import { handleMithraChat } from '../../server/geminiApi';

export default async function handler(req: Request, res: Response) {
  res.setHeader('Content-Type', 'application/json');

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method Not Allowed' });
  }

  try {
    const { message, history, userContext, platformSummary, language } = req.body || {};

    if (!message || typeof message !== 'string') {
      return res.status(400).json({ error: 'message is required and must be a string' });
    }

    const safeMessage = message.trim().slice(0, 2000);
    const safeHistory = Array.isArray(history) ? history.slice(-10) : [];
    const safeLang = typeof language === 'string' ? language : 'en';

    const result = await handleMithraChat({
      message: safeMessage,
      history: safeHistory,
      userContext: userContext && typeof userContext === 'object' ? userContext : undefined,
      platformSummary: platformSummary && typeof platformSummary === 'object' ? platformSummary : undefined,
      language: safeLang,
    });

    res.status(200).json(result);
  } catch (error: any) {
    res.status(500).json({ error: error.message || 'Internal Server Error' });
  }
}
