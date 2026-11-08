CREATE OR REPLACE FUNCTION public.cancel_generation_job(p_job uuid,p_user uuid) RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE v_id text; j public.generation_jobs;
BEGIN
 SELECT video_id INTO v_id FROM public.generation_jobs WHERE id=p_job AND user_id=p_user;
 IF NOT FOUND THEN RETURN false; END IF;
 PERFORM 1 FROM public.videos WHERE id=v_id FOR UPDATE;
 SELECT * INTO j FROM public.generation_jobs WHERE id=p_job AND user_id=p_user FOR UPDATE;
 IF j.status NOT IN ('queued','running','paused','handoff') THEN RETURN false; END IF;
 IF EXISTS(SELECT 1 FROM public.render_jobs WHERE video_id=v_id AND status='done') THEN RETURN false; END IF;
 UPDATE public.generation_jobs SET status='cancelled',fence=fence+1,lease_owner=NULL,lease_until=NULL,updated_at=clock_timestamp() WHERE id=p_job;
 UPDATE public.render_jobs SET status='cancelled',error='Cancelled by owner',updated_at=clock_timestamp() WHERE video_id=v_id AND status NOT IN ('done','failed','cancelled');
 UPDATE public.videos SET data=data||jsonb_build_object('status','failed','removed',true,'detail','Removed from queue','error','Cancelled by owner'),updated_at=clock_timestamp() WHERE id=v_id;
 RETURN true;
END $$;
CREATE FUNCTION public.reflect_generation_render_status() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
BEGIN
 IF NEW.status='done' THEN
 UPDATE public.generation_jobs SET status='done',updated_at=clock_timestamp() WHERE video_id=NEW.video_id AND status='handoff';
 ELSIF NEW.status='failed' THEN
 UPDATE public.generation_jobs SET status='paused',error=NEW.error,updated_at=clock_timestamp() WHERE video_id=NEW.video_id AND status='handoff';
 END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER reflect_generation_render_completion AFTER UPDATE OF status ON public.render_jobs FOR EACH ROW EXECUTE FUNCTION public.reflect_generation_render_status();