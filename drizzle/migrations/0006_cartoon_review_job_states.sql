CREATE OR REPLACE FUNCTION public.apply_render_event(job_id uuid, job_token text, next_status text, video_patch jsonb, saved_path text)
RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path TO public AS $$
DECLARE j public.render_jobs;
BEGIN
 SELECT * INTO j FROM public.render_jobs WHERE id = job_id AND token_hash = job_token FOR UPDATE;
 IF NOT FOUND OR j.expires_at < now() OR j.status IN ('done','failed','cancelled') THEN RETURN false; END IF;
 IF next_status NOT IN ('submitting','running','saving','review','done','failed') THEN RAISE EXCEPTION 'Invalid state'; END IF;
 IF (video_patch->>'progress')::numeric < (SELECT (data->>'progress')::numeric FROM public.videos WHERE id = j.video_id) THEN video_patch := video_patch - 'progress'; END IF;
 UPDATE public.videos SET data = data || video_patch, file_path = COALESCE(NULLIF(saved_path,''),file_path), updated_at = now() WHERE id = j.video_id AND user_id = j.user_id;
 UPDATE public.render_jobs SET status = next_status, error = COALESCE(video_patch->>'error',error), updated_at = now() WHERE id = j.id;
 RETURN true;
END; $$;
REVOKE ALL ON FUNCTION public.apply_render_event(uuid,text,text,jsonb,text) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.apply_render_event(uuid,text,text,jsonb,text) TO service_role;
CREATE OR REPLACE FUNCTION public.protect_hosted_video()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path TO public AS $$
BEGIN
 IF auth.role() = 'authenticated' AND EXISTS (SELECT 1 FROM public.render_jobs WHERE video_id = OLD.id AND status IN ('submitting','running','saving','review','done')) THEN
   NEW.data := OLD.data; NEW.file_path := OLD.file_path;
 END IF;
 RETURN NEW;
END; $$;
CREATE OR REPLACE FUNCTION public.approve_cartoon_render(job_id uuid, owner_id uuid, review_hash text, next_token_hash text)
RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path TO public AS $$
DECLARE j public.render_jobs; v jsonb;
BEGIN
 SELECT * INTO j FROM public.render_jobs WHERE id = job_id AND user_id = owner_id FOR UPDATE;
 IF NOT FOUND OR j.status <> 'review' OR j.expires_at < now() THEN RETURN false; END IF;
 SELECT data INTO v FROM public.videos WHERE id = j.video_id AND user_id = owner_id;
 IF v->'cartoonReview'->>'hash' IS DISTINCT FROM review_hash OR COALESCE((v->'cartoonReview'->>'approved')::boolean,false) THEN RETURN false; END IF;
 UPDATE public.render_jobs SET status = 'submitting',token_hash = next_token_hash,expires_at = now() + interval '48 hours',updated_at = now() WHERE id = j.id;
 UPDATE public.videos SET data = data || jsonb_build_object('cartoonReview',(v->'cartoonReview') || '{"approved":true}'::jsonb,'detail','Sending approved cartoon to full render','hostedRender',jsonb_build_object('id',j.id,'status','submitting')) WHERE id = j.video_id AND user_id = owner_id;
 RETURN true;
END; $$;
REVOKE ALL ON FUNCTION public.approve_cartoon_render(uuid,uuid,text,text) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.approve_cartoon_render(uuid,uuid,text,text) TO service_role;