import { Router } from 'express';
import overviewRoutes from './overview.js';
import contentRoutes from './content.js';
import behaviorRoutes from './behavior.js';
import distributionRoutes from './distribution.js';
import approvalRoutes from './approval.js';
import platformRoutes from './platform.js';
import logRoutes from './logs.js';

const router = Router();

router.use('/overview', overviewRoutes);
router.use('/content', contentRoutes);
router.use('/behavior', behaviorRoutes);
router.use('/distribution', distributionRoutes);
router.use('/approval', approvalRoutes);
router.use('/platform', platformRoutes);
router.use('/logs', logRoutes);

// Health check
router.get('/health', (_req, res) => {
  res.json({
    status: 'ok',
    uptime: process.uptime(),
    timestamp: new Date().toISOString(),
  });
});

export default router;
