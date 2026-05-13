import { Router } from 'express';
import { assertExportAllowed, createExportJob, getExportJob, getExportMetricRows } from '../db/repositories.js';
import { requirePermission } from '../middleware/auth.js';
import { appendAuditLog } from '../utils/audit.js';
import { asObject, optionalNumber, optionalString, ValidationError } from '../utils/validation.js';
import { asyncRoute } from './asyncRoute.js';

const router = Router();

function csvEscape(value: unknown): string {
  const text = value === null || value === undefined ? '' : String(value);
  return /[",\n\r]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

function toCsv(rows: Array<Record<string, unknown>>, watermark: string): string {
  const headers = [
    'metricDate',
    'projectId',
    'contentId',
    'diseaseId',
    'pushCount',
    'deliveredCount',
    'readUsers',
    'readCount',
    'likeCount',
    'dislikeCount',
    'bookmarkCount',
    'shareCount',
    'interactionCount',
    'avgReadSec',
    'finishRate',
  ];
  const lines = [
    '# Px Lite aggregate export',
    `# Watermark: ${watermark}`,
    '# Aggregate-only data; no patient identity or patient-level events.',
    headers.join(','),
    ...rows.map((row) => headers.map((header) => csvEscape(row[header])).join(',')),
  ];
  return `${lines.join('\n')}\n`;
}

router.post('/', requirePermission('export:create'), asyncRoute(async (req, res) => {
  const data = asObject(req.body);
  const payload = {
    scope: optionalString(data.scope, 'scope', 40) || 'all',
    projectId: optionalString(data.projectId, 'projectId', 80),
    diseaseId: optionalString(data.diseaseId, 'diseaseId', 80),
    rangeDays: optionalNumber(data.rangeDays, 'rangeDays', 1, 365) || 14,
  };

  try {
    const job = await createExportJob(payload, req.user!);
    await appendAuditLog(req, {
      action: 'export.create',
      resourceType: 'behavior_export',
      resourceId: job.id,
      after: job,
      metadata: { aggregateOnly: true },
    });
    res.status(201).json({ success: true, data: job, timestamp: new Date().toISOString() });
  } catch (err) {
    throw new ValidationError(err instanceof Error ? err.message : 'Export blocked');
  }
}));

router.get('/:id', requirePermission('export:read'), asyncRoute(async (req, res) => {
  const job = await getExportJob(String(req.params.id), req.user!);
  if (!job) {
    return res.status(404).json({ success: false, data: null, message: 'Export job not found', timestamp: new Date().toISOString() });
  }
  res.json({ success: true, data: job, timestamp: new Date().toISOString() });
}));

router.get('/:id/download', requirePermission('export:read'), asyncRoute(async (req, res) => {
  const job = await getExportJob(String(req.params.id), req.user!);
  if (!job) {
    return res.status(404).json({ success: false, data: null, message: 'Export job not found', timestamp: new Date().toISOString() });
  }

  const createdAt = typeof job.createdAt === 'string' ? Date.parse(job.createdAt) : Date.now();
  const ttlMinutes = Number(process.env.EXPORT_URL_TTL_MINUTES || 60);
  if (Number.isFinite(createdAt) && Date.now() - createdAt > ttlMinutes * 60_000) {
    return res.status(410).json({ success: false, data: null, message: 'Export download link expired', timestamp: new Date().toISOString() });
  }

  try {
    await assertExportAllowed(req.user!);
  } catch (err) {
    throw new ValidationError(err instanceof Error ? err.message : 'Export blocked');
  }
  const rows = await getExportMetricRows(job, req.user!);
  const watermark = `${req.user!.tenantId} / ${req.user!.id} / ${new Date().toISOString()}`;
  await appendAuditLog(req, {
    action: 'export.download',
    resourceType: 'behavior_export',
    resourceId: String(req.params.id),
    metadata: { rowCount: rows.length, aggregateOnly: true },
  });

  res.setHeader('Content-Type', 'text/csv; charset=utf-8');
  res.setHeader('Content-Disposition', `attachment; filename="${String(req.params.id)}.csv"`);
  res.send(toCsv(rows, watermark));
}));

export default router;
