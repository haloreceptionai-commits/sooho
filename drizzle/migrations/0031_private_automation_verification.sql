ALTER TABLE public.video_automation_runs ADD COLUMN private_test boolean NOT NULL DEFAULT false;
GRANT SELECT(private_test) ON public.video_automation_runs TO authenticated;
ALTER TABLE public.video_automation_runs DROP CONSTRAINT video_automation_runs_workspace_id_format_local_date_key;
ALTER TABLE public.video_automation_runs ADD CONSTRAINT automation_unique_daily_kind UNIQUE(workspace_id,format,local_date,private_test);

CREATE FUNCTION public.start_video_automation_test(p_workspace uuid,p_user uuid,p_format text,p_video text,p_settings jsonb,p_hash text) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE a public.video_automation; r public.video_automation_runs; gj jsonb; inp jsonb; day date := (now() AT TIME ZONE 'Europe/London')::date;
BEGIN
 SELECT * INTO a FROM public.video_automation WHERE workspace_id=p_workspace AND user_id=p_user FOR UPDATE;
 IF NOT FOUND OR p_format NOT IN ('short','long') OR p_hash !~ '^[a-f0-9]{64}$' OR a.paused_reason IS NOT NULL THEN RAISE EXCEPTION 'Private verification is unavailable'; END IF;
 IF NOT EXISTS(SELECT 1 FROM public.workspaces WHERE id=p_workspace AND user_id=p_user) OR NOT EXISTS(SELECT 1 FROM public.youtube_connections WHERE workspace_id=p_workspace AND user_id=p_user) THEN RAISE EXCEPTION 'Workspace channel is unavailable'; END IF;
 SELECT * INTO r FROM public.video_automation_runs WHERE workspace_id=p_workspace AND format=p_format AND local_date=day AND private_test;
 IF FOUND THEN RETURN jsonb_build_object('id',r.id,'generationJobId',r.generation_job_id,'videoId',r.video_id,'existing',true); END IF;
 inp=jsonb_build_object('topic','Private daily automation test','format',p_format,'durationSec',CASE WHEN p_format='short' THEN 30 ELSE 180 END,'archetype','auto','style',coalesce(p_settings->>'defaultStyle','3D animated cartoon'),'voice','onyx','engine',CASE WHEN p_format='short' THEN 'advanced' ELSE 'own' END);
 INSERT INTO public.videos(id,user_id,data) VALUES(p_video,p_user,jsonb_build_object('id',p_video,'workspaceId',p_workspace,'title','Private daily automation test','description','','input',inp,'status','running','stage','script','progress',0,'detail','Private automation verification queued','createdAt',floor(extract(epoch FROM now())*1000)));
 INSERT INTO public.video_automation_runs(workspace_id,user_id,format,local_date,publish_at,generate_at,video_id,status,private_test) VALUES(p_workspace,p_user,p_format,day,now()+interval '6 hours',now(),p_video,'generating',true) RETURNING * INTO r;
 gj=public.start_generation_job(p_video,p_user,p_settings,p_hash);
 UPDATE public.generation_jobs SET request=request||jsonb_build_object('automation',jsonb_build_object('id',r.id,'focus',a.focus)) WHERE id=(gj->>'id')::uuid;
 UPDATE public.video_automation_runs SET generation_job_id=(gj->>'id')::uuid WHERE id=r.id;
 RETURN jsonb_build_object('id',r.id,'generationJobId',gj->>'id','videoId',p_video,'existing',false);
END $$;
REVOKE ALL ON FUNCTION public.start_video_automation_test(uuid,uuid,text,text,jsonb,text) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.start_video_automation_test(uuid,uuid,text,text,jsonb,text) TO service_role;

