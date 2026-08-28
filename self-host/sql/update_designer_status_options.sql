-- Expand designer_status options: keep Proofing/On hold/Waiting/Approved
-- and add Ordered / Printed / Cut / Welded / Application.
-- Safe to re-run. Does NOT clear existing valid values.

ALTER TABLE public.jobs
  ADD COLUMN IF NOT EXISTS designer_status TEXT;

ALTER TABLE public.jobs
  DROP CONSTRAINT IF EXISTS jobs_designer_status_check;

ALTER TABLE public.jobs
  ADD CONSTRAINT jobs_designer_status_check
  CHECK (
    designer_status IS NULL
    OR designer_status IN (
      'proofing', 'on_hold', 'waiting_client', 'approved',
      'ordered', 'printed', 'cut', 'welded', 'application'
    )
  );

NOTIFY pgrst, 'reload schema';
