/**
 * Integration tests. Requires a migrated + seeded database (`npm run db:migrate && npm run db:seed`).
 * Boots the real Express app + Socket.io on an ephemeral port.
 *   npm test
 */
import assert from 'node:assert/strict';
import { createServer, Server } from 'node:http';
import { after, before, describe, it } from 'node:test';
import jwt from 'jsonwebtoken';
import { io as connect, Socket } from 'socket.io-client';
import { createApp } from '../src/app';
import { env } from '../src/config/env';
import { prisma } from '../src/db/prisma';
import { flagOverdueTasks } from '../src/jobs/overdue';
import { initSocket } from '../src/realtime/socket';

const PASSWORD = process.env.SEED_PASSWORD ?? 'Password123!';
let server: Server;
let base: string;

interface Session {
  token: string;
  cookie: string;
  user: { id: string; role: string };
}

async function api(method: string, path: string, opts: { token?: string; body?: unknown; cookie?: string } = {}) {
  const res = await fetch(`${base}${path}`, {
    method,
    headers: {
      'content-type': 'application/json',
      ...(opts.token && { authorization: `Bearer ${opts.token}` }),
      ...(opts.cookie && { cookie: opts.cookie }),
    },
    body: opts.body === undefined || method === 'GET' ? undefined : JSON.stringify(opts.body),
  });
  const text = await res.text();
  return { status: res.status, headers: res.headers, json: text ? JSON.parse(text) : null };
}

async function login(email: string): Promise<Session> {
  const r = await api('POST', '/api/auth/login', { body: { email, password: PASSWORD } });
  assert.equal(r.status, 200, `login ${email}`);
  const cookie = r.headers.get('set-cookie')!.split(';')[0];
  return { token: r.json.data.accessToken, cookie, user: r.json.data.user };
}

function socketFor(token: string): Promise<Socket> {
  return new Promise((resolve, reject) => {
    const s = connect(base, { auth: { token }, transports: ['websocket'], reconnection: false });
    s.on('connect', () => resolve(s));
    s.on('connect_error', reject);
  });
}

const collect = (s: Socket, event: string) => {
  const got: any[] = [];
  s.on(event, (p) => got.push(p));
  return got;
};
const settle = (ms = 300) => new Promise((r) => setTimeout(r, ms));

