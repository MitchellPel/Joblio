-- Joblio schema for lean self-host (plain Postgres).
-- No Supabase Auth / Storage catalog. Proofs files stay on the Windows share.

CREATE EXTENSION IF NOT EXISTS "pgcrypto";

CREATE TABLE IF NOT EXISTS public.users (
  id            BIGSERIAL PRIMARY KEY,
  username      TEXT NOT NULL UNIQUE,
  password_hash TEXT NOT NULL,
  role          TEXT NOT NULL DEFAULT 'staff'
                  CHECK (role IN ('admin', 'staff')),
  full_name     TEXT NOT NULL DEFAULT '',
  active        BOOLEAN NOT NULL DEFAULT true,
  can_archive   BOOLEAN NOT NULL DEFAULT false,
  can_move_any  BOOLEAN NOT NULL DEFAULT false,
  can_edit_rigging BOOLEAN NOT NULL DEFAULT false,
  can_edit_vehicle_bookings BOOLEAN NOT NULL DEFAULT false,
  can_create_orders BOOLEAN NOT NULL DEFAULT false,
  can_manage_orders BOOLEAN NOT NULL DEFAULT false,
  can_use_ai BOOLEAN NOT NULL DEFAULT false,
  can_delete_notes BOOLEAN NOT NULL DEFAULT false,
  can_manage_quote_sizes BOOLEAN NOT NULL DEFAULT false,
  board_color   TEXT,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.jobs (
  id             BIGSERIAL PRIMARY KEY,
  job_no         TEXT NOT NULL UNIQUE,
  job_name       TEXT NOT NULL DEFAULT '',
  client         TEXT NOT NULL DEFAULT '',
  contact_name   TEXT,
  contact_phone  TEXT,
  contact_email  TEXT,
  stage          TEXT NOT NULL DEFAULT 'new'
                   CHECK (stage IN ('new','design','production','install','collection','completed')),
  assigned_to    BIGINT REFERENCES public.users(id) ON DELETE SET NULL,
  due_date       DATE,
  scope_notes    TEXT,
  pinned_brief   TEXT,
  job_kind       TEXT CHECK (job_kind IS NULL OR job_kind IN ('vehicle','sign','vinyl')),
  designer_status TEXT,
  created_by     BIGINT NOT NULL REFERENCES public.users(id),
  created_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
  archived_at    TIMESTAMPTZ,
  version        INTEGER NOT NULL DEFAULT 1
);

CREATE INDEX IF NOT EXISTS idx_jobs_stage ON public.jobs(stage);
CREATE INDEX IF NOT EXISTS idx_jobs_assigned ON public.jobs(assigned_to);
CREATE INDEX IF NOT EXISTS idx_jobs_archived ON public.jobs(archived_at);

CREATE TABLE IF NOT EXISTS public.stage_history (
  id          BIGSERIAL PRIMARY KEY,
  job_id      BIGINT NOT NULL REFERENCES public.jobs(id) ON DELETE CASCADE,
  from_stage  TEXT,
  to_stage    TEXT NOT NULL,
  changed_by  BIGINT NOT NULL REFERENCES public.users(id),
  changed_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  note        TEXT
);

CREATE INDEX IF NOT EXISTS idx_stage_history_job ON public.stage_history(job_id);

CREATE TABLE IF NOT EXISTS public.job_notes (
  id         BIGSERIAL PRIMARY KEY,
  job_id     BIGINT NOT NULL REFERENCES public.jobs(id) ON DELETE CASCADE,
  author_id  BIGINT NOT NULL REFERENCES public.users(id),
  body       TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_job_notes_job ON public.job_notes(job_id);

CREATE TABLE IF NOT EXISTS public.note_mentions (
  id                 BIGSERIAL PRIMARY KEY,
  note_id            BIGINT NOT NULL REFERENCES public.job_notes(id) ON DELETE CASCADE,
  job_id             BIGINT NOT NULL REFERENCES public.jobs(id) ON DELETE CASCADE,
  mentioned_user_id  BIGINT NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  created_by         BIGINT NOT NULL REFERENCES public.users(id),
  created_at         TIMESTAMPTZ NOT NULL DEFAULT now(),
  seen               BOOLEAN NOT NULL DEFAULT false
);

CREATE INDEX IF NOT EXISTS idx_note_mentions_user ON public.note_mentions(mentioned_user_id, seen);
CREATE INDEX IF NOT EXISTS idx_note_mentions_job ON public.note_mentions(job_id);

-- Metadata only; image bytes live in \\server\...\proofs\{id}.img
CREATE TABLE IF NOT EXISTS public.job_proofs (
  id             BIGSERIAL PRIMARY KEY,
  job_id         BIGINT NOT NULL REFERENCES public.jobs(id) ON DELETE CASCADE,
  file_name      TEXT NOT NULL,
  mime_type      TEXT NOT NULL,
  size           INTEGER NOT NULL DEFAULT 0,
  storage_path   TEXT NOT NULL DEFAULT '',
  thumb_path     TEXT,
  uploaded_by    BIGINT NOT NULL REFERENCES public.users(id),
  uploaded_name  TEXT,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_job_proofs_job ON public.job_proofs(job_id);

CREATE TABLE IF NOT EXISTS public.checklist_templates (
  id         BIGSERIAL PRIMARY KEY,
  name       TEXT NOT NULL,
  created_by BIGINT NOT NULL REFERENCES public.users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.checklist_template_items (
  id          BIGSERIAL PRIMARY KEY,
  template_id BIGINT NOT NULL REFERENCES public.checklist_templates(id) ON DELETE CASCADE,
  body        TEXT NOT NULL,
  sort_order  INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS public.job_checklist_items (
  id         BIGSERIAL PRIMARY KEY,
  job_id     BIGINT NOT NULL REFERENCES public.jobs(id) ON DELETE CASCADE,
  body       TEXT NOT NULL,
  done       BOOLEAN NOT NULL DEFAULT false,
  sort_order INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_job_checklist_job ON public.job_checklist_items(job_id);

CREATE TABLE IF NOT EXISTS public.rigging_months (
  year_month  TEXT PRIMARY KEY,
  status      TEXT NOT NULL DEFAULT 'active'
                CHECK (status IN ('active','archived')),
  archived_at TIMESTAMPTZ
);

CREATE TABLE IF NOT EXISTS public.rigging_installs (
  id             BIGSERIAL PRIMARY KEY,
  job_id         BIGINT NOT NULL UNIQUE REFERENCES public.jobs(id) ON DELETE CASCADE,
  scheduled_date DATE NOT NULL,
  duration_days  INTEGER NOT NULL DEFAULT 1,
  note           TEXT,
  created_by     BIGINT NOT NULL REFERENCES public.users(id),
  created_at     TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_rigging_installs_date ON public.rigging_installs(scheduled_date);

CREATE TABLE IF NOT EXISTS public.rigging_alerts_sent (
  id          BIGSERIAL PRIMARY KEY,
  user_id     BIGINT NOT NULL REFERENCES public.users(id),
  install_id  BIGINT NOT NULL REFERENCES public.rigging_installs(id) ON DELETE CASCADE,
  alert_type  TEXT NOT NULL CHECK (alert_type IN ('5day','2day','dayof')),
  alert_date  DATE NOT NULL,
  sent_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (user_id, install_id, alert_type, alert_date)
);

CREATE TABLE IF NOT EXISTS public.vehicles (
  id         BIGSERIAL PRIMARY KEY,
  name       TEXT NOT NULL,
  active     BOOLEAN NOT NULL DEFAULT true,
  sort_order INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.vehicle_booking_months (
  year_month  TEXT PRIMARY KEY,
  status      TEXT NOT NULL DEFAULT 'active'
                CHECK (status IN ('active','archived')),
  archived_at TIMESTAMPTZ
);

CREATE TABLE IF NOT EXISTS public.vehicle_bookings (
  id             BIGSERIAL PRIMARY KEY,
  job_id         BIGINT NOT NULL UNIQUE REFERENCES public.jobs(id) ON DELETE CASCADE,
  scheduled_date DATE NOT NULL,
  note           TEXT,
  created_by     BIGINT NOT NULL REFERENCES public.users(id),
  created_at     TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_vehicle_bookings_date ON public.vehicle_bookings(scheduled_date);
CREATE INDEX IF NOT EXISTS idx_vehicle_bookings_job ON public.vehicle_bookings(job_id);

CREATE TABLE IF NOT EXISTS public.orders (
  id          BIGSERIAL PRIMARY KEY,
  job_id      BIGINT REFERENCES public.jobs(id),
  order_name  TEXT NOT NULL DEFAULT '',
  items_body  TEXT NOT NULL DEFAULT '',
  status      TEXT NOT NULL DEFAULT 'open'
                CHECK (status IN ('open','placed','done')),
  created_by  BIGINT NOT NULL REFERENCES public.users(id),
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  archived_at TIMESTAMPTZ,
  version     INTEGER NOT NULL DEFAULT 1
);

CREATE INDEX IF NOT EXISTS idx_orders_archived ON public.orders(archived_at);
CREATE INDEX IF NOT EXISTS idx_orders_status ON public.orders(status);
CREATE INDEX IF NOT EXISTS idx_orders_job ON public.orders(job_id);

CREATE TABLE IF NOT EXISTS public.order_seen (
  user_id   BIGINT NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  order_id  BIGINT NOT NULL REFERENCES public.orders(id) ON DELETE CASCADE,
  seen_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, order_id)
);

CREATE OR REPLACE FUNCTION public.set_updated_at()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_jobs_updated_at ON public.jobs;
CREATE TRIGGER trg_jobs_updated_at
  BEFORE UPDATE ON public.jobs
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

DROP TRIGGER IF EXISTS trg_orders_updated_at ON public.orders;
CREATE TRIGGER trg_orders_updated_at
  BEFORE UPDATE ON public.orders
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

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

-- Image bytes live in \\server\...\Jobtracker\quote-sizes\{id}.img
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

-- LAN self-host: no RLS. Access is limited by office firewall + Docker ports.
-- (Hosted Supabase uses service-role bypass instead.)
