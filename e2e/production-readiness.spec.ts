import { expect, test } from '@playwright/test';

test('pharma operations dashboard loads without false automation positioning', async ({ page }) => {
  await page.goto('/');
  await expect(page.getByRole('heading', { name: '患者教育内容运营总览' })).toBeVisible();
  await expect(page.getByText('患者行为洞察')).toBeVisible();
});

test('content workshop matches live read-only demo workflow', async ({ page }) => {
  await page.goto('/content');
  await expect(page.getByRole('heading', { name: '患教内容工坊' })).toBeVisible();
  await expect(page.getByText(/共 \d+ 条 · 第 1 \/ 1 页/)).toBeVisible();
  await expect(page.getByRole('button', { name: /新建内容/ })).toHaveCount(0);
});

test('pharma content request drawer can select a project and submit', async ({ page }) => {
  await page.addInitScript(() => {
    window.localStorage.setItem('pxlite.currentTenantId', 'T-NV');
    window.localStorage.setItem('pxlite.role', 'pharma');
  });

  await page.goto('/content');
  await expect(page.getByRole('button', { name: /发起选题需求/ })).toBeVisible();

  await page.getByRole('button', { name: /发起选题需求/ }).click();
  await expect(page.getByText('当前租户视角下还没有可关联的项目')).toHaveCount(0);
  await expect(page.getByLabel('所属项目')).toBeVisible();
  await page.getByLabel('所属项目').selectOption({ index: 0 });

  await page.getByPlaceholder('例如：出院 30 天随访节点提醒').fill('自动化发起选题需求');
  await page.getByRole('button', { name: 'P0' }).click();
  await page.getByRole('button', { name: 'P2' }).click();
  await page.locator('input[type="date"]').fill('2026-06-10');
  await page.getByPlaceholder('补充合规口径、目标人群偏好、参考资料等').fill('自动化测试备注：覆盖术后 30 天随访节点。');

  await page.getByRole('button', { name: '提交诉求' }).click();

  await expect(page.getByText(/已提交诉求：.*自动化发起选题需求/)).toBeVisible();
  await expect(page.getByText(/自动化发起选题需求/).nth(1)).toBeVisible();
});

test('request-level distribution workbench implements Manus actions', async ({ page }) => {
  await page.goto('/distribute/request/REQ-2030');
  await expect(page.getByRole('heading', { name: /诉求 ·/ })).toBeVisible();
  await expect(page.getByText('本次分发批次 · 主题 × 形式篇数')).toBeVisible();

  await page.getByRole('button', { name: '保存策略' }).click();
  await expect(page.getByText('诉求级分发策略已保存').last()).toBeVisible();

  await page.getByRole('button', { name: /按诉求额度回填/ }).click();
  await page.getByRole('button', { name: /提交本批分发/ }).click();
  await expect(page.getByText(/已提交本批分发 \d+ 篇/)).toBeVisible();
  await expect(page.getByText(/BATCH-REQ-2030/).first()).toBeVisible();
});

test('finance data platform route is implemented', async ({ page }) => {
  await page.goto('/finance/data');
  await expect(page.getByRole('heading', { name: '业财数据基座' })).toBeVisible();
  await expect(page.getByText('客户榜单')).toBeVisible();
});
