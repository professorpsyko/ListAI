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

app.use(cors({ origin: process.env.FRONTEND_URL || 'http://localhost:5173', credentials: true }));
app.use(express.json({ limit: '10mb' }));
app.use(clerkAuth);

// Routes
app.use('/api/listings', listingsRouter);
app.use('/api/users', usersRouter);

// Health check
app.get('/health', (_req, res) => res.json({ status: 'ok' }));

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
