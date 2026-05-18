import { useCallback, useRef, useState } from 'react';

import { ApiError, assets } from '@/services/api';
import { useHistoryStore } from '@/state/historyStore';

interface UploadState {
  uploading: boolean;
  progress: number; // 0–1, only meaningful during PUT
  error: string | null;
}

const KIND_FOR_MIME: Record<string, 'video' | 'audio' | 'image'> = {
  'video/': 'video',
  'audio/': 'audio',
  'image/': 'image',
};

function detectKind(mime: string): 'video' | 'audio' | 'image' | null {
  for (const [prefix, kind] of Object.entries(KIND_FOR_MIME)) {
    if (mime.startsWith(prefix)) return kind;
  }
  return null;
}

/**
 * Three-step upload:
 *   1. POST /assets/presign   → reserve row, get PUT URL
 *   2. PUT to MinIO directly  → bytes never touch the API
 *   3. PATCH /assets/:id/status processing → backend enqueues worker
 */
export function useAssetUpload(workspaceId: string | null | undefined) {
  const [state, setState] = useState<UploadState>({ uploading: false, progress: 0, error: null });
  const inputRef = useRef<HTMLInputElement | null>(null);
  const toast = useHistoryStore((s) => s.toast);

  const upload = useCallback(
    async (file: File) => {
      if (!workspaceId) {
        setState({ uploading: false, progress: 0, error: 'No active workspace' });
        return;
      }
      const kind = detectKind(file.type);
      if (!kind) {
        setState({ uploading: false, progress: 0, error: `Unsupported file type: ${file.type}` });
        return;
      }

      setState({ uploading: true, progress: 0, error: null });

      try {
        // 1. presign
        const presign = await assets.presign(workspaceId, {
          filename: file.name,
          kind,
          size_bytes: file.size,
        });

        // 2. PUT bytes — use XHR for progress events (fetch doesn't expose them)
        await putWithProgress(presign.upload_url, file, (p) =>
          setState((s) => ({ ...s, progress: p })),
        );

        // 3. flip status → backend XADDs the cloudcut:assets stream
        await assets.updateStatus(presign.asset_id, { status: 'processing' });

        setState({ uploading: false, progress: 1, error: null });
        toast({ who: 'Upload', body: `${file.name} uploaded, processing…` });
      } catch (e) {
        const msg = e instanceof ApiError ? e.message : (e as Error).message;
        setState({ uploading: false, progress: 0, error: msg });
        toast({ who: 'Upload failed', body: msg });
      }
    },
    [workspaceId, toast],
  );

  /** Open the OS file picker; calls `upload(file)` on selection. */
  const openPicker = useCallback(() => {
    inputRef.current?.click();
  }, []);

  const onPickerChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0];
      if (file) void upload(file);
      // Reset so picking the same file twice still fires onChange.
      e.target.value = '';
    },
    [upload],
  );

  return { state, openPicker, onPickerChange, inputRef };
}

function putWithProgress(
  url: string,
  file: File,
  onProgress: (fraction: number) => void,
): Promise<void> {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open('PUT', url);
    xhr.setRequestHeader('Content-Type', file.type || 'application/octet-stream');
    xhr.upload.addEventListener('progress', (e) => {
      if (e.lengthComputable) onProgress(e.loaded / e.total);
    });
    xhr.addEventListener('load', () => {
      if (xhr.status >= 200 && xhr.status < 300) resolve();
      else reject(new Error(`MinIO PUT ${xhr.status}: ${xhr.statusText}`));
    });
    xhr.addEventListener('error', () => reject(new Error('Network error during upload')));
    xhr.send(file);
  });
}
