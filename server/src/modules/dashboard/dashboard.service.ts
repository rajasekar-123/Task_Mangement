import { Priority, Prisma, TaskStatus } from '@prisma/client';
import { prisma } from '../../db/prisma';
import { AuthUser } from '../../middleware/auth';
import { taskScope } from '../../lib/scope';
import { onlineCount } from '../../realtime/socket';
import { taskInclude, taskOrder, toTaskDTO } from '../tasks/tasks.service';

const STATUSES: TaskStatus[] = ['TODO', 'IN_PROGRESS', 'IN_REVIEW', 'DONE'];
const PRIORITIES: Priority[] = ['LOW', 'MEDIUM', 'HIGH', 'CRITICAL'];

const byStatus = async (where: Prisma.TaskWhereInput) => {
  const groups = await prisma.task.groupBy({ by: ['status'], where, _count: { _all: true } });
  return Object.fromEntries(STATUSES.map((s) => [s, groups.find((g) => g.status === s)?._count._all ?? 0])) as Record<TaskStatus, number>;
};

const byPriority = async (where: Prisma.TaskWhereInput) => {
  const groups = await prisma.task.groupBy({ by: ['priority'], where, _count: { _all: true } });
  return Object.fromEntries(PRIORITIES.map((p) => [p, groups.find((g) => g.priority === p)?._count._all ?? 0])) as Record<Priority, number>;
};

export async function adminDashboard() {
  const [projects, clients, users, tasksByStatus, overdue] = await Promise.all([
    prisma.project.count(),
    prisma.client.count(),
    prisma.user.count({ where: { isActive: true } }),
    byStatus({}),
    prisma.task.count({ where: { isOverdue: true, status: { not: 'DONE' } } }),
  ]);
  return {
    role: 'ADMIN' as const,
    totalProjects: projects,
    totalClients: clients,
    totalUsers: users,
    tasksByStatus,
    totalTasks: Object.values(tasksByStatus).reduce((a, b) => a + b, 0),
    overdueCount: overdue,
    onlineUsers: onlineCount(),
  };
}

export async function pmDashboard(user: AuthUser) {
  const scope = taskScope(user);
  const now = new Date();
  const weekAhead = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000);

  const [projects, grouped, tasksByPriority, upcoming, overdue] = await Promise.all([
    prisma.project.findMany({
      where: { createdById: user.id },
      select: { id: true, name: true, client: { select: { name: true } } },
      orderBy: { createdAt: 'desc' },
    }),
    prisma.task.groupBy({ by: ['projectId', 'status'], where: scope, _count: { _all: true } }),
    byPriority(scope),
    prisma.task.findMany({
      where: { ...scope, status: { not: 'DONE' }, dueDate: { gte: now, lte: weekAhead } },
      include: taskInclude,
      orderBy: [{ dueDate: 'asc' }, { priority: 'desc' }],
      take: 50,
    }),
    prisma.task.count({ where: { ...scope, isOverdue: true, status: { not: 'DONE' } } }),
  ]);

  return {
    role: 'PROJECT_MANAGER' as const,
    projects: projects.map((p) => {
      const rows = grouped.filter((g) => g.projectId === p.id);
      const count = (s?: TaskStatus) => rows.filter((r) => !s || r.status === s).reduce((a, r) => a + r._count._all, 0);
      return { id: p.id, name: p.name, clientName: p.client.name, totalTasks: count(), doneTasks: count('DONE') };
    }),
    tasksByPriority,
    upcomingThisWeek: upcoming.map(toTaskDTO),
    overdueCount: overdue,
  };
}

export async function developerDashboard(user: AuthUser) {
  const scope = taskScope(user);
  const [tasks, tasksByStatus] = await Promise.all([
    prisma.task.findMany({ where: scope, include: taskInclude, orderBy: taskOrder, take: 200 }),
    byStatus(scope),
  ]);
  return {
    role: 'DEVELOPER' as const,
    tasks: tasks.map(toTaskDTO),
    tasksByStatus,
    overdueCount: tasks.filter((t) => t.isOverdue && t.status !== 'DONE').length,
  };
}

export function dashboardFor(user: AuthUser) {
  switch (user.role) {
    case 'ADMIN':
      return adminDashboard();
    case 'PROJECT_MANAGER':
      return pmDashboard(user);
    default:
      return developerDashboard(user);
  }
}
