/**
 * Pablo v5 Database Schema - Drizzle ORM for Cloudflare D1 (SQLite)
 *
 * Tables:
 * - sessions: IDE sessions
 * - messages: Chat messages per session
 * - files: Virtual file system per session
 * - pipeline_runs: Feature Factory pipeline executions
 * - pipeline_stages: Individual stage results
 * - patterns: Self-learning pattern memory
 * - domain_kb: Domain knowledge base entries
 */

import { sqliteTable, text, integer, real } from 'drizzle-orm/sqlite-core';
import { sql } from 'drizzle-orm';

// ─── Sessions ────────────────────────────────────────────────────────────────

export const sessions = sqliteTable('sessions', {
  id: text('id').primaryKey(),
  title: text('title').notNull().default('Untitled Session'),
  repoUrl: text('repo_url'),
  repoBranch: text('repo_branch').default('main'),
  createdAt: text('created_at')
    .notNull()
    .default(sql`(datetime('now'))`),
  updatedAt: text('updated_at')
    .notNull()
    .default(sql`(datetime('now'))`),
  status: text('status', { enum: ['active', 'paused', 'completed', 'error'] })
    .notNull()
    .default('active'),
  metadata: text('metadata'), // JSON string for flexible data
  snapshot: text('snapshot'), // JSON string of SessionSnapshot — full IDE state
});

// ─── Messages ────────────────────────────────────────────────────────────────

export const messages = sqliteTable('messages', {
  id: text('id').primaryKey(),
  sessionId: text('session_id')
    .notNull()
    .references(() => sessions.id, { onDelete: 'cascade' }),
  role: text('role', { enum: ['user', 'assistant', 'system'] }).notNull(),
  content: text('content').notNull(),
  model: text('model'),
  tokens: integer('tokens'),
  durationMs: integer('duration_ms'),
  createdAt: text('created_at')
    .notNull()
    .default(sql`(datetime('now'))`),
});

// ─── Files (Virtual File System) ─────────────────────────────────────────────

export const files = sqliteTable('files', {
  id: text('id').primaryKey(),
  sessionId: text('session_id')
    .notNull()
    .references(() => sessions.id, { onDelete: 'cascade' }),
  path: text('path').notNull(),
  name: text('name').notNull(),
  content: text('content').notNull().default(''),
  language: text('language').default('plaintext'),
  isDirectory: integer('is_directory', { mode: 'boolean' }).notNull().default(false),
  parentPath: text('parent_path'),
  createdAt: text('created_at')
    .notNull()
    .default(sql`(datetime('now'))`),
  updatedAt: text('updated_at')
    .notNull()
    .default(sql`(datetime('now'))`),
});

// ─── Pipeline Runs (Feature Factory) ─────────────────────────────────────────

export const pipelineRuns = sqliteTable('pipeline_runs', {
  id: text('id').primaryKey(),
  sessionId: text('session_id')
    .notNull()
    .references(() => sessions.id, { onDelete: 'cascade' }),
  featureDescription: text('feature_description').notNull(),
  status: text('status', {
    enum: ['pending', 'running', 'completed', 'failed', 'cancelled'],
  })
    .notNull()
    .default('pending'),
  currentStage: text('current_stage', {
    enum: ['plan', 'db', 'api', 'ui', 'ux_validation', 'tests', 'execute', 'review'],
  }).default('plan'),
  planOutput: text('plan_output'), // JSON
  dbOutput: text('db_output'), // JSON
  apiOutput: text('api_output'), // JSON
  uiOutput: text('ui_output'), // JSON
  testsOutput: text('tests_output'), // JSON
  executeOutput: text('execute_output'), // JSON
  reviewOutput: text('review_output'), // JSON
  totalTokens: integer('total_tokens').default(0),
  totalDurationMs: integer('total_duration_ms').default(0),
  createdAt: text('created_at')
    .notNull()
    .default(sql`(datetime('now'))`),
  completedAt: text('completed_at'),
});

