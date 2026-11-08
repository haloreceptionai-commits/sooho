CREATE OR REPLACE FUNCTION public.protect_generation_video() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
BEGIN
 IF coalesce(auth.role(),'')='authenticated' AND EXISTS(SELECT 1 FROM public.generation_jobs WHERE video_id=OLD.id AND status IN ('queued','running','paused','handoff','done','cancelled')) THEN RAISE EXCEPTION 'Background generation owns this video'; END IF;
 RETURN NEW;
END $$;