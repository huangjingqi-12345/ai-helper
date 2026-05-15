import { expect, test, type Page } from '@playwright/test';

test.describe.configure({ mode: 'serial' });

async function expectKpi(page: Page, label: string, value: string): Promise<void> {
  await expect(page.locator('div').filter({ has: page.getByText(label, { exact: true }) }).filter({ hasText: value }).first()).toBeVisible();
}

test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => {
    window.localStorage.setItem('pxlite.authToken', 'dev-px-admin');
  });
});

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

test('admin accounts and projects match live demo metrics', async ({ page }) => {
  await page.goto('/admin/accounts');
  await expect(page.getByRole('heading', { name: '账号 · 角色 · 字段级权限' })).toBeVisible();
  await expectKpi(page, '全部账号', '18');
  await expectKpi(page, '运营视图', '6');
  await expectKpi(page, '药企视图', '12');
  await expectKpi(page, '已冻结', '2');
  await expect(page.getByText('已开二步验证')).toHaveCount(0);
  await expect(page.getByText('2FA')).toHaveCount(0);
  await expect(page.getByText('最近登录')).toBeVisible();

  await page.goto('/admin/projects');
  await expect(page.getByRole('heading', { name: '项目管理' })).toBeVisible();
  await expectKpi(page, '项目总数', '14');
  await expectKpi(page, '进行中', '8');
  await expectKpi(page, '累计篇数', '61篇');
  await expectKpi(page, '已完成', '2');
  await expect(page.getByText('他莫昔芬 · 内分泌依从性')).toBeVisible();
  await expect(page.getByText('主题×形式').first()).toBeVisible();
});



test('admin approval flow configuration matches live demo editor', async ({ page }) => {
  await page.goto('/admin/approval-flows');
  await expect(page.getByRole('heading', { name: '自定义审批流' })).toBeVisible();
  await expect(page.getByText('DX 医学审核 / PX 运营审核 为系统内置不可编辑')).toBeVisible();
  await expect(page.getByText('链路预览')).toBeVisible();

  await page.getByRole('button', { name: /新增节点/ }).click();
  await expect(page.getByText('已新增节点').last()).toBeVisible();
  await page.getByRole('button', { name: /^(停用|启用)$/ }).first().click();
  await expect(page.getByText(/已停用该流|已启用该流/).last()).toBeVisible();
});

