import { readFile } from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';
import { describe, expect, it } from 'vitest';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

async function readProjectFile(relativeToServer: string): Promise<string> {
  return readFile(path.resolve(__dirname, '../..', relativeToServer), 'utf8');
}

describe('AI helper HTML artifacts', () => {
  it.each([
    ['general artifact renderer', 'src/ai-helper/artifacts.ts', '.stage', 1280],
    ['data overview renderer', 'ai-helper/skills/patient-education-data-overview/scripts/render_overview_assets.ts', '.board', 1440],
  ])('%s centers the generated canvas in the browser viewport and keeps the outer frame square', async (_name, file, exportRootSelector, screenshotWidth) => {
    const source = await readProjectFile(file);
    const compact = source.replace(/\s+/g, '');

    expect(compact).toContain('html{min-height:100%;background:');
    expect(compact).toContain('body{min-height:100vh;');
    expect(compact).toContain('display:grid;place-items:center');
    expect(compact).toContain(`${exportRootSelector}{position:relative;`);
    expect(compact).toContain('border-radius:0!important');
    expect(compact).toContain('conic-gradient(from120deg');
    expect(compact).toContain(`viewport:{width:${screenshotWidth},`);
  });
});
