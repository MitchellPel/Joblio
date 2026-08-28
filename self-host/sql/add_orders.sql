-- Orders feature for live Docker Postgres (safe to re-run).

ALTER TABLE public.users
  ADD COLUMN IF NOT EXISTS can_create_orders BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE public.users
  ADD COLUMN IF NOT EXISTS can_manage_orders BOOLEAN NOT NULL DEFAULT false;

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

DROP TRIGGER IF EXISTS trg_orders_updated_at ON public.orders;
CREATE TRIGGER trg_orders_updated_at
  BEFORE UPDATE ON public.orders
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

NOTIFY pgrst, 'reload schema';
