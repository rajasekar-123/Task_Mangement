import type { User } from './types';

export class ApiError extends Error {
  constructor(
    public status: number,
    public code: string,
    message: string,
    public details?: { path: string; message: string }[],
  ) {
    super(message);
  }
}

interface AuthResult {
  user: User;
  accessToken: string;
}

// The access token lives only in memory: gone on reload, never in localStorage.
// The long-lived refresh token is an HttpOnly cookie that JS cannot read.
let accessToken: string | null = null;
let onSessionLost: () => void = () => {};

export const getAccessToken = () => accessToken;
export const setSessionLostHandler = (fn: () => void) => (onSessionLost = fn);

let inflightRefresh: Promise<AuthResult | null> | null = null;

/** Single-flight: concurrent 401s (or React StrictMode double effects) share one refresh call. */
export function refreshSession(): Promise<AuthResult | null> {
  inflightRefresh ??= fetch('/api/auth/refresh', { method: 'POST', credentials: 'include' })
    .then(async (res) => {
      if (!res.ok) return null;
      const { data } = (await res.json()) as { data: AuthResult };
      accessToken = data.accessToken;
      return data;
    })
    .catch(() => null)
    .finally(() => {
      inflightRefresh = null;
    });
  return inflightRefresh;
}

async function toError(res: Response): Promise<ApiError> {
  try {
    const body = await res.json();
    return new ApiError(res.status, body.error?.code ?? 'ERROR', body.error?.message ?? res.statusText, body.error?.details);
  } catch {
    return new ApiError(res.status, 'ERROR', res.statusText);
  }
}

export async function request<T>(path: string, init: { method?: string; body?: unknown } = {}, retry = true): Promise<T> {
  const res = await fetch(path, {
    method: init.method ?? 'GET',
    credentials: 'include',
    headers: {
      ...(init.body !== undefined && { 'Content-Type': 'application/json' }),
      ...(accessToken && { Authorization: `Bearer ${accessToken}` }),
    },
    body: init.body === undefined ? undefined : JSON.stringify(init.body),
  });

  if (res.status === 401 && retry && !path.startsWith('/api/auth/')) {
    if (await refreshSession()) return request<T>(path, init, false);
    accessToken = null;
    onSessionLost();
  }
  if (!res.ok) throw await toError(res);
  if (res.status === 204) return undefined as T;
  const json = await res.json();
  return ('data' in json && Object.keys(json).length === 1 ? json.data : json) as T;
}

export const api = {
  get: <T>(path: string) => request<T>(path),
  post: <T>(path: string, body?: unknown) => request<T>(path, { method: 'POST', body: body ?? {} }),
  patch: <T>(path: string, body: unknown) => request<T>(path, { method: 'PATCH', body }),
  del: (path: string) => request<void>(path, { method: 'DELETE' }),
};

export async function login(email: string, password: string): Promise<User> {
  const res = await fetch('/api/auth/login', {
    method: 'POST',
    credentials: 'include',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password }),
  });
  if (!res.ok) throw await toError(res);
  const { data } = (await res.json()) as { data: AuthResult };
  accessToken = data.accessToken;
  return data.user;
}

export async function logout() {
  await fetch('/api/auth/logout', { method: 'POST', credentials: 'include' }).catch(() => {});
  accessToken = null;
}
