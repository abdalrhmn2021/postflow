# PostFlow

**Social media scheduling for agencies.** An agency plans its clients' posts on one calendar, the client approves them from a link, and each post goes out on Facebook and Instagram at its time - automatically. Captions are drafted by AI in the brand's own voice.

> Status: **phase 1 (accounts and agencies)** - in progress. Done: database tables, agency sign-up.

## Tech stack

| Layer    | Tech                                                          |
| -------- | ------------------------------------------------------------- |
| Web      | Next.js 16 (App Router), React 19, TypeScript, Tailwind CSS 4 |
| API      | NestJS 12, TypeScript                                         |
| Database | PostgreSQL 17 + Prisma 7                                      |
| Jobs     | Redis 7 + BullMQ (phase 4)                                    |
| Tests    | Vitest + Supertest, Playwright (phase 7)                      |
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
│   │   └── src/app/         pages
│   └── api/                 NestJS API + worker
│       ├── prisma/          schema.prisma, migrations
│       ├── src/
│       │   ├── config/      environment variables, checked at start-up
│       │   ├── prisma/      database client
│       │   ├── redis/       Redis connection
│       │   ├── health/      GET /api/health
│       │   ├── auth/        sign-up (POST /api/auth/register), password hashing
│       │   ├── common/      shared pieces (request validation)
│       │   ├── worker/      worker module + heartbeat
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
Upstash's free plan has a monthly command limit, which is plenty for development.

## Checks

```bash
npm run format:check                 # Prettier
npm run typecheck -w api && npm run lint -w api && npm test -w api
npm run test:e2e -w api              # needs `npm run db:up`
npm run typecheck -w web && npm run lint -w web && npm run build -w web
```

CI runs all of them on every push and pull request.

## Author

**AbdAlrhmn ALkhlwt** - Full-Stack Developer · [GitHub](https://github.com/abdalrhmn2021)
