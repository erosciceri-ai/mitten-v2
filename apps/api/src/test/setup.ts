import { afterAll } from 'vitest';
import { closeDatabase } from '../db/index.js';
afterAll(async () => { await closeDatabase(); });
