CREATE FUNCTION public.start_generation_job(p_video text,p_user uuid,p_settings jsonb,p_hash text) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE v public.videos; j public.generation_jobs; new_id uuid;
BEGIN
 SELECT * INTO v FROM public.videos WHERE id=p_video AND user_id=p_user FOR UPDATE;
 IF NOT FOUND OR p_hash !~ '^[a-f0-9]{64}$' THEN RAISE EXCEPTION 'Video not found'; END IF;
 SELECT * INTO j FROM public.generation_jobs WHERE video_id=p_video AND status IN ('queued','running','paused','handoff') LIMIT 1;
 IF FOUND THEN RETURN jsonb_build_object('id',j.id,'existing',true); END IF;
 IF v.data->>'status'='done' OR v.data ? 'hostedRender' THEN RAISE EXCEPTION 'Video already handed off'; END IF;
 INSERT INTO public.generation_jobs(video_id,user_id,request,token_hash,expires_at) VALUES(p_video,p_user,jsonb_build_object('input',v.data->'input','settings',p_settings),p_hash,clock_timestamp()+interval '24 hours') RETURNING id INTO new_id;
 UPDATE public.videos SET data=data||jsonb_build_object('generationJob',jsonb_build_object('id',new_id,'status','queued'),'status','running','detail','Background generation queued · safe to close after Start is confirmed'),updated_at=clock_timestamp() WHERE id=p_video;
 RETURN jsonb_build_object('id',new_id,'existing',false);
END $$;
REVOKE ALL ON FUNCTION public.start_generation_job(text,uuid,jsonb,text) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.start_generation_job(text,uuid,jsonb,text) TO service_role;