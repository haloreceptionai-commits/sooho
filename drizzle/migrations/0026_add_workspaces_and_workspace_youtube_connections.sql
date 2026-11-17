CREATE TABLE public.workspaces (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  name text NOT NULL CHECK (char_length(btrim(name)) BETWEEN 1 AND 60),
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE ON public.workspaces TO authenticated;
GRANT ALL ON public.workspaces TO service_role;
ALTER TABLE public.workspaces ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Owner reads workspaces" ON public.workspaces FOR SELECT TO authenticated USING (auth.uid() = user_id);
CREATE POLICY "Owner creates workspaces" ON public.workspaces FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Owner updates workspaces" ON public.workspaces FOR UPDATE TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

ALTER TABLE public.youtube_connections ADD COLUMN workspace_id uuid REFERENCES public.workspaces(id) ON DELETE CASCADE;
ALTER TABLE public.youtube_replies ADD COLUMN workspace_id uuid REFERENCES public.workspaces(id) ON DELETE SET NULL;

INSERT INTO public.workspaces (user_id, name)
SELECT user_id, 'Main workspace'
FROM (
  SELECT user_id FROM public.youtube_connections
  UNION
  SELECT user_id FROM public.videos
  UNION
  SELECT user_id FROM public.youtube_replies
) AS existing_users;

UPDATE public.youtube_connections AS c
SET workspace_id = w.id
FROM public.workspaces AS w
WHERE c.user_id = w.user_id AND w.name = 'Main workspace';

UPDATE public.youtube_replies AS r
SET workspace_id = w.id
FROM public.workspaces AS w
WHERE r.user_id = w.user_id AND w.name = 'Main workspace';

ALTER TABLE public.youtube_connections ALTER COLUMN workspace_id SET NOT NULL;
ALTER TABLE public.youtube_connections DROP CONSTRAINT youtube_connections_pkey;
ALTER TABLE public.youtube_connections ADD CONSTRAINT youtube_connections_pkey PRIMARY KEY (workspace_id);
CREATE INDEX youtube_connections_user_id_idx ON public.youtube_connections (user_id);
CREATE INDEX youtube_replies_user_id_workspace_id_idx ON public.youtube_replies (user_id, workspace_id);

CREATE FUNCTION public.ensure_default_workspace()
RETURNS uuid
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public
AS $function$
DECLARE
  caller_id uuid := auth.uid();
  workspace_uuid uuid;
BEGIN
  IF caller_id IS NULL THEN
    RAISE EXCEPTION 'Authentication required' USING ERRCODE = '42501';
  END IF;
  PERFORM pg_advisory_xact_lock(hashtextextended('ensure_default_workspace:' || caller_id::text, 0));
  SELECT id INTO workspace_uuid
  FROM public.workspaces
  WHERE user_id = caller_id
  ORDER BY created_at ASC, id ASC
  LIMIT 1;
  IF workspace_uuid IS NULL THEN
    INSERT INTO public.workspaces (user_id, name)
    VALUES (caller_id, 'Main workspace')
    RETURNING id INTO workspace_uuid;
  END IF;
  RETURN workspace_uuid;
END;
$function$;
REVOKE ALL ON FUNCTION public.ensure_default_workspace() FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.ensure_default_workspace() TO authenticated;