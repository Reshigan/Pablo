import { create } from 'zustand';

export type PatternType = 'code_pattern' | 'error_fix' | 'architecture' | 'convention' | 'shortcut' | 'preference';
export type ConfidenceLevel = 'low' | 'medium' | 'high' | 'verified';

export interface Pattern {
  id: string;
  type: PatternType;
  trigger: string;
  action: string;
  context: string;
  confidence: number;
  usageCount: number;
  lastUsed: number;
  createdAt: number;
  tags: string[];
}

export interface DomainKBEntry {
  id: string;
  domain: string;
  key: string;
  value: string;
  source: string;
  confidence: number;
  createdAt: number;
  updatedAt: number;
}

export interface FeedbackEntry {
  id: string;
  patternId: string;
  type: 'positive' | 'negative' | 'correction';
  message: string;
  createdAt: number;
}

interface LearningState {
  patterns: Pattern[];
  domainKB: DomainKBEntry[];
  feedback: FeedbackEntry[];

  // Stats
  totalPatterns: number;
  avgConfidence: number;
  sessionsAnalyzed: number;
  hydrated: boolean;

  // Actions
  hydrate: () => Promise<void>;
  addPattern: (pattern: Omit<Pattern, 'id' | 'createdAt' | 'lastUsed' | 'usageCount'>) => string;
  updatePattern: (id: string, updates: Partial<Pattern>) => void;
  removePattern: (id: string) => void;
  usePattern: (id: string) => void;
  addDomainEntry: (entry: Omit<DomainKBEntry, 'id' | 'createdAt' | 'updatedAt'>) => string;
  updateDomainEntry: (id: string, updates: Partial<DomainKBEntry>) => void;
  removeDomainEntry: (id: string) => void;
  addFeedback: (feedback: Omit<FeedbackEntry, 'id' | 'createdAt'>) => void;
  getPatternsByType: (type: PatternType) => Pattern[];
  getTopPatterns: (limit: number) => Pattern[];
  buildContext: (query: string) => string;
}

let counter = 0;
function generateId(prefix: string): string {
  counter += 1;
  return `${prefix}-${Date.now()}-${counter}`;
}

