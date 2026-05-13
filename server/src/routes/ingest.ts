import { Router } from 'express';
import { ingestAggregateMetrics, type AggregateMetricInput } from '../db/repositories.js';
import { requirePermission } from '../middleware/auth.js';
import { appendAuditLog } from '../utils/audit.js';
import { asObject, optionalNumber, optionalString, requiredString, ValidationError } from '../utils/validation.js';
import { asyncRoute } from './asyncRoute.js';

const router = Router();

function validateMetricRows(body: unknown): AggregateMetricInput[] {
  const data = asObject(body);
  const rows = Array.isArray(data.rows) ? data.rows : [];
  if (rows.length === 0) throw new ValidationError('rows must contain at least one aggregate metric row');
  if (rows.length > 500) throw new ValidationError('rows must contain <= 500 aggregate metric rows');

  return rows.map((item, index) => {
    const row = asObject(item, `rows[${index}]`);
    return {
      projectId: optionalString(row.projectId, `rows[${index}].projectId`, 80),
      contentId: optionalString(row.contentId, `rows[${index}].contentId`, 80),
      diseaseId: optionalString(row.diseaseId, `rows[${index}].diseaseId`, 80),
      metricDate: requiredString(row.metricDate, `rows[${index}].metricDate`, 20),
      pushCount: optionalNumber(row.pushCount, `rows[${index}].pushCount`),
      deliveredCount: optionalNumber(row.deliveredCount, `rows[${index}].deliveredCount`),
      readUsers: optionalNumber(row.readUsers, `rows[${index}].readUsers`),
      readCount: optionalNumber(row.readCount, `rows[${index}].readCount`),
      likeCount: optionalNumber(row.likeCount, `rows[${index}].likeCount`),
      dislikeCount: optionalNumber(row.dislikeCount, `rows[${index}].dislikeCount`),
      bookmarkCount: optionalNumber(row.bookmarkCount, `rows[${index}].bookmarkCount`),
      shareCount: optionalNumber(row.shareCount, `rows[${index}].shareCount`),
      avgReadSec: optionalNumber(row.avgReadSec, `rows[${index}].avgReadSec`),
      finishRate: optionalNumber(row.finishRate, `rows[${index}].finishRate`, 0, 1),
    };
  });
}

router.post('/aggregate-metrics', requirePermission('ingest:write'), asyncRoute(async (req, res) => {
  const rows = validateMetricRows(req.body);
  const result = await ingestAggregateMetrics(rows, req.user!);
  await appendAuditLog(req, {
    action: 'aggregate_metrics.ingest',
    resourceType: 'behavior_daily_metrics',
    description: `Ingested ${result.inserted} aggregate metric rows`,
    metadata: { rowCount: result.inserted },
  });
  res.status(201).json({ success: true, data: result, timestamp: new Date().toISOString() });
}));

export default router;
