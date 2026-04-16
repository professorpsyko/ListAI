// Load config first — will exit if env vars are missing
import './config';

import express from 'express';
import cors from 'cors';
import 'express-async-errors';
import { clerkAuth } from './middleware/auth';
import { errorHandler } from './middleware/error';
import listingsRouter from './routes/listings';
import usersRouter from './routes/users';
import { startImageWorker } from './workers/image-worker';
import { startPricingWorker } from './workers/pricing-worker';
import { config } from './config';
import { prisma } from './lib/prisma';

const app = express();

// Allow requests from localhost (dev) and any Vercel deployment for this project
const allowedOrigins = (process.env.FRONTEND_URL || 'http://localhost:5173')
  .split(',')
  .map((o) => o.trim());

app.use(
  cors({
    origin: (origin, callback) => {
      // Allow requests with no origin (mobile apps, curl, etc.)
      if (!origin) return callback(null, true);
      // Allow any vercel.app subdomain or explicitly listed origin
      if (
        allowedOrigins.some((o) => origin === o) ||
        origin.endsWith('.vercel.app') ||
        origin === 'http://localhost:5173'
      ) {
        return callback(null, true);
      }
      return callback(new Error(`CORS: origin ${origin} not allowed`));
    },
    credentials: true,
  }),
);
app.use(express.json({ limit: '10mb' }));
app.use(clerkAuth);

// Routes
app.use('/api/listings', listingsRouter);
app.use('/api/users', usersRouter);

// Health check
app.get('/health', (_req, res) => res.json({ status: 'ok' }));

// Claude API connectivity test — hit /api/test-claude to verify key + list available models
app.get('/api/test-claude', async (_req, res) => {
  try {
    const Anthropic = (await import('@anthropic-ai/sdk')).default;
    const client = new Anthropic({ apiKey: config.ANTHROPIC_API_KEY });
    // List available models so we can see exactly what this account can use
    const modelsPage = await (client as any).models.list();
    const models = modelsPage.data ?? modelsPage;
    const modelIds = models.map((m: any) => m.id);
    res.json({ ok: true, availableModels: modelIds, keyPrefix: config.ANTHROPIC_API_KEY.slice(0, 12) + '...' });
  } catch (err) {
    res.json({ ok: false, error: err instanceof Error ? err.message : String(err), keyPrefix: config.ANTHROPIC_API_KEY.slice(0, 12) + '...' });
  }
});

// Error handler (must be last)
app.use(errorHandler);

async function main() {
  // Test DB connection
  await prisma.$connect();
  console.log('✅ Database connected');

  // Start background workers
  startImageWorker();
  startPricingWorker();

  const port = parseInt(config.PORT, 10);
  app.listen(port, () => {
    console.log(`✅ ListAI backend running on port ${port}`);
  });
}

main().catch((err) => {
  console.error('❌ Failed to start server:', err);
  process.exit(1);
});
