import { SliderRow } from './SliderRow';

interface TransformEditorProps {
  clipId: string;
}

/** Position, scale, rotation, and opacity controls for a clip on the canvas. */
export function TransformEditor({ clipId: _clipId }: TransformEditorProps) {
  return (
    <div className="flex flex-col gap-1 px-3.5 pt-2">
      <SliderRow label="X" min={-1920} max={1920} defaultValue={0} step={1} />
      <SliderRow label="Y" min={-1080} max={1080} defaultValue={0} step={1} />
      <SliderRow label="Scale" min={0} max={4} defaultValue={1} step={0.01} />
      <SliderRow label="Rotation" min={-180} max={180} defaultValue={0} step={1} />
      <SliderRow label="Opacity" min={0} max={1} defaultValue={1} step={0.01} />
    </div>
  );
}
