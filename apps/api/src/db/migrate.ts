import { getDatabase, closeDatabase } from './index.js';
try { await getDatabase(); console.log('Database migrations completed'); }
finally { await closeDatabase(); }
