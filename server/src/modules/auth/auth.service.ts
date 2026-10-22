import bcrypt from 'bcryptjs';
import { randomUUID } from 'crypto';
import { prisma } from '../../db/prisma';
import { env } from '../../config/env';
import { unauthorized } from '../../lib/errors';
import { signAccessToken, signRefreshToken, verifyRefreshToken } from '../../lib/tokens';

// Compared against when the email is unknown so response time doesn't reveal which emails exist.
const DUMMY_HASH = bcrypt.hashSync('not-a-real-password', 10);

const publicUser = (u: { id: string; name: string; email: string; role: string }) => ({
  id: u.id,
  name: u.name,
  email: u.email,
  role: u.role,
});

async function issueRefreshToken(userId: string) {
  const id = randomUUID();
  const expiresAt = new Date(Date.now() + env.REFRESH_TOKEN_TTL_DAYS * 24 * 60 * 60 * 1000);
  await prisma.refreshToken.create({ data: { id, userId, expiresAt } });
  return signRefreshToken(userId, id);
}

export async function login(email: string, password: string) {
  const user = await prisma.user.findUnique({ where: { email: email.toLowerCase() } });
  const ok = await bcrypt.compare(password, user?.passwordHash ?? DUMMY_HASH);
  if (!user || !ok || !user.isActive) throw unauthorized('Invalid email or password');
  return {
    user: publicUser(user),
    accessToken: signAccessToken(user.id, user.role),
    refreshToken: await issueRefreshToken(user.id),
  };
}

/**
 * Rotating refresh tokens: every refresh revokes the presented token and issues a new one.
 * Presenting an already-revoked token means it was stolen or replayed, so every session for that user is revoked.
 */
export async function refresh(token: string | undefined) {
  if (!token) throw unauthorized('Missing refresh token');
  let payload;
  try {
    payload = verifyRefreshToken(token);
  } catch {
    throw unauthorized('Invalid refresh token');
  }

  const row = await prisma.refreshToken.findUnique({ where: { id: payload.jti } });
  if (!row || row.userId !== payload.sub) throw unauthorized('Invalid refresh token');
  if (row.revokedAt) {
    await prisma.refreshToken.updateMany({ where: { userId: row.userId, revokedAt: null }, data: { revokedAt: new Date() } });
    throw unauthorized('Refresh token reuse detected; please sign in again');
  }
  if (row.expiresAt < new Date()) throw unauthorized('Refresh token expired');

  // Atomic claim: only one concurrent request can flip revokedAt from null.
  const claimed = await prisma.refreshToken.updateMany({ where: { id: row.id, revokedAt: null }, data: { revokedAt: new Date() } });
  if (claimed.count === 0) throw unauthorized('Refresh token already used');

  const user = await prisma.user.findUnique({ where: { id: row.userId } });
  if (!user || !user.isActive) throw unauthorized('Account not found or disabled');

  return {
    user: publicUser(user),
    accessToken: signAccessToken(user.id, user.role),
    refreshToken: await issueRefreshToken(user.id),
  };
}

export async function logout(token: string | undefined) {
  if (!token) return;
  try {
    const payload = verifyRefreshToken(token);
    await prisma.refreshToken.updateMany({ where: { id: payload.jti, revokedAt: null }, data: { revokedAt: new Date() } });
  } catch {
    // Already invalid: nothing to revoke.
  }
}

export const revokeAllForUser = (userId: string) =>
  prisma.refreshToken.updateMany({ where: { userId, revokedAt: null }, data: { revokedAt: new Date() } });
