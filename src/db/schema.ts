import { sqliteTable, text, integer } from 'drizzle-orm/sqlite-core';

// Accounts table
export const accounts = sqliteTable('accounts', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  email: text('email').notNull().unique(),
  displayName: text('display_name'),
  photoUrl: text('photo_url'),
  accessToken: text('access_token').notNull(),
  refreshToken: text('refresh_token').notNull(),
  expiresAt: integer('expires_at').notNull(),
  isActive: integer('is_active', { mode: 'boolean' }).notNull().default(true),
  sortOrder: integer('sort_order').notNull().default(0),
  createdAt: integer('created_at').notNull(),
  updatedAt: integer('updated_at').notNull(),
});

// Current account selection
export const currentAccount = sqliteTable('current_account', {
  id: integer('id').primaryKey().default(1),
  accountId: integer('account_id').references(() => accounts.id),
});

// Quota info for accounts
export const quotaInfo = sqliteTable('quota_info', {
  accountId: integer('account_id').primaryKey().references(() => accounts.id),
  inputQuota: integer('input_quota').notNull().default(0),
  inputUsed: integer('input_used').notNull().default(0),
  outputQuota: integer('output_quota').notNull().default(0),
  outputUsed: integer('output_used').notNull().default(0),
  updatedAt: integer('updated_at').notNull(),
});

// App configuration key-value store
export const appConfig = sqliteTable('app_config', {
  key: text('key').primaryKey(),
  value: text('value').notNull(),
});

// Proxy configuration
export const proxyConfig = sqliteTable('proxy_config', {
  id: integer('id').primaryKey().default(1),
  enabled: integer('enabled', { mode: 'boolean' }).notNull().default(false),
  host: text('host').notNull().default('127.0.0.1'),
  port: integer('port').notNull().default(8094),
  schedulingMode: text('scheduling_mode').notNull().default('cache-first'),
  sessionStickiness: integer('session_stickiness', { mode: 'boolean' }).notNull().default(true),
  allowedModels: text('allowed_models').notNull().default('[]'),
  apiKey: text('api_key'),
  createdAt: integer('created_at').notNull(),
  updatedAt: integer('updated_at').notNull(),
});

// Proxy monitor logs
export const proxyMonitorLogs = sqliteTable('proxy_monitor_logs', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  timestamp: integer('timestamp').notNull(),
  method: text('method').notNull(),
  path: text('path').notNull(),
  statusCode: integer('status_code').notNull(),
  latencyMs: integer('latency_ms').notNull(),
  accountEmail: text('account_email'),
  model: text('model'),
  inputTokens: integer('input_tokens'),
  outputTokens: integer('output_tokens'),
  errorMessage: text('error_message'),
});

// Type exports
export type Account = typeof accounts.$inferSelect;
export type NewAccount = typeof accounts.$inferInsert;
export type ProxyConfig = typeof proxyConfig.$inferSelect;
export type MonitorLog = typeof proxyMonitorLogs.$inferSelect;
