-- Deleting a user removes their buildings instead of leaving orphaned rows.
ALTER TABLE public.buildings
  ADD CONSTRAINT buildings_user_id_fkey
  FOREIGN KEY (user_id) REFERENCES auth.users (id) ON DELETE CASCADE;
