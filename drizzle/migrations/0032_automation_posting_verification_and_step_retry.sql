ALTER TABLE public.video_automation ADD COLUMN posting_verified_at timestamptz, ADD COLUMN posting_verified_youtube_id text;
ALTER TABLE public.generation_steps ADD COLUMN retries integer NOT NULL DEFAULT 0;

CREATE FUNCTION public.retry_generation_step(p_job uuid,p_hash text,p_owner text,p_fence bigint,p_key text,p_input_hash text) RETURNS text LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE j public.generation_jobs; s public.generation_steps;
BEGIN
 SELECT * INTO j FROM public.generation_jobs WHERE id=p_job AND token_hash=p_hash FOR UPDATE;
 IF NOT FOUND OR j.status<>'running' OR j.expires_at<=clock_timestamp() OR j.lease_until<=clock_timestamp() OR j.lease_owner IS DISTINCT FROM p_owner OR j.fence<>p_fence THEN RETURN 'rejected'; END IF;
 SELECT * INTO s FROM public.generation_steps WHERE job_id=p_job AND step_key=p_key FOR UPDATE;
 IF NOT FOUND OR s.input_hash<>p_input_hash THEN RETURN 'uncertain'; END IF;
 IF s.status='complete' THEN RETURN 'complete'; END IF;
 IF s.status NOT IN ('intent','uncertain') OR s.retries>=1 THEN RETURN 'uncertain'; END IF;
 -- A cut-off request can still finish on its own; wait until no original call can be alive.
 IF s.updated_at > clock_timestamp() - interval '3 minutes' THEN RETURN 'wait'; END IF;
 UPDATE public.generation_steps SET status='intent',retries=retries+1,fence=p_fence,error=NULL,updated_at=clock_timestamp() WHERE job_id=p_job AND step_key=p_key;
 RETURN 'started';
END $$;
REVOKE ALL ON FUNCTION public.retry_generation_step(uuid,text,text,bigint,text,text) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.retry_generation_step(uuid,text,text,bigint,text,text) TO service_role;