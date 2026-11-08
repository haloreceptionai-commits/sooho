REVOKE SELECT ON public.generation_jobs FROM authenticated;
GRANT SELECT(id,video_id,user_id,status,request,expires_at,fence,lease_until,run_id,error,created_at,updated_at) ON public.generation_jobs TO authenticated;
CREATE FUNCTION public.patch_generation_video(p_job uuid,p_hash text,p_owner text,p_fence bigint,p_patch jsonb) RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE j public.generation_jobs;
BEGIN
 SELECT * INTO j FROM public.generation_jobs WHERE id=p_job AND token_hash=p_hash FOR UPDATE;
 IF NOT FOUND OR j.status<>'running' OR j.expires_at<=clock_timestamp() OR j.lease_until<=clock_timestamp() OR j.lease_owner IS DISTINCT FROM p_owner OR j.fence<>p_fence THEN RETURN false; END IF;
 UPDATE public.videos SET data=data || p_patch,updated_at=clock_timestamp() WHERE id=j.video_id AND user_id=j.user_id;
 RETURN FOUND;
END $$;
CREATE FUNCTION public.handoff_generation_job(p_job uuid,p_hash text,p_owner text,p_fence bigint) RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
BEGIN
 UPDATE public.generation_jobs SET status='handoff',lease_owner=NULL,lease_until=NULL,updated_at=clock_timestamp() WHERE id=p_job AND token_hash=p_hash AND status='running' AND lease_owner=p_owner AND fence=p_fence AND lease_until>clock_timestamp() AND expires_at>clock_timestamp() AND EXISTS(SELECT 1 FROM public.render_jobs r WHERE r.video_id=generation_jobs.video_id AND r.status NOT IN ('failed','cancelled'));
 RETURN FOUND;
END $$;
CREATE FUNCTION public.pause_generation_job(p_job uuid,p_hash text,p_owner text,p_fence bigint,p_error text) RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE j public.generation_jobs;
BEGIN
 SELECT * INTO j FROM public.generation_jobs WHERE id=p_job AND token_hash=p_hash FOR UPDATE;
 IF NOT FOUND OR j.status<>'running' OR j.lease_owner IS DISTINCT FROM p_owner OR j.fence<>p_fence THEN RETURN false; END IF;
 UPDATE public.generation_jobs SET status='paused',error=left(p_error,2000),fence=fence+1,lease_until=NULL,lease_owner=NULL,updated_at=clock_timestamp() WHERE id=p_job;
 UPDATE public.generation_steps SET status='uncertain',error=left(p_error,2000),updated_at=clock_timestamp() WHERE job_id=p_job AND status='intent';
 UPDATE public.videos SET data=data||jsonb_build_object('status','failed','detail','Generation paused · saved work is safe','error',left(p_error,2000)),updated_at=clock_timestamp() WHERE id=j.video_id;
 RETURN true;
END $$;
REVOKE ALL ON FUNCTION public.patch_generation_video(uuid,text,text,bigint,jsonb),public.handoff_generation_job(uuid,text,text,bigint),public.pause_generation_job(uuid,text,text,bigint,text) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.patch_generation_video(uuid,text,text,bigint,jsonb),public.handoff_generation_job(uuid,text,text,bigint),public.pause_generation_job(uuid,text,text,bigint,text) TO service_role;