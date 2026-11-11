import { getDatabase, closeDatabase } from './index.js';
try { await getDatabase(); console.log('Database migrations completed'); }
catch { console.error('Database migration failed'); process.exitCode = 1; }
finally { await closeDatabase().catch(() => { process.exitCode = 1; }); }
