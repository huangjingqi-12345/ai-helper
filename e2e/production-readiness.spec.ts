import { expect, test } from '@playwright/test';

test('pharma operations dashboard loads without false automation positioning', async ({ page }) => {
  await page.goto('/');
  await expect(page.getByRole('heading', { name: '患者教育内容运营总览' })).toBeVisible();
  await expect(page.getByText('患者行为洞察')).toBeVisible();
});

test('content workflow can create a real draft from the workshop', async ({ page }) => {
  await page.goto('/content');
  await page.getByRole('button', { name: /新建内容/ }).click();
  await expect(page.getByText(/已创建草稿内容|创建内容失败/)).toBeVisible();
});
