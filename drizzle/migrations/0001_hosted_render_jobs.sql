CREATE TABLE public.render_jobs (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 video_id text NOT NULL UNIQUE REFERENCES public.videos(id),
 user_id uuid NOT NULL,
 status text NOT NULL DEFAULT 'submitting' CHECK (status IN ('submitting','running','saving','done','failed','cancelled')),
 token_hash text NOT NULL,
 expires_at timestamptz NOT NULL,
 run_id text,
 manifest jsonb NOT NULL,
 output_path text NOT NULL,
 error text,
 created_at timestamptz NOT NULL DEFAULT now(),
 updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.render_jobs TO authenticated;
GRANT ALL ON public.render_jobs TO service_role;
ALTER TABLE public.render_jobs ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Owner reads render jobs" ON public.render_jobs FOR SELECT TO authenticated USING (user_id = auth.uid());
CREATE OR REPLACE FUNCTION public.protect_hosted_video() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
 IF auth.role() = 'authenticated' AND EXISTS (SELECT 1 FROM public.render_jobs WHERE video_id = OLD.id AND status IN ('submitting','running','saving','done')) THEN
   NEW.data := OLD.data;
   NEW.file_path := OLD.file_path;
 END IF;
 RETURN NEW;
END;
$$;
CREATE TRIGGER protect_hosted_video BEFORE UPDATE ON public.videos FOR EACH ROW EXECUTE FUNCTION public.protect_hosted_video();