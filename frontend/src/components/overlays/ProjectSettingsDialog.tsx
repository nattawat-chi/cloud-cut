import { useEffect, useState } from 'react';

import { cn } from '@/lib/utils';
import { ApiError } from '@/services/api';
import { useProjectStore } from '@/state/projectStore';
import { useUIStore } from '@/state/uiStore';

interface Preset {
  label: string;
  fps: number;
  w: number;
  h: number;
}

const PRESETS: Preset[] = [
  { label: '1080p 30fps', fps: 30, w: 1920, h: 1080 },
  { label: '1080p 60fps', fps: 60, w: 1920, h: 1080 },
  { label: '720p 30fps',  fps: 30, w: 1280, h: 720  },
  { label: '4K 30fps',   fps: 30, w: 3840, h: 2160 },
];

function matchPreset(fps: number, w: number, h: number): string {
  const found = PRESETS.find((p) => p.fps === fps && p.w === w && p.h === h);
  return found?.label ?? 'custom';
}

export function ProjectSettingsDialog(): React.ReactElement | null {
  const open   = useUIStore((s) => s.showProjectSettings);
  const toggle = useUIStore((s) => s.toggleProjectSettings);

  const project       = useProjectStore((s) => s.project);
  const updateProject = useProjectStore((s) => s.updateProject);

  const [name, setName]     = useState('');
  const [preset, setPreset] = useState(PRESETS[0]!.label);
  const [saving, setSaving] = useState(false);
  const [error, setError]   = useState<string | null>(null);
  const [saved, setSaved]   = useState(false);

  // Seed form from current project whenever it changes or dialog opens.
  useEffect(() => {
    if (!project || !open) return;
    setName(project.name);
    // Extract w × h from project.resolution string ("1920×1080").
    const [wStr, hStr] = project.resolution.split('×');
    const w = parseInt(wStr ?? '1920', 10);
    const h = parseInt(hStr ?? '1080', 10);
    setPreset(matchPreset(project.fps, w, h));
    setError(null);
    setSaved(false);
  }, [project, open]);

  if (!open || !project) return null;

  const selectedPreset = PRESETS.find((p) => p.label === preset) ?? PRESETS[0]!;

  const onSave = async () => {
    if (!name.trim()) return;
    setSaving(true);
    setError(null);
    setSaved(false);
    try {
      await updateProject({
        name: name.trim(),
        fps: selectedPreset.fps,
        resW: selectedPreset.w,
        resH: selectedPreset.h,
      });
      setSaved(true);
    } catch (e) {
      setError(e instanceof ApiError ? e.message : (e as Error).message);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div
      className="fixed inset-0 z-40 grid place-items-center bg-black/60 backdrop-blur-sm"
      onClick={toggle}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="w-full max-w-sm rounded-lg border border-surface-3 bg-surface-1 p-5 shadow-xl"
      >
        <h2 className="mb-4 text-base font-semibold tracking-tight">Project settings</h2>

        {/* Name */}
        <div className="mb-4">
          <label className="mb-1.5 block text-[11px] uppercase tracking-wide text-text-3">
            Name
          </label>
          <input
            autoFocus
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && void onSave()}
            disabled={saving}
            className={cn(
              'w-full rounded-md border border-line bg-surface-2 px-3 py-1.5',
              'text-sm text-text-1 placeholder:text-text-4',
              'focus:border-accent focus:outline-none',
              'disabled:opacity-50',
            )}
          />
        </div>

        {/* Resolution preset */}
        <div className="mb-5">
          <label className="mb-1.5 block text-[11px] uppercase tracking-wide text-text-3">
            Resolution &amp; frame rate
          </label>
          <div className="grid grid-cols-2 gap-1.5">
            {PRESETS.map((p) => (
              <button
                key={p.label}
                type="button"
                onClick={() => setPreset(p.label)}
                disabled={saving}
                className={cn(
                  'rounded border px-3 py-2 text-left text-xs',
                  preset === p.label
                    ? 'border-accent bg-accent/15 text-text-1'
                    : 'border-line bg-surface-2 text-text-3 hover:text-text-1',
                  'disabled:opacity-50',
                )}
              >
                <div className="font-medium">{p.label}</div>
                <div className="mt-0.5 font-mono text-[10px] text-text-4">
                  {p.w}×{p.h}
                </div>
              </button>
            ))}
          </div>
        </div>

        {saved && (
          <div className="mb-3 rounded border border-emerald-500/40 bg-emerald-500/10 px-3 py-2 text-xs text-emerald-300">
            Settings saved.
          </div>
        )}
        {error && (
          <div className="mb-3 rounded border border-red-500/40 bg-red-500/10 px-3 py-2 text-xs text-red-300">
            {error}
          </div>
        )}

        <div className="flex justify-end gap-2">
          <button
            type="button"
            onClick={toggle}
            className="rounded px-3 py-1.5 text-xs text-text-2 hover:bg-surface-2"
          >
            Close
          </button>
          <button
            type="button"
            onClick={() => void onSave()}
            disabled={saving || !name.trim()}
            className={cn(
              'rounded bg-accent px-3 py-1.5 text-xs font-semibold text-accent-foreground',
              'hover:brightness-110 disabled:opacity-50',
            )}
          >
            {saving ? 'Saving…' : 'Save'}
          </button>
        </div>
      </div>
    </div>
  );
}
