import { mkdtemp, readdir, readFile, rm } from 'fs/promises';
import fs from 'fs';
import os from 'os';
import path from 'path';
import { describe, expect, it } from 'vitest';
import { renderPptDeckFromSpecs } from '../ai-helper/pptSpecRenderer.js';

const CANVAS_W = 1280;
const CANVAS_H = 720;

function numericAttr(tag: string, name: string): number | undefined {
  const match = tag.match(new RegExp(`\\s${name}="([^"]+)"`));
  if (!match) return undefined;
  const n = Number(match[1]);
  return Number.isFinite(n) ? n : undefined;
}

function collectCanvasOverflow(svg: string): string[] {
  const issues: string[] = [];
  const root = svg.match(/<svg\b[^>]*>/)?.[0] || '';
  expect(root).toContain('width="1280"');
  expect(root).toContain('height="720"');
  expect(root).toContain('viewBox="0 0 1280 720"');

  for (const match of svg.matchAll(/<(rect|circle|ellipse|line)\b[^>]*>/g)) {
    const tag = match[0];
    const kind = match[1];
    let minX = 0;
    let maxX = 0;
    let minY = 0;
    let maxY = 0;

    if (kind === 'rect') {
      const x = numericAttr(tag, 'x') ?? 0;
      const y = numericAttr(tag, 'y') ?? 0;
      const w = numericAttr(tag, 'width') ?? 0;
      const h = numericAttr(tag, 'height') ?? 0;
      minX = x;
      maxX = x + w;
      minY = y;
      maxY = y + h;
    } else if (kind === 'circle') {
      const cx = numericAttr(tag, 'cx') ?? 0;
      const cy = numericAttr(tag, 'cy') ?? 0;
      const r = numericAttr(tag, 'r') ?? 0;
      minX = cx - r;
      maxX = cx + r;
      minY = cy - r;
      maxY = cy + r;
    } else if (kind === 'ellipse') {
      const cx = numericAttr(tag, 'cx') ?? 0;
      const cy = numericAttr(tag, 'cy') ?? 0;
      const rx = numericAttr(tag, 'rx') ?? 0;
      const ry = numericAttr(tag, 'ry') ?? 0;
      minX = cx - rx;
      maxX = cx + rx;
      minY = cy - ry;
      maxY = cy + ry;
    } else {
      const x1 = numericAttr(tag, 'x1') ?? 0;
      const x2 = numericAttr(tag, 'x2') ?? 0;
      const y1 = numericAttr(tag, 'y1') ?? 0;
      const y2 = numericAttr(tag, 'y2') ?? 0;
      minX = Math.min(x1, x2);
      maxX = Math.max(x1, x2);
      minY = Math.min(y1, y2);
      maxY = Math.max(y1, y2);
    }

    if (minX < 0 || minY < 0 || maxX > CANVAS_W || maxY > CANVAS_H) {
      issues.push(`${kind} overflow: ${tag}`);
    }
  }
  return issues;
}

