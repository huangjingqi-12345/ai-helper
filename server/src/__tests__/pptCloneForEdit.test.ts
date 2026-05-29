import fs from 'fs/promises';
import path from 'path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { streamAssistant } from '../ai-helper/agent.js';
import { SkillExecutor } from '../ai-helper/skillExecutor.js';
import { AI_HELPER_ROOT } from '../ai-helper/paths.js';

const sourceProject = 'projects/test_clone_for_edit_source';

async function resetProject(rel: string): Promise<void> {
  await fs.rm(path.join(AI_HELPER_ROOT, rel), { recursive: true, force: true });
}

afterEach(async () => {
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
  await resetProject(sourceProject);
  await resetProject('projects/test_retry_edit_source');
  await resetProject('projects/test_draft_edit_source');
  const projectsRoot = path.join(AI_HELPER_ROOT, 'projects');
  const names = await fs.readdir(projectsRoot).catch(() => []);
  await Promise.all(
    names
      .filter((name) => name.startsWith('test_clone_for_edit_target') || name.startsWith('test_retry_edit_target') || name.startsWith('test_draft_edit_target') || name.startsWith('test_premium_bundle_ok'))
      .map((name) => fs.rm(path.join(projectsRoot, name), { recursive: true, force: true })),
  );
});

