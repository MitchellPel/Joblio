-- Quote Sizes: boss requests sizes for quoting; staff reply in chat (safe to re-run).

CREATE TABLE IF NOT EXISTS public.quote_sizes (
  id          BIGSERIAL PRIMARY KEY,
  job_name    TEXT NOT NULL,
  scope       TEXT NOT NULL DEFAULT '',
  status      TEXT NOT NULL DEFAULT 'open'
                CHECK (status IN ('open','done')),
  has_image   BOOLEAN NOT NULL DEFAULT false,
  file_name   TEXT NOT NULL DEFAULT '',
  mime_type   TEXT NOT NULL DEFAULT '',
  size        INTEGER NOT NULL DEFAULT 0,
  created_by  BIGINT NOT NULL REFERENCES public.users(id),
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  archived_at TIMESTAMPTZ,
  version     INTEGER NOT NULL DEFAULT 1
);

CREATE INDEX IF NOT EXISTS idx_quote_sizes_archived ON public.quote_sizes(archived_at);
CREATE INDEX IF NOT EXISTS idx_quote_sizes_status ON public.quote_sizes(status);

CREATE TABLE IF NOT EXISTS public.quote_size_notes (
  id             BIGSERIAL PRIMARY KEY,
  quote_size_id  BIGINT NOT NULL REFERENCES public.quote_sizes(id) ON DELETE CASCADE,
  author_id      BIGINT NOT NULL REFERENCES public.users(id),
  body           TEXT NOT NULL DEFAULT '',
  has_image      BOOLEAN NOT NULL DEFAULT false,
  file_name      TEXT NOT NULL DEFAULT '',
  mime_type      TEXT NOT NULL DEFAULT '',
  size           INTEGER NOT NULL DEFAULT 0,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_quote_size_notes_qs ON public.quote_size_notes(quote_size_id);

CREATE TABLE IF NOT EXISTS public.quote_size_mentions (
  id                 BIGSERIAL PRIMARY KEY,
  note_id            BIGINT NOT NULL REFERENCES public.quote_size_notes(id) ON DELETE CASCADE,
  quote_size_id      BIGINT NOT NULL REFERENCES public.quote_sizes(id) ON DELETE CASCADE,
  mentioned_user_id  BIGINT NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  created_by         BIGINT NOT NULL REFERENCES public.users(id),
  created_at         TIMESTAMPTZ NOT NULL DEFAULT now(),
  seen               BOOLEAN NOT NULL DEFAULT false
);

CREATE INDEX IF NOT EXISTS idx_quote_size_mentions_user
  ON public.quote_size_mentions(mentioned_user_id, seen);

CREATE TABLE IF NOT EXISTS public.quote_size_seen (
  user_id        BIGINT NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  quote_size_id  BIGINT NOT NULL REFERENCES public.quote_sizes(id) ON DELETE CASCADE,
  seen_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, quote_size_id)
);

DROP TRIGGER IF EXISTS trg_quote_sizes_updated_at ON public.quote_sizes;
CREATE TRIGGER trg_quote_sizes_updated_at
  BEFORE UPDATE ON public.quote_sizes
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

NOTIFY pgrst, 'reload schema';
