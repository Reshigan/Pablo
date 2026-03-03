import { create } from 'zustand';

export type PipelineStage = 'plan' | 'db' | 'api' | 'ui' | 'ux_validation' | 'tests' | 'execute' | 'review';
export type StageStatus = 'pending' | 'running' | 'completed' | 'failed' | 'skipped';

export interface StageResult {
  stage: PipelineStage;
  status: StageStatus;
  output: string;
  model?: string;
  tokens?: number;
  durationMs?: number;
  error?: string;
  startedAt?: number;
  completedAt?: number;
}

export interface PipelineRun {
  id: string;
  featureDescription: string;
  status: 'idle' | 'running' | 'completed' | 'failed' | 'cancelled';
  currentStage: PipelineStage | null;
  stages: StageResult[];
  totalTokens: number;
  totalDurationMs: number;
  createdAt: number;
  completedAt?: number;
  /** Detected tech stack for this run — injected into every stage prompt */
  techStack?: TechStackHint;
}

// ─── Tech Stack Detection ────────────────────────────────────────────────────

export interface TechStackHint {
  frontend: string;   // e.g. "React + TypeScript + Tailwind CSS"
  backend: string;    // e.g. "Node.js + Express" or "Python + FastAPI"
  database: string;   // e.g. "PostgreSQL" or "SQLite"
  fullLabel: string;  // human-readable summary
}

const FRONTEND_PATTERNS: [RegExp, string][] = [
  [/\b(react|nextjs|next\.js)\b/i, 'React'],
  [/\b(vue|vuejs|vue\.js|nuxt)\b/i, 'Vue'],
  [/\b(svelte|sveltekit)\b/i, 'Svelte'],
  [/\b(angular)\b/i, 'Angular'],
  [/\b(html|static\s*site|landing\s*page)\b/i, 'HTML'],
];

const BACKEND_PATTERNS: [RegExp, string][] = [
  [/\b(fastapi|flask|django)\b/i, 'Python + $1'],
  [/\b(express|node\.?js|koa|hono|nest\.?js)\b/i, 'Node.js'],
  [/\b(python)\b/i, 'Python + FastAPI'],
  [/\b(go|golang)\b/i, 'Go'],
  [/\b(rust|actix|axum)\b/i, 'Rust'],
];

const DB_PATTERNS: [RegExp, string][] = [
  [/\b(postgres|postgresql)\b/i, 'PostgreSQL'],
  [/\b(mysql|mariadb)\b/i, 'MySQL'],
  [/\b(mongodb|mongo)\b/i, 'MongoDB'],
  [/\b(sqlite)\b/i, 'SQLite'],
  [/\b(supabase)\b/i, 'Supabase (PostgreSQL)'],
  [/\b(prisma)\b/i, 'Prisma ORM'],
  [/\b(drizzle)\b/i, 'Drizzle ORM'],
];

const STYLE_PATTERNS: [RegExp, string][] = [
  [/\b(tailwind|tailwindcss)\b/i, 'Tailwind CSS'],
  [/\b(shadcn|radix)\b/i, 'shadcn/ui'],
  [/\b(material\s*ui|mui)\b/i, 'Material UI'],
  [/\b(chakra)\b/i, 'Chakra UI'],
  [/\b(bootstrap)\b/i, 'Bootstrap'],
];

const LANG_PATTERNS: [RegExp, string][] = [
  [/\b(typescript|\.tsx?)\b/i, 'TypeScript'],
  [/\b(javascript|\.jsx?)\b/i, 'JavaScript'],
];

/**
 * Detect tech stack from user's feature description.
 * If the user says "React admin dashboard with Tailwind", we extract:
 *   frontend: "React + TypeScript + Tailwind CSS"
 *   backend: "Node.js" (inferred from React)
 *   database: "PostgreSQL" (default)
 */
export function detectTechStack(description: string): TechStackHint {
  const text = description;

  // Detect frontend
  let frontend = '';
  for (const [re, label] of FRONTEND_PATTERNS) {
    if (re.test(text)) { frontend = label; break; }
  }

  // Detect backend
  let backend = '';
  for (const [re, label] of BACKEND_PATTERNS) {
    const match = text.match(re);
    if (match) {
      backend = label.includes('$1') ? label.replace('$1', match[1]) : label;
      break;
    }
  }

  // Detect database
  let database = '';
  for (const [re, label] of DB_PATTERNS) {
    if (re.test(text)) { database = label; break; }
  }

  // Detect styling
  let styling = '';
  for (const [re, label] of STYLE_PATTERNS) {
    if (re.test(text)) { styling = label; break; }
  }

  // Detect language
  let lang = '';
  for (const [re, label] of LANG_PATTERNS) {
    if (re.test(text)) { lang = label; break; }
  }

  // Apply defaults based on what was detected
  if (!frontend && !backend) {
    // No explicit stack → default to React + Node.js (most common for web apps)
    frontend = 'React';
    backend = 'Node.js';
  } else if (frontend && !backend) {
    // Frontend specified, infer backend
    if (['React', 'Vue', 'Svelte', 'Angular'].includes(frontend)) {
      backend = 'Node.js';
    }
  } else if (!frontend && backend) {
    // Backend specified, infer frontend
    if (backend.includes('Python')) {
      // Python backend → still generate React frontend unless user said otherwise
      frontend = 'React';
    } else {
      frontend = 'React';
    }
  }

  if (!lang) lang = frontend ? 'TypeScript' : 'JavaScript';
  if (!styling && frontend) styling = 'Tailwind CSS';
  if (!database) database = 'PostgreSQL';

  const frontendFull = [frontend, lang, styling].filter(Boolean).join(' + ');
  const fullLabel = [frontendFull, backend, database].filter(Boolean).join(' | ');

  return {
    frontend: frontendFull || 'React + TypeScript + Tailwind CSS',
    backend: backend || 'Node.js',
    database,
    fullLabel,
  };
}

