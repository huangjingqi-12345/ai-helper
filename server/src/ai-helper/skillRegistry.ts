import fs from 'fs';
import path from 'path';
import { AI_HELPER_ROOT } from './paths.js';

export interface SkillDoc {
  skill_id: string;
  title: string;
  path: string;
  content: string;
}

export class SkillRegistry {
  readonly skillsDir: string;
  private skills: SkillDoc[] = [];
  private hidden = new Set(['html-to-png', 'data-autoload-from-data-dir', 'patient-education-trend-analysis', 'sql-pro']);

  constructor(skillsDir = path.join(AI_HELPER_ROOT, 'skills')) {
    this.skillsDir = skillsDir;
    fs.mkdirSync(this.skillsDir, { recursive: true });
    for (const id of (process.env.HIDDEN_SKILL_IDS || '').split(',')) {
      if (id.trim()) this.hidden.add(id.trim());
    }
    this.reload();
  }

  reload(): void {
    const out: SkillDoc[] = [];
    const walk = (dir: string) => {
      if (!fs.existsSync(dir)) return;
      for (const ent of fs.readdirSync(dir, { withFileTypes: true })) {
        const abs = path.join(dir, ent.name);
        if (ent.isDirectory()) {
          if (['.git', 'node_modules', '__pycache__', '.venv'].includes(ent.name)) continue;
          walk(abs);
        } else if (ent.name === 'SKILL.md') {
          const skillId = path.basename(path.dirname(abs));
          if (this.hidden.has(skillId)) continue;
          const content = fs.readFileSync(abs, 'utf8');
          out.push({ skill_id: skillId, title: this.extractTitle(content, skillId), path: path.relative(this.skillsDir, abs), content });
        }
      }
    };
    walk(this.skillsDir);
    this.skills = out.sort((a, b) => a.skill_id.localeCompare(b.skill_id));
  }

  private extractTitle(text: string, fallback: string): string {
    for (const raw of text.split(/\r?\n/)) {
      const line = raw.trim();
      if (!line || line === '---' || line === '```' || line === 'yaml') continue;
      if (line.startsWith('name:')) return line.slice(5).trim() || fallback;
      if (line.startsWith('#')) return line.replace(/^#+/, '').trim() || fallback;
      return line.slice(0, 80) || fallback;
    }
    return fallback;
  }

  listSkills(): Array<{ skill_id: string; title: string; path: string }> {
    return this.skills.map(({ skill_id, title, path }) => ({ skill_id, title, path }));
  }

  buildPromptContext(): string {
    if (!this.skills.length) return '';
    const lines = ['可用 skills 目录（请根据任务自行选择，必要时 read_skill_file 读全文）：'];
    for (const skill of this.skills) {
      const desc = skill.content.split(/\r?\n/).map((x) => x.trim()).find((x) => x && !x.startsWith('#') && x !== '---') || '';
      lines.push(`- ${skill.skill_id}: ${skill.title}${desc ? ` — ${desc.slice(0, 120)}` : ''}`);
    }
    return lines.join('\n');
  }

  buildFullSkillContext(skillId: string): string {
    const skill = this.skills.find((x) => x.skill_id === skillId);
    if (!skill) return '';
    return `[Skill: ${skill.skill_id}]\n标题: ${skill.title}\n注入范围: 完整执行规范（未截断）\n内容:\n${skill.content}\n`;
  }
}
