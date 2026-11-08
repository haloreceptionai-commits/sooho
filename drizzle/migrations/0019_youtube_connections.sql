CREATE TABLE public.youtube_connections (
  user_id uuid PRIMARY KEY,
  refresh_token text NOT NULL,
  channel_id text,
  channel_title text,
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT ALL ON public.youtube_connections TO service_role;
ALTER TABLE public.youtube_connections ENABLE ROW LEVEL SECURITY;
-- No user policies: refresh tokens are only read by server code.