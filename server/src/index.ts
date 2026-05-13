import express from 'express';
import { corsMiddleware } from './middleware/cors.js';
import { requestLogger } from './middleware/requestLogger.js';
import { errorHandler } from './middleware/errorHandler.js';
import apiRoutes from './routes/index.js';
import { logger } from './utils/logger.js';
import { seedDatabase } from './db/seed.js';
import { DB_DRIVER } from './db/connection.js';

const app = express();
const PORT = parseInt(process.env.PORT || '3001', 10);

// Middleware
app.use(corsMiddleware);
app.use(express.json());
app.use(requestLogger);

// API routes
app.use('/api', apiRoutes);

// Error handler (must be last)
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
});

export { app };
