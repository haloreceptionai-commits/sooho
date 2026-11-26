CREATE TABLE public.video_automation (
 workspace_id uuid PRIMARY KEY REFERENCES public.workspaces(id),
 user_id uuid NOT NULL,
 enabled boolean NOT NULL DEFAULT false,
 timezone text NOT NULL DEFAULT 'Europe/London',
 formats text[] NOT NULL DEFAULT ARRAY['short']::text[],
 short_time text NOT NULL DEFAULT '18:00',
 long_time text NOT NULL DEFAULT '18:00',
 short_seconds integer NOT NULL DEFAULT 60,
 long_seconds integer NOT NULL DEFAULT 600,
 focus text NOT NULL DEFAULT '',
 settings jsonb NOT NULL DEFAULT '{}'::jsonb,
 paused_reason text,
 last_checked_at timestamptz,
 updated_at timestamptz NOT NULL DEFAULT now(),
 CONSTRAINT automation_formats CHECK(cardinality(formats) BETWEEN 1 AND 2 AND formats <@ ARRAY['short','long']::text[]),
 CONSTRAINT automation_times CHECK(short_time ~ '^([01][0-9]|2[0-3]):[0-5][0-9]$' AND long_time ~ '^([01][0-9]|2[0-3]):[0-5][0-9]$'),
 CONSTRAINT automation_lengths CHECK(short_seconds BETWEEN 15 AND 90 AND long_seconds BETWEEN 180 AND 1200),
 CONSTRAINT automation_focus CHECK(length(focus) <= 200),
 CONSTRAINT automation_timezone CHECK(timezone='Europe/London')
);
GRANT SELECT ON public.video_automation TO authenticated;
GRANT ALL ON public.video_automation TO service_role;
ALTER TABLE public.video_automation ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Owner reads automation" ON public.video_automation FOR SELECT TO authenticated USING(user_id=auth.uid() AND EXISTS(SELECT 1 FROM public.workspaces w WHERE w.id=workspace_id AND w.user_id=auth.uid()));
CREATE TABLE public.video_automation_runs (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 workspace_id uuid NOT NULL REFERENCES public.video_automation(workspace_id),
 user_id uuid NOT NULL,
 format text NOT NULL CHECK(format IN ('short','long')),
 local_date date NOT NULL,
 publish_at timestamptz NOT NULL,
 generate_at timestamptz NOT NULL,
 video_id text NOT NULL UNIQUE REFERENCES public.videos(id),
 generation_job_id uuid REFERENCES public.generation_jobs(id),
 status text NOT NULL DEFAULT 'queued' CHECK(status IN ('queued','generating','uploading','scheduled','published','paused','cancelled','missed')),
 error text,
 youtube_id text,
 upload_url text,
 upload_offset bigint NOT NULL DEFAULT 0,
 upload_size bigint,
 upload_mime text,
 lease_owner uuid,
 lease_until timestamptz,
 fence bigint NOT NULL DEFAULT 0,
 created_at timestamptz NOT NULL DEFAULT now(),
 updated_at timestamptz NOT NULL DEFAULT now(),
 UNIQUE(workspace_id,format,local_date)
);
GRANT SELECT(id,workspace_id,user_id,format,local_date,publish_at,generate_at,video_id,generation_job_id,status,error,youtube_id,upload_offset,upload_size,created_at,updated_at) ON public.video_automation_runs TO authenticated;
GRANT ALL ON public.video_automation_runs TO service_role;
ALTER TABLE public.video_automation_runs ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Owner reads automation runs" ON public.video_automation_runs FOR SELECT TO authenticated USING(user_id=auth.uid());
CREATE TABLE public.video_automation_runtime (
 key text PRIMARY KEY,
 lease_owner uuid,
 lease_until timestamptz,
 last_checked_at timestamptz
);
GRANT ALL ON public.video_automation_runtime TO service_role;
ALTER TABLE public.video_automation_runtime ENABLE ROW LEVEL SECURITY;
CREATE FUNCTION public.claim_video_automation_tick(p_owner uuid) RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
BEGIN
 INSERT INTO public.video_automation_runtime(key,lease_owner,lease_until,last_checked_at) VALUES('daily',p_owner,now()+interval '2 minutes',now())
 ON CONFLICT(key) DO UPDATE SET lease_owner=p_owner,lease_until=now()+interval '2 minutes',last_checked_at=now() WHERE video_automation_runtime.lease_until IS NULL OR video_automation_runtime.lease_until<now();
 RETURN FOUND;
