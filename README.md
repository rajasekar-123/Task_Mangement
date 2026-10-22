# Pulse — Real-Time Client Project Dashboard

Internal tool for a small agency: manage clients and projects, track tasks, and watch team activity live.
Role-based (Admin / Project Manager / Developer), with a WebSocket activity feed, presence, notifications and a scheduled overdue job.

**Stack:** React 18 + TypeScript (Vite) · Node 22 + Express 5 + TypeScript · PostgreSQL + Prisma · Socket.io · node-cron

```
client/   React SPA (TanStack Query, React Router, socket.io-client)
server/   Express API + Socket.io + cron job, Prisma schema/migrations/seed, integration tests
```

## Run it locally

### Option A — Docker (recommended)

```bash
cp .env.example .env          # then fill in the two JWT secrets (command is in the file)
docker compose up --build     # Postgres + API + nginx-served client
docker compose exec server npx tsx prisma/seed.ts   # load demo data
```
Open http://localhost:8080. Migrations are applied automatically when the API container starts.

### Option B — Node + your own Postgres

```bash
# Postgres 14+ running locally, e.g. createdb pulse
cd server
cp .env.example .env            # edit DATABASE_URL and the JWT secrets
npm install
npx prisma migrate deploy       # or `npm run db:migrate` in development
npm run db:seed
npm run dev                     # API + WebSocket on :4000

cd ../client
npm install
npm run dev                     # http://localhost:5173 (proxies /api and /socket.io to :4000)
```

> I could not run Docker on the machine this was built on, so the Compose setup is untested. Everything in Option B was run and verified (see Tests).

### Demo accounts (seed)

All use password `Password123!` (override with `SEED_PASSWORD`).

| Role | Email |
|---|---|
| Admin | admin@velozity.dev |
| Project Manager | meera.pm@velozity.dev, karan.pm@velozity.dev |
| Developer | ravi@, priya@, arjun@, neha@ `velozity.dev` |

Seed creates 1 admin, 2 PMs, 4 developers, 3 clients, 4 projects, 22 tasks in all statuses (3 already overdue), ~50 activity entries (some minutes old so the feed shows "2 mins ago"), and a few notifications. Re-running it resets the database.

**Try the real-time bits:** sign in as Admin in one window and as Ravi (developer) in another. Change a task's status as Ravi; the admin feed, the PM's feed and the dashboard counts update without a refresh. Moving a task to *In Review* pings its PM's bell.

## Tests

```bash
cd server && npm test     # needs a migrated + seeded database
```
16 integration tests boot the real app and sockets: forged/`alg:none` tokens, a valid token with a lying role claim, every 403/404 boundary between roles, refresh rotation + reuse detection, filter and sort behaviour, feed scoping, per-socket event delivery (who gets an event and who must not), presence, notification counts, and the overdue job (idempotent, ignores Done tasks).

## Architecture & decisions

### Access control (enforced in the API)
* **Role gates at the mount point** (`server/src/app.ts`): the access matrix is readable in one place.
* **Row-level scope** in one module, `lib/scope.ts`: `projectScope`, `taskScope`, `activityScope`. Every read/write of projects, tasks and activity goes through it. PMs get `project.createdById = me`; developers get `assigneeId = me`. Out-of-scope resources return **404**, not 403, so IDs can't be probed.
* **The role comes from the database on every request**, not from the JWT claim. A correctly signed token that claims `ADMIN` for a developer still gets developer permissions (tested). Deactivating a user or changing a role revokes refresh tokens and disconnects live sockets.
* Developers may only PATCH `status`; any other field is a 403.

### Tokens
Access token (15 min JWT) is kept **in memory only** in the SPA. Refresh token (7 days JWT) lives in an **HttpOnly, path-scoped (`/api/auth`) cookie**, so XSS can't read it. Refresh tokens are **rotated** and each has a row in `RefreshToken`; presenting an already-used token revokes all of that user's sessions (replay detection). The claim step is an atomic `UPDATE … WHERE revokedAt IS NULL`, so concurrent refreshes can't both win. The client de-duplicates simultaneous refreshes.

### WebSocket library: Socket.io
Native `ws` would be lighter, but this app needs rooms (per-user, per-role), auth in the handshake, automatic reconnection with a fresh token, and fan-out de-duplication across rooms. Socket.io gives all of that; I'd otherwise rewrite it. The cost is a slightly larger client. Transport is forced to `websocket` (no long-polling).

### Role-filtered feed
Events are **not** broadcast to a shared project room. After each committed transaction the server computes recipients with the same rules as `scope.ts` and emits to `role:ADMIN`, `user:<project owner>` and `user:<assignee>`. So a developer can never receive another developer's event, even if they are "viewing" that project. Sockets can't join arbitrary rooms; membership is derived from the authenticated identity.

**Missed events:** `GET /api/activity?limit=20` reads the last 20 role-scoped events straight from `ActivityLog` (no in-memory cache). It runs on first load and again whenever the socket reconnects.

**Persisted, not derived:** every status change writes an `ActivityLog` row (actor, from, to, timestamp) in the same transaction as the task update, behind a `SELECT … FOR UPDATE` row lock so the "from → to" is always accurate under concurrent edits. Messages like *"Ravi moved Task #12 from In Progress → In Review · 2 mins ago"* are rendered on the client from the structured row.

