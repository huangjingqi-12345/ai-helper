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

test('pharma content request drawer can select a project and submit', async ({ page }) => {
  await page.addInitScript(() => {
    window.localStorage.setItem('pxlite.currentTenantId', 'T-NV');
    window.localStorage.setItem('pxlite.role', 'pharma');
  });

  await page.goto('/content');
  await expect(page.getByRole('button', { name: /发起选题需求/ })).toBeVisible();

  await page.getByRole('button', { name: /发起选题需求/ }).click();
  await expect(page.getByText('当前租户视角下还没有可关联的项目')).toHaveCount(0);
  await expect(page.getByRole('button', { name: /赫赛汀 · HER2\+ 术后辅助随访计划/ })).toBeVisible();

  await page.getByRole('button', { name: /赫赛汀 · HER2\+ 术后辅助随访计划/ }).click();
  await page.getByPlaceholder('搜索项目名 / 病种 / 品牌').fill('优赫得');
  await page.getByRole('button', { name: /优赫得 · HER2 ADC 重点随访/ }).click();
  await expect(page.getByRole('button', { name: /优赫得 · HER2 ADC 重点随访/ })).toBeVisible();

  await page.getByPlaceholder('例如：出院 30 天随访节点提醒').fill('自动化发起选题需求');
  await page.getByRole('button', { name: 'P0' }).click();
  await page.getByRole('button', { name: 'P2' }).click();
  await page.locator('input[type="date"]').fill('2026-06-10');
  await page.getByRole('button', { name: /疾病认知/ }).click();
  await page.getByRole('button', { name: /生活方式/ }).click();
  await page.getByRole('button', { name: '+' }).first().click();
  await page.getByRole('button', { name: '−' }).nth(1).click();
  await page.getByPlaceholder('补充合规口径、目标人群偏好、参考资料等').fill('自动化测试备注：覆盖术后 30 天随访节点。');

  await page.getByRole('button', { name: '提交诉求' }).click();

  await expect(page.getByText('已提交诉求：优赫得 · HER2 ADC 重点随访 · 自动化发起选题需求')).toBeVisible();
  await expect(page.getByText('优赫得 · HER2 ADC 重点随访 · 自动化发起选题需求').nth(1)).toBeVisible();
  await expect(page.getByText('共 15 条 · 第 1 / 1 页')).toBeVisible();
});
