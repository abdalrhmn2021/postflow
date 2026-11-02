# Deploying PostFlow

Free to start: the site on **Vercel**, the API (with the publish worker inside it) on **Render**, the database on
**Neon**, Redis on **Upstash**, files on **Cloudinary**, captions with **Gemini**. One free uptime pinger keeps the
Render service awake, so scheduled posts go out on time.

```
Browser ──► Vercel (apps/web) ──/api/*──► Render (apps/api, RUN_WORKER=true) ──► Neon · Upstash · Cloudinary · Meta · Gemini
                                               ▲
                                  UptimeRobot, every 5 min: /api/health/ping
```

## 1. Production data (separate from development)

- **Neon** - in the `postflow` project: Branches -> New branch `production` -> its connection string
  (`...?sslmode=verify-full`). Development keeps its own branch: tests never touch real data.
- **Upstash** - the free plan has one database: production uses the same one as development. Every key
  starts with `prod:` in production and `dev:` on your computer (`REDIS_PREFIX`, from `NODE_ENV`), so
  their sessions and publish jobs never mix. Copy its `rediss://...` URL.
- **Cloudinary** - the same account works; every file is stored under `postflow/<agency>/<client>/`.
- **Encryption key** - `node -e "console.log(require('crypto').randomBytes(32).toString('base64'))"`. Keep it safe:
  changing it later means connecting every Facebook page again.

## 2. The API on Render

1. Render -> **New -> Blueprint** -> this repository. It reads `render.yaml`: one free web service, `postflow-api`.
2. Fill in the secret values it asks for: `DATABASE_URL`, `REDIS_URL`, `TOKEN_ENCRYPTION_KEY`, `CLOUDINARY_URL`,
   `GEMINI_API_KEY`. Leave `WEB_ORIGIN`, `META_APP_ID`, `META_APP_SECRET` empty for now.
3. Deploy. Each start runs the database migrations first. Check `https://<api>.onrender.com/api/health`:
   `database`, `redis` and `worker` must all be `up`.

## 3. The site on Vercel

1. Vercel -> **Add New -> Project** -> this repository -> **Root Directory: `apps/web`** (framework: Next.js).
2. Environment variable: `API_URL` = `https://<api>.onrender.com` (no `/api` at the end). Node.js 24 in the settings.
3. Deploy, then put the site's address in Render's `WEB_ORIGIN` (`https://<site>.vercel.app`) and redeploy the API.

The browser only ever talks to the site; Vercel forwards `/api/*` to Render, so the login cookie stays first-party.

## 4. Keep the API awake

Render's free services sleep after 15 minutes without visits - a sleeping worker publishes nothing.
**UptimeRobot** (free) -> New monitor -> HTTP(s) -> `https://<api>.onrender.com/api/health/ping` -> every 5 minutes.
`/ping` touches nothing else, so the database can still sleep (Neon's free plan counts awake time).

## 5. Meta (last)

Create the Meta app, add `https://<site>.vercel.app/api/meta/callback` to its Valid OAuth Redirect URIs, and set
`META_APP_ID` / `META_APP_SECRET` on Render. Until then, connecting pages is off and scheduled posts fail at their time.

## Upgrading later

Render **Starter** plan for `postflow-api` (always awake, faster). For more load: `RUN_WORKER=false` on the API and a
second service, a Render **Background Worker** with `npm run worker -w api` as its start command - same environment.
