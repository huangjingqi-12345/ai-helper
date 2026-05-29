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
  const projectsRoot = path.join(AI_HELPER_ROOT, 'projects');
  const names = await fs.readdir(projectsRoot).catch(() => []);
  await Promise.all(
    names
      .filter((name) => name.startsWith('test_clone_for_edit_target'))
      .map((name) => fs.rm(path.join(projectsRoot, name), { recursive: true, force: true })),
  );
});

describe('ppt-master clone for edit', () => {
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
});
