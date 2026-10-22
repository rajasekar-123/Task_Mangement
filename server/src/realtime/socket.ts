import type { Server as HttpServer } from 'http';
import { Server } from 'socket.io';
import { Role } from '@prisma/client';
import { env } from '../config/env';
import { resolveUser } from '../middleware/auth';

export const rooms = {
  user: (id: string) => `user:${id}`,
  role: (role: Role) => `role:${role}`,
};

let io: Server | null = null;

/**
 * Presence: userId -> open socket count. A user with two tabs is one online user.
 * In-memory is fine for a single instance; see README "Known limitations" for the multi-instance story.
 */
const presence = new Map<string, number>();
export const onlineCount = () => presence.size;

const broadcastPresence = () => io?.to(rooms.role('ADMIN')).emit('presence:count', { count: onlineCount() });

export function initSocket(server: HttpServer) {
  io = new Server(server, {
    cors: { origin: env.corsOrigins, credentials: true },
  });

  // Authenticate the handshake. Unauthenticated sockets never connect, so they never join a room.
  io.use(async (socket, next) => {
    try {
      const token = socket.handshake.auth?.token;
      if (typeof token !== 'string') return next(new Error('UNAUTHORIZED'));
      socket.data.user = await resolveUser(token);
      next();
    } catch {
      next(new Error('UNAUTHORIZED'));
    }
  });

  io.on('connection', (socket) => {
    const user = socket.data.user as { id: string; role: Role };
    // Rooms are derived from the DB-verified identity only; clients cannot ask to join arbitrary rooms.
    socket.join(rooms.user(user.id));
    socket.join(rooms.role(user.role));

    presence.set(user.id, (presence.get(user.id) ?? 0) + 1);
    broadcastPresence();
    if (user.role === 'ADMIN') socket.emit('presence:count', { count: onlineCount() });

    socket.on('disconnect', () => {
      const n = (presence.get(user.id) ?? 1) - 1;
      if (n <= 0) presence.delete(user.id);
      else presence.set(user.id, n);
      broadcastPresence();
    });
  });

  return io;
}

export const getIO = () => io;

export const disconnectUser = (userId: string) => io?.in(rooms.user(userId)).disconnectSockets(true);
