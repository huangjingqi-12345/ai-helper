import type { StreamEvent } from './types';

const PHASE_LABELS: Record<string, string> = {
  planning: '正在调用 AI 判断下一步',
  skill_context: '正在读取生成要求',
  skill_complete: '当前步骤完成，继续处理',
  retry: '正在根据结果修正并重试',
  finalizing: '正在整理报告与交付文件',
  complete: '即将完成',
};

function shortenBackendMessage(message: string, maxLen = 48): string {
  const text = message.replace(/\s+/g, ' ').trim();
  if (text.length <= maxLen) return text;
  return `${text.slice(0, maxLen)}…`;
}

function statusForAction(action = '', detail = ''): string {
  const raw = `${action} ${detail}`.toLowerCase();
  if (raw.includes('emit_text')) return '正在生成汇报正文';
  if (raw.includes('read_skill_file')) return '正在读取生成要求';
  if (raw.includes('write_text_deliverable')) return '正在生成报告正文';
  if (raw.includes('write_ppt_svg_slide')) return '正在生成 PPT 第 1 页';
  if (raw.includes('render_ppt_from_specs')) return '正在生成 PPT 页面';
  if (raw.includes('ppt_master_export')) return '正在导出 PPT 文件';
  if (raw.includes('ppt_master_bootstrap')) return '正在创建 PPT 生成任务';
  if (raw.includes('write_project_files') || raw.includes('write_project_file')) return '正在整理 PPT 页面素材';
  if (raw.includes('md_to_pdf') || raw.includes('pdf')) return '正在导出 PDF';
  if (raw.includes('render_overview') || raw.includes('overview')) return '正在生成图表与报告文件';
  if (raw.includes('run_skill_script')) return '正在生成图表与文件';
  return '正在执行生成步骤';
}

function skillResultStatus(data: unknown): { text: string; step?: number } | null {
  if (!data || typeof data !== 'object') return null;
  const payload = data as { ok?: boolean; summary?: string; detail?: { kind?: string } };
  const ok = payload.ok !== false;
  const summary = String(payload.summary || '').trim();
  const kind = String(payload.detail?.kind || '').trim();

  if (!ok) return { text: '当前步骤需要修正，正在重试' };

  const slideMatch = summary.match(/(?:写入|生成)第\s*(\d+)\s*页/i);
  if (slideMatch) {
    const page = Number(slideMatch[1]);
    return { text: `第 ${page} 页已生成，正在继续处理`, step: page };
  }

  if (/导出可编辑\s*PPTX|PPT\s*已导出|ppt_export/i.test(`${summary} ${kind}`)) {
    return { text: 'PPT 已导出，正在整理文件' };
  }
  if (/write_project_many|批量处理|design_spec|spec_lock|total\.md/i.test(`${summary} ${kind}`)) {
    return { text: 'PPT 结构与备注已生成' };
  }
  if (/write_text|写入交付文件|report\.md/i.test(`${summary} ${kind}`)) {
    return { text: '报告正文已生成，正在生成可视化文件' };
  }
  if (/script|执行脚本|png|html|pdf/i.test(`${summary} ${kind}`)) {
    return { text: '图表与文件已生成，正在整理结果' };
  }

  return { text: '当前步骤完成，继续处理' };
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

  if (phase === 'skill_call') {
    return { text: statusForAction(payload.action, payload.detail), step };
  }

  if (phase && PHASE_LABELS[phase]) {
    const base = PHASE_LABELS[phase];
    if (phase === 'skill_complete') {
      return { text: payload.ok === false ? '当前步骤失败，正在修正' : base, step };
    }
    return { text: base, step };
  }

  if (message) {
    return { text: shortenBackendMessage(message), step };
  }

  return null;
}

function modelProgressStatus(data: unknown): { text: string; step?: number } | null {
  if (!data || typeof data !== 'object') return null;
  const payload = data as { message?: string; step?: number; chunk_count?: number; content_chars?: number; done?: boolean };
  const step = typeof payload.step === 'number' ? payload.step : undefined;
  const message = String(payload.message || '').trim();
  if (message) return { text: shortenBackendMessage(message, 60), step };
  if (typeof payload.content_chars === 'number' && payload.content_chars > 0) {
    return { text: `模型响应中，已生成约 ${payload.content_chars} 字符`, step };
  }
  if (typeof payload.chunk_count === 'number' && payload.chunk_count > 0) {
    return { text: `模型正在生成…已接收 ${payload.chunk_count} 个片段`, step };
  }
  return payload.done ? { text: '模型响应已完成', step } : { text: '模型正在输出结构化计划…', step };
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
    case 'model_progress':
      return modelProgressStatus(evt.data);
    case 'thought': {
      const raw = String(evt.data ?? '').trim();
      const stepMatch = raw.match(/\[step\s+(\d+)\]/i);
      const step = stepMatch ? Number(stepMatch[1]) : undefined;
      if (raw.includes('调用模型')) {
        return { text: '正在调用 AI 模型…', step };
      }
      if (/生成第\s*\d+\s*页|第\s*\d+\s*页/.test(raw)) {
        const page = raw.match(/第\s*(\d+)\s*页/)?.[1];
        return { text: page ? `正在生成第 ${page} 页` : '正在生成页面', step };
      }
      return { text: '正在分析…', step };
    }
    case 'skills':
      return null;
    case 'skill_result':
      return skillResultStatus(evt.data);
    case 'files': {
      const files = Array.isArray(evt.data) ? evt.data.length : 0;
      if (files > 0) {
        return { text: `已生成 ${files} 个文件，正在整理结果` };
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
