-- Private Joblio AI chats (one thread per user). Safe to re-run.
-- Staff only see their own via the app. Admins can review any thread.

CREATE TABLE IF NOT EXISTS public.ai_chats (
  user_id INTEGER PRIMARY KEY REFERENCES public.users(id) ON DELETE CASCADE,
  messages_json TEXT NOT NULL DEFAULT '[]',
  session_json TEXT NOT NULL DEFAULT '{}',
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

NOTIFY pgrst, 'reload schema';
