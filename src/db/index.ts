import Database, { type Database as DatabaseType } from 'better-sqlite3';
import { drizzle } from 'drizzle-orm/better-sqlite3';
import { config } from '../config/settings.js';
import * as schema from './schema.js';

// Create SQLite connection
const sqlite: DatabaseType = new Database(config.dbPath);
sqlite.pragma('journal_mode = WAL');

// Create Drizzle instance
export const db = drizzle(sqlite, { schema });

// Export for direct access if needed
export { sqlite };
