ALTER TABLE public.render_jobs DROP CONSTRAINT render_jobs_status_check;
ALTER TABLE public.render_jobs ADD CONSTRAINT render_jobs_status_check CHECK (status IN ('submitting','running','saving','review','done','failed','cancelled'));
CREATE OR REPLACE FUNCTION public.expire_render_jobs()
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path TO public AS $$
DECLARE j public.render_jobs;
BEGIN
 FOR j IN SELECT * FROM public.render_jobs WHERE status IN ('submitting','running','saving','review') AND expires_at < now() ORDER BY expires_at LIMIT 50 FOR UPDATE SKIP LOCKED LOOP
 UPDATE public.render_jobs SET status = 'failed', error = 'Hosted rendering or review expired. Saved inputs are safe; no automatic restart.', updated_at = now() WHERE id = j.id;
 UPDATE public.videos SET data = data || jsonb_build_object('status','failed','error','Hosted rendering or review expired. Saved inputs are safe; no automatic restart.','detail','Hosted rendering stopped','hostedRender',jsonb_build_object('id',j.id,'status','failed')) WHERE id = j.video_id AND user_id = j.user_id;
 END LOOP;
END; $$;
REVOKE ALL ON FUNCTION public.expire_render_jobs() FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.expire_render_jobs() TO service_role;