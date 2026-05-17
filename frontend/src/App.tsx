import { useEffect } from 'react';

import { CollabSimulator } from '@/components/collaboration/CollabSimulator';
import { EditorLayout } from '@/components/layout/EditorLayout';
import { EffectsBrowser } from '@/components/overlays/EffectsBrowser';
import { HistoryPanel } from '@/components/overlays/HistoryPanel';
import { ShortcutsOverlay } from '@/components/overlays/ShortcutsOverlay';
import { ToastStack } from '@/components/overlays/ToastStack';
import { useKeyboardShortcuts } from '@/hooks/useKeyboardShortcuts';
import { useProjectStore } from '@/state/projectStore';

/**
 * App entry — hydrates the project store, mounts the editor shell, and
 * registers global concerns (keyboard shortcuts, collab simulator, overlays).
 */
export default function App() {
  const loadMockProject = useProjectStore((s) => s.loadMockProject);
  const projectLoaded = useProjectStore((s) => s.project !== null);

  useEffect(() => {
    if (!projectLoaded) loadMockProject();
  }, [projectLoaded, loadMockProject]);

  useKeyboardShortcuts();

  return (
    <>
      <EditorLayout />
      <CollabSimulator />
      <HistoryPanel />
      <ShortcutsOverlay />
      <EffectsBrowser />
      <ToastStack />
    </>
  );
}
