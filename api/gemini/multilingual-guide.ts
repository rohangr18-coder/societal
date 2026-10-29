import type { Request, Response } from 'express';
import { handleMultilingualGuide } from '../../server/geminiApi';

export default async function handler(req: Request, res: Response) {
  res.setHeader('Content-Type', 'application/json');

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method Not Allowed' });
  }

  try {
    const { language } = req.body || {};
    const safeLang = typeof language === 'string' ? language.slice(0, 50) : 'Hindi';
    const result = await handleMultilingualGuide(safeLang);
    res.status(200).json(result);
  } catch (error: any) {
    res.status(500).json({ error: error.message || 'Internal Server Error' });
  }
}
