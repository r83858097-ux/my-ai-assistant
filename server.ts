import express from 'express';
import path from 'path';
import { fileURLToPath } from 'url';
import dotenv from 'dotenv';
import { GoogleGenAI } from '@google/genai';

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const PORT = Number(process.env.PORT) || 3000;

app.use(express.json());

// Dynamic GoogleGenAI client accessor using current GEMINI_API_KEY
function getGeminiClient() {
  const apiKey = process.env.GEMINI_API_KEY || '';
  return new GoogleGenAI({
    apiKey,
    httpOptions: {
      headers: {
        'User-Agent': 'aistudio-build',
      },
    },
  });
}

// Supported models: gemini-3.1-flash-lite has high-throughput free-tier limits and fast responses
const PRIMARY_MODEL = 'gemini-3.1-flash-lite';
const FALLBACK_MODEL = 'gemini-3.8-flash';

// Timeout helper: guarantees a promise resolves or rejects within ms milliseconds
function withTimeout<T>(promise: Promise<T>, ms: number, message = 'Operation timed out'): Promise<T> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      reject(new Error(message));
    }, ms);
    promise
      .then((val) => {
        clearTimeout(timer);
        resolve(val);
      })
      .catch((err) => {
        clearTimeout(timer);
        reject(err);
      });
  });
}

// Normalize conversational turns for Gemini API
function normalizeConversationTurns(rawMessages: Array<{ role: string; text: string }>) {
  const cleaned: Array<{ role: 'user' | 'model'; text: string }> = [];

  for (const m of rawMessages) {
    const text = (m.text || '').trim();
    if (!text) continue;

    const role = m.role === 'assistant' || m.role === 'model' ? 'model' : 'user';

    // If the list is empty and the first message is 'model', skip it (Gemini requires first turn to be 'user')
    if (cleaned.length === 0 && role === 'model') {
      continue;
    }

    // If the previous turn had the same role, merge them with a newline
    if (cleaned.length > 0 && cleaned[cleaned.length - 1].role === role) {
      cleaned[cleaned.length - 1].text += '\n\n' + text;
    } else {
      cleaned.push({ role, text });
    }
  }

  // Ensure last turn is user
  if (cleaned.length > 0 && cleaned[cleaned.length - 1].role !== 'user') {
    return [];
  }

  return cleaned.map((c) => ({
    role: c.role,
    parts: [{ text: c.text }],
  }));
}

// Check API and backend status
app.get('/api/status', async (_req, res) => {
  const hasKey = Boolean(
    process.env.GEMINI_API_KEY &&
    process.env.GEMINI_API_KEY.trim().length > 0 &&
    process.env.GEMINI_API_KEY !== 'MY_GEMINI_API_KEY'
  );

  res.json({
    status: 'ok',
    appName: 'My AI Assistant',
    hasKey,
    primaryModel: PRIMARY_MODEL,
    fallbackModel: FALLBACK_MODEL,
    timestamp: new Date().toISOString(),
  });
});

// Simple connectivity check
app.post('/api/test-connection', async (_req, res) => {
  if (!process.env.GEMINI_API_KEY || process.env.GEMINI_API_KEY === 'MY_GEMINI_API_KEY') {
    return res.status(503).json({
      success: false,
      error: 'GEMINI_API_KEY is not configured in AI Studio Settings > Secrets.',
    });
  }

  const ai = getGeminiClient();
  const start = performance.now();

  const modelsToTry = [PRIMARY_MODEL, FALLBACK_MODEL];
  let lastError: any = null;

  for (const model of modelsToTry) {
    try {
      const response = await withTimeout(
        ai.models.generateContent({
          model,
          contents: 'Respond with exactly: "Google Gemini connection is active."',
        }),
        12000,
        `Model ${model} timed out after 12s`
      );

      const elapsedMs = Math.round(performance.now() - start);
      return res.json({
        success: true,
        message: response.text || 'Connected',
        latencyMs: elapsedMs,
        model,
      });
    } catch (err: any) {
      lastError = err;
      continue;
    }
  }

  const elapsedMs = Math.round(performance.now() - start);
  return res.status(500).json({
    success: false,
    error: lastError?.message || 'Failed to connect to Gemini API',
    latencyMs: elapsedMs,
  });
});

