CREATE FUNCTION public.complete_video_automation_upload(p_run uuid,p_owner uuid,p_fence bigint,p_youtube text) RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE r public.video_automation_runs;
BEGIN
 SELECT * INTO r FROM public.video_automation_runs WHERE id=p_run FOR UPDATE;
 IF NOT FOUND OR r.status<>'uploading' OR r.lease_owner IS DISTINCT FROM p_owner OR r.fence<>p_fence OR r.lease_until<=now() OR p_youtube !~ '^[A-Za-z0-9_-]{1,64}$' THEN RETURN false; END IF;
 IF NOT EXISTS(SELECT 1 FROM public.video_automation WHERE workspace_id=r.workspace_id AND enabled AND paused_reason IS NULL) THEN RETURN false; END IF;
 UPDATE public.video_automation_runs SET status='scheduled',youtube_id=p_youtube,upload_offset=upload_size,lease_until=NULL,updated_at=now() WHERE id=p_run;
 UPDATE public.videos SET data=data||jsonb_build_object('youtubeId',p_youtube,'scheduledPublishAt',r.publish_at),updated_at=now() WHERE id=r.video_id AND user_id=r.user_id;
 UPDATE public.generation_jobs SET status='done',updated_at=now() WHERE id=r.generation_job_id AND status='handoff';
 RETURN true;
END $$;
REVOKE ALL ON FUNCTION public.complete_video_automation_upload(uuid,uuid,bigint,text) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.complete_video_automation_upload(uuid,uuid,bigint,text) TO service_role;