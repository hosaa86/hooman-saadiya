import crypto from 'node:crypto';
import type { NextFunction, Request, Response } from 'express';
import { config } from './config.js';

/** With APP_PASSWORD set, the browser asks for it (any user name). Without it, the app is open on the network. */
export function authorized(header: string | undefined): boolean {
  if (!config.appPassword) return true;
  if (!header?.startsWith('Basic ')) return false;
  const decoded = Buffer.from(header.slice(6), 'base64').toString('utf8');
  const pass = decoded.slice(decoded.indexOf(':') + 1);
  const a = crypto.createHash('sha256').update(pass).digest();
  const b = crypto.createHash('sha256').update(config.appPassword).digest();
  return crypto.timingSafeEqual(a, b);
}

export function requireLogin(req: Request, res: Response, next: NextFunction) {
  if (authorized(req.headers.authorization)) return next();
  res.set('WWW-Authenticate', 'Basic realm="YummyTime Command Center", charset="UTF-8"').status(401).send('Login required');
}
