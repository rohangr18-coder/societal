import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import { fileURLToPath, URL } from 'url';
import { defineConfig, Plugin } from 'vite';
import { handleCategorySuggestion, handleMatchInsights, handleMultilingualGuide, handleMithraChat } from './server/geminiApi.ts';

function apiServerPlugin(): Plugin {
  return {
    name: 'api-server-middleware',
    configureServer(server) {
      server.middlewares.use(async (req, res, next) => {
        if (!req.url?.startsWith('/api/')) {
          return next();
        }

        // Helper to parse JSON body
        const getBody = () => new Promise<any>((resolve) => {
          let data = '';
          req.on('data', chunk => { data += chunk; });
          req.on('end', () => {
            try {
              resolve(data ? JSON.parse(data) : {});
            } catch {
              resolve({});
            }
          });
        });

        res.setHeader('Content-Type', 'application/json');

        try {
          if (req.url === '/api/gemini/suggest-category' && req.method === 'POST') {
            const body = await getBody();
            const result = await handleCategorySuggestion(body.foodName || '', body.description || '');
            res.end(JSON.stringify(result));
            return;
          }

          if (req.url === '/api/gemini/match-insights' && req.method === 'POST') {
            const body = await getBody();
            const result = await handleMatchInsights(body);
            res.end(JSON.stringify(result));
            return;
          }

          if (req.url === '/api/gemini/multilingual-guide' && req.method === 'POST') {
            const body = await getBody();
            const result = await handleMultilingualGuide(body.language || 'Hindi');
            res.end(JSON.stringify(result));
            return;
          }

          if (req.url === '/api/gemini/mithra-chat' && req.method === 'POST') {
            const body = await getBody();
            const result = await handleMithraChat(body);
            res.end(JSON.stringify(result));
            return;
          }

          if (req.url === '/api/health') {
            res.end(JSON.stringify({ status: 'ok', time: new Date().toISOString() }));
            return;
          }

          res.statusCode = 404;
          res.end(JSON.stringify({ error: 'Endpoint not found' }));
        } catch (error: any) {
          res.statusCode = 500;
          res.end(JSON.stringify({ error: error.message || 'Internal Server Error' }));
        }
      });
    },
  };
}

export default defineConfig(() => {
  return {
    plugins: [react(), tailwindcss(), apiServerPlugin()],
    resolve: {
      alias: {
        '@': fileURLToPath(new URL('.', import.meta.url)),
      },
    },
    server: {
      // HMR is disabled in AI Studio via DISABLE_HMR env var.
      // Do not modify—file watching is disabled to prevent flickering during agent edits.
      hmr: process.env.DISABLE_HMR !== 'true',
      // Disable file watching when DISABLE_HMR is true to save CPU during agent edits.
      watch: process.env.DISABLE_HMR === 'true' ? null : {},
    },
  };
});
