# PostFlow

**Social media scheduling for agencies.** An agency plans its clients' posts on one calendar, the client approves them from a link, and each post goes out on Facebook and Instagram at its time - automatically. Captions are drafted by AI in the brand's own voice.

> **Improvements 1 (security)** - logins are stored (a `Session` row per device): logging out ends the login itself, so a copied cookie stops working at once; "log out of every device" on the new account page; sign-ups limited per IP (`SIGNUPS_PER_HOUR`, 10 in production); a client can't answer a post that's already out; expired logins cleaned up by the worker's hourly sweep.
>
> Status: **phase 7 (launch)** - ready to deploy: browser tests (Playwright: sign-up, login, language, a post to the calendar, the client's approval) in CI; `RUN_WORKER=true` runs the publish worker inside the API (one free service); `/api/health/ping` for an uptime pinger that doesn't wake the database; `render.yaml` and [DEPLOY.md](DEPLOY.md) for Vercel + Render.
>
> **Phase 6 (AI captions)** - done. "Write me a caption" in the post editor: the idea in a few words -> three really different captions in the client's language and voice (from the client's settings), hashtags cleaned and after the text, within Instagram's limits; "improve the text I wrote" sends the draft too. Google Gemini through its REST API in JSON mode; the agency's words go to the model as quoted data, not instructions; at most 30 requests per person per hour. Nothing is saved until the person picks one.
>
> **Phase 5 (client approval)** - done. A client can require approval (a setting on the client): then only posts the client approved can be scheduled. A draft is sent for approval (editors too); the owner or a manager makes a review link (14 days, kept as a hash) and sends it - copy or WhatsApp. The client opens it with no account, sees each post as it will look on Facebook and Instagram, and approves or asks for changes with a note, which the agency sees in the editor. Changing an approved post's text, platforms or files needs a new approval; a link reaches its own client only and can be stopped.
>
> **Phase 4 (publishing)** - code done, waiting for the Meta app. Scheduling a post puts a delayed job on the publish queue (BullMQ) for its exact time - nothing polls the database. The worker takes it then, locks the post (PUBLISHING), and sends it: Facebook (text, a photo, several photos, a video) and Instagram (an image, a Reel, a carousel), images as JPEG and MOV as MP4 through Cloudinary. Each platform is recorded with its link or Meta's reason; a platform already out is never sent twice. Meta busy -> tried again after 1, 2, 4 minutes; refused for good -> FAILED with the reason; a refused token marks the page "needs connecting again". An hourly sweep re-queues any scheduled post whose job is missing. Website: "Publishing…", the reason a post failed, links to the published post.
>
> **Phase 3 (Facebook and Instagram)** - code done, waiting for the Meta app. each client connects its Facebook page (and the Instagram professional account linked to it) through Facebook's login - a one-time `state` against forged answers, the person's pages listed to pick from, the page token stored encrypted (AES-256-GCM) and never sent to the browser, `appsecret_proof` on every Graph API call; a page can't be on two clients of one agency; check / reconnect / disconnect; scheduling needs each picked platform connected (once Meta is set up). Website: a "Facebook and Instagram" card on the client's page, the page picker, badges on the clients list, warnings in the post editor.
>
> **Phase 2 (posts)** - done. the posts table (draft -> scheduled -> published / failed), the posts API (calendar range, drafts with no time, create, edit, schedule, unschedule, delete; editors draft for their brands, the owner and managers schedule; Instagram's caption and hashtag limits checked before scheduling); website: the posts calendar (month and week, each post on its day in its client's time zone, a client filter, + on a day for a new post, drafts with no time beside it) and the post editor - client, text with Instagram's counters, platforms, a time in the client's own time zone, a live preview, save / schedule / unschedule / delete by role. Images and videos: in the editor, drop or pick files - each uploads with a progress bar, then can be moved or removed; a file Instagram would refuse is marked red; the preview shows the real files (Facebook grid, Instagram carousel) and the calendar a thumbnail. Behind it, the browser uploads straight to Cloudinary with a ticket the API signs for one file name of that client; the API then reads the file's real size and format from Cloudinary and attaches it (up to 10 per post, reorder, remove); Meta's rules checked before scheduling (Instagram needs a file, images 4:5 to 1.91:1, Reels 3 s - 15 min, 60 s in a carousel; Facebook: photos, or one video alone).
>
> **Phase 1 (accounts and agencies)** - done (API and website). Done: database tables, agency sign-up, login (cookie), route protection and roles, brands (clients) with editor assignment, staff invites (link), staff list / role change / removal (API complete). Website: Arabic / English (language in the URL: /ar, /en), font, colors, base components, agency sign-up and login pages, a protected dashboard (top bar, sections, log out), clients pages (list, add, edit, editors, delete; read-only for managers and editors), team page (invite by link - copy or WhatsApp, open invites, role change, removal) and the invite page where a new staff member makes their account.

