import { Download, ExternalLink } from 'lucide-react';
import {
  canPreviewFile,
  fileNameFromUrl,
  isPptFile,
  resolveAiHelperAssetUrl,
} from '@/lib/ai-helper/deliverables';

interface PxAssistantFilesProps {
  files: string[];
}

export function PxAssistantFiles({ files }: PxAssistantFilesProps): JSX.Element | null {
  if (!files.length) return null;

  return (
    <div className="mt-3 space-y-2 border-t border-border/60 pt-3">
      <p className="text-[11px] font-medium uppercase tracking-[0.1em] text-muted-foreground">
        本轮生成文件
      </p>
      <ul className="space-y-2">
        {files.map((path) => {
          const name = fileNameFromUrl(path);
          const href = resolveAiHelperAssetUrl(path);
          const ppt = isPptFile(name);
          const preview = canPreviewFile(name);

          return (
            <li
              key={path}
              className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-border bg-secondary/30 px-3 py-2"
            >
              <div className="min-w-0">
                <p className="truncate text-[12.5px] font-medium text-foreground" title={name}>
                  {name}
                </p>
                <p className="text-[10.5px] text-muted-foreground">{ppt ? 'PPT' : name.split('.').pop()?.toUpperCase()}</p>
              </div>
              <div className="flex shrink-0 items-center gap-1.5">
                {preview && (
                  <a
                    href={href}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-1 rounded-md border border-[oklch(70%_.15_200_/.35)] bg-[oklch(70%_.15_200_/.1)] px-2 py-1 text-[11px] text-primary hover:bg-[oklch(70%_.15_200_/.18)]"
                  >
                    <ExternalLink className="h-3 w-3" />
                    预览
                  </a>
                )}
                <a
                  href={href}
                  download={ppt ? name : undefined}
                  target={ppt ? '_self' : '_blank'}
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-1 rounded-md border border-border bg-card px-2 py-1 text-[11px] text-foreground hover:border-primary/40"
                >
                  <Download className="h-3 w-3" />
                  下载
                </a>
              </div>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