### Presence
`Map<userId, socketCount>` on the server; a user with two tabs counts once. Changes are pushed to the admin room as `presence:count`.

### Overdue job: node-cron (not Bull)
Bull/BullMQ needs Redis, an extra service to run and pay for, which buys retries, concurrency and delayed jobs we don't need for one idempotent sweep. The job is a single `UPDATE … WHERE isOverdue = false AND status <> 'DONE' AND dueDate < now() RETURNING …` plus the activity inserts, in one transaction. Because the flip itself is the claim, running it on several instances flags each task exactly once. It runs every minute (`OVERDUE_CRON`) and once at boot to catch up. The flag is cleared when the task is completed or its due date moves to the future.

### Backend: Express 5
Familiar, small, and v5 forwards async errors to the error handler natively, so no wrapper boilerplate. Fastify's schema/perf advantages don't matter at this scale; zod gives me validation and types.

### Validation & errors
Every body and query is parsed with zod on the server. All errors share one shape: `{ "error": { "code", "message", "details?" } }`. Unknown errors become a generic 500 and are logged server-side only; Prisma errors are mapped (unique → 409, etc.). Login is rate-limited; `helmet` and a CORS allow-list are on.

### Database schema

```
User(id, name, email*, passwordHash, role, isActive)
RefreshToken(id=jti, userId→User, expiresAt, revokedAt)
Client(id, name, contactEmail)
Project(id, name, description, clientId→Client, createdById→User)
Task(id serial, projectId→Project, title, description, assigneeId→User?, status, priority,
     dueDate?, isOverdue, createdById→User)
ActivityLog(id, taskId→Task?, projectId→Project, actorId→User? (null=system), type,
            fromStatus?, toStatus?, detail?, createdAt)
Notification(id, userId→User, type, message, taskId→Task?, readAt?, createdAt)
```
Deletes: project → tasks → activity/notifications cascade; clients and users referenced by projects/tasks are `RESTRICT`; a deleted assignee becomes `NULL`.

### Indexing

| Index | Serves |
|---|---|
| `Project(createdById)` | PM scoping on every PM request |
| `Project(clientId)` | client → projects, FK lookups |
| `Task(projectId, status)` | project board and status filter |
| `Task(assigneeId, priority, dueDate)` | developer dashboard: own tasks sorted by priority then due date, covered by one index |
| `Task(dueDate)` | due-range filter, "due this week" |
| `Task(isOverdue, dueDate)` | overdue counts and the job's sweep |
| `ActivityLog(createdAt DESC)` | admin global feed, newest 20 |
| `ActivityLog(projectId, createdAt DESC)` | PM feed |
| `ActivityLog(taskId, createdAt DESC)` | task history and developer feed |
| `Notification(userId, readAt)` | unread-count badge |
| `Notification(userId, createdAt DESC)` | dropdown list |
| `User(role)`, `RefreshToken(userId)`, `(expiresAt)` | assignable-developer list, session revoke, cleanup |

`priority` is a Postgres enum declared LOW→CRITICAL, so `ORDER BY priority DESC` sorts correctly without a CASE.

### Filters
`status`, `priority` (comma-separated), `dueFrom`, `dueTo` (a bare date means "through the end of that day"), `overdue`, `projectId` are plain query params on `GET /api/tasks`, and the UI keeps them in the page URL (`/tasks?status=IN_REVIEW&priority=HIGH,CRITICAL&task=12`), so filtered views and open tasks are shareable links.

## Deploying (Vercel + a WebSocket host)

**Vercel's serverless functions cannot hold WebSocket connections open**, and the task requires WebSockets, so the stack is split:

1. **Backend + Postgres** on a host that supports long-running Node processes (Render, Railway, Fly.io). Set the env vars from `server/.env.example`; set `CORS_ORIGINS` to your Vercel URL, `COOKIE_SECURE=true`, `NODE_ENV=production`. Build `npm install && npm run build`, start `npx prisma migrate deploy && npm start`. Run `npm run db:seed` once for demo data.
2. **Frontend** on Vercel with root directory `client/`. Edit `client/vercel.json` and replace `YOUR-BACKEND-HOST` with the backend host. The `/api/*` rewrite keeps the refresh cookie first-party (no third-party cookie problems in Safari/Chrome). Set `VITE_SOCKET_URL=https://<backend host>` so the socket connects directly (Vercel can't proxy WebSockets).

Live link: _add after deploy_ · Repo: _add after push_

## Known limitations
* **Single-instance presence and sockets.** Presence is an in-memory map, and Socket.io rooms are per process. Scaling out needs the Redis adapter and a shared presence store. The overdue job is already multi-instance safe.
* **Short-lived socket auth.** The access token is checked at handshake only; an open socket survives token expiry. Deactivation/role changes do disconnect sockets, and reconnects always use a fresh token.
* **"Team" = the PM's own projects.** The spec says a PM sees "their team's activity"; I interpreted that as projects they created, matching the "PM can only manage projects they created" rule. There is no separate team entity.
* **Overdue latency** is up to one cron interval (1 min). A task past due is shown flagged only after the job runs, by design (not computed on page load).
* **Admin-created PM-owned data:** if an admin creates a project, the admin is its owner and receives its "In Review" notifications.
* "Due this week" means the next 7 days from now, not calendar week; dates use the server's UTC.
* No password reset / email flow, no pagination on lists (capped at 100–200 rows), the Docker setup is untested here, and the UI has no automated tests.
