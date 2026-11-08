CREATE OR REPLACE FUNCTION public.cancel_render_job(job_id uuid, owner_id uuid) RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE j public.render_jobs;
BEGIN
 SELECT * INTO j FROM public.render_jobs WHERE id = job_id AND user_id = owner_id FOR UPDATE;
 IF NOT FOUND OR j.status IN ('done','cancelled') THEN RETURN false; END IF;
 UPDATE public.render_jobs SET status = 'cancelled', error = 'Removed from queue', updated_at = now() WHERE id = j.id;
 UPDATE public.videos SET data = data || jsonb_build_object('status','failed','removed',true,'detail','Removed from queue','error','Removed from queue','hostedRender',jsonb_build_object('id',j.id,'status','cancelled')) WHERE id = j.video_id AND user_id = j.user_id;
 RETURN true;
END;
$$;
REVOKE ALL ON FUNCTION public.cancel_render_job(uuid,uuid) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.cancel_render_job(uuid,uuid) TO service_role;
CREATE OR REPLACE FUNCTION public.expire_render_jobs() RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE j public.render_jobs;
BEGIN
 FOR j IN SELECT * FROM public.render_jobs WHERE status IN ('submitting','running','saving') AND expires_at < now() ORDER BY expires_at LIMIT 50 FOR UPDATE SKIP LOCKED LOOP
 UPDATE public.render_jobs SET status = 'failed', error = 'Hosted assembly stopped before completion. Saved inputs are safe; no automatic restart.', updated_at = now() WHERE id = j.id;
 UPDATE public.videos SET data = data || jsonb_build_object('status','failed','error','Hosted assembly stopped before completion. Saved inputs are safe; no automatic restart.','detail','Hosted assembly stopped','hostedRender',jsonb_build_object('id',j.id,'status','failed')) WHERE id = j.video_id AND user_id = j.user_id;
 END LOOP;
END;
$$;
REVOKE ALL ON FUNCTION public.expire_render_jobs() FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.expire_render_jobs() TO service_role;