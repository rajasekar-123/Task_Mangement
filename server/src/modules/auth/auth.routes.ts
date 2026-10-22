import { CookieOptions, Response, Router } from 'express';
import rateLimit from 'express-rate-limit';
import { z } from 'zod';
import { env } from '../../config/env';
import { authenticate, me } from '../../middleware/auth';
import { parse } from '../../middleware/error';
import * as service from './auth.service';

const COOKIE = 'refresh_token';

const cookieOptions = (): CookieOptions => ({
  httpOnly: true, // not readable from JS, so XSS cannot exfiltrate it
  secure: env.cookieSecure,
  sameSite: env.COOKIE_SAMESITE,
  path: '/api/auth', // only ever sent to the auth endpoints
});

const setRefreshCookie = (res: Response, token: string) =>
  res.cookie(COOKIE, token, { ...cookieOptions(), maxAge: env.REFRESH_TOKEN_TTL_DAYS * 24 * 60 * 60 * 1000 });

const loginBody = z.object({
  email: z.string().trim().email().max(254),
  password: z.string().min(1).max(200),
});

const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: env.isProd ? 20 : 200,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: { code: 'RATE_LIMITED', message: 'Too many login attempts. Try again later.' } },
});

export const authRouter = Router();

authRouter.post('/login', loginLimiter, async (req, res) => {
  const { email, password } = parse(loginBody, req.body);
  const { user, accessToken, refreshToken } = await service.login(email, password);
  setRefreshCookie(res, refreshToken);
  res.json({ data: { user, accessToken } });
});

authRouter.post('/refresh', async (req, res) => {
  try {
    const { user, accessToken, refreshToken } = await service.refresh(req.cookies?.[COOKIE]);
    setRefreshCookie(res, refreshToken);
    res.json({ data: { user, accessToken } });
  } catch (err) {
    res.clearCookie(COOKIE, cookieOptions());
    throw err;
  }
});

authRouter.post('/logout', async (req, res) => {
  await service.logout(req.cookies?.[COOKIE]);
  res.clearCookie(COOKIE, cookieOptions());
  res.status(204).end();
});

authRouter.get('/me', authenticate, (req, res) => {
  res.json({ data: { user: me(req) } });
});
