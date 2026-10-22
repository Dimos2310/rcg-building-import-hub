# Write-up

**Live app:** https://rcg-building-import-hub.web.app  
**Repository:** https://github.com/Dimos2310/rcg-building-import-hub

## SSR decision: not needed, removed

The app does not need server-side rendering. Every page except the login form sits behind
authentication, so there is nothing for crawlers to index. The session lives in the browser
(supabase-js, localStorage), so the server could not render a signed-in page anyway, and all
data comes from Supabase over HTTPS. The repository already had `defaultSsr: false`, but that
only disables rendering; it was still built as a server app (Nitro, Cloudflare target) and
still contained server-only code. I removed that and switched TanStack Start to SPA mode,
which prerenders one static shell (`_shell.html`) that Firebase serves for every route. The
build output is plain static files, so it runs on Firebase Hosting's free Spark plan.

## What had to change

"No SSR" did not mean "no server". The Excel import was a TanStack `createServerFn`, which needs
a server runtime that static hosting does not have. The original brief also asked for the
uploader to be a Supabase Edge Function, which did not exist. So the import is now an Edge
Function (`supabase/functions/import-buildings`): the browser posts the file as multipart form
data, the function verifies the caller's JWT, parses the workbook, and inserts the rows with the
caller's own token, so the existing RLS policies decide what can be written. The import validates
every row (whole numbers in range, text length), skips duplicates (same name, address and city,
also against rows the user already has) and reports rejected rows by spreadsheet row number
instead of silently storing bad values. I also removed the
now-dead server code (Nitro, the server entry, auth middleware, the service-role client,
Drizzle) and the committed `.env` that pointed at the original Lovable backend.

## Product decisions

Confirmed with the hiring team: data is separated per user and each user can do whatever they
want with their own data. So row-level security stays per user, and the table now has Edit and
Delete (with confirmation) next to Import, the Excel template and an Export button that
downloads the user's current buildings with the same columns as the template. Sign-up stays open,
with email confirmation required, since this is a test and reviewers can create their own account;
it can be switched off in Supabase if the app should be invite-only.

## Deployment choices

- **Frontend:** Firebase Hosting (Spark plan). `firebase.json` rewrites all routes to the SPA shell so deep links like `/buildings` survive a refresh; hashed assets are cached immutably.
- **Backend:** a free-tier Supabase project in eu-west-1. The schema is applied with `supabase db push` from the migration in the repo; the function is deployed with `supabase functions deploy`.
- **Integration:** the frontend gets the Supabase URL and publishable key through `VITE_*` variables at build time. The publishable key is public by design; the service-role key is never used or shipped.
- **User access:** the account for thomas.katsikadakos@redataset.com was created in the Supabase dashboard with "Auto Confirm User", so it can sign in immediately. Credentials are sent separately.

## Issues and fixes

- **Server code in a static build:** see above. The build is now verified to produce only `dist/client`, and I tested deep links (`/`, `/auth`, `/buildings`) with the Firebase Hosting emulator.
- **Supabase refused my first function deploy:** the bundler cannot import from `cdn.sheetjs.com`. The npm `xlsx` package is stuck at 0.18.5 and has known vulnerabilities (prototype pollution, ReDoS), so I vendored the official SheetJS 0.20.3 build next to the function instead of downgrading.
- **Frontend upgrade of the same library:** the browser bundle (template download) also uses SheetJS 0.20.3, installed from SheetJS's own tarball.
- **Stale pages after a deploy:** the `no-cache` header first covered only `/_shell.html`, but `/`, `/auth` and `/buildings` are served through the SPA rewrite and got a one-hour cache, so a browser could show an old version after a redeploy. All HTML routes are now `no-cache`; hashed assets stay immutable.
- **Security headers:** Firebase sends only HSTS by default. I added a CSP restricted to the app itself and the Supabase project, plus `X-Content-Type-Options`, `X-Frame-Options`, a referrer policy and a permissions policy, and checked in Chrome that the app works and other origins are blocked.
- **Error handling:** `functions.invoke` hides the response body in its error object, so the page reads it and shows the function's own message (for example "File too large").
- **Limits:** the function caps uploads at 5 MB and 5000 rows to stay inside the free tier's CPU limits.

## Known limitations

- Free Supabase projects pause after about a week of inactivity; if that happens, resume it from the dashboard.
- Two users importing the same new building at the exact same moment could both insert it; duplicate detection is checked at import time, not enforced by a unique constraint (existing data could already contain duplicates).
- The `previewAuthStorage` helper is Lovable-specific; outside the Lovable preview it falls back to plain `localStorage`, so I left it as is.

## Tests

- 20 unit tests (`npm test`, vitest) cover the validation and duplicate rules in `supabase/functions/_shared/buildings.ts` and the import messages.
- 11 browser tests (`npm run test:e2e`, Playwright) run against the deployed app: route guard, login errors, login/refresh/sign-out, template, import with validation and duplicates, edit, delete, export and rejection of a non-workbook file. The signed-in tests use an existing account passed through `E2E_EMAIL` and `E2E_PASSWORD` and clean up the rows they create.
