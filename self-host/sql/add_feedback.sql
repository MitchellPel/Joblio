-- Bugs & change requests (Settings). Safe to re-run.

CREATE TABLE IF NOT EXISTS public.app_feedback (
  id          BIGSERIAL PRIMARY KEY,
  kind        TEXT NOT NULL DEFAULT 'bug'
                CHECK (kind IN ('bug', 'change')),
  body        TEXT NOT NULL,
  status      TEXT NOT NULL DEFAULT 'open'
                CHECK (status IN ('open', 'done')),
  created_by  BIGINT NOT NULL REFERENCES public.users(id),
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  done_by     BIGINT REFERENCES public.users(id),
  done_at     TIMESTAMPTZ,
  version     INTEGER NOT NULL DEFAULT 1
);

CREATE INDEX IF NOT EXISTS idx_app_feedback_status ON public.app_feedback(status);
CREATE INDEX IF NOT EXISTS idx_app_feedback_created_by ON public.app_feedback(created_by);

CREATE TABLE IF NOT EXISTS public.feedback_seen (
  user_id      BIGINT NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  feedback_id  BIGINT NOT NULL REFERENCES public.app_feedback(id) ON DELETE CASCADE,
  seen_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, feedback_id)
);

DROP TRIGGER IF EXISTS trg_app_feedback_updated_at ON public.app_feedback;
CREATE TRIGGER trg_app_feedback_updated_at
  BEFORE UPDATE ON public.app_feedback
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

NOTIFY pgrst, 'reload schema';