describe('API', () => {
  let admin: Session, meera: Session, karan: Session, ravi: Session, priya: Session;

  before(async () => {
    server = createServer(createApp());
    initSocket(server);
    await new Promise<void>((r) => server.listen(0, r));
    base = `http://127.0.0.1:${(server.address() as { port: number }).port}`;
    [admin, meera, karan, ravi, priya] = await Promise.all(
      ['admin@velozity.dev', 'meera.pm@velozity.dev', 'karan.pm@velozity.dev', 'ravi@velozity.dev', 'priya@velozity.dev'].map(login),
    );
  });

  after(async () => {
    server.close();
    await prisma.$disconnect();
  });

  describe('authentication', () => {
    it('sets the refresh token as an HttpOnly cookie and never in the body', async () => {
      const r = await api('POST', '/api/auth/login', { body: { email: 'ravi@velozity.dev', password: PASSWORD } });
      assert.match(r.headers.get('set-cookie')!, /refresh_token=.*HttpOnly/i);
      assert.equal(r.json.data.refreshToken, undefined);
    });

    it('rejects wrong password and unauthenticated requests with structured errors', async () => {
      const bad = await api('POST', '/api/auth/login', { body: { email: 'ravi@velozity.dev', password: 'nope' } });
      assert.equal(bad.status, 401);
      assert.equal(bad.json.error.code, 'UNAUTHORIZED');
      const none = await api('GET', '/api/tasks');
      assert.equal(none.status, 401);
    });

    it('rotates refresh tokens and revokes the family on reuse', async () => {
      const s = await login('neha@velozity.dev');
      const first = await api('POST', '/api/auth/refresh', { cookie: s.cookie });
      assert.equal(first.status, 200);
      const newCookie = first.headers.get('set-cookie')!.split(';')[0];
      assert.notEqual(newCookie, s.cookie);
      const replay = await api('POST', '/api/auth/refresh', { cookie: s.cookie }); // old token again
      assert.equal(replay.status, 401);
      const afterReplay = await api('POST', '/api/auth/refresh', { cookie: newCookie }); // family revoked
      assert.equal(afterReplay.status, 401);
    });

    it('rejects forged tokens, including a developer token re-signed with an admin role claim', async () => {
      const wrongSecret = jwt.sign({ sub: ravi.user.id, role: 'ADMIN' }, 'attacker-secret');
      assert.equal((await api('GET', '/api/users', { token: wrongSecret })).status, 401);
      // Unsigned ("alg: none") token
      const none = Buffer.from(JSON.stringify({ alg: 'none', typ: 'JWT' })).toString('base64url') +
        '.' + Buffer.from(JSON.stringify({ sub: ravi.user.id, role: 'ADMIN' })).toString('base64url') + '.';
      assert.equal((await api('GET', '/api/users', { token: none })).status, 401);
    });

    it('trusts the DB role, not the token claim', async () => {
      // Valid signature but lying role claim: the server must still treat Ravi as a developer.
      const lying = jwt.sign({ sub: ravi.user.id, role: 'ADMIN' }, env.JWT_ACCESS_SECRET, { expiresIn: '5m' });
      assert.equal((await api('GET', '/api/users', { token: lying })).status, 403);
      assert.equal((await api('GET', '/api/projects', { token: lying })).status, 403);
    });
  });

  describe('role-based access', () => {
    it('developers are blocked from management endpoints', async () => {
      for (const [m, p] of [['GET', '/api/users'], ['GET', '/api/projects'], ['GET', '/api/clients'], ['POST', '/api/projects']]) {
        assert.equal((await api(m, p, { token: ravi.token, body: {} })).status, 403, `${m} ${p}`);
      }
    });

    it('PMs cannot use admin endpoints', async () => {
      assert.equal((await api('GET', '/api/users', { token: meera.token })).status, 403);
      assert.equal((await api('POST', '/api/clients', { token: meera.token, body: { name: 'x' } })).status, 403);
    });

    it('a PM only sees projects they created, and other PMs\' projects are 404', async () => {
      const mine = (await api('GET', '/api/projects', { token: meera.token })).json.data;
      const theirs = (await api('GET', '/api/projects', { token: karan.token })).json.data;
      assert.ok(mine.length > 0 && theirs.length > 0);
      const mineIds = new Set(mine.map((p: any) => p.id));
      assert.ok(theirs.every((p: any) => !mineIds.has(p.id)));
      const foreign = theirs[0].id;
      assert.equal((await api('GET', `/api/projects/${foreign}`, { token: meera.token })).status, 404);
      assert.equal((await api('PATCH', `/api/projects/${foreign}`, { token: meera.token, body: { name: 'hijack' } })).status, 404);
      assert.equal((await api('DELETE', `/api/projects/${foreign}`, { token: meera.token })).status, 404);
      assert.equal(
        (await api('POST', `/api/projects/${foreign}/tasks`, { token: meera.token, body: { title: 'sneaky' } })).status,
        404,
      );
      const tasks = (await api('GET', `/api/tasks?projectId=${foreign}`, { token: meera.token })).json.data;
      assert.equal(tasks.length, 0);
    });

    it('a developer only sees their own tasks and cannot read or edit anyone else\'s', async () => {
      const mine = (await api('GET', '/api/tasks', { token: ravi.token })).json.data;
      assert.ok(mine.length > 0);
      assert.ok(mine.every((t: any) => t.assignee.id === ravi.user.id));
      const others = (await api('GET', '/api/tasks', { token: priya.token })).json.data;
      const foreign = others[0];
      assert.equal((await api('GET', `/api/tasks/${foreign.id}`, { token: ravi.token })).status, 404);
      assert.equal((await api('PATCH', `/api/tasks/${foreign.id}`, { token: ravi.token, body: { status: 'DONE' } })).status, 404);
      // Asking for another developer's tasks via query params still returns nothing
      const probe = (await api('GET', `/api/tasks?assigneeId=${priya.user.id}`, { token: ravi.token })).json.data;
      assert.equal(probe.length, 0);
    });

    it('a developer may change status only; other fields are 403', async () => {
      const t = (await api('GET', '/api/tasks', { token: ravi.token })).json.data[0];
      const r = await api('PATCH', `/api/tasks/${t.id}`, { token: ravi.token, body: { status: t.status, priority: 'LOW' } });
      assert.equal(r.status, 403);
      const reassign = await api('PATCH', `/api/tasks/${t.id}`, { token: ravi.token, body: { assigneeId: priya.user.id } });
      assert.equal(reassign.status, 403);
    });
  });

  describe('validation + errors', () => {
    it('returns field-level validation details and no stack traces', async () => {
      const r = await api('POST', '/api/projects', { token: meera.token, body: { name: '', clientId: 'not-a-uuid' } });
      assert.equal(r.status, 400);
      assert.equal(r.json.error.code, 'BAD_REQUEST');
      assert.ok(Array.isArray(r.json.error.details));
      assert.ok(!/node_modules|\.ts:\d+|\\n\s+at /.test(JSON.stringify(r.json)), 'no stack trace');
      const q = await api('GET', '/api/tasks?status=NOPE', { token: admin.token });
      assert.equal(q.status, 400);
      const unknown = await api('GET', '/api/does-not-exist', { token: admin.token });
      assert.equal(unknown.status, 404);
      assert.equal(unknown.json.error.code, 'NOT_FOUND');
    });
  });

  describe('filters', () => {
    it('filters by status, priority and due date range via query params', async () => {
      const r = await api('GET', '/api/tasks?status=IN_PROGRESS,IN_REVIEW&priority=HIGH,CRITICAL', { token: admin.token });
      assert.ok(r.json.data.length > 0);
      assert.ok(r.json.data.every((t: any) => ['IN_PROGRESS', 'IN_REVIEW'].includes(t.status) && ['HIGH', 'CRITICAL'].includes(t.priority)));
      const day = (n: number) => new Date(Date.now() + n * 864e5).toISOString().slice(0, 10);
      const range = await api('GET', `/api/tasks?dueFrom=${day(0)}&dueTo=${day(7)}`, { token: admin.token });
      assert.ok(range.json.data.every((t: any) => t.dueDate && t.dueDate >= day(0) && t.dueDate < day(8)));
      const dev = (await api('GET', '/api/tasks', { token: ravi.token })).json.data;
      const rank = { LOW: 0, MEDIUM: 1, HIGH: 2, CRITICAL: 3 } as Record<string, number>;
      for (let i = 1; i < dev.length; i++) assert.ok(rank[dev[i - 1].priority] >= rank[dev[i].priority], 'sorted by priority desc');
    });
  });

  describe('activity feed scoping', () => {
    it('is role-filtered and database-backed', async () => {
      const adminFeed = (await api('GET', '/api/activity?limit=100', { token: admin.token })).json.data;
      const meeraFeed = (await api('GET', '/api/activity?limit=100', { token: meera.token })).json.data;
      const raviFeed = (await api('GET', '/api/activity?limit=100', { token: ravi.token })).json.data;
      assert.ok(adminFeed.length > meeraFeed.length && meeraFeed.length > raviFeed.length && raviFeed.length > 0);

      const meeraProjects = new Set((await api('GET', '/api/projects', { token: meera.token })).json.data.map((p: any) => p.id));
      assert.ok(meeraFeed.every((a: any) => meeraProjects.has(a.projectId)));

      const raviTaskIds = new Set((await api('GET', '/api/tasks', { token: ravi.token })).json.data.map((t: any) => t.id));
      assert.ok(raviFeed.every((a: any) => raviTaskIds.has(a.taskId)));

      const last20 = (await api('GET', '/api/activity', { token: admin.token })).json.data;
      assert.equal(last20.length, 20);
      for (let i = 1; i < last20.length; i++) assert.ok(last20[i - 1].createdAt >= last20[i].createdAt);
    });
  });

  describe('realtime', () => {
    it('delivers status changes only to authorised sockets, with logs + notifications persisted', async () => {
      const sockets = {
        admin: await socketFor(admin.token),
        meera: await socketFor(meera.token),
        karan: await socketFor(karan.token),
        ravi: await socketFor(ravi.token),
        priya: await socketFor(priya.token),
      };
      const feed = Object.fromEntries(Object.entries(sockets).map(([k, s]) => [k, collect(s, 'activity:new')]));
      const notif = collect(sockets.meera, 'notification:new');
      const adminPresence = collect(sockets.admin, 'presence:count');

      // Pick a Ravi task in Meera's projects that is not already IN_REVIEW/DONE.
      const meeraProjects = new Set((await api('GET', '/api/projects', { token: meera.token })).json.data.map((p: any) => p.id));
      const task = (await api('GET', '/api/tasks', { token: ravi.token })).json.data.find(
        (t: any) => meeraProjects.has(t.projectId) && !['IN_REVIEW', 'DONE'].includes(t.status),
      );
      assert.ok(task, 'seed has a suitable task');
      const original = task.status;

      const unreadBefore = (await api('GET', '/api/notifications', { token: meera.token })).json.unreadCount;
      const r = await api('PATCH', `/api/tasks/${task.id}`, { token: ravi.token, body: { status: 'IN_REVIEW' } });
      assert.equal(r.status, 200);
      await settle();

      for (const who of ['admin', 'meera', 'ravi'] as const) {
        assert.equal(feed[who].length, 1, `${who} receives the event`);
        assert.equal(feed[who][0].taskId, task.id);
        assert.equal(feed[who][0].fromStatus, original);
        assert.equal(feed[who][0].toStatus, 'IN_REVIEW');
        assert.equal(feed[who][0].actor.name, 'Ravi Kumar');
      }
      assert.equal(feed.karan.length, 0, 'other PM gets nothing');
      assert.equal(feed.priya.length, 0, 'other developer gets nothing');

      assert.equal(notif.length, 1, 'PM notified in real time');
      assert.equal(notif[0].unreadCount, unreadBefore + 1);

      // Persisted, not derived: the log row exists in the DB with actor + timestamp.
      const row = await prisma.activityLog.findFirst({ where: { taskId: task.id, type: 'STATUS_CHANGED' }, orderBy: { createdAt: 'desc' } });
      assert.equal(row?.actorId, ravi.user.id);
      assert.equal(row?.toStatus, 'IN_REVIEW');

      // Presence: Ravi's second tab doesn't double count; disconnecting everything updates admin.
      const before = adminPresence.at(-1).count;
      const second = await socketFor(ravi.token);
      await settle();
      assert.equal(adminPresence.at(-1).count, before);
      second.close();

      // Mark all read pushes a count update
      const counts = collect(sockets.meera, 'notification:count');
      assert.equal((await api('POST', '/api/notifications/read-all', { token: meera.token })).status, 204);
      await settle();
      assert.equal(counts.at(-1).unreadCount, 0);

      // Restore the task + clean up
      await api('PATCH', `/api/tasks/${task.id}`, { token: ravi.token, body: { status: original } });
      Object.values(sockets).forEach((s) => s.close());
    });

    it('refuses socket connections without a valid token', async () => {
      await assert.rejects(socketFor('garbage'));
    });
  });

  describe('overdue job', () => {
    it('flags past-due unfinished tasks once, logs it, and ignores done tasks', async () => {
      const project = (await api('GET', '/api/projects', { token: meera.token })).json.data[0];
      const mk = (title: string, status: string) =>
        api('POST', `/api/projects/${project.id}/tasks`, {
          token: meera.token,
          body: { title, status, dueDate: new Date(Date.now() - 3600_000).toISOString(), assigneeId: ravi.user.id },
        });
      const open = (await mk('overdue-test-open', 'IN_PROGRESS')).json.data;
      const done = (await mk('overdue-test-done', 'DONE')).json.data;
      assert.equal(open.isOverdue, false, 'not flagged on read/create');

      const flagged = await flagOverdueTasks();
      assert.ok(flagged >= 1);
      assert.equal((await api('GET', `/api/tasks/${open.id}`, { token: meera.token })).json.data.isOverdue, true);
      assert.equal((await api('GET', `/api/tasks/${done.id}`, { token: meera.token })).json.data.isOverdue, false);
      assert.equal(await prisma.activityLog.count({ where: { taskId: open.id, type: 'MARKED_OVERDUE' } }), 1);

      assert.equal(await flagOverdueTasks(), 0, 'idempotent');

      // Completing it clears the flag
      const fixed = await api('PATCH', `/api/tasks/${open.id}`, { token: ravi.token, body: { status: 'DONE' } });
      assert.equal(fixed.json.data.isOverdue, false);

      await api('DELETE', `/api/tasks/${open.id}`, { token: meera.token });
      await api('DELETE', `/api/tasks/${done.id}`, { token: meera.token });
    });
  });
});
