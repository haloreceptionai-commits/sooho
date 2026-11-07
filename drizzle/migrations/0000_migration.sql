CREATE TABLE public.videos (
  id text PRIMARY KEY,
  user_id uuid NOT NULL DEFAULT auth.uid(),
  data jsonb NOT NULL,
  file_path text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE ON public.videos TO authenticated;
GRANT ALL ON public.videos TO service_role;
ALTER TABLE public.videos ENABLE ROW LEVEL SECURITY;
CREATE POLICY "own videos read" ON public.videos FOR SELECT TO authenticated USING (auth.uid() = user_id);
CREATE POLICY "own videos insert" ON public.videos FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);
CREATE POLICY "own videos update" ON public.videos FOR UPDATE TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
-- No DELETE policy: saved videos can never be removed from the app.

CREATE POLICY "own video files read" ON storage.objects FOR SELECT TO authenticated
  USING (bucket_id = 'videos' AND (storage.foldername(name))[1] = auth.uid()::text);
CREATE POLICY "own video files insert" ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'videos' AND (storage.foldername(name))[1] = auth.uid()::text);
CREATE POLICY "own video files update" ON storage.objects FOR UPDATE TO authenticated
  USING (bucket_id = 'videos' AND (storage.foldername(name))[1] = auth.uid()::text);