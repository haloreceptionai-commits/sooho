CREATE OR REPLACE FUNCTION public.apply_render_event(job_id uuid, job_token text, next_status text, video_patch jsonb, saved_path text) RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE j public.render_jobs; v_id text; g public.generation_jobs;
BEGIN
 SELECT video_id INTO v_id FROM public.render_jobs WHERE id=job_id AND token_hash=job_token;
 IF NOT FOUND THEN RETURN false; END IF;
 PERFORM 1 FROM public.videos WHERE id=v_id FOR UPDATE;
 SELECT * INTO g FROM public.generation_jobs WHERE video_id=v_id ORDER BY created_at DESC LIMIT 1 FOR UPDATE;
 IF FOUND AND g.status='cancelled' THEN RETURN false; END IF;
 SELECT * INTO j FROM public.render_jobs WHERE id=job_id AND token_hash=job_token FOR UPDATE;
 IF NOT FOUND OR j.expires_at<clock_timestamp() OR j.status IN ('failed','cancelled') THEN RETURN false; END IF;
 IF j.status='done' THEN RETURN next_status='done' AND (saved_path='' OR saved_path=j.output_path); END IF;
 IF next_status NOT IN ('submitting','running','saving','review','done','failed') THEN RAISE EXCEPTION 'Invalid state'; END IF;
 IF saved_path<>'' AND saved_path<>j.output_path THEN RETURN false; END IF;
 IF (video_patch->>'progress')::numeric < (SELECT (data->>'progress')::numeric FROM public.videos WHERE id=v_id) THEN video_patch:=video_patch-'progress'; END IF;
 UPDATE public.videos SET data=data||video_patch,file_path=coalesce(nullif(saved_path,''),file_path),updated_at=clock_timestamp() WHERE id=v_id AND user_id=j.user_id;
 UPDATE public.render_jobs SET status=next_status,error=coalesce(video_patch->>'error',error),updated_at=clock_timestamp() WHERE id=j.id;
 RETURN true;
END $$;