/**
 * usePermissions — derives UI capability flags from the current user's
 * workspace role (stored in projectStore.myRole after project load).
 *
 * Authorization matrix (§2.6):
 *   owner  → all
 *   admin  → all
 *   editor → view, upload, edit timeline, export
 *   viewer → view only
 *
 * These flags mirror the backend role guards — the backend enforces them
 * authoritatively; the frontend uses them only to disable/hide controls
 * so viewers don't hit confusing 403 errors.
 */

import { useProjectStore } from '@/state/projectStore';
import type { ProjectRole } from '@/state/projectStore';

export interface Permissions {
  role: ProjectRole | null;
  /** editor+ */
  canUpload: boolean;
  /** editor+ */
  canEditTimeline: boolean;
  /** editor+ */
  canExport: boolean;
  /** admin+ */
  canInvite: boolean;
  /** admin+ */
  canManageMembers: boolean;
}

export function usePermissions(): Permissions {
  const role = useProjectStore((s) => s.myRole);

  const isEditor = role === 'owner' || role === 'admin' || role === 'editor';
  const isAdmin  = role === 'owner' || role === 'admin';

  return {
    role,
    canUpload:        isEditor,
    canEditTimeline:  isEditor,
    canExport:        isEditor,
    canInvite:        isAdmin,
    canManageMembers: isAdmin,
  };
}
