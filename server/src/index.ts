import './config/env.js';
import express from 'express';
import { corsMiddleware } from './middleware/cors.js';
import { requestLogger } from './middleware/requestLogger.js';
import { errorHandler } from './middleware/errorHandler.js';
import apiRoutes from './routes/index.js';
import { aiHelperAssetsProxy } from './routes/aiHelper.js';
import { logger } from './utils/logger.js';
import { seedDatabase } from './db/seed.js';
import { DB_DRIVER } from './db/connection.js';
import { validationErrorHandler } from './utils/validation.js';
import { rateLimit, securityHeaders } from './middleware/security.js';
import { scheduleCxStatsSync } from './jobs/syncCxStats.js';
import { isCxStatsConfigured } from './integrations/cxStats.js';
import { isDxContentSyncConfigured, syncDxPosterIds } from './integrations/dxContentSync.js';

const app = express();
const PORT = parseInt(process.env.PORT || '3001', 10);

// Middleware
app.use(corsMiddleware);
app.use(securityHeaders);
app.use(rateLimit);
app.use(express.json({ limit: process.env.REQUEST_BODY_LIMIT || '1mb' }));
app.use(express.text({ type: ['text/csv', 'application/csv'], limit: process.env.REQUEST_BODY_LIMIT || '1mb' }));
app.use(requestLogger);

// Root path: API is mounted at /api (visiting / alone is not the app UI).
app.get('/', (_req, res) => {
  res.json({
    name: 'Px Lite API',
    status: 'ok',
    docs: 'Use /api/* endpoints. Open the frontend at http://localhost:5173 for the UI.',
    health: '/api/health',
    ready: '/api/ready',
  });
});

// AI helper static deliverables (generated/, projects/)
app.use('/ai-helper-assets', aiHelperAssetsProxy);

// API routes
app.use('/api', apiRoutes);

// Error handlers (must be last)
app.use(validationErrorHandler);
app.use(errorHandler);

try {
  await seedDatabase();
  logger.info({ driver: DB_DRIVER }, '✅ Database initialized successfully');
} catch (err) {
  logger.error({ err, driver: DB_DRIVER }, '❌ Failed to initialize database');
  process.exit(1);
}

app.listen(PORT, () => {
  logger.info(`🚀 Px Lite API server running at http://localhost:${PORT}`);
  logger.info(`📋 Health check: http://localhost:${PORT}/api/health`);

  // DX Content Sync: map poster_ids from DX to local content (runs once at startup)
  if (isDxContentSyncConfigured()) {
    syncDxPosterIds()
      .then(({ updated, notMatched }) => {
        logger.info({ updated, notMatched }, '🔗 DX poster_id sync completed');
      })
      .catch((err) => {
        logger.warn({ err }, '🔗 DX poster_id sync failed (non-fatal, will retry next restart)');
      });
  } else {
    logger.info('🔗 DX Content Sync not configured (set DX_API_BASE_URL + DOCTOR_SERVER_TOKEN to enable)');
  }

  // Schedule CX stats daily sync (if configured)
  if (isCxStatsConfigured()) {
    scheduleCxStatsSync();
    logger.info('📊 CX Stats daily sync job scheduled');
  } else {
    logger.info('📊 CX Stats sync not configured (set CX_API_BASE_URL + CX_PHARMA_ACCESS_TOKEN to enable)');
  }
});

export { app };