CREATE OR REPLACE FUNCTION public.reserve_video_automation_run(p_workspace uuid,p_format text,p_date date,p_publish timestamptz,p_video text,p_hash text) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE a public.video_automation; rid uuid; gj jsonb; inp jsonb;
BEGIN
 SELECT * INTO a FROM public.video_automation WHERE workspace_id=p_workspace FOR UPDATE;
 IF NOT FOUND OR NOT a.enabled OR a.paused_reason IS NOT NULL OR NOT(p_format=ANY(a.formats)) OR p_publish<=now() OR p_publish>now()+interval '1 hour' OR p_hash !~ '^[a-f0-9]{64}$' THEN RETURN NULL; END IF;
 IF EXISTS(SELECT 1 FROM public.video_automation_runs WHERE workspace_id=p_workspace AND format=p_format AND local_date=p_date AND NOT private_test) THEN RETURN NULL; END IF;
 IF NOT EXISTS(SELECT 1 FROM public.youtube_connections WHERE workspace_id=p_workspace AND user_id=a.user_id) THEN RETURN NULL; END IF;
 inp=jsonb_build_object('topic','Daily history video','format',p_format,'durationSec',CASE WHEN p_format='short' THEN a.short_seconds ELSE a.long_seconds END,'archetype','auto','style',coalesce(a.settings->>'defaultStyle','3D animated cartoon'),'voice','onyx','engine',CASE WHEN p_format='short' THEN 'advanced' ELSE 'own' END);
 INSERT INTO public.videos(id,user_id,data) VALUES(p_video,a.user_id,jsonb_build_object('id',p_video,'workspaceId',p_workspace,'title','Daily history video','description','','input',inp,'status','running','stage','script','progress',0,'detail','Daily automation queued','createdAt',floor(extract(epoch FROM now())*1000)));
 INSERT INTO public.video_automation_runs(workspace_id,user_id,format,local_date,publish_at,generate_at,video_id,status) VALUES(p_workspace,a.user_id,p_format,p_date,p_publish,p_publish-interval '1 hour',p_video,'generating') RETURNING id INTO rid;
 gj=public.start_generation_job(p_video,a.user_id,a.settings,p_hash);
 UPDATE public.generation_jobs SET request=request||jsonb_build_object('automation',jsonb_build_object('id',rid,'focus',a.focus)) WHERE id=(gj->>'id')::uuid;
 UPDATE public.video_automation_runs SET generation_job_id=(gj->>'id')::uuid WHERE id=rid;
 RETURN jsonb_build_object('id',rid,'generationJobId',gj->>'id');
END $$;
CREATE OR REPLACE FUNCTION public.claim_video_automation_upload(p_run uuid,p_owner uuid) RETURNS bigint LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE r public.video_automation_runs; a public.video_automation;
BEGIN
 SELECT * INTO r FROM public.video_automation_runs WHERE id=p_run FOR UPDATE;
 IF NOT FOUND OR r.status NOT IN ('generating','uploading') THEN RETURN NULL; END IF;
 SELECT * INTO a FROM public.video_automation WHERE workspace_id=r.workspace_id;
 IF NOT FOUND OR (NOT a.enabled AND NOT r.private_test) OR a.paused_reason IS NOT NULL THEN RETURN NULL; END IF;
 IF r.lease_until>now() AND r.lease_owner IS DISTINCT FROM p_owner THEN RETURN NULL; END IF;
 UPDATE public.video_automation_runs SET lease_owner=p_owner,lease_until=now()+interval '3 minutes',fence=fence+1,updated_at=now() WHERE id=p_run RETURNING fence INTO r.fence;
 RETURN r.fence;
END $$;
CREATE OR REPLACE FUNCTION public.complete_video_automation_upload(p_run uuid,p_owner uuid,p_fence bigint,p_youtube text) RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE r public.video_automation_runs;
BEGIN
 SELECT * INTO r FROM public.video_automation_runs WHERE id=p_run FOR UPDATE;
 IF NOT FOUND OR r.status<>'uploading' OR r.lease_owner IS DISTINCT FROM p_owner OR r.fence<>p_fence OR r.lease_until<=now() OR p_youtube !~ '^[A-Za-z0-9_-]{1,64}$' THEN RETURN false; END IF;
 IF NOT r.private_test AND r.publish_at<=now() THEN RETURN false; END IF;
 IF NOT EXISTS(SELECT 1 FROM public.video_automation WHERE workspace_id=r.workspace_id AND (enabled OR r.private_test) AND paused_reason IS NULL) THEN RETURN false; END IF;
 UPDATE public.video_automation_runs SET status='scheduled',youtube_id=p_youtube,upload_offset=upload_size,lease_until=NULL,updated_at=now() WHERE id=p_run;
 UPDATE public.videos SET data=data||jsonb_build_object('youtubeId',p_youtube)||CASE WHEN r.private_test THEN jsonb_build_object('youtubePrivacy','private') ELSE jsonb_build_object('scheduledPublishAt',r.publish_at) END,updated_at=now() WHERE id=r.video_id AND user_id=r.user_id;
 UPDATE public.generation_jobs SET status='done',updated_at=now() WHERE id=r.generation_job_id AND status='handoff';
 RETURN true;
END $$;