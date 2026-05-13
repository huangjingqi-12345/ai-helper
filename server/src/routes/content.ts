import { Router } from 'express';
import { getContentList, getContentById, createContent, updateContent, deleteContent } from '../db/repositories.js';
import { logger } from '../utils/logger.js';
import { asyncRoute } from './asyncRoute.js';
import { requirePermission } from '../middleware/auth.js';
import { appendAuditLog } from '../utils/audit.js';
import { asObject, enumValue, optionalString, requiredString, stringArray } from '../utils/validation.js';

const router = Router();

router.use(requirePermission('content:read'));

const contentTypes = ['article', 'video', 'infographic', 'quiz', 'qa', 'checklist', 'poster'] as const;
const contentStatuses = ['draft', 'under_review', 'approved', 'published', 'archived', 'offline'] as const;

function validateCreateContent(body: unknown): Record<string, unknown> {
  const data = asObject(body);
  return {
    projectId: requiredString(data.projectId, 'projectId', 80),
    title: requiredString(data.title, 'title', 200),
    type: enumValue(data.type, 'type', contentTypes),
    author: optionalString(data.author, 'author', 80),
    excerpt: optionalString(data.excerpt, 'excerpt', 500),
    content: requiredString(data.content, 'content', 20000),
    tags: stringArray(data.tags, 'tags', 20),
  };
}

function validateUpdateContent(body: unknown): Record<string, unknown> {
  const data = asObject(body);
  const result: Record<string, unknown> = {};
  if (data.title !== undefined) result.title = requiredString(data.title, 'title', 200);
  if (data.type !== undefined) result.type = enumValue(data.type, 'type', contentTypes);
  if (data.status !== undefined) result.status = enumValue(data.status, 'status', contentStatuses);
  if (data.author !== undefined) result.author = requiredString(data.author, 'author', 80);
  if (data.excerpt !== undefined) result.excerpt = optionalString(data.excerpt, 'excerpt', 500);
  if (data.content !== undefined) result.content = requiredString(data.content, 'content', 20000);
  if (data.tags !== undefined) result.tags = stringArray(data.tags, 'tags', 20);
  if (data.expectedDate !== undefined) result.expectedDate = optionalString(data.expectedDate, 'expectedDate', 40);
  if (data.rejectionNote !== undefined) result.rejectionNote = optionalString(data.rejectionNote, 'rejectionNote', 1000);
  return result;
}

router.get('/', asyncRoute(async (req, res) => {
  logger.info({ query: req.query }, 'GET /api/content');
  const { status, type, projectId, pipelineStage, priority, search, page = '1', pageSize = '20' } = req.query;

  const result = await getContentList({
    status: status as string | undefined,
    type: type as string | undefined,
    projectId: projectId as string | undefined,
    pipelineStage: pipelineStage as string | undefined,
    priority: priority as string | undefined,
    search: search as string | undefined,
    page: parseInt(page as string, 10),
    pageSize: parseInt(pageSize as string, 10),
    scope: req.user!,
  });

  res.json({
    success: true,
    data: result.data,
    pagination: {
      page: parseInt(page as string, 10),
      pageSize: parseInt(pageSize as string, 10),
      total: result.total,
      totalPages: result.totalPages,
    },
    timestamp: new Date().toISOString(),
  });
}));

router.get('/:id', asyncRoute(async (req, res) => {
  logger.info({ id: req.params.id }, 'GET /api/content/:id');
  const item = await getContentById(String(req.params.id), req.user!);
  if (!item) {
    return res.status(404).json({
      success: false,
      data: null,
      message: 'Content not found',
      timestamp: new Date().toISOString(),
    });
  }
  res.json({ success: true, data: item, timestamp: new Date().toISOString() });
}));

router.post('/', requirePermission('content:write'), asyncRoute(async (req, res) => {
  logger.info({ body: req.body }, 'POST /api/content');
  const newItem = await createContent(validateCreateContent(req.body), req.user!);
  await appendAuditLog(req, { action: 'content.create', resourceType: 'content', resourceId: String((newItem as Record<string, unknown> | null)?.id ?? ''), after: newItem });
  res.status(201).json({ success: true, data: newItem, timestamp: new Date().toISOString() });
}));

router.put('/:id', requirePermission('content:write'), asyncRoute(async (req, res) => {
  logger.info({ id: req.params.id, body: req.body }, 'PUT /api/content/:id');
  const before = await getContentById(String(req.params.id), req.user!);
  const updated = await updateContent(String(req.params.id), validateUpdateContent(req.body), req.user!);
  if (!updated) {
    return res.status(404).json({
      success: false,
      data: null,
      message: 'Content not found',
      timestamp: new Date().toISOString(),
    });
  }
  await appendAuditLog(req, { action: 'content.update', resourceType: 'content', resourceId: String(req.params.id), before, after: updated });
  res.json({ success: true, data: updated, timestamp: new Date().toISOString() });
}));

router.delete('/:id', requirePermission('content:write'), asyncRoute(async (req, res) => {
  logger.info({ id: req.params.id }, 'DELETE /api/content/:id');
  const before = await getContentById(String(req.params.id), req.user!);
  const deleted = await deleteContent(String(req.params.id), req.user!);
  if (!deleted) {
    return res.status(404).json({
      success: false,
      data: null,
      message: 'Content not found',
      timestamp: new Date().toISOString(),
    });
  }
  await appendAuditLog(req, { action: 'content.delete', resourceType: 'content', resourceId: String(req.params.id), before });
  res.json({ success: true, data: null, message: 'Deleted', timestamp: new Date().toISOString() });
}));

export default router;