// Direct download route for verified project backup ZIP
app.get('/download/my-ai-assistant.zip', (_req, res) => {
  const zipPath = path.join(__dirname, 'public', 'my-ai-assistant.zip');
  res.download(zipPath, 'my-ai-assistant.zip');
});

// Multi-turn conversational chat endpoint
app.post('/api/chat', async (req, res) => {
  res.setHeader('Content-Type', 'application/json');

  const { messages, systemInstruction } = req.body;

  if (!Array.isArray(messages) || messages.length === 0) {
    return res.status(400).json({ error: 'Messages list is required and cannot be empty.' });
  }

  if (!process.env.GEMINI_API_KEY || process.env.GEMINI_API_KEY === 'MY_GEMINI_API_KEY') {
    return res.status(503).json({
      error: 'GEMINI_API_KEY is not set. Please add your GEMINI_API_KEY in Google AI Studio (Settings > Secrets).',
    });
  }

  const formattedContents = normalizeConversationTurns(messages);
  if (formattedContents.length === 0) {
    return res.status(400).json({ error: 'Valid conversation turns could not be parsed.' });
  }

  const defaultInstruction =
    'You are "My AI Assistant", a thoughtful, friendly, and helpful AI assistant designed for mobile chat. Give clear, well-structured, easy-to-read answers with appropriate formatting, bullet points, or code blocks when helpful.';

  const ai = getGeminiClient();
  const start = performance.now();

  // Try PRIMARY_MODEL (gemini-3.1-flash-lite) first with 15s timeout, then FALLBACK_MODEL (gemini-3.8-flash)
  const candidateModels = [
    { name: PRIMARY_MODEL, timeoutMs: 15000 },
    { name: FALLBACK_MODEL, timeoutMs: 15000 },
  ];

  let lastError: any = null;

  for (const candidate of candidateModels) {
    try {
      const response = await withTimeout(
        ai.models.generateContent({
          model: candidate.name,
          contents: formattedContents,
          config: {
            systemInstruction: systemInstruction || defaultInstruction,
          },
        }),
        candidate.timeoutMs,
        `Model ${candidate.name} timed out after ${candidate.timeoutMs / 1000}s`
      );

      const elapsedMs = Math.round(performance.now() - start);
      return res.json({
        reply: response.text || 'No response content generated.',
        model: candidate.name,
        latencyMs: elapsedMs,
      });
    } catch (err: any) {
      lastError = err;
      console.warn(`Model ${candidate.name} attempt failed:`, err?.message || err);
      continue;
    }
  }

  // If both models failed
  const elapsedMs = Math.round(performance.now() - start);
  console.error('All Gemini models failed. Total time:', elapsedMs, 'ms. Last error:', lastError?.message);

  let friendlyErrorMessage = 'Failed to generate response from Gemini API.';

  if (lastError?.message) {
    const msg = lastError.message;
    if (msg.includes('timed out')) {
      friendlyErrorMessage = 'Gemini API servers took too long to respond. Please tap "Retry question".';
    } else if (msg.includes('API_KEY_INVALID') || msg.includes('invalid API key')) {
      friendlyErrorMessage = 'Invalid GEMINI_API_KEY. Please verify your key in Settings > Secrets.';
    } else if (msg.includes('RESOURCE_EXHAUSTED') || msg.includes('429')) {
      friendlyErrorMessage = 'Daily Gemini Free Tier limit reached for this project. Please try again tomorrow or link a billing account.';
    } else if (msg.includes('503') || msg.includes('UNAVAILABLE') || msg.includes('high demand') || msg.includes('overloaded')) {
      friendlyErrorMessage = 'Google Gemini servers are currently experiencing peak demand. Please tap "Retry question" in a moment.';
    } else {
      friendlyErrorMessage = msg;
    }
  }

  return res.status(500).json({
    error: friendlyErrorMessage,
  });
});

// Setup dev server middlewares or static production serving
async function bootstrap() {
  if (process.env.NODE_ENV === 'production') {
    app.use(express.static(path.join(__dirname, 'dist')));
    app.get('*', (_req, res) => {
      res.sendFile(path.join(__dirname, 'dist', 'index.html'));
    });
  } else {
    const { createServer } = await import('vite');
    const vite = await createServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  }

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`Server running at http://0.0.0.0:${PORT}`);
  });
}

bootstrap();
