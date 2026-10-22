import 'dotenv/config';
import bcrypt from 'bcryptjs';
import { ActivityType, Priority, PrismaClient, Role, TaskStatus } from '@prisma/client';

const prisma = new PrismaClient();

const PASSWORD = process.env.SEED_PASSWORD ?? 'Password123!';
const MIN = 60 * 1000;
const HOUR = 60 * MIN;
const DAY = 24 * HOUR;
const now = Date.now();
const at = (offsetMs: number) => new Date(now + offsetMs);

const FLOW: TaskStatus[] = ['TODO', 'IN_PROGRESS', 'IN_REVIEW', 'DONE'];

interface TaskSeed {
  title: string;
  status: TaskStatus;
  priority: Priority;
  /** days relative to now; negative on an unfinished task = already overdue */
  due: number | null;
  dev: number; // index into developers, -1 = unassigned
  /** make the most recent status change this many minutes old, so the live feed shows "2 mins ago" */
  recentMins?: number;
}

const projects: { name: string; description: string; client: number; pm: number; tasks: TaskSeed[] }[] = [
  {
    name: 'Storefront Redesign',
    description: 'New responsive storefront, checkout and design system for Acme Retail.',
    client: 0,
    pm: 0,
    tasks: [
      { title: 'Design system tokens', status: 'DONE', priority: 'MEDIUM', due: -5, dev: 0 },
      { title: 'Product listing page', status: 'IN_REVIEW', priority: 'HIGH', due: 2, dev: 1, recentMins: 2 },
      { title: 'Checkout flow', status: 'IN_PROGRESS', priority: 'CRITICAL', due: -2, dev: 0, recentMins: 14 },
      { title: 'Payment gateway integration', status: 'IN_PROGRESS', priority: 'CRITICAL', due: 4, dev: 2 },
      { title: 'Accessibility audit fixes', status: 'TODO', priority: 'MEDIUM', due: 6, dev: 3 },
      { title: 'Order confirmation emails', status: 'TODO', priority: 'LOW', due: 12, dev: 1 },
    ],
  },
  {
    name: 'Fleet Tracking Portal',
    description: 'Live shipment map and ETA dashboard for Northwind Logistics.',
    client: 1,
    pm: 0,
    tasks: [
      { title: 'Map clustering for 10k markers', status: 'IN_PROGRESS', priority: 'HIGH', due: -1, dev: 2, recentMins: 31 },
      { title: 'ETA prediction endpoint', status: 'IN_REVIEW', priority: 'HIGH', due: 3, dev: 3, recentMins: 8 },
      { title: 'Driver app auth', status: 'DONE', priority: 'HIGH', due: -8, dev: 3 },
      { title: 'CSV export of shipments', status: 'TODO', priority: 'LOW', due: 9, dev: 0 },
      { title: 'Geofence alerts', status: 'TODO', priority: 'MEDIUM', due: 5, dev: -1 },
    ],
  },
  {
    name: 'Patient Booking App',
    description: 'Appointment booking and reminders for Bluepeak Health clinics.',
    client: 2,
    pm: 1,
    tasks: [
      { title: 'Appointment calendar view', status: 'IN_REVIEW', priority: 'HIGH', due: 1, dev: 1, recentMins: 21 },
      { title: 'SMS reminder service', status: 'IN_PROGRESS', priority: 'MEDIUM', due: 3, dev: 2 },
      { title: 'HIPAA logging review', status: 'TODO', priority: 'CRITICAL', due: -3, dev: 3 },
      { title: 'Clinic onboarding wizard', status: 'DONE', priority: 'MEDIUM', due: -6, dev: 1 },
      { title: 'Doctor availability API', status: 'IN_PROGRESS', priority: 'HIGH', due: 5, dev: 0 },
      { title: 'Cancel / reschedule flow', status: 'TODO', priority: 'MEDIUM', due: 10, dev: -1 },
    ],
  },
  {
    name: 'Retail Analytics Dashboard',
    description: 'Weekly sales and inventory reporting for Acme Retail.',
    client: 0,
    pm: 1,
    tasks: [
      { title: 'Sales by region report', status: 'DONE', priority: 'MEDIUM', due: -4, dev: 3 },
      { title: 'Inventory low-stock alerts', status: 'IN_PROGRESS', priority: 'HIGH', due: 2, dev: 0 },
      { title: 'Scheduled PDF reports', status: 'TODO', priority: 'LOW', due: 14, dev: 2 },
      { title: 'Role-based report access', status: 'IN_REVIEW', priority: 'MEDIUM', due: 4, dev: 1, recentMins: 45 },
      { title: 'Data warehouse sync', status: 'TODO', priority: 'HIGH', due: 7, dev: 3 },
    ],
  },
];

