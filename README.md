# Building Import Hub

Login page plus a private page that lists buildings and imports them from an Excel file
(template included). React + TanStack Start (SPA mode) on **Firebase Hosting**, backed by
**Supabase** (Auth, Postgres with RLS, and an Edge Function for the Excel import).

- Live app: https://rcg-building-import-hub.web.app
- Design notes, SSR decision and issues: [WRITEUP.md](WRITEUP.md)

## Architecture

```
Browser (static SPA, Firebase Hosting)
  ├─ supabase-js ──► Supabase Auth            (email + password login)
  ├─ supabase-js ──► PostgREST /buildings     (RLS: each user sees only their rows)
  └─ functions.invoke("import-buildings") ──► Edge Function (parses .xlsx, inserts rows as the caller)
```

- `supabase/migrations/` – SQL migration (table, grants, RLS policies, index)
- `supabase/functions/import-buildings/` – Excel uploader (Deno). `xlsx.mjs` is the vendored SheetJS 0.20.3 build.
- `firebase.json` – serves `dist/client` and rewrites every route to the SPA shell

## Local development

```sh
cp .env.example .env     # fill in VITE_SUPABASE_URL and VITE_SUPABASE_PUBLISHABLE_KEY
npm install
npm run dev
```

## Deploy

```sh
# Supabase (once per project)
npx supabase login
npx supabase link --project-ref <project-ref>
npx supabase db push
npx supabase functions deploy import-buildings

# Frontend
npm run build
npx firebase-tools deploy --only hosting
```

Then in the Supabase dashboard: Authentication → URL Configuration → set Site URL (and a
Redirect URL) to the Firebase Hosting URL, and create users under Authentication → Users.
