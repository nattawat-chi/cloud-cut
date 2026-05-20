import { useEffect, useState } from 'react';

import { AuthPage } from '@/components/auth/AuthPage';
import { CollaboratorList } from '@/collaboration/CollaboratorList';
import { EditorLayout } from '@/components/layout/EditorLayout';
import { EffectsBrowser } from '@/components/overlays/EffectsBrowser';
import { ExportDialog } from '@/components/overlays/ExportDialog';
import { HistoryPanel } from '@/components/overlays/HistoryPanel';
import { MembersPanel } from '@/components/overlays/MembersPanel';
import { ProjectSettingsDialog } from '@/components/overlays/ProjectSettingsDialog';
import { ShortcutsOverlay } from '@/components/overlays/ShortcutsOverlay';
import { ToastStack } from '@/components/overlays/ToastStack';
import { useKeyboardShortcuts } from '@/hooks/useKeyboardShortcuts';
import { ApiError } from '@/services/api';
import { selectIsAuthenticated, useAuthStore } from '@/state/authStore';
import { useProjectStore } from '@/state/projectStore';

/**
 * App entry — gates on auth, hydrates the first available project, then mounts
 * the editor shell with global overlays.
 */
export default function App() {
  const authed = useAuthStore(selectIsAuthenticated);
  const projectLoaded = useProjectStore((s) => s.project !== null);
  const refreshWorkspaces = useProjectStore((s) => s.refreshWorkspaces);
  const selectWorkspace = useProjectStore((s) => s.selectWorkspace);
  const loadMockProject = useProjectStore((s) => s.loadMockProject);
  const setMyRole = useProjectStore((s) => s.setMyRole);
  const logout = useAuthStore((s) => s.logout);

  const [bootstrapError, setBootstrapError] = useState<string | null>(null);

  useEffect(() => {
    if (!authed) return;
    if (projectLoaded) return;
    let cancelled = false;

    (async () => {
      try {
        // 1. Hydrate the workspace list — feeds the TopBar workspace dropdown.
        await refreshWorkspaces();
        if (cancelled) return;
        const wsList = useProjectStore.getState().availableWorkspaces;
        if (!wsList[0]) throw new Error('You have no workspaces yet. Create one in the database.');

        // 2. Switch into the first workspace — this also lists its projects
        //    (feeds the project dropdown) and loads the first project.
        await selectWorkspace(wsList[0].id);
        if (cancelled) return;

        const projects = useProjectStore.getState().availableProjects;
        if (!projects[0]) {
          throw new Error('No projects in your workspace. Run the seed migration or create one via API.');
        }
      } catch (e) {
        if (cancelled) return;
        const msg = e instanceof ApiError ? e.message : (e as Error).message;

        // 401 = session truly dead (token expired AND refresh failed).
        // Kick to login — mock fallback here would poison the editor with
        // string IDs that break every follow-up API call (e.g. asset list).
        if (e instanceof ApiError && e.status === 401) {
          void logout();
          return;
        }

        setBootstrapError(msg);
        // Backend down / no workspaces: fall back to mock. Default to editor
        // so the mock session is fully interactive.
        setMyRole('editor');
        loadMockProject();
      }
    })();

    return () => { cancelled = true; };
  }, [authed, projectLoaded, refreshWorkspaces, selectWorkspace, loadMockProject, setMyRole]);

  useKeyboardShortcuts();

  if (!authed) return <AuthPage />;

  return (
    <>
      <EditorLayout />
      <CollaboratorList />
      <HistoryPanel />
      <MembersPanel />
      <ProjectSettingsDialog />
      <ShortcutsOverlay />
      <EffectsBrowser />
      <ExportDialog />
      <ToastStack />
      {bootstrapError && (
        <div className="fixed bottom-3 left-3 z-50 max-w-md bg-amber-500/10 border border-amber-500/40 text-amber-300 text-xs rounded px-3 py-2">
          <div className="font-semibold mb-0.5">Backend warning · using mock data</div>
          <div className="opacity-80">{bootstrapError}</div>
          <button onClick={() => { void logout(); }} className="mt-1 underline">
            Sign out
          </button>
        </div>
      )}
    </>
  );
}
