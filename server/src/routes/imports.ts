import { Router } from 'express';
import { createContent, ingestAggregateMetrics, type AggregateMetricInput } from '../db/repositories.js';
import { requirePermission } from '../middleware/auth.js';
import { appendAuditLog } from '../utils/audit.js';
import { ValidationError } from '../utils/validation.js';
import { asyncRoute } from './asyncRoute.js';

const router = Router();
const contentTypes = new Set(['article', 'video', 'infographic', 'quiz', 'qa', 'checklist', 'poster']);

function bodyToCsv(body: unknown): string {
  if (typeof body === 'string') return body;
  if (body && typeof body === 'object' && typeof (body as { csv?: unknown }).csv === 'string') return (body as { csv: string }).csv;
  throw new ValidationError('CSV body must be text/csv or JSON { csv: string }');
}

function parseCsv(csv: string): Array<Record<string, string>> {
  const lines = csv.split(/\r?\n/).map((line) => line.trim()).filter(Boolean);
  if (lines.length < 2) throw new ValidationError('CSV must include a header row and at least one data row');
  const headers = lines[0]!.split(',').map((header) => header.trim());
  return lines.slice(1).map((line) => {
    const values = line.split(',').map((value) => value.trim());
    return Object.fromEntries(headers.map((header, index) => [header, values[index] ?? '']));
  });
}

router.post('/content-csv', requirePermission('content:write'), asyncRoute(async (req, res) => {
  const rows = parseCsv(bodyToCsv(req.body));
  const errors: Array<{ row: number; message: string }> = [];
  let imported = 0;

  for (const [index, row] of rows.entries()) {
    try {
      if (!row.projectId) throw new ValidationError('projectId is required');
      if (!row.title) throw new ValidationError('title is required');
      if (row.type && !contentTypes.has(row.type)) throw new ValidationError(`type must be one of: ${[...contentTypes].join(', ')}`);
      await createContent({
        projectId: row.projectId,
        title: row.title,
        type: row.type || 'article',
        author: row.author || req.user!.name,
        excerpt: row.excerpt,
        content: row.content || row.title,
        tags: row.tags ? row.tags.split('|') : [],
      }, req.user!);
      imported += 1;
    } catch (err) {
      errors.push({ row: index + 2, message: err instanceof Error ? err.message : 'Unknown import error' });
    }
  }

  await appendAuditLog(req, { action: 'content.import_csv', resourceType: 'content', description: `Imported ${imported} content rows`, metadata: { imported, errors: errors.length } });
  res.status(errors.length ? 207 : 201).json({ success: errors.length === 0, data: { imported, errors }, timestamp: new Date().toISOString() });
}));

router.post('/metrics-csv', requirePermission('ingest:write'), asyncRoute(async (req, res) => {
  const rows = parseCsv(bodyToCsv(req.body));
  const errors: Array<{ row: number; message: string }> = [];
  const metrics: AggregateMetricInput[] = [];
  for (const [index, row] of rows.entries()) {
    try {
      if (!row.metricDate) throw new ValidationError('metricDate is required');
      const numericFields = ['pushCount', 'deliveredCount', 'readUsers', 'readCount', 'likeCount', 'dislikeCount', 'bookmarkCount', 'shareCount'];
      for (const field of numericFields) {
        if (row[field] && !Number.isFinite(Number(row[field]))) throw new ValidationError(`${field} must be numeric`);
      }
      metrics.push({
        projectId: row.projectId || undefined,
        contentId: row.contentId || undefined,
        diseaseId: row.diseaseId || undefined,
        metricDate: row.metricDate,
        pushCount: Number(row.pushCount || 0),
        deliveredCount: Number(row.deliveredCount || 0),
        readUsers: Number(row.readUsers || 0),
        readCount: Number(row.readCount || 0),
        likeCount: Number(row.likeCount || 0),
        dislikeCount: Number(row.dislikeCount || 0),
        bookmarkCount: Number(row.bookmarkCount || 0),
        shareCount: Number(row.shareCount || 0),
      });
    } catch (err) {
      errors.push({ row: index + 2, message: err instanceof Error ? err.message : 'Unknown import error' });
    }
  }
  if (metrics.length === 0 && errors.length > 0) {
    return res.status(400).json({ success: false, data: { imported: 0, errors }, timestamp: new Date().toISOString() });
  }
  const result = await ingestAggregateMetrics(metrics, req.user!);
  await appendAuditLog(req, { action: 'metrics.import_csv', resourceType: 'behavior_daily_metrics', description: `Imported ${result.inserted} metric rows`, metadata: { ...result, errors: errors.length } });
  res.status(errors.length ? 207 : 201).json({ success: errors.length === 0, data: { ...result, errors }, timestamp: new Date().toISOString() });
}));

export default router;