END $$;
CREATE FUNCTION public.reserve_video_automation_run(p_workspace uuid,p_format text,p_date date,p_publish timestamptz,p_video text,p_hash text) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE a public.video_automation; rid uuid; gj jsonb; inp jsonb;
BEGIN
 SELECT * INTO a FROM public.video_automation WHERE workspace_id=p_workspace FOR UPDATE;
 IF NOT FOUND OR NOT a.enabled OR a.paused_reason IS NOT NULL OR NOT(p_format=ANY(a.formats)) OR p_publish<=now() OR p_publish>now()+interval '1 hour' OR p_hash !~ '^[a-f0-9]{64}$' THEN RETURN NULL; END IF;
 IF EXISTS(SELECT 1 FROM public.video_automation_runs WHERE workspace_id=p_workspace AND format=p_format AND local_date=p_date) THEN RETURN NULL; END IF;
 IF NOT EXISTS(SELECT 1 FROM public.youtube_connections WHERE workspace_id=p_workspace AND user_id=a.user_id) THEN RETURN NULL; END IF;
 inp=jsonb_build_object('topic','Daily history video','format',p_format,'durationSec',CASE WHEN p_format='short' THEN a.short_seconds ELSE a.long_seconds END,'archetype','auto','style',coalesce(a.settings->>'defaultStyle','3D animated cartoon'),'voice','onyx','engine',CASE WHEN p_format='short' THEN 'advanced' ELSE 'own' END);
 INSERT INTO public.videos(id,user_id,data) VALUES(p_video,a.user_id,jsonb_build_object('id',p_video,'workspaceId',p_workspace,'title','Daily history video','description','','input',inp,'status','running','stage','script','progress',0,'detail','Daily automation queued','createdAt',floor(extract(epoch FROM now())*1000)));
 INSERT INTO public.video_automation_runs(workspace_id,user_id,format,local_date,publish_at,generate_at,video_id,status) VALUES(p_workspace,a.user_id,p_format,p_date,p_publish,p_publish-interval '1 hour',p_video,'generating') RETURNING id INTO rid;
 gj=public.start_generation_job(p_video,a.user_id,a.settings,p_hash);
 UPDATE public.generation_jobs SET request=request||jsonb_build_object('automation',jsonb_build_object('id',rid,'focus',a.focus)) WHERE id=(gj->>'id')::uuid;
 UPDATE public.video_automation_runs SET generation_job_id=(gj->>'id')::uuid WHERE id=rid;
 RETURN jsonb_build_object('id',rid,'generationJobId',gj->>'id');
END $$;
CREATE FUNCTION public.claim_video_automation_upload(p_run uuid,p_owner uuid) RETURNS bigint LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE r public.video_automation_runs; a public.video_automation;
BEGIN
 SELECT * INTO r FROM public.video_automation_runs WHERE id=p_run FOR UPDATE;
 IF NOT FOUND OR r.status NOT IN ('generating','uploading') THEN RETURN NULL; END IF;
 SELECT * INTO a FROM public.video_automation WHERE workspace_id=r.workspace_id;
 IF NOT a.enabled OR a.paused_reason IS NOT NULL THEN RETURN NULL; END IF;
 IF r.lease_until>now() AND r.lease_owner IS DISTINCT FROM p_owner THEN RETURN NULL; END IF;
 UPDATE public.video_automation_runs SET lease_owner=p_owner,lease_until=now()+interval '3 minutes',fence=fence+1,updated_at=now() WHERE id=p_run RETURNING fence INTO r.fence;
 RETURN r.fence;
END $$;
REVOKE ALL ON FUNCTION public.claim_video_automation_tick(uuid),public.reserve_video_automation_run(uuid,text,date,timestamptz,text,text),public.claim_video_automation_upload(uuid,uuid) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.claim_video_automation_tick(uuid),public.reserve_video_automation_run(uuid,text,date,timestamptz,text,text),public.claim_video_automation_upload(uuid,uuid) TO service_role;