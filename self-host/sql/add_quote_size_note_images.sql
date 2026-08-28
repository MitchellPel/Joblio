-- Chat images on Cut / Print List notes (safe to re-run if add_quote_sizes.sql already ran).

ALTER TABLE public.quote_size_notes
  ADD COLUMN IF NOT EXISTS has_image BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE public.quote_size_notes
  ADD COLUMN IF NOT EXISTS file_name TEXT NOT NULL DEFAULT '';
ALTER TABLE public.quote_size_notes
  ADD COLUMN IF NOT EXISTS mime_type TEXT NOT NULL DEFAULT '';
ALTER TABLE public.quote_size_notes
  ADD COLUMN IF NOT EXISTS size INTEGER NOT NULL DEFAULT 0;

NOTIFY pgrst, 'reload schema';
