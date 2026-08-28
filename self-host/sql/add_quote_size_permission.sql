-- Cut / Print List: staff can post/edit/complete/delete when this is on. Safe to re-run.

ALTER TABLE public.users
  ADD COLUMN IF NOT EXISTS can_manage_quote_sizes BOOLEAN NOT NULL DEFAULT false;

NOTIFY pgrst, 'reload schema';
