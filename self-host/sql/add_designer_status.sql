-- Add/expand designer_status on live Docker Postgres (safe to re-run).
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
