import type { Request, Response } from 'express';
import { handleCategorySuggestion } from '../../server/geminiApi';

export default async function handler(req: Request, res: Response) {
  res.setHeader('Content-Type', 'application/json');

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method Not Allowed' });
  }

  try {
    const { foodName, description } = req.body || {};
    const safeFoodName = String(foodName || '').slice(0, 200);
    const safeDesc = String(description || '').slice(0, 1000);

    const result = await handleCategorySuggestion(safeFoodName, safeDesc);
    res.status(200).json(result);
  } catch (error: any) {
    res.status(500).json({ error: error.message || 'Internal Server Error' });
  }
}
