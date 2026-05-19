import { beforeEach, describe, expect, it } from 'vitest';

import { useProjectStore } from './projectStore';

/**
 * These tests stand in for the "command manager" coverage the brief asks for:
 * every timeline mutation goes through one of these store actions, and each
 * action is a pure state transition we can assert on directly.
 */
describe('projectStore', () => {
  beforeEach(() => {
    // Reset to mock so each test is independent of execution order.
    useProjectStore.getState().loadMockProject();
  });

  describe('loadMockProject', () => {
    it('hydrates project + tracks + clips + effects', () => {
      const s = useProjectStore.getState();
      expect(s.project?.id).toBe('proj_01HX');
      expect(s.tracks).toHaveLength(4);
      expect(s.clips).toHaveLength(12);
      expect(Object.keys(s.effects).length).toBeGreaterThan(0);
    });
  });

  describe('addClip', () => {
    it('appends a new clip and returns its id', () => {
      const before = useProjectStore.getState().clips.length;
      const id = useProjectStore.getState().addClip({
        trackId: 'tr_v1',
        assetId: 'a_test',
        posMs: 1000,
        durMs: 5000,
        name: 'test.mp4',
      });
      const after = useProjectStore.getState().clips;
      expect(after).toHaveLength(before + 1);
      // Phase 6.6: addClip emits a `c-tmp_*` optimistic id that gets remapped
      // to the server's UUID once timelineApi.addClip resolves.
      expect(id).toMatch(/^c[-_]/);
      const created = after.find((c) => c.id === id);
      expect(created?.posMs).toBe(1000);
      expect(created?.durMs).toBe(5000);
      expect(created?.name).toBe('test.mp4');
    });

    it('clamps negative posMs to zero and enforces minimum duration', () => {
      const id = useProjectStore.getState().addClip({
        trackId: 'tr_v1',
        assetId: 'a_test',
        posMs: -500,
        durMs: 100,
        name: 'tiny.mp4',
      });
      const created = useProjectStore.getState().clips.find((c) => c.id === id);
      expect(created?.posMs).toBe(0);
      expect(created?.durMs).toBe(400); // floor at 400ms
    });
  });

  describe('moveClip', () => {
    it('updates posMs and bumps version', () => {
      const before = useProjectStore.getState().clips.find((c) => c.id === 'c2');
      useProjectStore.getState().moveClip('c2', 9000);
      const after = useProjectStore.getState().clips.find((c) => c.id === 'c2');
      expect(after?.posMs).toBe(9000);
      expect(after?.version).toBe((before?.version ?? 0) + 1);
    });

    it('floors posMs at zero', () => {
      useProjectStore.getState().moveClip('c2', -1000);
      expect(useProjectStore.getState().clips.find((c) => c.id === 'c2')?.posMs).toBe(0);
    });

    it('moves a clip to a different track when newTrackId provided', () => {
      useProjectStore.getState().moveClip('c2', 9000, 'tr_v2');
      expect(useProjectStore.getState().clips.find((c) => c.id === 'c2')?.trackId).toBe('tr_v2');
    });
  });

  describe('resizeClip', () => {
    it('updates both posMs and durMs', () => {
      useProjectStore.getState().resizeClip('c2', 7000, 12_000);
      const after = useProjectStore.getState().clips.find((c) => c.id === 'c2');
      expect(after?.posMs).toBe(7000);
      expect(after?.durMs).toBe(12_000);
    });

    it('enforces minimum duration of 400ms', () => {
      useProjectStore.getState().resizeClip('c2', 6000, 100);
      expect(useProjectStore.getState().clips.find((c) => c.id === 'c2')?.durMs).toBe(400);
    });
  });

  describe('splitClipAt', () => {
    it('splits a clip into two adjacent halves', () => {
      // c1: tr_v1, posMs 0, durMs 6000
      const before = useProjectStore.getState().clips.filter((c) => c.trackId === 'tr_v1');
      useProjectStore.getState().splitClipAt('c1', 3000);
      const after = useProjectStore.getState().clips.filter((c) => c.trackId === 'tr_v1');
      expect(after.length).toBe(before.length + 1);
      const left = after.find((c) => c.id === 'c1');
      expect(left?.durMs).toBe(3000);
      const right = after.find((c) => c.posMs === 3000 && c.id !== 'c1');
      expect(right?.durMs).toBe(3000);
    });

    it('rejects splits within 200ms of either edge', () => {
      const before = useProjectStore.getState().clips.length;
      useProjectStore.getState().splitClipAt('c1', 50); // too close to start
      expect(useProjectStore.getState().clips).toHaveLength(before);
      useProjectStore.getState().splitClipAt('c1', 5900); // too close to end of 6000
      expect(useProjectStore.getState().clips).toHaveLength(before);
    });
  });

  describe('deleteClips', () => {
    it('removes selected clips and orphaned effects', () => {
      // c2 has 2 effects in MOCK_EFFECTS.
      expect(useProjectStore.getState().effects['c2']).toBeDefined();
      useProjectStore.getState().deleteClips(['c2']);
      const s = useProjectStore.getState();
      expect(s.clips.find((c) => c.id === 'c2')).toBeUndefined();
      expect(s.effects['c2']).toBeUndefined();
    });

    it('is a no-op when called with an empty list', () => {
      const before = useProjectStore.getState().clips.length;
      useProjectStore.getState().deleteClips([]);
      expect(useProjectStore.getState().clips).toHaveLength(before);
    });
  });

  describe('effect actions', () => {
    it('addEffect appends a new fx with type defaults', () => {
      // c3 has no effects in MOCK_EFFECTS.
      useProjectStore.getState().addEffect('c3', 'brightness');
      const list = useProjectStore.getState().effects['c3'];
      expect(list).toHaveLength(1);
      expect(list?.[0]?.type).toBe('brightness');
      expect(list?.[0]?.enabled).toBe(true);
      expect(list?.[0]?.value).toBe(0); // brightness default
    });

    it('toggleEffect flips enabled', () => {
      // c2's fx2 is brightness/contrast — start enabled, toggle off
      const id = useProjectStore.getState().effects['c2']?.[0]?.id;
      expect(id).toBeTruthy();
      useProjectStore.getState().toggleEffect('c2', id!);
      expect(useProjectStore.getState().effects['c2']?.[0]?.enabled).toBe(false);
    });

    it('updateEffect changes value without toggling enabled', () => {
      const id = useProjectStore.getState().effects['c2']?.[0]?.id;
      useProjectStore.getState().updateEffect('c2', id!, 1.55);
      const fx = useProjectStore.getState().effects['c2']?.[0];
      expect(fx?.value).toBe(1.55);
      expect(fx?.enabled).toBe(true);
    });

    it('removeEffect drops the matching effect', () => {
      const id = useProjectStore.getState().effects['c2']?.[0]?.id;
      const before = useProjectStore.getState().effects['c2']?.length ?? 0;
      useProjectStore.getState().removeEffect('c2', id!);
      const after = useProjectStore.getState().effects['c2']?.length ?? 0;
      expect(after).toBe(before - 1);
    });
  });

  describe('toggleTrack', () => {
    it('flips boolean track flags', () => {
      const before = useProjectStore.getState().tracks.find((t) => t.id === 'tr_v1')?.muted;
      useProjectStore.getState().toggleTrack('tr_v1', 'muted');
      const after = useProjectStore.getState().tracks.find((t) => t.id === 'tr_v1')?.muted;
      expect(after).toBe(!before);
    });
  });
});
