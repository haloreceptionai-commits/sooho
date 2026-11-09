CREATE OR REPLACE FUNCTION public.resume_cartoon_render(job_id uuid, owner_id uuid, review_hash text, next_token_hash text, next_output_path text)
RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE j public.render_jobs; v jsonb;
BEGIN
 SELECT data INTO v FROM public.videos WHERE id = (SELECT video_id FROM public.render_jobs WHERE id = job_id) AND user_id = owner_id FOR UPDATE;
 IF NOT FOUND THEN RETURN false; END IF;
 SELECT * INTO j FROM public.render_jobs WHERE id = job_id AND user_id = owner_id FOR UPDATE;
 IF NOT FOUND OR j.status <> 'failed' OR j.manifest->>'kind' <> 'cartoon' THEN RETURN false; END IF;
 IF EXISTS (SELECT 1 FROM public.render_jobs WHERE video_id = j.video_id AND id <> j.id AND (created_at > j.created_at OR status IN ('submitting','running','saving','review','done'))) THEN RETURN false; END IF;
 IF v->'cartoonReview'->>'hash' IS DISTINCT FROM review_hash OR NOT COALESCE((v->'cartoonReview'->>'approved')::boolean,false) THEN RETURN false; END IF;
 IF next_token_hash !~ '^[a-f0-9]{64}$' OR next_output_path NOT LIKE owner_id::text || '/' || j.video_id || '/generation-output/%' THEN RETURN false; END IF;
 UPDATE public.render_jobs SET status = 'submitting', token_hash = next_token_hash, expires_at = now() + interval '48 hours', output_path = next_output_path, run_id = NULL, error = NULL, updated_at = now() WHERE id = j.id;
 UPDATE public.videos SET data = (data - 'error') || jsonb_build_object('status','running','stage','render','detail','Resuming approved cartoon render','hostedRender',jsonb_build_object('id',j.id,'status','submitting')), updated_at = now() WHERE id = j.video_id AND user_id = owner_id;
 RETURN true;
END; $$;
REVOKE ALL ON FUNCTION public.resume_cartoon_render(uuid,uuid,text,text,text) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.resume_cartoon_render(uuid,uuid,text,text,text) TO service_role;