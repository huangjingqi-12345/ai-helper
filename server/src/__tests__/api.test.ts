import { describe, it, expect } from 'vitest';

const BASE_URL = 'http://localhost:3001/api';

describe('Backend API Integration Tests', () => {
  describe('GET /api/health', () => {
    it('returns health status', async () => {
      const res = await fetch(`${BASE_URL}/health`);
      expect(res.status).toBe(200);
      const data = await res.json();
      expect(data.status).toBe('ok');
      expect(data.timestamp).toBeTruthy();
    });
  });

  describe('GET /api/overview', () => {
    it('returns overview summary data', async () => {
      const res = await fetch(`${BASE_URL}/overview`);
      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.success).toBe(true);
      const data = body.data;
      expect(data).toHaveProperty('projectCount');
      expect(data).toHaveProperty('publishedContent');
      expect(data).toHaveProperty('pushCount');
      expect(data).toHaveProperty('readUsers');
      expect(data).toHaveProperty('readCount');
      expect(data).toHaveProperty('interactionCount');
      expect(data).toHaveProperty('lastUpdated');
    });
  });

  describe('GET /api/overview/projects', () => {
    it('returns project list', async () => {
      const res = await fetch(`${BASE_URL}/overview/projects`);
      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.success).toBe(true);
      const data = body.data;
      expect(Array.isArray(data)).toBe(true);
      expect(data.length).toBeGreaterThan(0);
      expect(data[0]).toHaveProperty('id');
      expect(data[0]).toHaveProperty('name');
      expect(data[0]).toHaveProperty('disease');
    });
  });

  describe('GET /api/content', () => {
    it('returns paginated content list', async () => {
      const res = await fetch(`${BASE_URL}/content?page=1&pageSize=5`);
      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.success).toBe(true);
      expect(body).toHaveProperty('data');
      expect(body).toHaveProperty('pagination');
      expect(body.pagination).toHaveProperty('page');
      expect(body.pagination).toHaveProperty('pageSize');
      expect(body.pagination).toHaveProperty('total');
      expect(Array.isArray(body.data)).toBe(true);
      expect(body.data.length).toBeLessThanOrEqual(5);
    });

    it('supports status filtering', async () => {
      const res = await fetch(`${BASE_URL}/content?status=published`);
      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.success).toBe(true);
      body.data.forEach((item: { status: string }) => {
        expect(item.status).toBe('published');
      });
    });

    it('supports type filtering', async () => {
      const res = await fetch(`${BASE_URL}/content?type=article`);
      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.success).toBe(true);
      body.data.forEach((item: { type: string }) => {
        expect(item.type).toBe('article');
      });
    });
  });

  describe('GET /api/behavior', () => {
    it('returns behavior summary data', async () => {
      const res = await fetch(`${BASE_URL}/behavior`);
      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.success).toBe(true);
      const data = body.data;
      expect(data).toHaveProperty('totalReads');
      expect(data).toHaveProperty('totalInteractions');
      expect(data).toHaveProperty('avgReadDuration');
    });

    it('returns trend and analysis data', async () => {
      const res = await fetch(`${BASE_URL}/behavior`);
      const body = await res.json();
      const data = body.data;
      expect(data).toHaveProperty('readTrend');
      expect(Array.isArray(data.readTrend)).toBe(true);
      expect(data.readTrend.length).toBeGreaterThan(0);
      expect(data.readTrend[0]).toHaveProperty('date');
      expect(data.readTrend[0]).toHaveProperty('value');
      expect(data).toHaveProperty('topContent');
      expect(data).toHaveProperty('byDisease');
    });
  });

  describe('GET /api/distribution', () => {
    it('returns distribution strategies', async () => {
      const res = await fetch(`${BASE_URL}/distribution`);
      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.success).toBe(true);
      const data = body.data;
      expect(Array.isArray(data)).toBe(true);
      expect(data.length).toBeGreaterThan(0);
      expect(data[0]).toHaveProperty('id');
      expect(data[0]).toHaveProperty('name');
      expect(data[0]).toHaveProperty('status');
    });
  });

  describe('GET /api/approval', () => {
    it('returns approval items', async () => {
      const res = await fetch(`${BASE_URL}/approval`);
      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.success).toBe(true);
      const data = body.data;
      expect(Array.isArray(data)).toBe(true);
      expect(data.length).toBeGreaterThan(0);
      expect(data[0]).toHaveProperty('id');
      expect(data[0]).toHaveProperty('contentTitle');
      expect(data[0]).toHaveProperty('status');
      expect(data[0]).toHaveProperty('submittedBy');
    });
  });

  describe('POST /api/approval/:id/approve', () => {
    it('approves a pending item', async () => {
      const listRes = await fetch(`${BASE_URL}/approval`);
      const listBody = await listRes.json();
      const items = listBody.data;
      const pendingItem = items.find((i: { status: string }) => i.status === 'pending');
      
      if (pendingItem) {
        const res = await fetch(`${BASE_URL}/approval/${pendingItem.id}/approve`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ comment: 'Test approval' }),
        });
        expect(res.status).toBe(200);
        const body = await res.json();
        expect(body.success).toBe(true);
        expect(body.data.status).toBe('approved');
      }
    });
  });

  describe('GET /api/platform/users', () => {
    it('returns user list', async () => {
      const res = await fetch(`${BASE_URL}/platform/users`);
      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.success).toBe(true);
      const data = body.data;
      expect(Array.isArray(data)).toBe(true);
      expect(data.length).toBeGreaterThan(0);
      expect(data[0]).toHaveProperty('id');
      expect(data[0]).toHaveProperty('name');
      expect(data[0]).toHaveProperty('role');
      expect(data[0]).toHaveProperty('email');
    });
  });

  describe('GET /api/platform/settings', () => {
    it('returns platform settings', async () => {
      const res = await fetch(`${BASE_URL}/platform/settings`);
      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.success).toBe(true);
      const data = body.data;
      expect(data).toHaveProperty('siteName');
      expect(data).toHaveProperty('version');
      expect(data).toHaveProperty('region');
      expect(data).toHaveProperty('features');
    });
  });
});
