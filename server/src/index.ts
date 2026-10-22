import { createServer } from 'http';
import { createApp } from './app';
import { env } from './config/env';
import { prisma } from './db/prisma';
import { startJobs } from './jobs/overdue';
import { initSocket } from './realtime/socket';

const server = createServer(createApp());
initSocket(server);
startJobs();

server.listen(env.PORT, () => console.log(`API + WebSocket listening on :${env.PORT} (${env.NODE_ENV})`));

const shutdown = async () => {
  server.close();
  await prisma.$disconnect();
  process.exit(0);
};
process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);
