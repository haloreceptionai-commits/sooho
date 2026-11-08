CREATE OR REPLACE FUNCTION public.recover_cartoon_review(job_id uuid, owner_id uuid, saved_review jsonb)
RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path TO public AS $$
DECLARE j public.render_jobs;
BEGIN
 SELECT * INTO j FROM public.render_jobs WHERE id=job_id AND user_id=owner_id FOR UPDATE;
 IF NOT FOUND OR j.status <> 'failed' OR j.error <> 'Cloud callback unavailable' OR j.manifest->>'kind' <> 'cartoon' THEN RETURN false; END IF;
 UPDATE public.render_jobs SET status='review',error=NULL,expires_at=now()+interval '48 hours',updated_at=now() WHERE id=j.id;
 UPDATE public.videos SET data=data || jsonb_build_object('status','running','error',NULL,'progress',75,'detail','Review recovered cartoon preview and narration timing','cartoonReview',saved_review || '{"approved":false}'::jsonb,'hostedRender',jsonb_build_object('id',j.id,'status','review')),updated_at=now() WHERE id=j.video_id AND user_id=owner_id;
 RETURN true;
END; $$;
REVOKE ALL ON FUNCTION public.recover_cartoon_review(uuid,uuid,jsonb) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.recover_cartoon_review(uuid,uuid,jsonb) TO service_role;