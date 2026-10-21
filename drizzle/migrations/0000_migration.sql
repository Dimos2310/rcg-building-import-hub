CREATE TABLE public.buildings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL DEFAULT auth.uid(),
  name text NOT NULL,
  address text,
  city text,
  country text,
  floors integer,
  year_built integer,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.buildings TO authenticated;
GRANT ALL ON public.buildings TO service_role;
ALTER TABLE public.buildings ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users read own buildings" ON public.buildings FOR SELECT TO authenticated USING (auth.uid() = user_id);
CREATE POLICY "Users insert own buildings" ON public.buildings FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users update own buildings" ON public.buildings FOR UPDATE TO authenticated USING (auth.uid() = user_id);
CREATE POLICY "Users delete own buildings" ON public.buildings FOR DELETE TO authenticated USING (auth.uid() = user_id);
CREATE INDEX buildings_user_id_idx ON public.buildings(user_id);