async function main() {
  // Idempotent: wipe in FK-safe order, then rebuild.
  await prisma.notification.deleteMany();
  await prisma.activityLog.deleteMany();
  await prisma.task.deleteMany();
  await prisma.project.deleteMany();
  await prisma.client.deleteMany();
  await prisma.refreshToken.deleteMany();
  await prisma.user.deleteMany();

  const passwordHash = await bcrypt.hash(PASSWORD, 10);
  const mk = (name: string, email: string, role: Role) => prisma.user.create({ data: { name, email, role, passwordHash } });

  const admin = await mk('Asha Verma', 'admin@velozity.dev', 'ADMIN');
  const pms = [await mk('Meera Nair', 'meera.pm@velozity.dev', 'PROJECT_MANAGER'), await mk('Karan Shah', 'karan.pm@velozity.dev', 'PROJECT_MANAGER')];
  const devs = [
    await mk('Ravi Kumar', 'ravi@velozity.dev', 'DEVELOPER'),
    await mk('Priya Iyer', 'priya@velozity.dev', 'DEVELOPER'),
    await mk('Arjun Patel', 'arjun@velozity.dev', 'DEVELOPER'),
    await mk('Neha Gupta', 'neha@velozity.dev', 'DEVELOPER'),
  ];

  const clients = [
    await prisma.client.create({ data: { name: 'Acme Retail', contactEmail: 'it@acme-retail.example' } }),
    await prisma.client.create({ data: { name: 'Northwind Logistics', contactEmail: 'ops@northwind.example' } }),
    await prisma.client.create({ data: { name: 'Bluepeak Health', contactEmail: 'digital@bluepeak.example' } }),
  ];

  let activityCount = 0;
  let overdueCount = 0;

  for (const [pi, p] of projects.entries()) {
    const pm = pms[p.pm];
    const project = await prisma.project.create({
      data: { name: p.name, description: p.description, clientId: clients[p.client].id, createdById: pm.id, createdAt: at(-(20 + pi) * DAY) },
    });

    for (const [ti, t] of p.tasks.entries()) {
      const dev = t.dev >= 0 ? devs[t.dev] : null;
      const isOverdue = t.due !== null && t.due < 0 && t.status !== 'DONE';
      const createdAt = at(-(9 + ((pi + ti) % 5)) * DAY);

      const task = await prisma.task.create({
        data: {
          projectId: project.id,
          title: t.title,
          description: `${t.title} for ${p.name}.`,
          status: t.status,
          priority: t.priority,
          dueDate: t.due === null ? null : at(t.due * DAY),
          isOverdue,
          assigneeId: dev?.id ?? null,
          createdById: pm.id,
          createdAt,
        },
      });

      type Entry = { type: ActivityType; actorId: string | null; from?: TaskStatus; to?: TaskStatus; detail?: string; createdAt: Date };
      const entries: Entry[] = [{ type: 'TASK_CREATED', actorId: pm.id, to: 'TODO', detail: dev?.name, createdAt }];

      const steps = FLOW.indexOf(t.status);
      for (let s = 1; s <= steps; s++) {
        const isLast = s === steps;
        const when = isLast && t.recentMins ? at(-t.recentMins * MIN) : new Date(createdAt.getTime() + s * 7 * HOUR + ti * MIN);
        // Developers move their own work; the PM signs off Done.
        const actor = FLOW[s] === 'DONE' ? pm.id : (dev?.id ?? pm.id);
        entries.push({ type: 'STATUS_CHANGED', actorId: actor, from: FLOW[s - 1], to: FLOW[s], createdAt: when });
      }
      if (isOverdue) {
        overdueCount++;
        entries.push({ type: 'MARKED_OVERDUE', actorId: null, createdAt: new Date(at(t.due! * DAY).getTime() + MIN) });
      }

      await prisma.activityLog.createMany({
        data: entries.map((e) => ({
          taskId: task.id,
          projectId: project.id,
          actorId: e.actorId,
          type: e.type,
          fromStatus: e.from ?? null,
          toStatus: e.to ?? null,
          detail: e.detail ?? null,
          createdAt: e.createdAt,
        })),
      });
      activityCount += entries.length;

      // Notifications: assignee hears about assignment; PM hears about tasks sitting in review.
      if (dev) {
        await prisma.notification.create({
          data: {
            userId: dev.id,
            type: 'TASK_ASSIGNED',
            taskId: task.id,
            message: `${pm.name} assigned you Task #${task.id}: ${t.title}`,
            createdAt,
            readAt: t.status === 'TODO' ? null : at(-2 * DAY),
          },
        });
      }
      if (dev && t.status === 'IN_REVIEW') {
        await prisma.notification.create({
          data: {
            userId: pm.id,
            type: 'TASK_IN_REVIEW',
            taskId: task.id,
            message: `${dev.name} moved Task #${task.id} to In Review: ${t.title}`,
            createdAt: at(-(t.recentMins ?? 60) * MIN),
          },
        });
      }
    }
  }

  const taskCount = await prisma.task.count();
  console.log(`Seeded: 1 admin, ${pms.length} PMs, ${devs.length} developers, ${clients.length} clients, ${projects.length} projects, ${taskCount} tasks (${overdueCount} overdue), ${activityCount} activity entries.`);
  console.log(`All accounts use password: ${PASSWORD}`);
  console.log(`  ${admin.email} (admin) | ${pms.map((p) => p.email).join(', ')} | ${devs.map((d) => d.email).join(', ')}`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
