-- Same limits as supabase/functions/_shared/buildings.ts, enforced for every writer (import, edit, direct API).
ALTER TABLE public.buildings
  ADD CONSTRAINT buildings_name_length CHECK (char_length(name) BETWEEN 1 AND 200),
  ADD CONSTRAINT buildings_text_length CHECK (
    char_length(address) <= 200 AND char_length(city) <= 200 AND char_length(country) <= 200
  ),
  ADD CONSTRAINT buildings_floors_range CHECK (floors BETWEEN 0 AND 300),
  ADD CONSTRAINT buildings_year_range CHECK (year_built BETWEEN 1000 AND 2100);
