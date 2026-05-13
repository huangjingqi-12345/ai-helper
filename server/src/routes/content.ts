import { Router } from 'express';
import { getContentList, getContentById, createContent, updateContent, deleteContent } from '../db/repositories.js';
import { logger } from '../utils/logger.js';

const router = Router();

router.get('/', (req, res) => {
  logger.info({ query: req.query }, 'GET /api/content');
  const { status, type, projectId, pipelineStage, priority, search, page = '1', pageSize = '20' } = req.query;

  const result = getContentList({
    status: status as string | undefined,
    type: type as string | undefined,
    projectId: projectId as string | undefined,
    pipelineStage: pipelineStage as string | undefined,
    priority: priority as string | undefined,
    search: search as string | undefined,
    page: parseInt(page as string, 10),
    pageSize: parseInt(pageSize as string, 10),
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
});

router.get('/:id', (req, res) => {
  logger.info({ id: req.params.id }, 'GET /api/content/:id');
  const item = getContentById(req.params.id);
  if (!item) {
    return res.status(404).json({
      success: false,
      data: null,
      message: 'Content not found',
      timestamp: new Date().toISOString(),
    });
  }
  res.json({ success: true, data: item, timestamp: new Date().toISOString() });
});

router.post('/', (req, res) => {
  logger.info({ body: req.body }, 'POST /api/content');
  const newItem = createContent(req.body);
  res.status(201).json({ success: true, data: newItem, timestamp: new Date().toISOString() });
});

router.put('/:id', (req, res) => {
  logger.info({ id: req.params.id, body: req.body }, 'PUT /api/content/:id');
  const updated = updateContent(req.params.id, req.body);
  if (!updated) {
    return res.status(404).json({
      success: false,
      data: null,
      message: 'Content not found',
      timestamp: new Date().toISOString(),
    });
  }
  res.json({ success: true, data: updated, timestamp: new Date().toISOString() });
});

router.delete('/:id', (req, res) => {
  logger.info({ id: req.params.id }, 'DELETE /api/content/:id');
  const deleted = deleteContent(req.params.id);
  if (!deleted) {
    return res.status(404).json({
      success: false,
      data: null,
      message: 'Content not found',
      timestamp: new Date().toISOString(),
    });
  }
  res.json({ success: true, data: null, message: 'Deleted', timestamp: new Date().toISOString() });
});

export default router;
