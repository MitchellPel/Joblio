-- Joblio AI permission. Safe to re-run.

ALTER TABLE public.users
  ADD COLUMN IF NOT EXISTS can_use_ai BOOLEAN NOT NULL DEFAULT false;

NOTIFY pgrst, 'reload schema';