describe('ppt-master clone for edit', () => {
  it('allows premium SVG slides after the design bundle has been written once', async () => {
    vi.stubEnv('OPENAI_API_KEY', 'test-key');
    vi.stubEnv('OPENAI_BASE_URL', 'https://example.test/v1');
    vi.stubEnv('TEXT_MODEL', 'test-model');

    let modelCalls = 0;
    vi.stubGlobal('fetch', vi.fn(async (_url: unknown, init: RequestInit) => {
      const body = JSON.parse(String(init.body || '{}')) as { messages?: Array<{ content: string }> };
      const joined = (body.messages || []).map((m) => typeof m.content === 'string' ? m.content : JSON.stringify(m.content)).join('\n');
      const projectPath = joined.match(/project_path="([^"]+)"/)?.[1] || joined.match(/新建 PPT 项目 (projects\/[^\s"]+)/)?.[1] || '';
      modelCalls += 1;
      let content: string;
      if (modelCalls === 1) {
        content = JSON.stringify({
          type: 'skill_call',
          skill_id: 'ppt-master',
          action: 'emit_text',
          params: { content: '本报告基于最近一年患教运营数据，先给出核心判断：当前主数据暂无有效行为记录，因此本次精美版 PPT 将聚焦数据链路诊断、监控恢复和运营重启路径。页面将包含封面、核心结论、指标概览、趋势诊断、原因拆解和行动建议。' },
        });
      } else if (modelCalls === 2) {
        content = JSON.stringify({
          type: 'skill_call',
          skill_id: 'ppt-master',
          action: 'write_project_files',
          params: {
            project_path: projectPath,
            files: [
              { path: 'design_spec.md', content: '# 设计规范\n\n深色科技渐变、暗色卡片、统一图表风格。' },
              { path: 'spec_lock.md', content: '# 规范锁定\n\n1280×720；Microsoft YaHei, Arial, sans-serif；禁止 foreignObject/script/style/外链。' },
              { path: 'notes/total.md', content: '# 占位讲稿\n\n页1: 封面\n页2: 核心结论\n页3: 指标概览\n页4: 趋势诊断\n页5: 原因拆解\n页6: 行动建议' },
            ],
          },
        });
      } else {
        content = JSON.stringify({
          type: 'skill_call',
          skill_id: 'ppt-master',
          action: 'write_ppt_svg_slide',
          params: {
            project_path: projectPath,
            slide_no: 1,
            title: '封面',
            core_conclusion: '明确汇报主题与数据诊断方向',
            svg: '<svg width="1280" height="720" viewBox="0 0 1280 720" xmlns="http://www.w3.org/2000/svg"><rect width="1280" height="720" fill="#0B132B"/><text x="80" y="120" font-size="40" fill="#FFFFFF">患教运营年度复盘</text></svg>',
          },
        });
      }
      return { ok: true, json: async () => ({ choices: [{ finish_reason: 'stop', message: { content } }] }) };
    }));

    const events: Array<{ type: string; data: unknown }> = [];
    for await (const line of streamAssistant({
      conversation_id: 'test-premium-design-bundle-ok',
      run_id: 'run-premium-design-bundle-ok',
      shortcut: 'ppt_svg',
      data_scope: 'last_1_year',
      message: '生成一份 PPT 精美版',
    })) {
      const event = JSON.parse(line) as { type: string; data: unknown };
      events.push(event);
      if (
        event.type === 'skill_result' &&
        typeof event.data === 'object' &&
        event.data &&
        String((event.data as { detail?: { kind?: string } }).detail?.kind || '') === 'write_ppt_svg_slide'
      ) {
        break;
      }
    }

    expect(events).toContainEqual(expect.objectContaining({
      type: 'skill_result',
      data: expect.objectContaining({
        summary: expect.stringContaining('写入第 1 页 SVG'),
      }),
    }));
    expect(events).not.toContainEqual(expect.objectContaining({
      type: 'progress',
      data: expect.objectContaining({ message: 'PPT 精美版执行顺序需修正，正在要求模型按阶段继续' }),
    }));
  });

  it('uses context fallback for vague page replacement without waiting for intent classification', async () => {
    vi.stubEnv('OPENAI_API_KEY', 'test-key');
    vi.stubEnv('OPENAI_BASE_URL', 'https://example.test/v1');
    vi.stubEnv('TEXT_MODEL', 'test-model');
    const fetchMock = vi.fn(async () => {
      throw new Error('intent classifier should not be called for contextual PPT edit fallback');
    });
    vi.stubGlobal('fetch', fetchMock);

    let route: { type: string; data: Record<string, unknown> } | undefined;
    for await (const line of streamAssistant({
      conversation_id: 'test-context-ppt-edit-fallback',
      run_id: 'run-context-ppt-edit-fallback',
      message: '我不喜欢这个页面，换一个',
      history: [
        { role: 'user', text: '请帮我生成一份患教运营汇报 PPT 精美版' },
        {
          role: 'assistant',
          text: '正在逐页生成高精度 SVG 页面，当前已完成封面。',
          activePptContext: {
            projectPath: 'projects/context_fallback_ppt',
            slideCount: 1,
            slides: [
              { slideNo: 1, title: '封面', svgPath: '/projects/context_fallback_ppt/svg_output/01_slide.svg' },
            ],
          },
        },
      ],
    })) {
      const event = JSON.parse(line) as { type: string; data: Record<string, unknown> };
      if (event.type === 'route') {
        route = event;
        break;
      }
    }

    expect(fetchMock).not.toHaveBeenCalled();
    expect(route?.data).toEqual(expect.objectContaining({
      shortcut: 'ppt_svg',
      task: 'ppt_edit',
      is_followup: true,
      is_modification: true,
      history_included: true,
    }));
  });

  it('copies an existing PPT project and removes only pages selected for editing', async () => {
    const root = path.join(AI_HELPER_ROOT, sourceProject);
    await fs.mkdir(path.join(root, 'svg_output'), { recursive: true });
    await fs.writeFile(path.join(root, 'design_spec.md'), 'design', 'utf8');
    await fs.writeFile(path.join(root, 'spec_lock.md'), 'lock', 'utf8');
    await fs.mkdir(path.join(root, 'notes'), { recursive: true });
    await fs.writeFile(path.join(root, 'notes', 'total.md'), '# notes', 'utf8');
    await fs.writeFile(path.join(root, 'svg_output', '01_cover.svg'), '<svg width="1280" height="720" viewBox="0 0 1280 720"></svg>', 'utf8');
    await fs.writeFile(path.join(root, 'svg_output', '02_summary.svg'), '<svg width="1280" height="720" viewBox="0 0 1280 720"></svg>', 'utf8');
    await fs.writeFile(path.join(root, 'svg_output', '03_trend.svg'), '<svg width="1280" height="720" viewBox="0 0 1280 720"></svg>', 'utf8');

    const executor = new SkillExecutor(path.join(AI_HELPER_ROOT, 'generated', 'test-clone-for-edit'), { allowManualPptSvg: true });
    const result = await executor.execute({
      type: 'skill_call',
      skill_id: 'ppt-master',
      action: 'ppt_master_clone_for_edit',
      params: {
        source_project_path: sourceProject,
        edit_pages: [2],
        copy_pages: [1, 3],
        project_name: 'test_clone_for_edit_target',
      },
    });

    expect(result.ok).toBe(true);
    const targetProject = String(result.project_path);
    const targetRoot = path.join(AI_HELPER_ROOT, targetProject);
    await expect(fs.access(path.join(targetRoot, 'svg_output', '01_cover.svg'))).resolves.toBeUndefined();
    await expect(fs.access(path.join(targetRoot, 'svg_output', '03_trend.svg'))).resolves.toBeUndefined();
    await expect(fs.access(path.join(targetRoot, 'svg_output', '02_summary.svg'))).rejects.toThrow();
    await expect(fs.access(path.join(targetRoot, 'design_spec.md'))).resolves.toBeUndefined();
    await expect(fs.access(path.join(targetRoot, 'notes', 'total.md'))).resolves.toBeUndefined();
  });

  it('routes premium modification with active PPT context to local edit instead of full premium generation', async () => {
    vi.stubEnv('OPENAI_API_KEY', 'test-key');
    vi.stubEnv('OPENAI_BASE_URL', 'https://example.test/v1');
    vi.stubEnv('TEXT_MODEL', 'test-model');
    vi.stubGlobal('fetch', vi.fn(async () => ({
      ok: true,
      json: async () => ({
        choices: [{
          finish_reason: 'stop',
          message: {
            content: JSON.stringify({
              task: 'ppt',
              ppt_mode: 'premium',
              confidence: 1,
              is_followup: true,
              is_modification: true,
              reason: '要求精美化修改第四页',
            }),
          },
        }],
      }),
    })));

    const events: Array<{ type: string; data: unknown }> = [];
    for await (const line of streamAssistant({
      conversation_id: 'test-premium-local-edit',
      run_id: 'run-premium-local-edit',
      message: '第四页这也太丑了，我要精美版',
      history: [
        { role: 'user', text: '我想要修改第4页，不喜欢这个折线图' },
        {
          role: 'assistant',
          text: '已完成第4页修改',
          files: ['/generated/old/ppt.pptx'],
          activePptContext: {
            projectPath: 'projects/old_ppt',
            exportedPptx: '/generated/old/ppt.pptx',
            slideCount: 7,
            slides: [
              { slideNo: 1, title: '封面', svgPath: '/projects/old_ppt/svg_output/01.svg' },
              { slideNo: 2, title: '核心结论', svgPath: '/projects/old_ppt/svg_output/02.svg' },
              { slideNo: 3, title: '趋势', svgPath: '/projects/old_ppt/svg_output/03.svg' },
              { slideNo: 4, title: '趋势分析', svgPath: '/projects/old_ppt/svg_output/04.svg', deckSpec: { slide_no: 4, title: '趋势分析', chart: { type: 'line' } } },
              { slideNo: 5, title: '内容表现', svgPath: '/projects/old_ppt/svg_output/05.svg' },
              { slideNo: 6, title: '诊断', svgPath: '/projects/old_ppt/svg_output/06.svg' },
              { slideNo: 7, title: '行动建议', svgPath: '/projects/old_ppt/svg_output/07.svg' },
            ],
          },
        },
      ],
    })) {
      const event = JSON.parse(line) as { type: string; data: unknown };
      events.push(event);
      if (
        event.type === 'progress' &&
        typeof event.data === 'object' &&
        event.data &&
        'message' in event.data &&
        String(event.data.message).includes('PPT 局部修改')
      ) {
        break;
      }
    }

    expect(events).toContainEqual(expect.objectContaining({
      type: 'route',
      data: expect.objectContaining({ shortcut: 'ppt_svg', is_modification: true }),
    }));
    expect(events).toContainEqual(expect.objectContaining({
      type: 'progress',
      data: expect.objectContaining({ message: expect.stringContaining('PPT 局部修改') }),
    }));
    expect(vi.mocked(fetch)).toHaveBeenCalled();
  });

  it('does not ask the user for clarification in the PPT edit preface', async () => {
    vi.stubEnv('OPENAI_API_KEY', 'test-key');
    vi.stubEnv('OPENAI_BASE_URL', 'https://example.test/v1');
    vi.stubEnv('TEXT_MODEL', 'test-model');
    vi.stubGlobal('fetch', vi.fn(async (_url: unknown, init: RequestInit) => {
      const body = JSON.parse(String(init.body || '{}')) as { messages?: Array<{ content: string }> };
      const joined = (body.messages || []).map((m) => m.content).join('\n');
      const content = joined.includes('output_schema')
        ? JSON.stringify({ task: 'ppt_edit', ppt_mode: 'premium', confidence: 1, is_followup: true, is_modification: true, reason: '修改上一份PPT' })
        : '请说明您具体需要调整哪些内容或元素。';
      return { ok: true, json: async () => ({ choices: [{ finish_reason: 'stop', message: { content } }] }) };
    }));

    let firstText = '';
    for await (const line of streamAssistant({
      conversation_id: 'test-ppt-edit-no-clarify',
      run_id: 'run-ppt-edit-no-clarify',
      message: '修改一下这个ppt',
      history: [
        { role: 'user', text: '生成一份PPT' },
        {
          role: 'assistant',
          text: '已生成PPT',
          files: ['/generated/old/ppt.pptx'],
          activePptContext: {
            projectPath: 'projects/old_ppt',
            exportedPptx: '/generated/old/ppt.pptx',
            slideCount: 2,
            slides: [
              { slideNo: 1, title: '封面', svgPath: '/projects/old_ppt/svg_output/01.svg' },
              { slideNo: 2, title: '趋势页', svgPath: '/projects/old_ppt/svg_output/02.svg', deckSpec: { slide_no: 2, title: '趋势页' } },
            ],
          },
        },
      ],
    })) {
      const event = JSON.parse(line) as { type: string; data: unknown };
      if (event.type === 'text') {
        firstText = String(event.data);
        break;
      }
    }

    expect(firstText).not.toContain('请说明您具体需要调整哪些内容或元素');
    expect(firstText).not.toMatch(/具体需要|哪些内容|哪些元素|[？?]/);
    expect(firstText).toContain('自动定位');
    expect(firstText).toContain('直接完成局部修改');
  });

  it('does not expose low-level model errors when PPT edit fails and keeps previous PPT', async () => {
    vi.stubEnv('OPENAI_API_KEY', 'test-key');
    vi.stubEnv('OPENAI_BASE_URL', 'https://example.test/v1');
    vi.stubEnv('TEXT_MODEL', 'test-model');
    vi.stubGlobal('fetch', vi.fn(async (_url: unknown, init: RequestInit) => {
      const body = JSON.parse(String(init.body || '{}')) as { messages?: Array<{ content: string }> };
      const joined = (body.messages || []).map((m) => m.content).join('\n');
      if (joined.includes('output_schema')) {
        return {
          ok: true,
          json: async () => ({
            choices: [{
              finish_reason: 'stop',
              message: { content: JSON.stringify({ task: 'ppt_edit', ppt_mode: 'premium', confidence: 1, is_followup: true, is_modification: true, reason: '修改上一份PPT' }) },
            }],
          }),
        };
      }
      return {
        ok: false,
        status: 504,
        text: async () => '模型调用超时（>120000ms）：模型服务未在限定时间内返回',
      };
    }));

    const events: Array<{ type: string; data: unknown }> = [];
    for await (const line of streamAssistant({
      conversation_id: 'test-ppt-edit-safe-failure',
      run_id: 'run-ppt-edit-safe-failure',
      message: '修改一下这个ppt',
      history: [
        { role: 'user', text: '生成一份PPT' },
        {
          role: 'assistant',
          text: '已生成PPT',
          files: ['/generated/old/ppt.pptx'],
          activePptContext: {
            projectPath: 'projects/old_ppt',
            exportedPptx: '/generated/old/ppt.pptx',
            slideCount: 2,
            slides: [
              { slideNo: 1, title: '封面', svgPath: '/projects/old_ppt/svg_output/01.svg' },
              { slideNo: 2, title: '趋势页', svgPath: '/projects/old_ppt/svg_output/02.svg', deckSpec: { slide_no: 2, title: '趋势页' } },
            ],
          },
        },
      ],
    })) {
      events.push(JSON.parse(line) as { type: string; data: unknown });
    }

    const visible = events.map((event) => JSON.stringify(event.data)).join('\n');
    expect(visible).not.toContain('模型调用超时');
    expect(visible).not.toContain('120000ms');
    expect(visible).not.toContain('HTTP 504');
    expect(visible).not.toContain('模型服务未在限定时间内返回');
    expect(events).toContainEqual(expect.objectContaining({
      type: 'text',
      data: expect.stringContaining('已保留上一版 PPT 不变'),
    }));
    expect(events).toContainEqual(expect.objectContaining({
      type: 'files',
      data: expect.arrayContaining(['/generated/old/ppt.pptx']),
    }));
    const done = events.find((event) => event.type === 'done');
    const doneData = done?.data && typeof done.data === 'object' ? done.data as Record<string, unknown> : {};
    expect(doneData.text).toBe('这次 PPT 局部修改没有成功完成，已保留上一版 PPT 不变。你可以稍后重试，或换一种更明确的修改描述。');
    expect(doneData.files).toEqual(['/generated/old/ppt.pptx']);
    expect(doneData.activePptContext).toMatchObject({ exportedPptx: '/generated/old/ppt.pptx' });
  });

  it('returns SVG compatibility failures to the edit model and retries instead of aborting', async () => {
    const retrySource = 'projects/test_retry_edit_source';
    const root = path.join(AI_HELPER_ROOT, retrySource);
    await fs.mkdir(path.join(root, 'svg_output'), { recursive: true });
    await fs.mkdir(path.join(root, 'notes'), { recursive: true });
    await fs.writeFile(path.join(root, 'svg_output', '01_slide.svg'), '<svg width="1280" height="720" viewBox="0 0 1280 720"><rect width="1280" height="720" fill="#fff"/><text x="80" y="100" font-size="32">第一页</text></svg>', 'utf8');
    await fs.writeFile(path.join(root, 'svg_output', '02_slide.svg'), '<svg width="1280" height="720" viewBox="0 0 1280 720"><rect width="1280" height="720" fill="#fff"/><text x="80" y="100" font-size="32">旧第二页</text></svg>', 'utf8');
    await fs.writeFile(path.join(root, 'notes', 'total.md'), '# 01_slide\n\n第一页备注\n\n---\n\n# 02_slide\n\n第二页备注', 'utf8');

    vi.stubEnv('OPENAI_API_KEY', 'test-key');
    vi.stubEnv('OPENAI_BASE_URL', 'https://example.test/v1');
    vi.stubEnv('TEXT_MODEL', 'test-model');
    vi.stubGlobal('fetch', vi.fn(async (_url: unknown, init: RequestInit) => {
      const body = JSON.parse(String(init.body || '{}')) as { messages?: Array<{ role: string; content: string }> };
      const messages = body.messages || [];
      const joined = messages.map((m) => m.content).join('\n');
      const last = messages[messages.length - 1]?.content || '';
      let content: string;
      if (joined.includes('output_schema') && joined.includes('ppt_edit')) {
        content = JSON.stringify({ task: 'ppt_edit', ppt_mode: 'premium', confidence: 1, is_followup: true, is_modification: true, reason: '修改上一份PPT' });
      } else if (joined.includes('请先输出一段给用户看的中文说明')) {
        content = '我会定位第2页，保持其他页面不变，只修改目标页并重新导出。';
      } else if (!joined.includes('SKILL_RESULT')) {
        content = JSON.stringify({
          type: 'skill_call',
          skill_id: 'ppt-master',
          action: 'ppt_master_clone_for_edit',
          params: { source_project_path: retrySource, edit_pages: [2], copy_pages: [1], project_name: 'test_retry_edit_target' },
        });
      } else if (last.includes('ppt_clone_for_edit')) {
        content = JSON.stringify({
          type: 'skill_call',
          skill_id: 'ppt-master',
          action: 'write_ppt_svg_slide',
          params: {
            slide_no: 2,
            title: '新第二页',
            core_conclusion: '先故意触发兼容性错误',
            svg: '<svg width="1280" height="720" viewBox="0 0 1280 720"><g opacity="0.5"><rect width="1280" height="720" fill="#fff"/></g><text x="80" y="100" font-size="32">新第二页</text></svg>',
          },
        });
      } else if (last.includes('<g opacity>')) {
        content = JSON.stringify({
          type: 'skill_call',
          skill_id: 'ppt-master',
          action: 'write_ppt_svg_slide',
          params: {
            slide_no: 2,
            title: '新第二页',
            core_conclusion: '已修复兼容性错误',
            svg: '<svg width="1280" height="720" viewBox="0 0 1280 720"><rect width="1280" height="720" fill="#fff" opacity="0.5"/><text x="80" y="100" font-size="32">新第二页</text></svg>',
          },
        });
      } else if (last.includes('write_ppt_svg_slide')) {
        content = JSON.stringify({ type: 'skill_call', skill_id: 'ppt-master', action: 'ppt_master_export', params: {} });
      } else {
        content = JSON.stringify({ type: 'final', answer: 'PPT 已完成局部修改。', deliverable_files: [] });
      }
      return { ok: true, json: async () => ({ choices: [{ finish_reason: 'stop', message: { content } }] }) };
    }));

    const events: Array<{ type: string; data: unknown }> = [];
    for await (const line of streamAssistant({
      conversation_id: 'test-ppt-edit-retry',
      run_id: 'run-ppt-edit-retry',
      message: '修改第2页',
      history: [
        { role: 'user', text: '生成一份PPT' },
        {
          role: 'assistant',
          text: '已生成PPT',
          files: ['/generated/old/ppt.pptx'],
          activePptContext: {
            projectPath: retrySource,
            exportedPptx: '/generated/old/ppt.pptx',
            slideCount: 2,
            slides: [
              { slideNo: 1, title: '第一页', svgPath: `/${retrySource}/svg_output/01_slide.svg` },
              { slideNo: 2, title: '旧第二页', svgPath: `/${retrySource}/svg_output/02_slide.svg`, deckSpec: { slide_no: 2, title: '旧第二页' } },
            ],
          },
        },
      ],
    })) {
      events.push(JSON.parse(line) as { type: string; data: unknown });
    }

    expect(events).toContainEqual(expect.objectContaining({
      type: 'progress',
      data: expect.objectContaining({ phase: 'retry', message: expect.stringContaining('已把错误返回模型修正') }),
    }));
    expect(events.some((event) => event.type === 'text' && String(event.data).includes('PPT 局部修改失败'))).toBe(false);
    const done = events.find((event) => event.type === 'done');
    const doneData = done?.data && typeof done.data === 'object' ? done.data as Record<string, unknown> : {};
    expect(doneData.text).toBe('PPT 已完成局部修改。');
    const visible = events.map((event) => JSON.stringify(event.data)).join('\n');
    expect(visible).not.toContain('PPT SVG 兼容性检查失败');
    expect(visible).not.toContain('<g opacity>');
    const trace = Array.isArray(doneData.trace) ? doneData.trace : [];
    expect(trace.some((entry) => JSON.stringify(entry).includes('页面内容校验未通过，正在自动修正。'))).toBe(true);
    expect(trace.some((entry) => JSON.stringify(entry).includes('ppt_export'))).toBe(true);
  });

  it('keeps the latest cloned SVG draft as active context when PPT edit fails before export', async () => {
    const draftSource = 'projects/test_draft_edit_source';
    const root = path.join(AI_HELPER_ROOT, draftSource);
    await fs.mkdir(path.join(root, 'svg_output'), { recursive: true });
    await fs.mkdir(path.join(root, 'notes'), { recursive: true });
    await fs.writeFile(path.join(root, 'svg_output', '01_slide.svg'), '<svg width="1280" height="720" viewBox="0 0 1280 720"><rect width="1280" height="720" fill="#fff"/><text x="80" y="100" font-size="32">第一页旧版</text></svg>', 'utf8');
    await fs.writeFile(path.join(root, 'svg_output', '02_slide.svg'), '<svg width="1280" height="720" viewBox="0 0 1280 720"><rect width="1280" height="720" fill="#fff"/><text x="80" y="100" font-size="32">第二页旧版</text></svg>', 'utf8');
    await fs.writeFile(path.join(root, 'notes', 'total.md'), '# 01_slide\n\n第一页备注\n\n---\n\n# 02_slide\n\n第二页备注', 'utf8');

    vi.stubEnv('OPENAI_API_KEY', 'test-key');
    vi.stubEnv('OPENAI_BASE_URL', 'https://example.test/v1');
    vi.stubEnv('TEXT_MODEL', 'test-model');
    vi.stubGlobal('fetch', vi.fn(async (_url: unknown, init: RequestInit) => {
      const body = JSON.parse(String(init.body || '{}')) as { messages?: Array<{ role: string; content: string }> };
      const messages = body.messages || [];
      const joined = messages.map((m) => m.content).join('\n');
      const last = messages[messages.length - 1]?.content || '';
      if (joined.includes('output_schema') && joined.includes('ppt_edit')) {
        return { ok: true, json: async () => ({ choices: [{ finish_reason: 'stop', message: { content: JSON.stringify({ task: 'ppt_edit', ppt_mode: 'premium', confidence: 1, is_followup: true, is_modification: true, reason: '修改上一份PPT' }) } }] }) };
      }
      if (joined.includes('请先输出一段给用户看的中文说明')) {
        return { ok: true, json: async () => ({ choices: [{ finish_reason: 'stop', message: { content: '我会定位第2页并直接完成局部修改。' } }] }) };
      }
      if (!joined.includes('SKILL_RESULT')) {
        return { ok: true, json: async () => ({ choices: [{ finish_reason: 'stop', message: { content: JSON.stringify({ type: 'skill_call', skill_id: 'ppt-master', action: 'ppt_master_clone_for_edit', params: { source_project_path: draftSource, edit_pages: [2], copy_pages: [1], project_name: 'test_draft_edit_target' } }) } }] }) };
      }
      if (last.includes('ppt_clone_for_edit')) {
        return { ok: true, json: async () => ({ choices: [{ finish_reason: 'stop', message: { content: JSON.stringify({ type: 'skill_call', skill_id: 'ppt-master', action: 'write_ppt_svg_slide', params: { slide_no: 2, title: '第二页新版', core_conclusion: '已生成 SVG 草稿', svg: '<svg width="1280" height="720" viewBox="0 0 1280 720"><rect width="1280" height="720" fill="#eef"/><text x="80" y="100" font-size="32">第二页新版</text></svg>' } }) } }] }) };
      }
      return { ok: false, status: 504, text: async () => '模型调用超时（>120000ms）：模型服务未在限定时间内返回' };
    }));

    const events: Array<{ type: string; data: unknown }> = [];
    for await (const line of streamAssistant({
      conversation_id: 'test-ppt-edit-draft-failure',
      run_id: 'run-ppt-edit-draft-failure',
      message: '修改第2页',
      history: [
        { role: 'user', text: '生成一份PPT' },
        {
          role: 'assistant',
          text: '已生成PPT',
          files: ['/generated/old/ppt.pptx'],
          activePptContext: {
            projectPath: draftSource,
            exportedPptx: '/generated/old/ppt.pptx',
            slideCount: 2,
            slides: [
              { slideNo: 1, title: '第一页', svgPath: `/${draftSource}/svg_output/01_slide.svg` },
              { slideNo: 2, title: '第二页旧版', svgPath: `/${draftSource}/svg_output/02_slide.svg`, deckSpec: { slide_no: 2, title: '第二页旧版' } },
            ],
          },
        },
      ],
    })) {
      events.push(JSON.parse(line) as { type: string; data: unknown });
    }

    const done = events.find((event) => event.type === 'done');
    const doneData = done?.data && typeof done.data === 'object' ? done.data as Record<string, unknown> : {};
    expect(doneData.text).toBe('这次 PPT 没有成功导出为 PPTX，但已保留上一轮生成的 SVG 页面，可继续基于这些页面修改。');
    expect(doneData.files).toEqual([]);
    const active = doneData.activePptContext as { projectPath?: string; exportedPptx?: string; slides?: Array<{ slideNo: number; svgPath?: string; source?: string }> };
    expect(active.projectPath).toMatch(/^projects\/test_draft_edit_target/);
    expect(active.exportedPptx).toBeUndefined();
    expect(active.slides).toEqual(expect.arrayContaining([
      expect.objectContaining({ slideNo: 1, source: 'copied', svgPath: expect.stringMatching(/test_draft_edit_target.*\/svg_output\/01_slide\.svg/) }),
      expect.objectContaining({ slideNo: 2, source: 'generated', svgPath: expect.stringMatching(/test_draft_edit_target.*\/svg_output\/02_slide\.svg/) }),
    ]));
  });
});