test('pharma content request drawer can select a project and submit', async ({ page }) => {
  await page.addInitScript(() => {
    window.localStorage.setItem('pxlite.authToken', 'dev-pharma-admin');
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
  await page.goto('/distribute/request/REQ-2031');
  await expect(page.getByRole('heading', { name: '诉求 · 12 周随访节点提醒 · 多子项诉求' })).toBeVisible();
  await expect(page.getByText('本次分发批次 · 主题 × 形式 篇数')).toBeVisible();
  await expect(page.getByText('策略分发 · 互动派发逻辑')).toBeVisible();
  await expect(page.getByText('策略分发 · 候选 6 位')).toBeVisible();

  await page.getByRole('button', { name: '保存策略' }).click();
  await expect(page.getByText('诉求级分发策略已保存').last()).toBeVisible();

  await page.getByRole('button', { name: '清空' }).click();
  await expect(page.getByText('合计 0 篇').first()).toBeVisible();
  await page.getByRole('button', { name: /按诉求额度回填/ }).click();
  await expect(page.getByText('合计 6 篇').first()).toBeVisible();
  await page.getByRole('button', { name: /提交本批分发/ }).click();
  await expect(page.getByText(/已提交本批分发 \d+ 篇/)).toBeVisible();
  await expect(page.getByText(/BATCH-REQ-2031/).first()).toBeVisible();
});

test('approval center matches Manus grouped drawer workflow', async ({ page }) => {
  await page.goto('/approvals');
  await expect(page.getByRole('heading', { name: '审批中心' })).toBeVisible();
  await page.getByRole('button', { name: /诉求 · 首输 6 周内安全信号识别/ }).click();

  await expect(page.getByText('项目 · 优赫得 · HER2 ADC 重点随访 · 诉求 · 首输 6 周内安全信号识别')).toBeVisible();
  await expect(page.getByText('DX 医学审核').first()).toBeVisible();
  await expect(page.getByText('531h / 8h')).toBeVisible();

  await page.getByRole('button', { name: '查看 / 处理' }).click();
  await expect(page.getByText('审批链路')).toBeVisible();
  await expect(page.getByText('提交 · 作者 · 王医生')).toBeVisible();
  await expect(page.getByText('审核附件（患教内容详情）')).toBeVisible();
  await expect(page.getByText('服药顺序、漏服补救、中断策略与重启路径。').first()).toBeVisible();
  await expect(page.getByText('在「DX 医学审核」节点处理')).toBeVisible();
  await page.getByRole('button', { name: '不通过' }).click();
  await expect(page.getByRole('button', { name: '提交不通过' })).toBeVisible();
  await page.getByRole('button', { name: 'Close' }).click();
  await expect(page.getByText('审批链路')).toHaveCount(0);
});

test('tenant management matches Manus list and dialogs', async ({ page }) => {
  await page.goto('/admin/tenants');
  await expect(page.getByRole('heading', { name: '租户与可见范围' })).toBeVisible();
  await expect(page.locator('div').filter({ hasText: /^已停用\s*1$/ }).first()).toBeVisible();
  await expect(page.getByText('7 / 7 条')).toBeVisible();
  await expect(page.getByText('全部病种')).toBeVisible();
  await expect(page.getByText('1 种病').first()).toBeVisible();

  await page.getByRole('button', { name: '详情' }).nth(1).click();
  await expect(page.getByText('销售经理：沈书远')).toBeVisible();
  await expect(page.getByText('成功经理：陆玟昕')).toBeVisible();
  await expect(page.getByText('林筱 · linx@novartis.cn')).toBeVisible();
  await page.getByRole('button', { name: '邀请账号' }).click();
  await expect(page.getByText('为 诺华 邀请新账号')).toBeVisible();
  await expect(page.getByText('账号姓名必填。')).toBeVisible();
  await page.getByRole('button', { name: 'Close' }).last().click();
  await page.getByRole('button', { name: 'Close' }).click();

  await page.getByRole('button', { name: '新增租户' }).click();
  await expect(page.getByText('创建一家药企租户')).toBeVisible();
  await expect(page.getByRole('button', { name: '合规可见范围 病种 / 品牌 / 区域' })).toBeVisible();
  await expect(page.getByText('签约销售经理')).toBeVisible();
  await expect(page.getByRole('button', { name: '上一步' })).toHaveCount(0);
  await page.getByRole('button', { name: 'Close' }).click();
});

test('finance data platform route is implemented', async ({ page }) => {
  await page.goto('/finance');
  await expect(page.getByRole('heading', { name: '业财总览' })).toBeVisible();
  await expect(page.getByText('月度经常性收入')).toBeVisible();
  await expect(page.getByText('业财待办速览')).toBeVisible();

  await page.goto('/finance/contracts');
  await expect(page.getByRole('heading', { name: '客户合同与订阅' })).toBeVisible();
  await expect(page.getByText('共 7 条')).toBeVisible();

  await page.goto('/finance/billing');
  await expect(page.getByRole('heading', { name: '自动化固定费账单引擎' })).toBeVisible();
  await expect(page.getByText('共 6 张')).toBeVisible();

  await page.goto('/finance/invoicing');
  await expect(page.getByRole('heading', { name: '价值交付报告 × 开票联动' })).toBeVisible();
  await expect(page.getByText('累计交付报告')).toBeVisible();

  await page.goto('/finance/data');
  await expect(page.getByRole('heading', { name: '业财数据基座' })).toBeVisible();
  await expect(page.getByText('客户榜单')).toBeVisible();
});
