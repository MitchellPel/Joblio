-- Multi-select job statuses (JSON in designer_status) + optional order job/name.
-- Safe to re-run. Apply on the Joblio Docker Postgres, then reload PostgREST.

-- Allow designer_status to store JSON arrays (e.g. ["urgent","proofing"]) or legacy singles.
ALTER TABLE public.jobs
  DROP CONSTRAINT IF EXISTS jobs_designer_status_check;

-- Orders: job is optional; free-text order_name for name-only orders.
ALTER TABLE public.orders
  ALTER COLUMN job_id DROP NOT NULL;

ALTER TABLE public.orders
  ADD COLUMN IF NOT EXISTS order_name TEXT NOT NULL DEFAULT '';

NOTIFY pgrst, 'reload schema';
