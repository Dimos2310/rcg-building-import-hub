# Building Import Hub – Write-up

**Live app:** <https://rcg-building-import-hub.web.app>  
**Repository:** <https://github.com/Dimos2310/rcg-building-import-hub>  
**Ελληνική έκδοση / Greek version:** [WRITEUP.el.md](WRITEUP.el.md)

## Summary

The app is deployed end to end on free tiers: a static React single-page app on **Firebase
Hosting**, backed by a **Supabase** project (Auth, Postgres with row-level security, and an Edge
Function for the Excel import). I assessed whether SSR was needed, concluded it was not, and
removed it. Beyond getting it running I made the import robust (validation, duplicate handling,
clear feedback), added the data operations a user needs (edit, delete, export), hardened the
deployment, and covered the behaviour with unit and browser tests that run against the live app.

## 1. SSR decision: not needed, removed

Every page except the login form sits behind authentication, so there is nothing for crawlers to
index. The session lives in the browser (supabase-js), so a server could not render a signed-in
page anyway, and all data comes from Supabase over HTTPS. The repository already had
`defaultSsr: false`, but that only disables rendering: it was still built as a server app (Nitro,
Cloudflare target) and still contained server-only code. I switched TanStack Start to SPA mode,
which prerenders one static shell that Firebase serves for every route, and removed the server
code. The build output is plain static files, so it runs on Firebase's free Spark plan.

"No SSR" did not mean "no server": the Excel import was a TanStack server function, which static
hosting cannot run. The project's original README (its Lovable prompt) also asked for the uploader to be a Supabase
Edge Function, but `AGENTS.md` showed it had been built as a server function instead. Moving the
import to an Edge Function solved both problems.

## 2. Architecture

```text
Browser (static SPA on Firebase Hosting)
  ├─ supabase-js ──► Supabase Auth             email + password
  ├─ supabase-js ──► Postgres via PostgREST    row-level security: each user sees only their rows
  └─ functions.invoke("import-buildings") ──► Edge Function: parse, validate, de-duplicate, insert
```

Validation rules live in one pure module (`supabase/functions/_shared/buildings.ts`) used by the
Edge Function, the edit UI and the unit tests. The page talks to Supabase through a small
data-access module (`src/lib/buildings-api.ts`). Three migrations create the table, grants, RLS
policies, value constraints and a cascading link to the user.

## 3. Features

- **Login** with email and password, a private buildings page, and a route guard that redirects signed-out visitors.
- **Per-user data:** every user works only on their own buildings.
- **Excel template** to download, and **Export** of the user's current buildings with the same columns, so a file can be edited and imported again.
- **Import** that validates each row (whole numbers in range, text length), skips duplicates (same name, address and city, ignoring case, also against rows the user already has), and reports rejected rows by spreadsheet row number.
- **Edit in place:** the pencil turns a row into inputs; Enter saves, Escape cancels. Selecting several rows and choosing "Edit selected" edits them together, each with its own values, and "Save all" validates every row first and sends only the rows that changed.
- **Delete** per row or for a selection, always with confirmation.
- **Large tables:** the list and the export read every page, so more than 1000 buildings are never silently cut off.

## 4. Design decisions and why

| Decision | Reasoning | Trade-off accepted |
| --- | --- | --- |
| Static SPA instead of SSR | No SEO need, session is client-side, runs on the free plan | None relevant here |
| Import as an Edge Function, not browser-side | Asked for in the project's original README; enforces size and validation limits on the server; runs with the user's own token so RLS applies | One more deployable to maintain |
| Data separated per user | Confirmed with the hiring team; simplest safe model; enforced by RLS in the database, not by UI code | Users cannot share data |
| One shared validation module, plus database CHECK constraints | Same rules for import, edit and tests; the database still protects itself against direct API calls | Rules must be changed in two places (code and migration) |
| Skip duplicates rather than overwrite | Re-importing the same file is safe and never destroys edits | Two genuinely identical buildings cannot both be imported |
| Reject bad rows individually and import the rest | Typical spreadsheets have a few mistakes; the user sees exactly which rows to fix | A partial import is possible, but it is always reported |
| Inline editing instead of dialogs | Fewer clicks and no context switch; multi-row editing is natural in a table | Setting one value on many rows means typing it per row |
| Sign-up left open, email confirmation required | It is a test, so reviewers can create their own account; strangers still need a real inbox | Can be closed in Supabase if the app should be invite-only |
| Vendored SheetJS 0.20.3 | The npm package is stuck on a version with known vulnerabilities, and Supabase's bundler cannot import from SheetJS's CDN | A 1 MB file lives in the repository |
| Unit tests for rules, browser tests for flows | Rules are pure and cheap to test; the real risk is the integration of hosting, auth, function and RLS, so browser tests run against the deployed app | Browser tests need a real account |