export const useLearningStore = create<LearningState>((set, get) => ({
  patterns: [],
  domainKB: [],
  feedback: [],
  totalPatterns: 0,
  avgConfidence: 0,
  sessionsAnalyzed: 0,
  hydrated: false,

  hydrate: async () => {
    if (get().hydrated) return;
    try {
      const res = await fetch('/api/patterns');
      if (!res.ok) return;
      const rows = (await res.json()) as Array<{
        id: string;
        type: PatternType;
        trigger: string;
        action: string;
        confidence: number;
        usageCount: number;
        lastUsedAt: string | null;
        metadata: string | null;
        createdAt: string;
      }>;
      const hydrated: Pattern[] = rows.map((r) => ({
        id: r.id,
        type: r.type,
        trigger: r.trigger,
        action: r.action,
        context: r.metadata ?? '',
        confidence: r.confidence,
        usageCount: r.usageCount,
        lastUsed: r.lastUsedAt ? new Date(r.lastUsedAt).getTime() : Date.now(),
        createdAt: new Date(r.createdAt).getTime(),
        tags: [r.type],
      }));
      set({
        patterns: hydrated,
        totalPatterns: hydrated.length,
        avgConfidence: hydrated.length > 0
          ? hydrated.reduce((s, p) => s + p.confidence, 0) / hydrated.length
          : 0,
        hydrated: true,
      });
    } catch {
      // Non-blocking — patterns stay empty if D1 is unavailable
      set({ hydrated: true });
    }
  },

  addPattern: (pattern) => {
    const id = generateId('pat');
    const now = Date.now();
    const newPattern: Pattern = {
      ...pattern,
      id,
      usageCount: 0,
      lastUsed: now,
      createdAt: now,
    };
    set((state) => {
      const patterns = [...state.patterns, newPattern];
      return {
        patterns,
        totalPatterns: patterns.length,
        avgConfidence: patterns.reduce((sum, p) => sum + p.confidence, 0) / patterns.length,
      };
    });
    return id;
  },

  updatePattern: (id, updates) =>
    set((state) => {
      const patterns = state.patterns.map((p) => (p.id === id ? { ...p, ...updates } : p));
      return {
        patterns,
        avgConfidence: patterns.length > 0 ? patterns.reduce((sum, p) => sum + p.confidence, 0) / patterns.length : 0,
      };
    }),

  removePattern: (id) =>
    set((state) => {
      const patterns = state.patterns.filter((p) => p.id !== id);
      return {
        patterns,
        totalPatterns: patterns.length,
        avgConfidence: patterns.length > 0 ? patterns.reduce((sum, p) => sum + p.confidence, 0) / patterns.length : 0,
      };
    }),

  usePattern: (id) =>
    set((state) => ({
      patterns: state.patterns.map((p) =>
        p.id === id ? { ...p, usageCount: p.usageCount + 1, lastUsed: Date.now() } : p
      ),
    })),

  addDomainEntry: (entry) => {
    const id = generateId('kb');
    const now = Date.now();
    set((state) => ({
      domainKB: [...state.domainKB, { ...entry, id, createdAt: now, updatedAt: now }],
    }));
    return id;
  },

  updateDomainEntry: (id, updates) =>
    set((state) => ({
      domainKB: state.domainKB.map((e) =>
        e.id === id ? { ...e, ...updates, updatedAt: Date.now() } : e
      ),
    })),

  removeDomainEntry: (id) =>
    set((state) => ({
      domainKB: state.domainKB.filter((e) => e.id !== id),
    })),

  addFeedback: (feedback) => {
    const id = generateId('fb');
    set((state) => ({
      feedback: [...state.feedback, { ...feedback, id, createdAt: Date.now() }],
    }));

    // Auto-adjust pattern confidence based on feedback
    const { patterns } = get();
    const pattern = patterns.find((p) => p.id === feedback.patternId);
    if (pattern) {
      const adjustment = feedback.type === 'positive' ? 0.05 : feedback.type === 'negative' ? -0.1 : -0.05;
      const newConfidence = Math.max(0, Math.min(1, pattern.confidence + adjustment));
      get().updatePattern(feedback.patternId, { confidence: newConfidence });
    }
  },

  getPatternsByType: (type) => {
    return get().patterns.filter((p) => p.type === type);
  },

  getTopPatterns: (limit) => {
    return [...get().patterns]
      .sort((a, b) => b.confidence * b.usageCount - a.confidence * a.usageCount)
      .slice(0, limit);
  },

  buildContext: (query) => {
    const { patterns, domainKB } = get();
    const queryLower = query.toLowerCase();

    // Find relevant patterns
    const relevantPatterns = patterns
      .filter(
        (p) =>
          p.trigger.toLowerCase().includes(queryLower) ||
          p.action.toLowerCase().includes(queryLower) ||
          p.tags.some((t) => queryLower.includes(t.toLowerCase()))
      )
      .slice(0, 5);

    // Find relevant KB entries
    const relevantKB = domainKB
      .filter(
        (e) =>
          e.key.toLowerCase().includes(queryLower) ||
          e.value.toLowerCase().includes(queryLower) ||
          e.domain.toLowerCase().includes(queryLower)
      )
      .slice(0, 5);

    const contextParts: string[] = [];

    if (relevantPatterns.length > 0) {
      contextParts.push('## Learned Patterns');
      relevantPatterns.forEach((p) => {
        contextParts.push(`- **${p.trigger}**: ${p.action} (confidence: ${Math.round(p.confidence * 100)}%)`);
      });
    }

    if (relevantKB.length > 0) {
      contextParts.push('\n## Domain Knowledge');
      relevantKB.forEach((e) => {
        contextParts.push(`- **${e.domain}/${e.key}**: ${e.value}`);
      });
    }

    return contextParts.join('\n');
  },
}));
