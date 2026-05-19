import { useRef } from 'react';
import { UploadIcon } from 'lucide-react';

import { useAssetUpload } from '@/hooks/useAssetUpload';

/** Drag-and-drop + click-to-browse file upload button for the asset panel. */
export function AssetUpload() {
  const inputRef = useRef<HTMLInputElement>(null);
  const { upload, uploading } = useAssetUpload();

  const handleFiles = (files: FileList | null) => {
    if (!files) return;
    for (const file of Array.from(files)) upload(file);
  };

  return (
    <label
      className="flex cursor-pointer items-center gap-2 rounded-md border border-dashed border-line px-3 py-2 text-xs text-text-3 hover:border-accent hover:text-text-2 transition-colors"
      onDragOver={(e) => e.preventDefault()}
      onDrop={(e) => { e.preventDefault(); handleFiles(e.dataTransfer.files); }}
    >
      <UploadIcon size={13} />
      <span>{uploading ? 'Uploading…' : 'Upload media'}</span>
      <input
        ref={inputRef}
        type="file"
        accept="video/*,audio/*,image/*"
        multiple
        className="sr-only"
        onChange={(e) => handleFiles(e.target.files)}
      />
    </label>
  );
}