## Tech stack

| Layer    | Tech                                                          |
| -------- | ------------------------------------------------------------- |
| Web      | Next.js 16 (App Router), React 19, TypeScript, Tailwind CSS 4 |
| API      | NestJS 12, TypeScript                                         |
| Database | PostgreSQL 17 + Prisma 7                                      |
| Jobs     | Redis 7 + BullMQ                                              |
| Tests    | Vitest + Supertest, Playwright                                |
| CI       | GitHub Actions                                                |

## Architecture

```
Browser ──► Next.js (apps/web) ──/api/*──► NestJS API (apps/api) ──► PostgreSQL
                                                │
                                                └──► Redis ◄── Worker (apps/api, separate process) ──► Meta Graph API
```

The API and the **worker** are the same codebase but two processes: the API answers the website, the worker runs background jobs (publishing posts at their time). A slow or failing call to Meta can never slow the website down.

## Project structure

```
postflow/
├── apps/
│   ├── web/                 Next.js site
│   │   └── src/
│   │       ├── app/[lang]/  pages, under /ar or /en
│   │       ├── i18n/        languages: dictionaries (ar.ts, en.ts), config
│   │       ├── lib/         api() - the one way to call the API; error texts; serverApi() / getSession() (server); time zones;
│   │       │                zoned-time.ts (a time in a client's zone <-> UTC); calendar.ts (the calendar's days);
│   │       │                caption.ts (Instagram's limits); media.ts (file rules, Cloudinary thumbnail URLs);
│   │       │                upload.ts (a file straight to Cloudinary, with progress); *.test.ts next to each (npm test -w web)
│   │       ├── components/  ui/ (Button, Input, Select, Textarea, FormError, LanguageSwitch), Logo, LocalDate, SystemStatus, MediaThumb
│   │       └── proxy.ts     sends a URL without a language to /ar or /en; /dashboard needs a login
│   └── api/                 NestJS API + worker
│       ├── prisma/          schema.prisma, migrations
│       ├── src/
│       │   ├── config/      environment variables, checked at start-up
│       │   ├── prisma/      database client
│       │   ├── redis/       Redis connection
│       │   ├── health/      GET /api/health
│       │   ├── auth/        sign-up, login, /me, logout; AuthGuard + @Public / @Roles / @CurrentUser
│       │   ├── brands/      an agency's clients: /api/brands, editors per brand
│       │   ├── invites/     staff invites: the owner makes a link, the person opens it and makes an account
│       │   ├── staff/       the agency's people: /api/staff, change a role, remove someone
│       │   ├── posts/       /api/posts: the calendar, drafts, scheduling, files; posts.rules.ts = what a post needs before it's scheduled
│       │   ├── meta/        Facebook login and pages: MetaGraph (what the API needs) and GraphApiMeta; token-cipher.ts
│       │   ├── ai/          caption ideas: CaptionWriter (the prompt, the cleanup) and GeminiCaptionWriter
│       │   ├── review/      client approval: review links and the client's answers (public, the link is the key)
│       │   ├── publish/     the publish queue (PublishQueue: delayed jobs) and PublisherService (one post -> Meta)
│       │   ├── media/       file storage: MediaStorage (what the API needs) and CloudinaryStorage (signed uploads, details, delete)
│       │   ├── common/      shared pieces (request validation)
│       │   ├── worker/      worker module: heartbeat, PublishWorker (takes jobs at their time, hourly sweep)
│       │   ├── main.ts      API entry point
│       │   └── worker.ts    worker entry point
│       └── test/            e2e tests (real database)
├── docker-compose.yml       PostgreSQL + Redis for development
└── .github/workflows/ci.yml
```

