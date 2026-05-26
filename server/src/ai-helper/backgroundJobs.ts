import { randomUUID } from 'crypto';
import type { SkillCall, SkillResult } from './skillExecutor.js';

export interface BackgroundJob {
  id: string;
  status: 'queued' | 'running' | 'done' | 'failed';
  label: string;
  files: string[];
  expected_files: string[];
  error: string;
  created_at: number;
  started_at?: number;
  finished_at?: number;
  conversation_id?: string;
  run_id?: string;
}

const jobs = new Map<string, BackgroundJob & { call?: SkillCall; runner?: () => Promise<SkillResult> }>();

export function listBackgroundJobs(filter: { conversation_id?: string; run_id?: string } = {}): BackgroundJob[] {
  return [...jobs.values()]
    .filter((job) => !filter.conversation_id || job.conversation_id === filter.conversation_id)
    .filter((job) => !filter.run_id || job.run_id === filter.run_id)
    .sort((a, b) => b.created_at - a.created_at)
    .slice(0, 50)
    .map(snapshotJob);
}

export function getBackgroundJob(id: string): BackgroundJob {
  const job = jobs.get(id);
  if (!job) return { id, status: 'failed', label: 'missing', files: [], expected_files: [], error: 'job not found', created_at: Date.now() };
  return snapshotJob(job);
}

function snapshotJob(job: BackgroundJob): BackgroundJob {
  return {
    id: job.id,
    status: job.status,
    label: job.label,
    files: job.files,
    expected_files: job.expected_files,
    error: job.error,
    created_at: job.created_at,
    started_at: job.started_at,
    finished_at: job.finished_at,
    conversation_id: job.conversation_id,
    run_id: job.run_id,
  };
}

export function scheduleBackgroundJob(args: {
  label: string;
  expected_files?: string[];
  conversation_id?: string;
  run_id?: string;
  runner: () => Promise<SkillResult>;
}): BackgroundJob {
  const id = `bg-${Date.now()}-${randomUUID().slice(0, 8)}`;
  const job: BackgroundJob & { runner: () => Promise<SkillResult> } = {
    id,
    status: 'queued',
    label: args.label,
    files: [],
    expected_files: args.expected_files || [],
    error: '',
    created_at: Date.now(),
    conversation_id: args.conversation_id,
    run_id: args.run_id,
    runner: args.runner,
  };
  jobs.set(id, job);
  void runJob(id);
  return snapshotJob(job);
}

async function runJob(id: string): Promise<void> {
  const job = jobs.get(id);
  if (!job?.runner) return;
  job.status = 'running';
  job.started_at = Date.now();
  try {
    const result = await job.runner();
    job.status = result.ok === false ? 'failed' : 'done';
    job.files = Array.isArray(result.files) ? result.files : result.file ? [String(result.file)] : [];
    job.error = result.ok === false ? String(result.error || result.summary || 'background job failed') : '';
  } catch (err) {
    job.status = 'failed';
    job.error = err instanceof Error ? err.message : String(err);
  } finally {
    job.finished_at = Date.now();
  }
}
