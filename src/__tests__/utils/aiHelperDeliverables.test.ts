import { describe, expect, it } from 'vitest';
import { filterVisibleDeliverables } from '@/lib/ai-helper/deliverables';

describe('AI helper deliverable filtering', () => {
  it('keeps only user-facing generated deliverables', () => {
    const files = filterVisibleDeliverables([
      'https://dev-px-agent.oss-cn-shanghai.aliyuncs.com/ai-helper/tenant/user/projects/ppt-demo/design_spec.md',
      'https://dev-px-agent.oss-cn-shanghai.aliyuncs.com/ai-helper/tenant/user/projects/ppt-demo/spec_lock.md',
      'https://dev-px-agent.oss-cn-shanghai.aliyuncs.com/ai-helper/tenant/user/projects/ppt-demo/notes/total.md',
      'https://dev-px-agent.oss-cn-shanghai.aliyuncs.com/ai-helper/tenant/user/projects/ppt-demo/svg_output/01_slide.svg',
      '/generated/conv/run/overview_manifest.json',
      '/generated/conv/run/overview_metrics.json',
      '/generated/conv/run/overview_report.md',
      '/generated/conv/run/overview_kpi.png',
      'https://dev-px-agent.oss-cn-shanghai.aliyuncs.com/ai-helper/tenant/user/generated/conv/run/ppt_20260529120000.pptx',
    ]);

    expect(files).toEqual([
      '/generated/conv/run/overview_report.md',
      '/generated/conv/run/overview_kpi.png',
      'https://dev-px-agent.oss-cn-shanghai.aliyuncs.com/ai-helper/tenant/user/generated/conv/run/ppt_20260529120000.pptx',
    ]);
  });
});