## Run locally

**Requirements:** Node.js 24 (or Node 22 with `npm install -g npm@11`), and either Docker Desktop or the two free cloud services below.

```bash
npm install                          # installs both apps and generates the Prisma client
cp apps/api/.env.example apps/api/.env
cp apps/web/.env.example apps/web/.env.local
npm run db:up                        # PostgreSQL + Redis in Docker

# three terminals:
npm run dev:api                      # http://localhost:4000/api/health
npm run dev:worker
npm run dev:web                      # http://localhost:3000
```

The home page shows a live status of the API, database, Redis and worker.

### Without Docker (free cloud services)

Skip `npm run db:up` and use two free hosted services instead - nothing to install:

1. **PostgreSQL - [Neon](https://neon.com):** create a project, copy its connection string
   (`postgresql://...neon.tech/neondb?sslmode=verify-full`) into `DATABASE_URL` in `apps/api/.env`.
2. **Redis - [Upstash](https://upstash.com):** create a Redis database, copy its `rediss://...` URL into `REDIS_URL`.

Neon's free database sleeps after 5 idle minutes; the first request after that takes a moment longer.

### Images and videos (Cloudinary)

Post files are stored on [Cloudinary](https://cloudinary.com) (free plan: no card needed). In its dashboard press
**Go to API Keys**, copy the **API environment variable** (`cloudinary://<api_key>:<api_secret>@<cloud_name>`) and
paste it into `CLOUDINARY_URL` in `apps/api/.env`. Without it everything works except uploads. The e2e tests use a fake
store, so CI needs no account.

### AI captions (Gemini)

Get a key at [aistudio.google.com](https://aistudio.google.com) -> **Get API key** (the free tier is enough) and put it
in `GEMINI_API_KEY`. Without it the "write me a caption" button says it isn't set up. `GEMINI_MODEL` defaults to
`gemini-flash-latest`, Google's newest Flash model.

### Facebook and Instagram (Meta app)

Connecting clients' pages needs a Meta app ([developers.facebook.com](https://developers.facebook.com)) with Facebook
Login for Business. Put its **App ID** and **App secret** in `META_APP_ID` / `META_APP_SECRET`, and add
`http://localhost:3000/api/meta/callback` to its **Valid OAuth Redirect URIs**. In development mode the app works on
the pages of its own admins and testers, with no review by Meta. Without the two keys connecting is off, and posts can
be scheduled without a connected page. The e2e tests use a fake Meta.
Upstash's free plan has a monthly command limit, which is plenty for development.

## Checks

```bash
npm run format:check                 # Prettier
npm run typecheck -w api && npm run lint -w api && npm test -w api
npm run test:e2e -w api              # needs `npm run db:up`
npm run typecheck -w web && npm run lint -w web && npm test -w web && npm run build -w web
npm run build -w api && npm run test:browser -w web   # Playwright: needs the database + Redis running
```

CI runs all of them on every push and pull request.

## Author

**AbdAlrhmn ALkhlwt** - Full-Stack Developer · [GitHub](https://github.com/abdalrhmn2021)
