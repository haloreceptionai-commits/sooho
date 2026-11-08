CREATE TABLE public.generation_jobs (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 video_id text NOT NULL REFERENCES public.videos(id),
 user_id uuid NOT NULL,
 status text NOT NULL DEFAULT 'queued' CHECK (status IN ('queued','running','paused','handoff','done','cancelled')),
 request jsonb NOT NULL,
 token_hash text NOT NULL,
 expires_at timestamptz NOT NULL,
 fence bigint NOT NULL DEFAULT 0,
 lease_owner text,
 lease_until timestamptz,
 run_id text,
 error text,
 created_at timestamptz NOT NULL DEFAULT now(),
 updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.generation_jobs TO authenticated;
GRANT ALL ON public.generation_jobs TO service_role;
ALTER TABLE public.generation_jobs ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Owner reads generation jobs" ON public.generation_jobs FOR SELECT TO authenticated USING (user_id = auth.uid());
CREATE UNIQUE INDEX generation_jobs_one_active_video ON public.generation_jobs(video_id) WHERE status IN ('queued','running','paused','handoff');
CREATE TABLE public.generation_steps (
 job_id uuid NOT NULL REFERENCES public.generation_jobs(id),
 step_key text NOT NULL,
 input_hash text NOT NULL,
 status text NOT NULL CHECK (status IN ('intent','complete','uncertain','failed')),
 fence bigint NOT NULL,
 result jsonb,
 error text,
 created_at timestamptz NOT NULL DEFAULT now(),
 updated_at timestamptz NOT NULL DEFAULT now(),
 PRIMARY KEY(job_id,step_key)
);
GRANT SELECT ON public.generation_steps TO authenticated;
GRANT ALL ON public.generation_steps TO service_role;
ALTER TABLE public.generation_steps ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Owner reads generation steps" ON public.generation_steps FOR SELECT TO authenticated USING (EXISTS (SELECT 1 FROM public.generation_jobs j WHERE j.id=job_id AND j.user_id=auth.uid()));
CREATE FUNCTION public.claim_generation_job(p_job uuid,p_hash text,p_owner text) RETURNS bigint LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE j public.generation_jobs; new_fence bigint;
BEGIN
 SELECT * INTO j FROM public.generation_jobs WHERE id=p_job AND token_hash=p_hash FOR UPDATE;
 IF NOT FOUND OR j.expires_at<=now() OR j.status NOT IN ('queued','running') OR length(p_owner)<8 OR length(p_owner)>100 THEN RETURN NULL; END IF;
 IF j.lease_until>now() THEN
  IF j.lease_owner=p_owner THEN RETURN j.fence; END IF;
  RETURN NULL;
 END IF;
 IF EXISTS(SELECT 1 FROM public.generation_steps WHERE job_id=p_job AND status IN ('intent','uncertain')) THEN
  UPDATE public.generation_steps SET status='uncertain',updated_at=now() WHERE job_id=p_job AND status='intent';
  UPDATE public.generation_jobs SET status='paused',error='A paid step has an uncertain result. Reconciliation is required before retry.',updated_at=now() WHERE id=p_job;
  RETURN NULL;
 END IF;
 new_fence=j.fence+1;
 UPDATE public.generation_jobs SET fence=new_fence,status='running',lease_owner=p_owner,lease_until=now()+interval '12 minutes',updated_at=now() WHERE id=p_job;
 RETURN new_fence;
END $$;
CREATE FUNCTION public.heartbeat_generation_job(p_job uuid,p_hash text,p_owner text,p_fence bigint) RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
BEGIN
 UPDATE public.generation_jobs SET lease_until=now()+interval '12 minutes',updated_at=now() WHERE id=p_job AND token_hash=p_hash AND lease_owner=p_owner AND fence=p_fence AND status='running' AND expires_at>now() AND lease_until>now();
 RETURN FOUND;
END $$;
CREATE FUNCTION public.begin_generation_step(p_job uuid,p_hash text,p_owner text,p_fence bigint,p_key text,p_input_hash text) RETURNS text LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE j public.generation_jobs; s public.generation_steps;
BEGIN
 SELECT * INTO j FROM public.generation_jobs WHERE id=p_job AND token_hash=p_hash FOR UPDATE;
 IF NOT FOUND OR j.status<>'running' OR j.expires_at<=now() OR j.lease_until<=now() OR j.lease_owner IS DISTINCT FROM p_owner OR j.fence<>p_fence THEN RETURN 'rejected'; END IF;
 IF p_key !~ '^[a-z0-9][a-z0-9:/_-]{0,119}$' OR p_input_hash !~ '^[a-f0-9]{64}$' THEN RETURN 'rejected'; END IF;
 SELECT * INTO s FROM public.generation_steps WHERE job_id=p_job AND step_key=p_key;
 IF FOUND THEN
  IF s.input_hash<>p_input_hash THEN RETURN 'input_changed'; END IF;
  IF s.status='complete' THEN RETURN 'complete'; END IF;
  RETURN 'uncertain';
 END IF;
 INSERT INTO public.generation_steps(job_id,step_key,input_hash,status,fence) VALUES(p_job,p_key,p_input_hash,'intent',p_fence);
 RETURN 'started';
END $$;
CREATE FUNCTION public.complete_generation_step(p_job uuid,p_hash text,p_owner text,p_fence bigint,p_key text,p_input_hash text,p_result jsonb) RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE j public.generation_jobs;
BEGIN
 SELECT * INTO j FROM public.generation_jobs WHERE id=p_job AND token_hash=p_hash FOR UPDATE;
 IF NOT FOUND OR j.status<>'running' OR j.expires_at<=now() OR j.lease_until<=now() OR j.lease_owner IS DISTINCT FROM p_owner OR j.fence<>p_fence THEN RETURN false; END IF;
 UPDATE public.generation_steps SET status='complete',result=p_result,error=NULL,updated_at=now() WHERE job_id=p_job AND step_key=p_key AND input_hash=p_input_hash AND fence=p_fence AND status='intent';
 IF FOUND THEN RETURN true; END IF;
 RETURN EXISTS(SELECT 1 FROM public.generation_steps WHERE job_id=p_job AND step_key=p_key AND input_hash=p_input_hash AND status='complete' AND result=p_result);
END $$;
CREATE FUNCTION public.cancel_generation_job(p_job uuid,p_user uuid) RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
BEGIN
 UPDATE public.generation_jobs SET status='cancelled',fence=fence+1,lease_owner=NULL,lease_until=NULL,updated_at=now() WHERE id=p_job AND user_id=p_user AND status IN ('queued','running','paused','handoff');
 RETURN FOUND;
END $$;
REVOKE ALL ON FUNCTION public.claim_generation_job(uuid,text,text),public.heartbeat_generation_job(uuid,text,text,bigint),public.begin_generation_step(uuid,text,text,bigint,text,text),public.complete_generation_step(uuid,text,text,bigint,text,text,jsonb),public.cancel_generation_job(uuid,uuid) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.claim_generation_job(uuid,text,text),public.heartbeat_generation_job(uuid,text,text,bigint),public.begin_generation_step(uuid,text,text,bigint,text,text),public.complete_generation_step(uuid,text,text,bigint,text,text,jsonb),public.cancel_generation_job(uuid,uuid) TO service_role;
CREATE FUNCTION public.protect_generation_video() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
BEGIN
 IF current_user IN ('postgres','supabase_admin') OR coalesce(auth.role(),'')='service_role' THEN RETURN NEW; END IF;
 IF EXISTS(SELECT 1 FROM public.generation_jobs WHERE video_id=OLD.id AND status IN ('queued','running','paused','handoff')) THEN RAISE EXCEPTION 'Background generation owns this video'; END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER protect_generation_video_update BEFORE UPDATE ON public.videos FOR EACH ROW EXECUTE FUNCTION public.protect_generation_video();