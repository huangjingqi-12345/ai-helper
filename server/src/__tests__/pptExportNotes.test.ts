import fs from 'fs/promises';
import path from 'path';
import { afterEach, describe, expect, it } from 'vitest';
import { AI_HELPER_ROOT } from '../ai-helper/paths.js';
import { SkillExecutor } from '../ai-helper/skillExecutor.js';

const projectRel = 'projects/test_notes_split_export';
const outputDir = path.join(AI_HELPER_ROOT, 'generated', 'test-notes-split-export');

async function reset(): Promise<void> {
  await fs.rm(path.join(AI_HELPER_ROOT, projectRel), { recursive: true, force: true });
  await fs.rm(outputDir, { recursive: true, force: true });
}

function svg(title: string): string {
  return `<svg xmlns="http://www.w3.org/2000/svg" width="1280" height="720" viewBox="0 0 1280 720"><rect width="1280" height="720" fill="#FFFFFF"/><text x="80" y="100" font-family="Arial" font-size="32" fill="#111827">${title}</text></svg>`;
}

afterEach(reset);

describe('ppt-master export notes splitting', () => {
  it('splits total.md sections separated by blank lines and markdown rulers', async () => {
    await reset();
    const root = path.join(AI_HELPER_ROOT, projectRel);
    await fs.mkdir(path.join(root, 'svg_output'), { recursive: true });
    await fs.mkdir(path.join(root, 'notes'), { recursive: true });
    const stems = ['01_cover', '02_executive_summary', '03_kpi_dashboard', '04_trend', '05_comparison', '06_diagnosis', '07_closing'];
    await Promise.all(stems.map((stem) => fs.writeFile(path.join(root, 'svg_output', `${stem}.svg`), svg(stem), 'utf8')));
    await fs.writeFile(path.join(root, 'notes', 'total.md'), stems.map((stem) => `# ${stem}\n\n- ${stem} speaker note`).join('\n\n---\n\n'), 'utf8');

    const executor = new SkillExecutor(outputDir, { allowManualPptSvg: true });
    const result = await executor.execute({
      type: 'skill_call',
      skill_id: 'ppt-master',
      action: 'ppt_master_export',
      params: { project_path: projectRel },
    });

    expect(result).toMatchObject({ ok: true });
    expect(String(result.file || '')).toMatch(/\.pptx$/);
    await expect(fs.access(path.join(root, 'notes', '01_cover.md'))).resolves.toBeUndefined();
    await expect(fs.readFile(path.join(root, 'notes', '07_closing.md'), 'utf8')).resolves.toContain('07_closing speaker note');
  });

  it('keeps Chinese SVG text on one line when it fits before PPT export', async () => {
    await reset();
    const root = path.join(AI_HELPER_ROOT, projectRel);
    await fs.mkdir(path.join(root, 'svg_output'), { recursive: true });
    await fs.mkdir(path.join(root, 'notes'), { recursive: true });
    await fs.writeFile(path.join(root, 'svg_output', '01_slide.svg'), `
<svg xmlns="http://www.w3.org/2000/svg" width="1280" height="720" viewBox="0 0 1280 720">
  <rect width="1280" height="720" fill="#FFFFFF"/>
  <text x="314" y="100" font-family="Microsoft YaHei" font-size="24" fill="#111827">确认业务后台是否实际配置并下发了患教推送任务</text>
  <text x="314" y="200" font-family="Microsoft YaHei" font-size="24" fill="#111827">核对年度运营计划确认是否存在长期的业务静默期</text>
</svg>`, 'utf8');
    await fs.writeFile(path.join(root, 'notes', 'total.md'), '# 01_slide\n\nspeaker note', 'utf8');

    const executor = new SkillExecutor(outputDir, { allowManualPptSvg: true });
    const result = await executor.execute({
      type: 'skill_call',
      skill_id: 'ppt-master',
      action: 'ppt_master_export',
      params: { project_path: projectRel },
    });

    expect(result).toMatchObject({ ok: true });
    const wrapped = await fs.readFile(path.join(root, 'svg_output', '01_slide.svg'), 'utf8');
    expect(wrapped).not.toContain('<tspan');
    expect(wrapped).toContain('确认业务后台是否实际配置并下发了患教推送任务');
    expect(wrapped).toContain('核对年度运营计划确认是否存在长期的业务静默期');
  });

  it('only wraps Chinese SVG text when it would overflow the canvas', async () => {
    await reset();
    const root = path.join(AI_HELPER_ROOT, projectRel);
    await fs.mkdir(path.join(root, 'svg_output'), { recursive: true });
    await fs.mkdir(path.join(root, 'notes'), { recursive: true });
    await fs.writeFile(path.join(root, 'svg_output', '01_slide.svg'), `
<svg xmlns="http://www.w3.org/2000/svg" width="1280" height="720" viewBox="0 0 1280 720">
  <rect width="1280" height="720" fill="#FFFFFF"/>
  <text x="980" y="100" font-family="Microsoft YaHei" font-size="24" fill="#111827">核对年度运营计划确认是否存在长期的业务静默期</text>
</svg>`, 'utf8');
    await fs.writeFile(path.join(root, 'notes', 'total.md'), '# 01_slide\n\nspeaker note', 'utf8');

    const executor = new SkillExecutor(outputDir, { allowManualPptSvg: true });
    const result = await executor.execute({
      type: 'skill_call',
      skill_id: 'ppt-master',
      action: 'ppt_master_export',
      params: { project_path: projectRel },
    });

    expect(result).toMatchObject({ ok: true });
    const wrapped = await fs.readFile(path.join(root, 'svg_output', '01_slide.svg'), 'utf8');
    expect(wrapped).toContain('<tspan');
    expect(wrapped).not.toMatch(/静默<\/tspan><tspan[^>]*>期/);
    expect(wrapped).toContain('静默期');
  });
});
