-- Remove only the AI helper mock rows created by mock-ai-helper-data.sql.
-- Intended for local SQLite development databases.

PRAGMA foreign_keys = ON;

BEGIN TRANSACTION;

DELETE FROM behavior_daily_metrics
 WHERE tenant_id = 'MOCK-TENANT-AI'
    OR project_id LIKE 'MOCK-PROJ-%'
    OR content_id LIKE 'MOCK-CONTENT-%'
    OR disease_id LIKE 'MOCK-DISEASE-%';

DELETE FROM content
 WHERE tenant_id = 'MOCK-TENANT-AI'
    OR id LIKE 'MOCK-CONTENT-%'
    OR project_id LIKE 'MOCK-PROJ-%';

DELETE FROM projects
 WHERE tenant_id = 'MOCK-TENANT-AI'
    OR id LIKE 'MOCK-PROJ-%';

DELETE FROM tenant_scopes
 WHERE tenant_id = 'MOCK-TENANT-AI'
    OR id = 'MOCK-SCOPE-AI';

DELETE FROM brands
 WHERE tenant_id = 'MOCK-TENANT-AI'
    OR id LIKE 'MOCK-BRAND-%';

DELETE FROM tenants
 WHERE id = 'MOCK-TENANT-AI';

DELETE FROM diseases
 WHERE id LIKE 'MOCK-DISEASE-%';

COMMIT;
