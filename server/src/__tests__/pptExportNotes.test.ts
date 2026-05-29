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
});
