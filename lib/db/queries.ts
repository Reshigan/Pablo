/**
 * Pablo v5 Database Queries
 * Helper functions for CRUD operations on all tables
 * These will be used by API routes and the Feature Factory
 */

import type {
  Session,
  NewSession,
  Message,
  NewMessage,
  FileRecord,
  NewFileRecord,
  PipelineRun,
  NewPipelineRun,
  PipelineStage,
  NewPipelineStage,
  Pattern,
  NewPattern,
  DomainKbEntry,
  NewDomainKbEntry,
} from './schema';

// ─── ID Generation ───────────────────────────────────────────────────────────

let idCounter = 0;

export function generateId(prefix: string = ''): string {
  idCounter += 1;
  const timestamp = Date.now().toString(36);
  const random = Math.random().toString(36).substring(2, 8);
  const counter = idCounter.toString(36);
  return prefix ? `${prefix}_${timestamp}${random}${counter}` : `${timestamp}${random}${counter}`;
}

// ─── In-Memory Store (until D1 is connected) ─────────────────────────────────
// This provides a working data layer during development
// Will be replaced with actual D1 queries when Cloudflare Workers are configured

class InMemoryStore {
  private sessions = new Map<string, Session>();
  private messages = new Map<string, Message>();
  private files = new Map<string, FileRecord>();
  private pipelineRuns = new Map<string, PipelineRun>();
  private pipelineStages = new Map<string, PipelineStage>();
  private patterns = new Map<string, Pattern>();
  private domainKb = new Map<string, DomainKbEntry>();

  // ─── Sessions ──────────────────────────────────────────────────────────

  createSession(data: NewSession): Session {
    const now = new Date().toISOString();
    const session: Session = {
      id: data.id ?? generateId('ses'),
      title: data.title ?? 'Untitled Session',
      repoUrl: data.repoUrl ?? null,
      repoBranch: data.repoBranch ?? 'main',
      createdAt: now,
      updatedAt: now,
      status: data.status ?? 'active',
      metadata: data.metadata ?? null,
    };
    this.sessions.set(session.id, session);
    return session;
  }

  getSession(id: string): Session | undefined {
    return this.sessions.get(id);
  }

  listSessions(): Session[] {
    return Array.from(this.sessions.values()).sort(
      (a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime()
    );
  }

  updateSession(id: string, updates: Partial<Session>): Session | undefined {
    const session = this.sessions.get(id);
    if (!session) return undefined;
    const updated = { ...session, ...updates, updatedAt: new Date().toISOString() };
    this.sessions.set(id, updated);
    return updated;
  }

  deleteSession(id: string): boolean {
    // Cascade delete messages and files
    for (const [msgId, msg] of this.messages) {
      if (msg.sessionId === id) this.messages.delete(msgId);
    }
    for (const [fileId, file] of this.files) {
      if (file.sessionId === id) this.files.delete(fileId);
    }
    return this.sessions.delete(id);
  }

  // ─── Messages ──────────────────────────────────────────────────────────

  createMessage(data: NewMessage): Message {
    const message: Message = {
      id: data.id ?? generateId('msg'),
      sessionId: data.sessionId,
      role: data.role,
      content: data.content,
      model: data.model ?? null,
      tokens: data.tokens ?? null,
      durationMs: data.durationMs ?? null,
      createdAt: new Date().toISOString(),
    };
    this.messages.set(message.id, message);
    return message;
  }

  getMessagesBySession(sessionId: string): Message[] {
    return Array.from(this.messages.values())
      .filter((m) => m.sessionId === sessionId)
      .sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime());
  }

  // ─── Files ─────────────────────────────────────────────────────────────

  createFile(data: NewFileRecord): FileRecord {
    const now = new Date().toISOString();
    const file: FileRecord = {
      id: data.id ?? generateId('file'),
      sessionId: data.sessionId,
      path: data.path,
      name: data.name,
      content: data.content ?? '',
      language: data.language ?? 'plaintext',
      isDirectory: data.isDirectory ?? false,
      parentPath: data.parentPath ?? null,
      createdAt: now,
      updatedAt: now,
    };
    this.files.set(file.id, file);
    return file;
  }

  getFilesBySession(sessionId: string): FileRecord[] {
    return Array.from(this.files.values())
      .filter((f) => f.sessionId === sessionId)
      .sort((a, b) => a.path.localeCompare(b.path));
  }

  getFileByPath(sessionId: string, path: string): FileRecord | undefined {
    return Array.from(this.files.values()).find(
      (f) => f.sessionId === sessionId && f.path === path
    );
  }

  updateFile(id: string, updates: Partial<FileRecord>): FileRecord | undefined {
    const file = this.files.get(id);
    if (!file) return undefined;
    const updated = { ...file, ...updates, updatedAt: new Date().toISOString() };
    this.files.set(id, updated);
    return updated;
  }

  deleteFile(id: string): boolean {
    return this.files.delete(id);
  }

  // ─── Pipeline Runs ─────────────────────────────────────────────────────

