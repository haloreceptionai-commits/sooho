ALTER TABLE public.youtube_connections ADD COLUMN IF NOT EXISTS auto_reply boolean NOT NULL DEFAULT false;
CREATE TABLE public.youtube_replies (
  comment_id text PRIMARY KEY,
  user_id uuid NOT NULL,
  video_id text,
  author text,
  comment text,
  reply text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.youtube_replies TO authenticated;
GRANT ALL ON public.youtube_replies TO service_role;
ALTER TABLE public.youtube_replies ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Owner reads replies" ON public.youtube_replies FOR SELECT TO authenticated USING (auth.uid() = user_id);
CREATE INDEX youtube_replies_user_idx ON public.youtube_replies(user_id, created_at DESC);