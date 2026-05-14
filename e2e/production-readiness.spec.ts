import { expect, test } from '@playwright/test';

test('pharma operations dashboard loads without false automation positioning', async ({ page }) => {
  await page.goto('/');
  await expect(page.getByRole('heading', { name: '患者教育内容运营总览' })).toBeVisible();
  await expect(page.getByText('患者行为洞察')).toBeVisible();
});

test('content workshop matches live read-only demo workflow', async ({ page }) => {
  await page.goto('/content');
  await expect(page.getByRole('heading', { name: '患教内容工坊' })).toBeVisible();
  await expect(page.getByText('共 14 条 · 第 1 / 1 页')).toBeVisible();
  await expect(page.getByRole('button', { name: /新建内容/ })).toHaveCount(0);
});
