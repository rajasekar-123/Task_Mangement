import { Notification, NotificationType, Prisma } from '@prisma/client';
import { prisma } from '../../db/prisma';
import { notFound } from '../../lib/errors';
import { getIO, rooms } from '../../realtime/socket';

export interface NotificationDTO {
  id: string;
  type: NotificationType;
  message: string;
  taskId: number | null;
  read: boolean;
  createdAt: string;
}

const toDTO = (n: Notification): NotificationDTO => ({
  id: n.id,
  type: n.type,
  message: n.message,
  taskId: n.taskId,
  read: n.readAt !== null,
  createdAt: n.createdAt.toISOString(),
});

export const unreadCount = (userId: string) => prisma.notification.count({ where: { userId, readAt: null } });

/** Persist inside the caller's transaction; deliver with `deliver` after it commits. */
export const createNotification = (
  tx: Prisma.TransactionClient,
  data: { userId: string; type: NotificationType; message: string; taskId: number },
) => tx.notification.create({ data });

export async function deliver(n: Notification) {
  getIO()
    ?.to(rooms.user(n.userId))
    .emit('notification:new', { notification: toDTO(n), unreadCount: await unreadCount(n.userId) });
}

async function pushCount(userId: string) {
  getIO()
    ?.to(rooms.user(userId))
    .emit('notification:count', { unreadCount: await unreadCount(userId) });
}

export async function list(userId: string, limit = 20) {
  const [rows, count] = await Promise.all([
    prisma.notification.findMany({ where: { userId }, orderBy: { createdAt: 'desc' }, take: limit }),
    unreadCount(userId),
  ]);
  return { data: rows.map(toDTO), unreadCount: count };
}

export async function markRead(userId: string, id: string) {
  // userId in the where clause: you can only touch your own notifications.
  const res = await prisma.notification.updateMany({ where: { id, userId, readAt: null }, data: { readAt: new Date() } });
  if (res.count === 0) {
    const exists = await prisma.notification.findFirst({ where: { id, userId }, select: { id: true } });
    if (!exists) throw notFound('Notification');
  }
  await pushCount(userId);
}

export async function markAllRead(userId: string) {
  await prisma.notification.updateMany({ where: { userId, readAt: null }, data: { readAt: new Date() } });
  await pushCount(userId);
}