  createPipelineRun(data: NewPipelineRun): PipelineRun {
    const run: PipelineRun = {
      id: data.id ?? generateId('run'),
      sessionId: data.sessionId,
      featureDescription: data.featureDescription,
      status: data.status ?? 'pending',
      currentStage: data.currentStage ?? 'plan',
      planOutput: data.planOutput ?? null,
      dbOutput: data.dbOutput ?? null,
      apiOutput: data.apiOutput ?? null,
      uiOutput: data.uiOutput ?? null,
      testsOutput: data.testsOutput ?? null,
      executeOutput: data.executeOutput ?? null,
      reviewOutput: data.reviewOutput ?? null,
      totalTokens: data.totalTokens ?? 0,
      totalDurationMs: data.totalDurationMs ?? 0,
      createdAt: new Date().toISOString(),
      completedAt: data.completedAt ?? null,
    };
    this.pipelineRuns.set(run.id, run);
    return run;
  }

  getPipelineRun(id: string): PipelineRun | undefined {
    return this.pipelineRuns.get(id);
  }

  getPipelineRunsBySession(sessionId: string): PipelineRun[] {
    return Array.from(this.pipelineRuns.values())
      .filter((r) => r.sessionId === sessionId)
      .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
  }

  updatePipelineRun(id: string, updates: Partial<PipelineRun>): PipelineRun | undefined {
    const run = this.pipelineRuns.get(id);
    if (!run) return undefined;
    const updated = { ...run, ...updates };
    this.pipelineRuns.set(id, updated);
    return updated;
  }

  // ─── Pipeline Stages ───────────────────────────────────────────────────

  createPipelineStage(data: NewPipelineStage): PipelineStage {
    const stage: PipelineStage = {
      id: data.id ?? generateId('stg'),
      runId: data.runId,
      stage: data.stage,
      status: data.status ?? 'pending',
      input: data.input ?? null,
      output: data.output ?? null,
      model: data.model ?? null,
      tokens: data.tokens ?? 0,
      durationMs: data.durationMs ?? 0,
      error: data.error ?? null,
      startedAt: data.startedAt ?? null,
      completedAt: data.completedAt ?? null,
    };
    this.pipelineStages.set(stage.id, stage);
    return stage;
  }

  getStagesByRun(runId: string): PipelineStage[] {
    return Array.from(this.pipelineStages.values())
      .filter((s) => s.runId === runId);
  }

  updatePipelineStage(id: string, updates: Partial<PipelineStage>): PipelineStage | undefined {
    const stage = this.pipelineStages.get(id);
    if (!stage) return undefined;
    const updated = { ...stage, ...updates };
    this.pipelineStages.set(id, updated);
    return updated;
  }

  // ─── Patterns ──────────────────────────────────────────────────────────

  createPattern(data: NewPattern): Pattern {
    const pattern: Pattern = {
      id: data.id ?? generateId('pat'),
      sessionId: data.sessionId ?? null,
      type: data.type,
      trigger: data.trigger,
      action: data.action,
      confidence: data.confidence ?? 0.5,
      usageCount: data.usageCount ?? 0,
      lastUsedAt: data.lastUsedAt ?? null,
      metadata: data.metadata ?? null,
      createdAt: new Date().toISOString(),
    };
    this.patterns.set(pattern.id, pattern);
    return pattern;
  }

  getPatterns(type?: string): Pattern[] {
    const all = Array.from(this.patterns.values());
    if (type) return all.filter((p) => p.type === type);
    return all.sort((a, b) => b.confidence - a.confidence);
  }

  updatePattern(id: string, updates: Partial<Pattern>): Pattern | undefined {
    const pattern = this.patterns.get(id);
    if (!pattern) return undefined;
    const updated = { ...pattern, ...updates };
    this.patterns.set(id, updated);
    return updated;
  }

  // ─── Domain KB ─────────────────────────────────────────────────────────

  createDomainKbEntry(data: NewDomainKbEntry): DomainKbEntry {
    const now = new Date().toISOString();
    const entry: DomainKbEntry = {
      id: data.id ?? generateId('kb'),
      category: data.category,
      title: data.title,
      content: data.content,
      tags: data.tags ?? null,
      source: data.source ?? null,
      confidence: data.confidence ?? 0.8,
      createdAt: now,
      updatedAt: now,
    };
    this.domainKb.set(entry.id, entry);
    return entry;
  }

  searchDomainKb(query: string): DomainKbEntry[] {
    const lower = query.toLowerCase();
    return Array.from(this.domainKb.values()).filter(
      (e) =>
        e.title.toLowerCase().includes(lower) ||
        e.content.toLowerCase().includes(lower) ||
        (e.tags && e.tags.toLowerCase().includes(lower))
    );
  }

  getDomainKbByCategory(category: string): DomainKbEntry[] {
    return Array.from(this.domainKb.values()).filter((e) => e.category === category);
  }
}

// Singleton store instance
export const db = new InMemoryStore();
