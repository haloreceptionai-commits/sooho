CREATE OR REPLACE FUNCTION public.apply_render_event(job_id uuid, job_token text, next_status text, video_patch jsonb, saved_path text) RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE j public.render_jobs;
BEGIN
 SELECT * INTO j FROM public.render_jobs WHERE id = job_id AND token_hash = job_token FOR UPDATE;
 IF NOT FOUND OR j.expires_at < now() OR j.status IN ('done','failed','cancelled') THEN RETURN false; END IF;
 IF next_status NOT IN ('submitting','running','saving','done','failed') THEN RAISE EXCEPTION 'Invalid state'; END IF;
 IF (video_patch->>'progress')::numeric < (SELECT (data->>'progress')::numeric FROM public.videos WHERE id = j.video_id) THEN video_patch := video_patch - 'progress'; END IF;
 UPDATE public.videos SET data = data || video_patch, file_path = COALESCE(saved_path,file_path), updated_at = now() WHERE id = j.video_id AND user_id = j.user_id;
 UPDATE public.render_jobs SET status = next_status, error = COALESCE(video_patch->>'error',error), updated_at = now() WHERE id = j.id;
 RETURN true;
END;
$$;
REVOKE ALL ON FUNCTION public.apply_render_event(uuid,text,text,jsonb,text) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.apply_render_event(uuid,text,text,jsonb,text) TO service_role;