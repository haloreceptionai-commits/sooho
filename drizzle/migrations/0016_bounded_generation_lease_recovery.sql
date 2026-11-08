ALTER TABLE public.generation_jobs ADD COLUMN recovery_count integer NOT NULL DEFAULT 0;
CREATE FUNCTION public.recover_generation_job(p_job uuid,p_new_hash text) RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE j public.generation_jobs;
BEGIN
 SELECT * INTO j FROM public.generation_jobs WHERE id=p_job FOR UPDATE;
 IF NOT FOUND OR j.status<>'running' OR j.lease_until>=clock_timestamp() OR j.expires_at<=clock_timestamp() OR p_new_hash !~ '^[a-f0-9]{64}$' THEN RETURN false; END IF;
 IF j.recovery_count>=3 OR EXISTS(SELECT 1 FROM public.generation_steps WHERE job_id=p_job AND status IN ('intent','uncertain')) THEN
 UPDATE public.generation_steps SET status='uncertain',updated_at=clock_timestamp() WHERE job_id=p_job AND status='intent';
 UPDATE public.generation_jobs SET status='paused',error='Interrupted step needs review; no automatic paid retry',fence=fence+1,updated_at=clock_timestamp() WHERE id=p_job;
 UPDATE public.videos SET data=data||jsonb_build_object('status','failed','detail','Generation paused · saved work is safe','error','Interrupted step needs review; no automatic paid retry'),updated_at=clock_timestamp() WHERE id=j.video_id;
 RETURN false;
 END IF;
 UPDATE public.generation_jobs SET status='queued',token_hash=p_new_hash,fence=fence+1,lease_owner=NULL,lease_until=NULL,recovery_count=recovery_count+1,updated_at=clock_timestamp() WHERE id=p_job;
 RETURN true;
END $$;
REVOKE ALL ON FUNCTION public.recover_generation_job(uuid,text) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.recover_generation_job(uuid,text) TO service_role;