// ─── Pipeline Stages ─────────────────────────────────────────────────────────

export const pipelineStages = sqliteTable('pipeline_stages', {
  id: text('id').primaryKey(),
  runId: text('run_id')
    .notNull()
    .references(() => pipelineRuns.id, { onDelete: 'cascade' }),
  stage: text('stage', {
    enum: ['plan', 'db', 'api', 'ui', 'ux_validation', 'tests', 'execute', 'review'],
  }).notNull(),
  status: text('status', {
    enum: ['pending', 'running', 'completed', 'failed', 'skipped'],
  })
    .notNull()
    .default('pending'),
  input: text('input'), // JSON
  output: text('output'), // JSON
  model: text('model'),
  tokens: integer('tokens').default(0),
  durationMs: integer('duration_ms').default(0),
  error: text('error'),
  startedAt: text('started_at'),
  completedAt: text('completed_at'),
});

// ─── Patterns (Self-Learning) ────────────────────────────────────────────────

export const patterns = sqliteTable('patterns', {
  id: text('id').primaryKey(),
  sessionId: text('session_id').references(() => sessions.id, {
    onDelete: 'set null',
  }),
  type: text('type', {
    enum: ['code_pattern', 'error_fix', 'architecture', 'convention', 'shortcut'],
  }).notNull(),
  trigger: text('trigger_text').notNull(), // What triggers this pattern
  action: text('action').notNull(), // What to do
  confidence: real('confidence').notNull().default(0.5),
  usageCount: integer('usage_count').notNull().default(0),
  lastUsedAt: text('last_used_at'),
  metadata: text('metadata'), // JSON
  createdAt: text('created_at')
    .notNull()
    .default(sql`(datetime('now'))`),
});

// ─── Domain Knowledge Base ───────────────────────────────────────────────────

export const domainKb = sqliteTable('domain_kb', {
  id: text('id').primaryKey(),
  category: text('category', {
    enum: ['framework', 'library', 'pattern', 'convention', 'api', 'config'],
  }).notNull(),
  title: text('title').notNull(),
  content: text('content').notNull(),
  tags: text('tags'), // JSON array of tags
  source: text('source'), // Where this knowledge came from
  confidence: real('confidence').notNull().default(0.8),
  createdAt: text('created_at')
    .notNull()
    .default(sql`(datetime('now'))`),
  updatedAt: text('updated_at')
    .notNull()
    .default(sql`(datetime('now'))`),
});

// ─── Secrets (Environment Variables) ────────────────────────────────────────

export const secrets = sqliteTable('secrets', {
  id: text('id').primaryKey(),
  sessionId: text('session_id').references(() => sessions.id, {
    onDelete: 'cascade',
  }),
  key: text('key').notNull(),
  value: text('value').notNull(),
  createdAt: text('created_at')
    .notNull()
    .default(sql`(datetime('now'))`),
  updatedAt: text('updated_at')
    .notNull()
    .default(sql`(datetime('now'))`),
});

// ─── Type exports ────────────────────────────────────────────────────────────

export type Session = typeof sessions.$inferSelect;
export type NewSession = typeof sessions.$inferInsert;
export type Message = typeof messages.$inferSelect;
export type NewMessage = typeof messages.$inferInsert;
export type FileRecord = typeof files.$inferSelect;
export type NewFileRecord = typeof files.$inferInsert;
export type PipelineRun = typeof pipelineRuns.$inferSelect;
export type NewPipelineRun = typeof pipelineRuns.$inferInsert;
export type PipelineStage = typeof pipelineStages.$inferSelect;
export type NewPipelineStage = typeof pipelineStages.$inferInsert;
export type Pattern = typeof patterns.$inferSelect;
export type NewPattern = typeof patterns.$inferInsert;
export type DomainKbEntry = typeof domainKb.$inferSelect;
export type NewDomainKbEntry = typeof domainKb.$inferInsert;
