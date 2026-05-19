import { useEffect, useState } from 'react';

import { cn } from '@/lib/utils';
import { ApiError, exports_, type ExportJobResponse } from '@/services/api';
import { useHistoryStore } from '@/state/historyStore';
import { useProjectStore } from '@/state/projectStore';
import { useUIStore } from '@/state/uiStore';

type Format = 'mp4' | 'webm' | 'mov';
type Resolution = '360' | '720' | '1080' | '2160';

const FORMATS: ReadonlyArray<{ value: Format; label: string }> = [
  { value: 'mp4', label: 'MP4 (H.264 + AAC)' },
  { value: 'webm', label: 'WebM (VP9 + Opus)' },
  { value: 'mov', label: 'MOV (H.264 + AAC)' },
];

const RESOLUTIONS: ReadonlyArray<{ value: Resolution; label: string; size: string }> = [
  { value: '360', label: '360p', size: '640×360' },
  { value: '720', label: '720p HD', size: '1280×720' },
  { value: '1080', label: '1080p Full HD', size: '1920×1080' },
  { value: '2160', label: '4K UHD', size: '3840×2160' },
];

/**
 * Export dialog — opened from the Export button in TopBar.
 * Pick format + resolution, POST to /exports, poll status until done.
 */
export function ExportDialog(): React.ReactElement | null {
  const open = useUIStore((s) => s.showExportDialog);
  const toggle = useUIStore((s) => s.toggleExportDialog);
  const projectId = useProjectStore((s) => s.project?.id);
  const toast = useHistoryStore((s) => s.toast);

  const [format, setFormat] = useState<Format>('mp4');
  const [resolution, setResolution] = useState<Resolution>('1080');
  const [job, setJob] = useState<ExportJobResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  // Poll the job until it terminates
  useEffect(() => {
    if (!job || job.status === 'done' || job.status === 'error') return;
    const interval = window.setInterval(async () => {
      try {
        const updated = await exports_.get(job.id);
        setJob(updated);
        if (updated.status === 'done') {
          toast({ who: 'Export', body: `Done · ${updated.format} ${updated.resolution}p` });
        } else if (updated.status === 'error') {
          toast({ who: 'Export failed', body: updated.error_msg ?? 'unknown' });
        }
      } catch {
        /* network blip — keep polling */
      }
    }, 1500);
    return () => window.clearInterval(interval);
  }, [job, toast]);

  if (!open) return null;

  const onSubmit = async () => {
    if (!projectId) return;
    setSubmitting(true);
    setError(null);
    setJob(null);
    try {
      const r = await exports_.create(projectId, { format, resolution });
      setJob(r.job);
    } catch (e) {
      setError(e instanceof ApiError ? e.message : (e as Error).message);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div
      className="fixed inset-0 z-40 grid place-items-center bg-black/60 backdrop-blur-sm"
      onClick={toggle}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="w-full max-w-md rounded-lg border border-surface-3 bg-surface-1 p-5 shadow-xl"
      >
        <h2 className="text-base font-semibold tracking-tight mb-3">Export project</h2>

        {/* Format */}
        <div className="mb-3">
          <div className="text-[11px] uppercase tracking-wide text-text-3 mb-1.5">Format</div>
          <div className="grid grid-cols-3 gap-1.5">
            {FORMATS.map((f) => (
              <button
                key={f.value}
                type="button"
                onClick={() => setFormat(f.value)}
                disabled={submitting || job?.status === 'processing'}
                className={cn(
                  'text-xs py-1.5 px-2 rounded border',
                  format === f.value
                    ? 'border-accent bg-accent/15 text-text-1'
                    : 'border-line bg-surface-2 text-text-3 hover:text-text-1',
                )}
              >
                {f.value.toUpperCase()}
              </button>
            ))}
          </div>
        </div>

        {/* Resolution — 4 radio buttons per spec */}
        <div className="mb-3">
          <div className="text-[11px] uppercase tracking-wide text-text-3 mb-1.5">Resolution</div>
          <div className="space-y-1">
            {RESOLUTIONS.map((r) => (
              <label
                key={r.value}
                className={cn(
                  'flex items-center justify-between px-3 py-1.5 rounded border cursor-pointer',
                  resolution === r.value
                    ? 'border-accent bg-accent/10'
                    : 'border-line bg-surface-2 hover:border-surface-3',
                )}
              >
                <div className="flex items-center gap-2">
                  <input
                    type="radio"
                    name="resolution"
                    value={r.value}
                    checked={resolution === r.value}
                    onChange={() => setResolution(r.value)}
                    disabled={submitting || job?.status === 'processing'}
                    className="accent-accent"
                  />
                  <span className="text-sm">{r.label}</span>
                </div>
                <span className="text-xs text-text-3">{r.size}</span>
              </label>
            ))}
          </div>
        </div>

        {/* Status */}
        {job && (
          <div
            className={cn(
              'mb-3 px-3 py-2 rounded text-xs border',
              job.status === 'done'
                ? 'bg-emerald-500/10 border-emerald-500/40 text-emerald-300'
                : job.status === 'error'
                ? 'bg-red-500/10 border-red-500/40 text-red-300'
                : 'bg-amber-500/10 border-amber-500/40 text-amber-300',
            )}
          >
            <div className="font-semibold">Status: {job.status}</div>
            {job.status === 'done' && job.output_key && (
              <div className="opacity-80 break-all mt-0.5">{job.output_key}</div>
            )}
            {job.status === 'error' && job.error_msg && (
              <div className="opacity-80 mt-0.5">{job.error_msg}</div>
            )}
          </div>
        )}

        {error && (
          <div className="mb-3 px-3 py-2 rounded text-xs bg-red-500/10 border border-red-500/40 text-red-300">
            {error}
          </div>
        )}

        <div className="flex gap-2 justify-end">
          <button
            type="button"
            onClick={toggle}
            className="text-xs px-3 py-1.5 rounded text-text-2 hover:bg-surface-2"
          >
            Close
          </button>
          <button
            type="button"
            onClick={onSubmit}
            disabled={submitting || job?.status === 'processing' || job?.status === 'queued'}
            className="text-xs px-3 py-1.5 rounded bg-accent text-accent-foreground font-semibold hover:brightness-110 disabled:opacity-50"
          >
            {submitting
              ? 'Submitting…'
              : job?.status === 'processing' || job?.status === 'queued'
              ? 'Processing…'
              : 'Start export'}
          </button>
        </div>
      </div>
    </div>
  );
}
