import dotenv from 'dotenv';

dotenv.config();

export interface AppConfig {
  port: number;
  nodeEnv: string;
  jwtSecret: string;
  jwtExpiresIn: string;
  dbPath: string;
  corsOrigin: string;
}

function getEnv(key: string, defaultValue?: string): string {
  const value = process.env[key];
  if (value === undefined) {
    if (defaultValue !== undefined) {
      return defaultValue;
    }
    throw new Error(`Missing required environment variable: ${key}`);
  }
  return value;
}

function validateCorsOrigin(origin: string): string {
  if (origin === '*') {
    throw new Error('CORS origin cannot be "*" when credentials are enabled. Specify an explicit origin.');
  }
  return origin;
}

export const config: AppConfig = {
  port: parseInt(getEnv('PORT', '3000'), 10),
  nodeEnv: getEnv('NODE_ENV', 'development'),
  jwtSecret: getEnv('JWT_SECRET'),
  jwtExpiresIn: getEnv('JWT_EXPIRES_IN', '7d'),
  dbPath: getEnv('DB_PATH', './data/mitten.db'),
  corsOrigin: validateCorsOrigin(getEnv('CORS_ORIGIN', 'http://localhost:5173')),
};

export function validateConfig(): void {
  if (!config.jwtSecret || config.jwtSecret.length < 32) {
    throw new Error('JWT_SECRET must be at least 32 characters long');
  }
  if (config.port < 1 || config.port > 65535) {
    throw new Error('Invalid PORT');
  }
}