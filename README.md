# Optima

**Adaptive AI macro tracker.** Optima pulls your real energy expenditure from a wearable, computes a *rolling* maintenance baseline instead of a static formula, and uses multimodal AI to make food logging nearly frictionless.

The core idea: your true maintenance (TDEE) isn't a fixed number from a calculator — it's the **7-day rolling average of your actual daily burn**, which smooths out training-day spikes and rest days to find what you really maintain on. Your calorie target is then that baseline plus your goal offset (Cut / Maintain / Bulk).

## Features

- **Wearable sync** — Google Health API (OAuth 2.0 + PKCE, encrypted tokens). Backfills 7 days of calories-out + steps per sync.
- **Adaptive TDEE** — 7-day rolling average of `caloriesOut`, filtering out unworn/failed-sync days (`< 1200 kcal`) so the baseline stays honest.
- **Multimodal food logging** — snap a photo *and/or* type a description ("Chipotle bowl, double chicken, extra guac"); Gemini estimates macros into a strict JSON schema. Always editable before saving.
- **One-tap quick-add & recents** — log a text meal in one tap, or re-log a frequent meal from recent chips with **no** AI call.
- **Diary & Macro Assistant** — review/edit/delete the day's meals; get AI meal suggestions that fill your remaining macro gaps.
- **Custom goal offsets** — set your own Cut/Bulk deltas, persisted per user.
- **Real auth** — Supabase Auth (email/password) with route-protecting middleware; all data keyed to `auth.uid()`.
- **PWA** — installable to your phone's home screen, offline app-shell cache.

## Tech Stack

| Layer | Choice |
|---|---|
| Framework | **Next.js 14** (App Router, TypeScript, PWA) |
| Database | **PostgreSQL** via **Supabase** + **Prisma** ORM |
| Auth | **Supabase Auth** (`@supabase/ssr`) + Next.js middleware |
| AI | **Google Gemini** (vision + text, structured JSON output) |
| Wearable data | **Google Health API** (successor to the Fitbit Web API) |
| Data fetching | **TanStack Query** · **Zustand** for local UI state |
| Hosting | **Vercel** |

## Getting Started (Local Setup)

**Prerequisites:** Node.js 20+, a free [Supabase](https://supabase.com) project, a [Google AI Studio](https://ai.google.dev) key, and Google Cloud OAuth credentials for the Google Health API.

```bash
# 1. Install dependencies
npm install

# 2. Configure environment
cp .env.example .env      # then fill in the values (see table below)

# 3. Create the database tables in Supabase
npm run db:push

# 4. (Optional) seed mock burn + meal data to exercise the TDEE math
npm run db:seed

# 5. Run it
npm run dev               # http://localhost:3000
```

Then in **Supabase → Authentication → Providers**, enable **Email** (toggle off "Confirm email" for quick local testing). Visit `/login` to create an account.

> **Note:** the `FITBIT_*` environment variable names are legacy — the app was migrated from the (deprecating) Fitbit Web API to the Google Health API, so these now hold your **Google** OAuth credentials.

## Environment Variables

All are required unless marked optional. **Never commit real values** — `.env` is gitignored; only `.env.example` is tracked.

| Variable | Example / Placeholder | Purpose |
|---|---|---|
| `DATABASE_URL` | `postgresql://postgres.<ref>:<pw>@aws-0-<region>.pooler.supabase.com:6543/postgres?pgbouncer=true` | Pooled connection (app runtime) |
| `DIRECT_URL` | `postgresql://postgres.<ref>:<pw>@aws-0-<region>.pooler.supabase.com:5432/postgres` | Direct connection (Prisma migrations) |
| `NEXT_PUBLIC_SUPABASE_URL` | `https://<ref>.supabase.co` | Supabase project URL (public) |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | `sb_publishable_xxx` or `eyJhbGci...` | Supabase anon/publishable key (public) |
| `TOKEN_ENCRYPTION_KEY` | `<64 hex chars>` | AES-256-GCM key for wearable tokens. Generate: `node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"` |
| `FITBIT_CLIENT_ID` | `1234567890-abc.apps.googleusercontent.com` | Google OAuth client id |
| `FITBIT_CLIENT_SECRET` | `GOCSPX-xxxxxxxx` | Google OAuth client secret |
| `FITBIT_REDIRECT_URI` | `http://localhost:3000/api/fitbit/callback` | OAuth callback (must match Google Cloud exactly) |
| `APP_BASE_URL` | `http://localhost:3000` | Base URL for OAuth redirects |
| `GEMINI_API_KEY` | `AIza...` | Google Gemini API key |
| `SUPABASE_SERVICE_ROLE_KEY` | `eyJhbGci...` | *(Optional)* enables meal-image uploads to Supabase Storage |

### Deploying

Import the repo into Vercel, add the variables above, then set `APP_BASE_URL` and `FITBIT_REDIRECT_URI` to your Vercel URL and redeploy. Add that URL to **Google OAuth** (authorized origin + `/api/fitbit/callback` redirect) and **Supabase → Auth → URL Configuration**.

## Scripts

| Command | Description |
|---|---|
| `npm run dev` | Start the dev server |
| `npm run build` / `npm start` | Production build / serve |
| `npm run db:push` | Sync the Prisma schema to the database |
| `npm run db:seed` | Seed mock data |
