-- Name colour on board cards. Safe to re-run.

ALTER TABLE public.users
  ADD COLUMN IF NOT EXISTS board_color TEXT;

NOTIFY pgrst, 'reload schema';
