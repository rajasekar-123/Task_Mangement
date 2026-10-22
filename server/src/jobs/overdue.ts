import cron from 'node-cron';
import { prisma } from '../db/prisma';
import { env } from '../config/env';
import { publishActivity, publishTaskUpdated } from '../realtime/publisher';
import { activityInclude } from '../modules/activity/activity.service';
import { taskInclude, toTaskDTO } from '../modules/tasks/tasks.service';

/**
 * Flags every unfinished task whose due date has passed.
 *
 * The flip is a single UPDATE ... WHERE "isOverdue" = false RETURNING, so each task is flagged (and logged)
 * exactly once even if several API instances run this job at the same time: the second instance's UPDATE
 * matches zero rows. The flag and its activity entries commit in the same transaction.
 */
export async function flagOverdueTasks(): Promise<number> {
  const flagged = await prisma.$transaction(async (tx) => {
    const rows = await tx.$queryRaw<{ id: number; projectId: string }[]>`
      UPDATE "Task"
      SET "isOverdue" = true, "updatedAt" = now()
      WHERE "isOverdue" = false AND "status" <> 'DONE' AND "dueDate" IS NOT NULL AND "dueDate" < now()
      RETURNING "id", "projectId"`;
    if (rows.length === 0) return [];
    await tx.activityLog.createMany({
      data: rows.map((r) => ({ taskId: r.id, projectId: r.projectId, actorId: null, type: 'MARKED_OVERDUE' as const })),
    });
    return rows.map((r) => r.id);
  });
  if (flagged.length === 0) return 0;

  // Realtime fan-out after commit.
  const [tasks, activities] = await Promise.all([
    prisma.task.findMany({ where: { id: { in: flagged } }, include: taskInclude }),
    prisma.activityLog.findMany({
      where: { taskId: { in: flagged }, type: 'MARKED_OVERDUE' },
      include: activityInclude,
      orderBy: { createdAt: 'desc' },
      take: flagged.length,
    }),
  ]);
  tasks.forEach((t) => publishTaskUpdated(toTaskDTO(t), t.project.createdById));
  activities.forEach(publishActivity);
  return flagged.length;
}

async function purgeExpiredRefreshTokens() {
  await prisma.refreshToken.deleteMany({ where: { expiresAt: { lt: new Date() } } });
}

export function startJobs() {
  let running = false;
  const sweep = async () => {
    if (running) return; // never overlap with a slow previous run
    running = true;
    try {
      const n = await flagOverdueTasks();
      if (n > 0) console.log(`[overdue-job] flagged ${n} task(s)`);
    } catch (err) {
      console.error('[overdue-job] failed', err);
    } finally {
      running = false;
    }
  };

  cron.schedule(env.OVERDUE_CRON, sweep);
  cron.schedule('0 3 * * *', () => purgeExpiredRefreshTokens().catch((e) => console.error('[token-cleanup] failed', e)));
  void sweep(); // catch up immediately after a restart instead of waiting for the next tick
}
