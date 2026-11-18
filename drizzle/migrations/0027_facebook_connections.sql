CREATE TABLE public.facebook_connections (
  workspace_id uuid PRIMARY KEY REFERENCES public.workspaces(id) ON DELETE CASCADE,
  user_id uuid NOT NULL,
  page_id text NOT NULL,
  page_name text NOT NULL,
  page_access_token text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT ALL ON public.facebook_connections TO service_role;
ALTER TABLE public.facebook_connections ENABLE ROW LEVEL SECURITY;
CREATE INDEX facebook_connections_user_idx ON public.facebook_connections(user_id);