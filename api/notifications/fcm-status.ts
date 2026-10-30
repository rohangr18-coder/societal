import type { Request, Response } from 'express';

export default function handler(req: Request, res: Response) {
  res.setHeader('Content-Type', 'application/json');

  res.status(200).json({
    status: 'ok',
    fcmEnabled: true,
    messagingSenderId: '1073054435184',
    serviceWorkerScope: '/',
    serviceWorkerFile: '/firebase-messaging-sw.js',
    timestamp: new Date().toISOString(),
  });
}
