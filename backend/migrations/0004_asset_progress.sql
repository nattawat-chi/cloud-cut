-- CloudCut — add progress_pct column to assets.
-- Populated by the worker as ffmpeg streams `-progress pipe:1` output;
-- read by the frontend through GET /assets to drive the upload progress bar.

ALTER TABLE assets
  ADD COLUMN progress_pct SMALLINT NOT NULL DEFAULT 0
    CHECK (progress_pct BETWEEN 0 AND 100);

-- Backfill: any already-ready asset reports 100% so existing rows aren't stuck at 0.
UPDATE assets SET progress_pct = 100 WHERE status = 'ready';
