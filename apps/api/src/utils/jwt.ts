import { config, jwtLifetimeSeconds } from '../config/index.js';
import jwt from 'jsonwebtoken';
import { findUserById } from '../models/User.js';




export interface JWTPayload {
  userId: number;
  email: string;
  iat?: number;
  exp?: number;
}

export function generateToken(payload: Omit<JWTPayload, 'iat' | 'exp'>): string {
  if (config.jwtSecret.length < 32) throw new Error('Invalid JWT signing configuration');
  return jwt.sign(payload, config.jwtSecret, { algorithm: 'HS256', expiresIn: jwtLifetimeSeconds(config.jwtExpiresIn) });
}

export function verifyToken(token: string): JWTPayload | null {
  try {
    if (config.jwtSecret.length < 32) return null;
    const payload = jwt.verify(token, config.jwtSecret, { algorithms: ['HS256'] });
    if (typeof payload !== 'object' || !Number.isSafeInteger(payload.userId) || payload.userId < 1 ||
        typeof payload.email !== 'string' || !Number.isSafeInteger(payload.iat) || !Number.isSafeInteger(payload.exp) ||
        payload.iat! >= payload.exp!) return null;
    return { userId: payload.userId, email: payload.email, iat: payload.iat, exp: payload.exp };
  } catch {
    return null;
  }
}

export function extractTokenFromHeader(authHeader: string | undefined): string | null {
  if (!authHeader) return null;
  const parts = authHeader.split(' ');
  if (parts.length !== 2 || parts[0].toLowerCase() !== 'bearer') return null;
  return parts[1];
}

export async function authenticateRequest(authHeader: string | undefined): Promise<{ userId: number; email: string } | null> {
  const token = extractTokenFromHeader(authHeader);
  if (!token) return null;

  const payload = verifyToken(token);
  if (!payload) return null;

  const user = await findUserById(payload.userId);
  if (!user) return null;

  return { userId: user.id, email: user.email };
}