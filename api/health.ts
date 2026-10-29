import type { Request, Response } from 'express';

export default function handler(req: Request, res: Response) {
  const hasGeminiKey = Boolean(
    process.env.GEMINI_API_KEY && process.env.GEMINI_API_KEY !== 'MY_GEMINI_API_KEY'
  );

  res.setHeader('Content-Type', 'application/json');
  res.status(200).json({
    status: 'ok',
    service: 'Food Rescue Network Backend',
    timestamp: new Date().toISOString(),
    geminiConfigured: hasGeminiKey,
  });
}