## 5. Deployment

- **Frontend:** Firebase Hosting (Spark plan). `firebase.json` rewrites every route to the SPA shell so deep links such as `/buildings` survive a refresh. Hashed assets are cached immutably; HTML is never cached, so a redeploy shows up immediately.
- **Backend:** free-tier Supabase project in eu-west-1. Schema applied with `supabase db push`, function deployed with `supabase functions deploy`.
- **Integration:** the frontend receives the Supabase URL and publishable key through `VITE_*` variables at build time. The publishable key is public by design; the service-role key is never used or shipped, and the original committed `.env` (which pointed at another backend) was removed.
- **User access:** an account for `thomas.katsikadakos@redataset.com` was created in the dashboard with "Auto Confirm User" and verified to sign in. Credentials are sent separately.

## 6. Security

- Row-level security on every operation; verified that anonymous reads return nothing and anonymous inserts are rejected.
- The Edge Function requires a valid JWT and takes the user id from the token, never from the request.
- Response headers: a Content-Security-Policy limited to the app and the Supabase project, `X-Content-Type-Options`, `X-Frame-Options`, a referrer policy and a permissions policy. I checked in Chrome that the app works and that other origins are blocked.
- Upload limits (5 MB, 5000 rows), text length limits, and whole-number ranges, enforced in the function and again by the database.
- No secrets in the repository or its history.

## 7. Testing

- **26 unit tests** (`npm test`, vitest): validation, duplicate detection, row numbering, pagination, import messages and edit helpers.
- **14 browser tests** (`npm run test:e2e`, Playwright, real Chrome) against the deployed app: route guard, login errors, login/refresh/sign-out, template, import with validation and duplicates, in-place edit with validation errors, multi-row edit and delete, delete with confirmation, export, a table of more than 1000 rows, no hydration errors on load, and rejection of a non-workbook file. Signed-in tests use an account passed through `E2E_EMAIL` and `E2E_PASSWORD` and clean up the rows they create.

## 8. Issues I ran into and how I solved them

- **Server code in a static build.** Switching off SSR was not enough; I replaced Nitro with SPA mode, moved the import to an Edge Function, deleted the dead server code, and confirmed the output is static.
- **Supabase refused my first function deploy.** Its bundler cannot import from `cdn.sheetjs.com`. Instead of downgrading to the vulnerable npm release, I vendored the official 0.20.3 build next to the function.
- **Stale pages after a deploy.** My `no-cache` header matched only `/_shell.html`, but `/`, `/auth` and `/buildings` are served through the rewrite and got a one-hour cache, so a browser could show an old version. I noticed it when a browser kept showing an older build right after a deploy; all HTML routes are now `no-cache`.
- **Silent data loss on import.** The original truncated or blanked bad values without telling anyone. Rows are now validated and rejected with a reason.
- **Lists and exports cut off at 1000 rows.** Supabase returns at most 1000 rows per request while the import accepts up to 5000, so a large import would have looked complete but shown and exported only part of it. The Edge Function already paged correctly; the page and export now use the same helper, with a stable sort so pages never overlap, and a browser test imports 1100 rows to prove it.
- **`npm ci` failed on Node 22 / npm 10.** The lockfile had been written by npm 11 and lacked two optional dependencies. I regenerated it with npm 10 and verified a clean `npm ci` on Node 20, 22 and 25.
- **React hydration error (#418).** With the full development message I found the cause: the static shell is prerendered at `/` (a redirect, so an empty page) but served for every route, and `/auth` tried to render its form on the first client render. The page content is now rendered on the client only (`ClientOnly`), and a browser test guards against the error returning.
- **Test brittleness.** Adding named action buttons made substring cell locators ambiguous, and a row count raced the table load; both were fixed with exact locators and an explicit wait.
- **Error messages.** `functions.invoke` hides the response body in its error object, so the page reads it and shows the function's own message.

## 9. Known limitations and next steps

- **Duplicates are detected at import time, not enforced by a unique constraint.** Adding one would first require cleaning existing data; two users cannot clash because data is per user, but a double submit within the same moment could.
- **CSP allows inline scripts and styles** because the static shell contains inline bootstrap scripts and static hosting cannot issue per-request nonces.
- **Multi-row save is not a single transaction:** rows are saved independently, and any failure stays open for correction with its message.
- Free Supabase projects pause after about a week of inactivity; resume from the dashboard if that happens.
- `npm audit` reports a Vite advisory that affects only the development server, not the static site; I left the dependency range as the project pinned it.
- The Lovable-generated files I did not need to touch keep their original formatting, so the lint formatter reports style issues there; I kept the diff limited to meaningful changes.
- With more time: a unique constraint after a data cleanup, import rate limiting, sorting and virtual scrolling for large tables, CI running the unit and browser tests on every push, and invite-only sign-up.
