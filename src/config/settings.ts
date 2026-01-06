import 'dotenv/config';

export const config = {
  port: parseInt(process.env.PORT || '8094', 10),
  host: process.env.HOST || '127.0.0.1',
  dbPath: process.env.DB_PATH || 'data.db',
  logLevel: process.env.LOG_LEVEL || 'info',
  openBrowser: process.env.OPEN_BROWSER === 'true',
};