// ─── Pipeline Stages ─────────────────────────────────────────────────────────

// FIX: Model names now match actual Ollama Cloud models
export const PIPELINE_STAGES: { id: PipelineStage; label: string; description: string; model: string }[] = [
  { id: 'plan', label: 'Plan', description: 'Analyze requirements and create implementation plan', model: 'deepseek-v3.2' },
  { id: 'db', label: 'Database', description: 'Design schema and write migrations', model: 'qwen3-coder:480b' },
  { id: 'api', label: 'API', description: 'Generate API routes and business logic', model: 'qwen3-coder:480b' },
  { id: 'ui', label: 'UI', description: 'Build React components and pages', model: 'qwen3-coder:480b' },
  { id: 'ux_validation', label: 'UX Validation', description: 'Verify UI/UX wiring, accessibility, and integration', model: 'deepseek-v3.2' },
  { id: 'tests', label: 'Tests', description: 'Write unit and integration tests', model: 'qwen3-coder:480b' },
  { id: 'execute', label: 'Execute', description: 'Generate configs, setup, and seed data', model: 'qwen3-coder:480b' },
  { id: 'review', label: 'Review', description: 'AI code review and quality check', model: 'deepseek-v3.2' },
];

// ─── Store ───────────────────────────────────────────────────────────────────

interface PipelineState {
  runs: PipelineRun[];
  activeRunId: string | null;

  // Actions
  startRun: (featureDescription: string) => string;
  updateStage: (runId: string, stage: PipelineStage, updates: Partial<StageResult>) => void;
  advanceStage: (runId: string) => void;
  completeRun: (runId: string, status: 'completed' | 'failed' | 'cancelled') => void;
  setActiveRun: (runId: string | null) => void;
  getActiveRun: () => PipelineRun | undefined;
}

let runCounter = 0;

export const usePipelineStore = create<PipelineState>((set, get) => ({
  runs: [],
  activeRunId: null,

  startRun: (featureDescription: string) => {
    runCounter += 1;
    const id = `run-${Date.now()}-${runCounter}`;
    const stages: StageResult[] = PIPELINE_STAGES.map((s) => ({
      stage: s.id,
      status: 'pending' as StageStatus,
      output: '',
    }));
    // Set first stage to running
    stages[0].status = 'running';
    stages[0].startedAt = Date.now();

    // Detect tech stack from the feature description
    const techStack = detectTechStack(featureDescription);

    const run: PipelineRun = {
      id,
      featureDescription,
      status: 'running',
      currentStage: 'plan',
      stages,
      totalTokens: 0,
      totalDurationMs: 0,
      createdAt: Date.now(),
      techStack,
    };

    set((state) => ({
      runs: [run, ...state.runs],
      activeRunId: id,
    }));

    return id;
  },

  updateStage: (runId, stage, updates) => {
    set((state) => ({
      runs: state.runs.map((run) => {
        if (run.id !== runId) return run;
        return {
          ...run,
          stages: run.stages.map((s) =>
            s.stage === stage ? { ...s, ...updates } : s
          ),
          totalTokens: run.totalTokens + (updates.tokens ?? 0),
          totalDurationMs: run.totalDurationMs + (updates.durationMs ?? 0),
        };
      }),
    }));
  },

  advanceStage: (runId) => {
    set((state) => ({
      runs: state.runs.map((run) => {
        if (run.id !== runId) return run;
        const currentIdx = PIPELINE_STAGES.findIndex((s) => s.id === run.currentStage);
        if (currentIdx < 0 || currentIdx >= PIPELINE_STAGES.length - 1) return run;

        const nextStage = PIPELINE_STAGES[currentIdx + 1];
        return {
          ...run,
          currentStage: nextStage.id,
        };
      }),
    }));
  },

  completeRun: (runId, status) => {
    set((state) => ({
      runs: state.runs.map((run) =>
        run.id === runId
          ? { ...run, status, currentStage: null, completedAt: Date.now() }
          : run
      ),
    }));
  },

  setActiveRun: (runId) => set({ activeRunId: runId }),

  getActiveRun: () => {
    const state = get();
    return state.runs.find((r) => r.id === state.activeRunId);
  },
}));
