import { describe, it, expect } from 'vitest';
import { NAV_ITEMS, CONTENT_STATUS_MAP, STRATEGY_STATUS_MAP, ROLE_MAP, PAGE_DESCRIPTIONS } from '@/utils/constants';

describe('NAV_ITEMS', () => {
  it('contains 7 navigation items', () => {
    expect(NAV_ITEMS).toHaveLength(7);
  });

  it('each item has key, label, path, and icon', () => {
    NAV_ITEMS.forEach((item) => {
      expect(item.key).toBeTruthy();
      expect(item.label).toBeTruthy();
      expect(item.path).toBeTruthy();
      expect(item.icon).toBeTruthy();
    });
  });

  it('first item is overview with root path', () => {
    expect(NAV_ITEMS[0].key).toBe('overview');
    expect(NAV_ITEMS[0].path).toBe('/');
  });
});

describe('CONTENT_STATUS_MAP', () => {
  it('has all expected statuses', () => {
    expect(CONTENT_STATUS_MAP.draft).toBeDefined();
    expect(CONTENT_STATUS_MAP.under_review).toBeDefined();
    expect(CONTENT_STATUS_MAP.approved).toBeDefined();
    expect(CONTENT_STATUS_MAP.published).toBeDefined();
    expect(CONTENT_STATUS_MAP.archived).toBeDefined();
  });

  it('each status has label and color', () => {
    Object.values(CONTENT_STATUS_MAP).forEach((status) => {
      expect(status.label).toBeTruthy();
      expect(status.color).toBeTruthy();
    });
  });
});

describe('STRATEGY_STATUS_MAP', () => {
  it('has all expected statuses', () => {
    expect(STRATEGY_STATUS_MAP.draft).toBeDefined();
    expect(STRATEGY_STATUS_MAP.active).toBeDefined();
    expect(STRATEGY_STATUS_MAP.paused).toBeDefined();
    expect(STRATEGY_STATUS_MAP.completed).toBeDefined();
  });
});

describe('ROLE_MAP', () => {
  it('has all expected roles', () => {
    expect(ROLE_MAP.admin).toBeDefined();
    expect(ROLE_MAP.editor).toBeDefined();
    expect(ROLE_MAP.viewer).toBeDefined();
  });
});

describe('PAGE_DESCRIPTIONS', () => {
  it('has descriptions for all nav items', () => {
    NAV_ITEMS.forEach((item) => {
      expect(PAGE_DESCRIPTIONS[item.key]).toBeTruthy();
    });
  });
});
