import express from 'express';
import path from 'path';
import { fileURLToPath } from 'url';
import dotenv from 'dotenv';
import { app } from './server/app.js';

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
function getPort(): number {
  const args = process.argv.slice(2);
  for (let i = 0; i < args.length; i++) {
    if ((args[i] === '--port' || args[i] === '-p') && args[i + 1]) {
      const p = Number(args[i + 1]);
      if (!isNaN(p) && p > 0) return p;
    }
    if (args[i].startsWith('--port=')) {
      const p = Number(args[i].split('=')[1]);
      if (!isNaN(p) && p > 0) return p;
    }
  }
  // In development mode, the dev server must always run on port 3000
  if (process.env.NODE_ENV !== 'production') {
    return 3000;
  }
  return Number(process.env.PORT) || 3000;
}

function getHost(): string {
  const args = process.argv.slice(2);
  for (let i = 0; i < args.length; i++) {
    if ((args[i] === '--host' || args[i] === '-h') && args[i + 1]) {
      return args[i + 1];
    }
    if (args[i].startsWith('--host=')) {
      return args[i].split('=')[1];
    }
  }
  return '0.0.0.0';
}

const PORT = getPort();
const HOST = getHost();

async function startServer() {
  if (process.env.NODE_ENV !== 'production' && !process.env.VERCEL) {
    const { createServer: createViteServer } = await import('vite');
    const vite = await createViteServer({
      server: { middlewareMode: true, hmr: false },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    // Serve frontend static files
    const distPath = path.join(__dirname, 'dist');
    app.use(express.static(distPath));

    app.get('*', (req, res, next) => {
      // Never intercept API routes
      if (req.path.startsWith('/api/')) {
        return next();
      }
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  // Start listener for local execution / container deployment
  if (!process.env.VERCEL) {
    const server = app.listen(PORT, HOST, () => {
      console.log(`Food Rescue Network server running on http://${HOST}:${PORT}`);
    });

    server.on('error', (err: any) => {
      console.error(`Failed to listen on ${HOST}:${PORT}:`, err.message);
      if (err.code === 'EADDRINUSE') {
        process.exit(1);
      }
    });
  }
}

startServer();

export default app;
