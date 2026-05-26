import type { StreamEvent } from './types';

const PHASE_LABELS: Record<string, string> = {
  planning: '正在规划任务步骤',
  skill_context: '正在加载技能规范',
  skill_complete: '工具执行完成，继续推进',
  retry: '正在根据结果修正并重试',
  finalizing: '正在整理报告与交付文件',
  complete: '即将完成',
};

const SKILL_SHORT_NAMES: Record<string, string> = {
  'patient-education-data-overview': '数据概览',
  'patient-education-monthly-report': '月度报告',
  'ppt-master': 'PPT 生成',
};

function shortSkillName(skillId: string): string {
  const key = skillId.trim();
  if (!key) return '工具';
  return SKILL_SHORT_NAMES[key] || key.replace(/^patient-education-/, '').replace(/-/g, ' ');
}

function shortenBackendMessage(message: string, maxLen = 48): string {
  const text = message.replace(/\s+/g, ' ').trim();
  if (text.length <= maxLen) return text;
  return `${text.slice(0, maxLen)}…`;
}

function progressStatus(data: unknown): { text: string; step?: number } | null {
  if (typeof data === 'string') {
    const t = data.trim();
    return t ? { text: shortenBackendMessage(t) } : null;
  }
  if (!data || typeof data !== 'object') return null;

  const payload = data as {
    phase?: string;
    message?: string;
    step?: number;
    skill_id?: string;
    action?: string;
    ok?: boolean;
    detail?: string;
  };

  const step = typeof payload.step === 'number' ? payload.step : undefined;
  const phase = (payload.phase || '').trim();
  const message = (payload.message || '').trim();

  if (phase && PHASE_LABELS[phase]) {
    const base = PHASE_LABELS[phase];
    const stepPrefix = step ? `第 ${step} 步 · ` : '';
    if (phase === 'skill_complete' && payload.skill_id) {
      const name = shortSkillName(payload.skill_id);
      const ok = payload.ok !== false;
      return {
        text: `${stepPrefix}${ok ? '已完成' : '执行失败'}：${name}`,
        step,
      };
    }
    if (message && phase === 'planning') {
      return { text: `${stepPrefix}${shortenBackendMessage(message, 40)}`, step };
    }
    return { text: `${stepPrefix}${base}`, step };
  }

  if (message) {
    return { text: step ? `第 ${step} 步 · ${shortenBackendMessage(message)}` : shortenBackendMessage(message), step };
  }

  return null;
}

export function statusFromStreamEvent(evt: StreamEvent): { text: string; step?: number } | null {
  switch (evt.type) {
    case 'status': {
      const raw = String(evt.data ?? '').trim();
      if (!raw) return null;
      if (raw.includes('PostgreSQL') || raw.includes('预查') || raw.includes('指标')) {
        return { text: raw };
      }
      return { text: shortenBackendMessage(raw) };
    }
    case 'progress':
      return progressStatus(evt.data);
    case 'thought': {
      const raw = String(evt.data ?? '').trim();
      const stepMatch = raw.match(/\[step\s+(\d+)\]/i);
      const step = stepMatch ? Number(stepMatch[1]) : undefined;
      if (raw.includes('调用模型')) {
        return { text: step ? `第 ${step} 步 · 正在调用 AI 模型…` : '正在调用 AI 模型…', step };
      }
      return { text: step ? `第 ${step} 步 · 正在分析…` : '正在分析…', step };
    }
    case 'skills': {
      const list = Array.isArray(evt.data) ? (evt.data as string[]) : [];
      if (!list.length) return { text: '正在识别可用技能…' };
      const names = list.slice(0, 3).map(shortSkillName).join('、');
      const more = list.length > 3 ? ` 等 ${list.length} 项` : '';
      return { text: `已启用：${names}${more}` };
    }
    case 'skill_result': {
      const data = (evt.data || {}) as { ok?: boolean; skill_id?: string; summary?: string };
      const ok = data.ok !== false;
      const skill = shortSkillName(String(data.skill_id || ''));
      if (ok) {
        return { text: skill ? `✓ ${skill} 执行成功` : '✓ 工具执行成功' };
      }
      return { text: skill ? `↻ ${skill} 需重试` : '↻ 工具执行失败，正在修正' };
    }
    case 'files': {
      const files = Array.isArray(evt.data) ? evt.data.length : 0;
      if (files > 0) {
        return { text: `已产出 ${files} 个文件，继续处理…` };
      }
      return null;
    }
    default:
      return null;
  }
}

export function formatElapsed(seconds: number): string {
  if (seconds < 60) return `${seconds} 秒`;
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return s > 0 ? `${m} 分 ${s} 秒` : `${m} 分`;
}
