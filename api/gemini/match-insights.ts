import type { Request, Response } from 'express';
import { handleMatchInsights } from '../../server/geminiApi.js';

export default async function handler(req: Request, res: Response) {
  res.setHeader('Content-Type', 'application/json');

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method Not Allowed' });
  }

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
    res.status(200).json(result);
  } catch (error: any) {
    res.status(500).json({ error: error.message || 'Internal Server Error' });
  }
}
