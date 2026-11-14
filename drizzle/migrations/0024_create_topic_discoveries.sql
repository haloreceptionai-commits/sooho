CREATE TABLE public.topic_discoveries (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 user_id uuid NOT NULL,
 batch_id uuid NOT NULL,
 fact_key text NOT NULL,
 data jsonb NOT NULL,
 saved boolean NOT NULL DEFAULT false,
 created_at timestamptz NOT NULL DEFAULT now(),
 UNIQUE(user_id, fact_key)
);
GRANT SELECT, INSERT, UPDATE ON public.topic_discoveries TO authenticated;
GRANT ALL ON public.topic_discoveries TO service_role;
ALTER TABLE public.topic_discoveries ENABLE ROW LEVEL SECURITY;
CREATE POLICY topic_owner_select ON public.topic_discoveries FOR SELECT TO authenticated USING (user_id = auth.uid());
CREATE POLICY topic_owner_insert ON public.topic_discoveries FOR INSERT TO authenticated WITH CHECK (user_id = auth.uid());
CREATE POLICY topic_owner_update ON public.topic_discoveries FOR UPDATE TO authenticated USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());
CREATE INDEX topic_owner_batches ON public.topic_discoveries(user_id, created_at DESC);