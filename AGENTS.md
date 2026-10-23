<!-- LOVABLE:BEGIN -->
> [!IMPORTANT]
> This project is connected to [Lovable](https://lovable.dev). Avoid rewriting
> published git history — force pushing, or rebasing/amending/squashing commits
> that are already pushed — as it rewrites history on Lovable's side and the
> user will likely lose their project history.
>
> Commits you push to the connected branch sync back to Lovable and show up in
> the editor, so keep the branch in a working state.
<!-- LOVABLE:END -->
- SSR is disabled app-wide via `defaultSsr: false` in src/start.ts, and the app is built as a static SPA (`spa.enabled` and `nitro: false` in vite.config.ts). Firebase Hosting serves `dist/client`.
- Excel import runs in the Supabase Edge Function supabase/functions/import-buildings, not in a TanStack server function. Validation and duplicate rules are shared in supabase/functions/_shared.
- SQL migrations live in supabase/migrations and are applied with `supabase db push`.
