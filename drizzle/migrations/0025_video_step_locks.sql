CREATE TABLE public.video_step_locks (
  video_id text NOT NULL,
  step text NOT NULL,
  user_id uuid NOT NULL DEFAULT auth.uid(),
  holder text NOT NULL,
  stage text NOT NULL DEFAULT '',
  started_at timestamptz NOT NULL DEFAULT now(),
  expires_at timestamptz NOT NULL,
  PRIMARY KEY (video_id, step)
);
GRANT SELECT, INSERT, UPDATE ON public.video_step_locks TO authenticated;
GRANT ALL ON public.video_step_locks TO service_role;
ALTER TABLE public.video_step_locks ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Owner reads own locks" ON public.video_step_locks FOR SELECT TO authenticated USING (user_id = auth.uid());
CREATE POLICY "Owner takes locks on own videos" ON public.video_step_locks FOR INSERT TO authenticated
  WITH CHECK (user_id = auth.uid() AND EXISTS (SELECT 1 FROM public.videos v WHERE v.id = video_id AND v.user_id = auth.uid()));
CREATE POLICY "Owner renews own locks" ON public.video_step_locks FOR UPDATE TO authenticated
  USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());

-- Atomic claim: succeeds only when the step is free, lapsed, or already held by the same window.
CREATE OR REPLACE FUNCTION public.claim_video_step(_video_id text, _step text, _holder text, _stage text, _ttl_seconds integer)
RETURNS TABLE (holder text, stage text, started_at timestamptz, expires_at timestamptz)
LANGUAGE sql SECURITY INVOKER SET search_path = public AS $$
  INSERT INTO public.video_step_locks AS l (video_id, step, user_id, holder, stage, expires_at)
  VALUES (_video_id, _step, auth.uid(), _holder, left(coalesce(_stage, ''), 200), now() + make_interval(secs => least(greatest(_ttl_seconds, 30), 900)))
  ON CONFLICT (video_id, step) DO UPDATE
    SET holder = excluded.holder, stage = excluded.stage, expires_at = excluded.expires_at,
        started_at = CASE WHEN l.holder = excluded.holder AND l.expires_at >= now() THEN l.started_at ELSE now() END
    WHERE l.expires_at < now() OR l.holder = excluded.holder
  RETURNING l.holder, l.stage, l.started_at, l.expires_at;
$$;
GRANT EXECUTE ON FUNCTION public.claim_video_step(text, text, text, text, integer) TO authenticated;