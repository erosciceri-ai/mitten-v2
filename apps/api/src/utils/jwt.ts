import { config, validateConfig } from '../config/index.js';
import jwt from 'jsonwebtoken';
import { findUserById } from '../models/User.js';




export interface JWTPayload {
  userId: number;
  email: string;
  iat?: number;
  exp?: number;
}

export function generateToken(payload: Omit<JWTPayload, 'iat' | 'exp'>): string {
  validateConfig();
  return jwt.sign(payload, config.jwtSecret, { expiresIn: config.jwtExpiresIn as jwt.SignOptions['expiresIn'] });
}

export function verifyToken(token: string): JWTPayload | null {
  try {
    return jwt.verify(token, config.jwtSecret) as JWTPayload;
  } catch {
    return null;
  }
}

export function extractTokenFromHeader(authHeader: string | undefined): string | null {
  if (!authHeader) return null;
  const parts = authHeader.split(' ');
  if (parts.length !== 2 || parts[0] !== 'Bearer') return null;
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