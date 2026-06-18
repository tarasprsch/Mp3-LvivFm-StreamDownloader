import crypto from 'node:crypto';
import type { Request, Response, NextFunction } from 'express';
import type { ConfigStore } from './config.js';

const cookieName = 'lfm_session';

export class AuthService {
  private readonly sessions = new Set<string>();

  constructor(private readonly configStore: ConfigStore) {}

  login(password: string): string | undefined {
    if (!passwordMatches(password, this.configStore.value.auth.password)) return undefined;
    const token = crypto.randomBytes(32).toString('base64url');
    this.sessions.add(token);
    return token;
  }

  logout(token: string | undefined): void {
    if (token) this.sessions.delete(token);
  }

  isAuthenticated(token: string | undefined): boolean {
    return Boolean(token && this.sessions.has(token));
  }

  middleware = (request: Request, response: Response, next: NextFunction): void => {
    if (this.isAuthenticated(readCookie(request, cookieName))) {
      next();
      return;
    }
    response.status(401).json({ error: 'Authentication required' });
  };
}

export function passwordMatches(candidate: string, expected: string): boolean {
  const candidateBytes = Buffer.from(candidate);
  const expectedBytes = Buffer.from(expected);
  if (candidateBytes.length !== expectedBytes.length) return false;
  return crypto.timingSafeEqual(candidateBytes, expectedBytes);
}

export function setSessionCookie(response: Response, token: string): void {
  response.cookie(cookieName, token, {
    httpOnly: true,
    sameSite: 'strict',
    path: '/',
    maxAge: 1000 * 60 * 60 * 12
  });
}

export function clearSessionCookie(response: Response): void {
  response.clearCookie(cookieName, { path: '/' });
}

export function readCookie(request: Request, name: string): string | undefined {
  const header = request.headers.cookie;
  if (!header) return undefined;
  for (const part of header.split(';')) {
    const [rawKey, ...rawValue] = part.trim().split('=');
    if (rawKey === name) return decodeURIComponent(rawValue.join('='));
  }
  return undefined;
}
