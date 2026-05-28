import { readFile } from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';
import { describe, expect, it } from 'vitest';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

async function readProjectFile(relativeToServer: string): Promise<string> {
  return readFile(path.resolve(__dirname, '../..', relativeToServer), 'utf8');
}

describe('data overview HTML text rendering', () => {
  it('does not introduce ellipsis truncation in the rich overview renderer', async () => {
    const source = await readProjectFile('ai-helper/skills/patient-education-data-overview/scripts/render_overview_assets.ts');

    expect(source).not.toMatch(/text-overflow\s*:\s*ellipsis/i);
    expect(source).not.toMatch(/white-space\s*:\s*nowrap[^`]*text-overflow\s*:\s*ellipsis/i);
    expect(source).not.toContain('${s.slice(0, max)}…');
    expect(source).not.toMatch(/esc\(short\([^)]*(?:label|title|name)/);
  });

  it('does not introduce ellipsis truncation in the fallback overview artifact', async () => {
    const source = await readProjectFile('src/ai-helper/artifacts.ts');

    expect(source).not.toMatch(/text-overflow\s*:\s*ellipsis/i);
    expect(source).not.toMatch(/white-space\s*:\s*nowrap[^`]*text-overflow\s*:\s*ellipsis/i);
  });
});
