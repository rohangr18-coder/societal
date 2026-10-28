import express from 'express';
import path from 'path';
import { fileURLToPath } from 'url';
import dotenv from 'dotenv';
import { handleCategorySuggestion, handleMatchInsights, handleMultilingualGuide, handleMithraChat } from './server/geminiApi.js';

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const PORT = process.env.PORT || 3000;

app.use(express.json());

// API Endpoints
app.post('/api/gemini/suggest-category', async (req, res) => {
  try {
    const { foodName, description } = req.body;
    const result = await handleCategorySuggestion(foodName || '', description || '');
    res.json(result);
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

app.post('/api/gemini/match-insights', async (req, res) => {
  try {
    const result = await handleMatchInsights(req.body);
    res.json(result);
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

app.post('/api/gemini/multilingual-guide', async (req, res) => {
  try {
    const { language } = req.body;
    const result = await handleMultilingualGuide(language || 'Hindi');
    res.json(result);
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

app.post('/api/gemini/mithra-chat', async (req, res) => {
  try {
    const result = await handleMithraChat(req.body);
    res.json(result);
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// Serve frontend static files
const distPath = path.join(__dirname, 'dist');
app.use(express.static(distPath));

app.get('*', (req, res) => {
  res.sendFile(path.join(distPath, 'index.html'));
});

app.listen(PORT, () => {
  console.log(`Food Rescue Network server running on port ${PORT}`);
});