describe('PPT spec renderer', () => {
  it('keeps generated slide primitives inside the 16:9 canvas to avoid export-time page shrinking', async () => {
    const root = await mkdtemp(path.join(os.tmpdir(), 'ppt-spec-renderer-'));
    try {
      await renderPptDeckFromSpecs(root, 'projects/test_ppt', {
        title: '患教运营汇报',
        subtitle: '测试',
        theme: 'medical_green',
        design_tokens: { background: 'grid_dots', accent_shape: 'orbit', number_style: 'hero', card_style: 'soft' },
        slides: [
          { slide_type: 'cover', layout_variant: 'statement_cover', title: '封面' },
          { slide_type: 'executive_summary', layout_variant: 'insight_split', title: '核心结论', bullets: ['阅读与互动持续改善'], highlight_points: [{ label: '阅读峰值', reason: '重点内容发布后增长' }] },
          {
            slide_type: 'kpi_dashboard',
            layout_variant: 'hero_metric',
            title: '核心 KPI 看板（近60天）',
            metrics: [
              { label: '累计推送量', value: 359541, unit: '次', delta: '+15.2%' },
              { label: '累计阅读量', value: 144156, unit: '次', delta: '+18.5%' },
              { label: '累计互动量', value: 13845, unit: '次', delta: '+25.1%' },
              { label: '整体完读率', value: '65.2', unit: '%', delta: '+5.5pp' },
            ],
            bullets: ['推送与阅读规模稳步扩大，互动转化表现优异。'],
          },
          { slide_type: 'trend', layout_variant: 'timeline_band', title: '趋势分析', chart: { categories: ['03', '04', '05'], values: [30, 45, 78] }, bullets: ['阅读增长较快，需要关注互动承接。'], highlight_points: [{ label: '05月', reason: '阅读提升' }] },
          { slide_type: 'comparison', layout_variant: 'matrix', title: '项目对比', chart: { categories: ['项目A', '项目B', '项目C'], values: [78, 58, 42] }, bullets: ['头部项目贡献明显。'] },
          { slide_type: 'ranking', layout_variant: 'content_cards', title: '内容排行', metrics: [{ label: '糖尿病饮食管理', value: 1024, unit: '次' }, { label: '高血压用药提醒', value: 820, unit: '次' }], bullets: ['高表现内容主题集中。'] },
          { slide_type: 'diagnosis', layout_variant: 'funnel_focus', title: '诊断', metrics: [{ label: '推送', value: 100 }, { label: '阅读', value: 42 }, { label: '互动', value: 12 }], bullets: ['阅读后互动承接偏弱。'] },
          { slide_type: 'roadmap', layout_variant: 'swimlane', title: '行动计划', bullets: ['优化内容供给', '提升触达转化', '沉淀复用机制'] },
          { slide_type: 'closing', title: '谢谢' },
        ],
      });

      const names = (await readdir(path.join(root, 'svg_output'))).filter((name) => name.endsWith('.svg'));
      expect(names.length).toBe(9);
      expect(fs.existsSync(path.join(root, 'visual_qa.json'))).toBe(true);
      const qa = JSON.parse(await readFile(path.join(root, 'visual_qa.json'), 'utf8')) as { reports: Array<{ score: number; metrics: { overlap_count: number } }> };
      expect(qa.reports.length).toBe(9);
      expect(Math.min(...qa.reports.map((r) => r.score))).toBeGreaterThan(50);
      for (const name of names) {
        const svg = await readFile(path.join(root, 'svg_output', name), 'utf8');
        expect(collectCanvasOverflow(svg)).toEqual([]);
        expect(svg).not.toContain('<tspan');
      }
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });

  it('renders structured comparison and top-content pages with chart content and without blank SVG containers', async () => {
    const root = await mkdtemp(path.join(os.tmpdir(), 'ppt-spec-renderer-regression-'));
    try {
      await renderPptDeckFromSpecs(root, 'projects/test_ppt', {
        title: '患教运营汇报',
        theme: 'medical_green',
        slides: [
          { slide_type: 'cover', title: '封面' },
          {
            slide_type: 'comparison',
            layout_variant: 'matrix',
            title: '项目表现：三大疾病管理项目对比',
            chart: { type: 'bar', categories: ['糖尿病管理', '高血压管理', '肿瘤随访'], values: [70994, 52979, 20183] },
            metrics: [
              { label: '糖尿病阅读', value: '70994', unit: '次', note: '占比49.2%' },
              { label: '高血压阅读', value: '52979', unit: '次', note: '占比36.7%' },
            ],
            bullets: ['糖尿病项目贡献近半，高血压项目互动率领先', '肿瘤项目规模小但需求粘性值得培育'],
            takeaway: '糖尿病项目贡献近半，高血压项目互动率领先，肿瘤项目重点提升。',
          },
          {
            slide_type: 'top_content',
            layout_variant: 'content_cards',
            title: '内容红榜：Top 5 高表现内容',
            metrics: [
              { label: '控糖饮食指南', value: '3.1万', unit: '次', note: '完读73.1%' },
              { label: '漏服降糖药问答', value: '2.36万', unit: '次', note: '完读67.1%' },
              { label: '复诊红旗信号图', value: '2.12万', unit: '次', note: '完读70.1%' },
            ],
            bullets: ['实操指南类内容完读率最高，问答卡和图解类互动表现突出'],
            takeaway: '实操指南类内容完读率最高，问答卡和图解类互动表现突出。',
          },
        ],
      });

      const comparison = await readFile(path.join(root, 'svg_output', '02_comparison.svg'), 'utf8');
      expect(comparison).toContain('糖尿病管理');
      expect(comparison).toContain('高血压管理');
      expect(comparison).toContain('肿瘤随访');
      expect(comparison).toContain('70994');
      expect(comparison).toContain('0');
      expect(collectCanvasOverflow(comparison)).toEqual([]);

      const topContent = await readFile(path.join(root, 'svg_output', '03_top_content.svg'), 'utf8');
      expect(topContent).toContain('控糖饮食指南');
      expect(topContent).toContain('漏服降糖药问答');
      expect(topContent).toContain('复诊红旗信号图');
      expect(topContent).toContain('3.1万次');
      expect(collectCanvasOverflow(topContent)).toEqual([]);
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });

  it('does not leave the diagnosis funnel panel blank when no funnel metrics are provided', async () => {
    const root = await mkdtemp(path.join(os.tmpdir(), 'ppt-spec-renderer-diagnosis-'));
    try {
      await renderPptDeckFromSpecs(root, 'projects/test_ppt', {
        title: '患教运营汇报',
        theme: 'executive_blue',
        slides: [
          { slide_type: 'cover', title: '封面' },
          {
            slide_type: 'diagnosis',
            layout_variant: 'funnel_focus',
            title: '潜在问题与原因判断',
            bullets: [
              '部分基础科普内容吸引力不足，阅读深度偏低',
              '肿瘤项目推送转化率有待提升',
              '慢病问答内容互动强，但后续承接不足',
              '推送频次与患者场景匹配仍需优化',
            ],
            takeaway: '部分基础科普内容吸引力不足，肿瘤项目推送转化率有待提升。',
          },
        ],
      });

      const diagnosis = await readFile(path.join(root, 'svg_output', '02_diagnosis.svg'), 'utf8');
      expect(diagnosis).toContain('问题信号');
      expect(diagnosis).toContain('部分基础科普内容吸引力不足');
      expect(diagnosis).not.toContain('转化链路');
      expect(collectCanvasOverflow(diagnosis)).toEqual([]);
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });

  it('applies model-controlled structure, visual style, data display, and components', async () => {
    const root = await mkdtemp(path.join(os.tmpdir(), 'ppt-spec-renderer-controls-'));
    try {
      await renderPptDeckFromSpecs(root, 'projects/test_ppt', {
        title: '患教运营汇报',
        theme: 'medical_green',
        style: { title_size: 34, body_size: 16, accent_color: '#0052D9', risk_color: '#E34D59', panel_alt_fill: '#E8F3FF' },
        data_display: { number_format: 'compact_cn', sort: 'desc', top_n: 2, highlight_max: true },
        slides: [
          { slide_type: 'cover', title: '封面' },
          {
            slide_type: 'components',
            layout_variant: 'component_grid',
            title: '模型控制组件页',
            takeaway: '组件层由模型指定，最终布局由后端控制。',
            components: [
              { type: 'metric_card', title: '累计阅读量', value: 144156, unit: '次', tone: 'good', icon: 'read' },
              { type: 'risk_card', title: '风险信号', text: '低完读内容需要重点优化', tone: 'risk', icon: 'warning' },
              { type: 'action_card', title: '行动建议', text: '将长视频拆分为短内容并增加互动引导', tone: 'warn', icon: 'action' },
            ],
            metrics: [
              { label: '低完读内容', value: 3, unit: '篇', status: 'risk' },
              { label: '累计阅读量', value: 144156, unit: '次' },
              { label: '互动量', value: 13845, unit: '次' },
            ],
          },
        ],
      });

      const svg = await readFile(path.join(root, 'svg_output', '02_components.svg'), 'utf8');
      expect(svg).toContain('font-size="34"');
      expect(svg).toContain('#0052D9');
      expect(svg).toContain('#E34D59');
      expect(svg).toContain('模型控制组件页');
      expect(svg).toContain('风险信号');
      expect(svg).toContain('行动建议');
      expect(svg).toContain('14.4万次');
      expect(svg).not.toContain('13845次');
      expect(collectCanvasOverflow(svg)).toEqual([]);
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });

  it('lets the model choose a component dashboard with chart, axes, labels, icons, and card styling without writing SVG coordinates', async () => {
    const root = await mkdtemp(path.join(os.tmpdir(), 'ppt-spec-renderer-dashboard-controls-'));
    try {
      await renderPptDeckFromSpecs(root, 'projects/test_ppt', {
        title: '患教运营汇报',
        theme: 'executive_blue',
        design_tokens: { card_style: 'outlined', chart_style: 'bold', icon_style: 'square', chart_palette: ['#0052D9', '#00A870'] },
        data_display: { number_format: 'compact_cn', show_axis: true, show_grid: true, show_value_labels: true },
        slides: [
          { slide_type: 'cover', title: '封面' },
          {
            slide_type: 'components',
            layout_variant: 'component_dashboard',
            title: '模型选择组件看板',
            takeaway: '结构由模型声明，绝对坐标由后端组件库生成。',
            components: [
              {
                type: 'chart_panel',
                title: '阅读趋势',
                layout_variant: 'line',
                chart: { type: 'line', title: '月度阅读', x_label: '月份', y_label: '阅读量', value_suffix: '次', categories: ['01', '02', '03'], values: [12000, 18000, 26000] },
              },
              { type: 'metric_card', title: '累计阅读', value: 56000, unit: '次', tone: 'good', icon: 'read' },
              { type: 'metric_card', title: '互动量', value: 7800, unit: '次', tone: 'warn', icon: 'interaction' },
              { type: 'action_card', title: '下一步', text: '优先放大高完读主题，并补足互动承接链路。', icon: 'action' },
            ],
          },
        ],
      });

      const svg = await readFile(path.join(root, 'svg_output', '02_components.svg'), 'utf8');
      expect(svg).toContain('模型选择组件看板');
      expect(svg).toContain('月度阅读');
      expect(svg).toContain('月份');
      expect(svg).toContain('阅读量');
      expect(svg).toContain('2.6万次');
      expect(svg).toContain('5.6万次');
      expect(svg).toContain('#0052D9');
      expect(collectCanvasOverflow(svg)).toEqual([]);
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });

  it('renders comparison pages with multi-series bar data instead of blank panels or zero metric cards', async () => {
    const root = await mkdtemp(path.join(os.tmpdir(), 'ppt-spec-renderer-series-'));
    try {
      await renderPptDeckFromSpecs(root, 'projects/test_ppt', {
        title: '患教运营汇报',
        theme: 'medical_green',
        data_display: { number_format: 'compact_cn', show_axis: true, show_grid: true, show_legend: true, show_value_labels: true },
        slides: [
          { slide_type: 'cover', title: '封面' },
          {
            slide_type: 'comparison',
            layout_variant: 'component_dashboard',
            title: '三大核心疾病项目表现矩阵',
            chart: {
              type: 'bar',
              title: '各项目阅读量与互动量对比',
              categories: ['糖尿病管理', '高血压管理', '肿瘤随访'],
              series: [
                { name: '阅读量', values: [70994, 52979, 20183], color: '#007A6C' },
                { name: '互动量', values: [6758, 4954, 2133], color: '#D97706' },
              ],
            },
            takeaway: '糖尿病与高血压项目构成流量双引擎。',
          },
        ],
      });

      const svg = await readFile(path.join(root, 'svg_output', '02_comparison.svg'), 'utf8');
      expect(svg).toContain('各项目阅读量与互动量对比');
      expect(svg).toContain('阅读量');
      expect(svg).toContain('互动量');
      expect(svg).toContain('7.1万');
      expect(svg).toContain('5.3万');
      expect(svg).toContain('2.0万');
      expect(svg).not.toContain('MODEL CONTROLLED DASHBOARD');
      expect(svg).not.toContain('>0</text></g><g><rect x="952"');
      expect(collectCanvasOverflow(svg)).toEqual([]);
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });

  it('keeps speaker notes out of slide body bullets and marks programmatic renders for export', async () => {
    const root = await mkdtemp(path.join(os.tmpdir(), 'ppt-spec-renderer-notes-'));
    try {
      await renderPptDeckFromSpecs(root, 'projects/test_ppt', {
        title: '患教运营汇报',
        theme: 'medical_green',
        slides: [
          { slide_type: 'cover', title: '封面' },
          {
            slide_type: 'executive_summary',
            title: '核心运营指标概览...',
            takeaway: '核心项目累计触达33.8万人，内容触达效率持续改善……',
            metrics: [{ label: '累计推送量...', value: '35.9万', unit: '次' }],
            notes: '这是演讲者备注，不应该出现在页面正文中……',
          },
        ],
      });

      const svg = await readFile(path.join(root, 'svg_output', '02_executive_summary.svg'), 'utf8');
      expect(svg).not.toContain('这是演讲者备注');
      expect(svg).toContain('累计推送量');
      expect(svg).not.toMatch(/…|⋯|\.{3,}|。{3,}/);
      expect(fs.existsSync(path.join(root, 'renderer_meta.json'))).toBe(true);
      expect(fs.existsSync(path.join(root, 'visual_qa.json'))).toBe(true);
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });
});
