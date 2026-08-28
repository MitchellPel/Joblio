-- Vehicle/rigging calendar extras + delete-notes permission. Safe to re-run.

ALTER TABLE public.users
  ADD COLUMN IF NOT EXISTS can_delete_notes BOOLEAN NOT NULL DEFAULT false;

ALTER TABLE public.rigging_installs
  ADD COLUMN IF NOT EXISTS duration_days INTEGER NOT NULL DEFAULT 1;

NOTIFY pgrst, 'reload schema';
