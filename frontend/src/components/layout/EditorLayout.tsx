import {
  ResizableHandle,
  ResizablePanel,
  ResizablePanelGroup,
} from '@/components/ui/resizable';
import { TopBar } from '@/components/topbar/TopBar';
import { AssetBrowser } from '@/components/assets/AssetBrowser';
import { VideoPlayer } from '@/components/player/VideoPlayer';
import { InspectorPanel } from '@/components/inspector/InspectorPanel';
import { Timeline } from '@/components/timeline/Timeline';

/**
 * Editor shell — 48px top bar over a vertical split:
 *   - Upper row: AssetBrowser | VideoPlayer | InspectorPanel (resizable horizontally)
 *   - Bottom:    Timeline (resizable vertically)
 *
 * Default sizes mirror the prototype's --left-w / --right-w / --bottom-h.
 * `react-resizable-panels` persists ratios via `autoSaveId` so panel sizes
 * survive reloads (and round-trip cleanly across HMR).
 */
export function EditorLayout() {
  return (
    <div className="grid h-screen w-screen grid-rows-[48px_1fr] bg-surface-0 text-foreground">
      <TopBar />

      <ResizablePanelGroup
        direction="vertical"
        autoSaveId="cloudcut:editor:v1"
        className="min-h-0"
      >
        {/* Upper row — assets / player / inspector */}
        <ResizablePanel defaultSize={62} minSize={30}>
          <ResizablePanelGroup direction="horizontal" className="min-h-0">
            <ResizablePanel
              defaultSize={20}
              minSize={14}
              maxSize={35}
              className="border-r border-line bg-surface-1"
            >
              <AssetBrowser />
            </ResizablePanel>

            <ResizableHandle />

            <ResizablePanel defaultSize={55} minSize={30} className="bg-surface-0">
              <VideoPlayer />
            </ResizablePanel>

            <ResizableHandle />

            <ResizablePanel
              defaultSize={25}
              minSize={16}
              maxSize={38}
              className="border-l border-line bg-surface-1"
            >
              <InspectorPanel />
            </ResizablePanel>
          </ResizablePanelGroup>
        </ResizablePanel>

        <ResizableHandle />

        {/* Bottom row — timeline */}
        <ResizablePanel defaultSize={38} minSize={20} maxSize={70}>
          <Timeline />
        </ResizablePanel>
      </ResizablePanelGroup>
    </div>
  );
}
