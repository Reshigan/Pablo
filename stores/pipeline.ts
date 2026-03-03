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
  /** Tech stack resolved after Plan stage — injected into every subsequent stage */
  techStack?: TechStackHint;
}

// ─── Tech Stack Hint ─────────────────────────────────────────────────────────

export interface TechStackHint {
  frontend: string;    // e.g. "React + TypeScript + Tailwind CSS"
  backend: string;     // e.g. "Cloudflare Workers + Hono" or "Python + FastAPI"
  database: string;    // e.g. "Cloudflare D1 + Drizzle ORM" or "PostgreSQL + Prisma"
  storage: string;     // e.g. "Cloudflare R2" or "AWS S3" or "none"
  infra: string;       // e.g. "Cloudflare Workers" or "Vercel" or "Docker"
  fullLabel: string;   // one-line summary
}

// ─── Extract Explicit User Mentions (no guessing, no defaults) ───────────────

/**
 * Extracts ONLY what the user explicitly mentioned. Does NOT fill in defaults.
 * The Plan stage LLM will recommend the rest and explain why.
 */
export function extractExplicitStack(description: string): Partial<TechStackHint> {
  const text = description.toLowerCase();
  const hints: Partial<TechStackHint> = {};

  // Frontend frameworks
  if (/\b(react|nextjs|next\.js)\b/.test(text)) hints.frontend = 'React';
  else if (/\b(vue|vuejs|nuxt)\b/.test(text)) hints.frontend = 'Vue';
  else if (/\b(svelte|sveltekit)\b/.test(text)) hints.frontend = 'Svelte';
  else if (/\b(angular)\b/.test(text)) hints.frontend = 'Angular';
  else if (/\b(solid\.?js|solidjs)\b/.test(text)) hints.frontend = 'SolidJS';
  else if (/\b(html|static\s*site|landing\s*page)\b/.test(text)) hints.frontend = 'HTML';

  // Backend frameworks
  if (/\b(fastapi)\b/.test(text)) hints.backend = 'Python + FastAPI';
  else if (/\b(django)\b/.test(text)) hints.backend = 'Python + Django';
  else if (/\b(flask)\b/.test(text)) hints.backend = 'Python + Flask';
  else if (/\b(hono)\b/.test(text)) hints.backend = 'Cloudflare Workers + Hono';
  else if (/\b(express)\b/.test(text)) hints.backend = 'Node.js + Express';
  else if (/\b(nest\.?js)\b/.test(text)) hints.backend = 'Node.js + NestJS';
  else if (/\b(python)\b/.test(text)) hints.backend = 'Python';
  else if (/\b(node\.?js)\b/.test(text)) hints.backend = 'Node.js';
  else if (/\b(golang|go\s*(?:backend|server|api|service|lang))\b/.test(text)) hints.backend = 'Go';
  else if (/\b(rust|actix|axum)\b/.test(text)) hints.backend = 'Rust';
  else if (/\b(java|spring)\b/.test(text)) hints.backend = 'Java + Spring Boot';
  else if (/\b(\.net|c#|dotnet)\b/.test(text)) hints.backend = '.NET';

  // Databases
  if (/\b(d1|cloudflare\s*d1)\b/.test(text)) hints.database = 'Cloudflare D1';
  else if (/\b(postgres|postgresql|neon)\b/.test(text)) hints.database = 'PostgreSQL';
  else if (/\b(mysql|mariadb|planetscale)\b/.test(text)) hints.database = 'MySQL';
  else if (/\b(mongodb|mongo)\b/.test(text)) hints.database = 'MongoDB';
  else if (/\b(sqlite)\b/.test(text)) hints.database = 'SQLite';
  else if (/\b(supabase)\b/.test(text)) hints.database = 'Supabase';
  else if (/\b(turso|libsql)\b/.test(text)) hints.database = 'Turso';
  else if (/\b(firebase|firestore)\b/.test(text)) hints.database = 'Firebase';
  else if (/\b(dynamodb)\b/.test(text)) hints.database = 'DynamoDB';
  else if (/\b(redis)\b/.test(text)) hints.database = 'Redis';

  // Storage
  if (/\b(r2|cloudflare\s*r2)\b/.test(text)) hints.storage = 'Cloudflare R2';
  else if (/\b(s3|aws\s*s3)\b/.test(text)) hints.storage = 'AWS S3';
  else if (/\b(gcs|google\s*cloud\s*storage)\b/.test(text)) hints.storage = 'Google Cloud Storage';
  else if (/\b(minio)\b/.test(text)) hints.storage = 'MinIO';
  else if (/\b(blob|azure\s*blob)\b/.test(text)) hints.storage = 'Azure Blob Storage';

  // Infrastructure / Deploy target
  if (/\b(cloudflare\s*workers|workers)\b/.test(text)) hints.infra = 'Cloudflare Workers';
  else if (/\b(cloudflare\s*pages)\b/.test(text)) hints.infra = 'Cloudflare Pages';
  else if (/\b(vercel)\b/.test(text)) hints.infra = 'Vercel';
  else if (/\b(netlify)\b/.test(text)) hints.infra = 'Netlify';
  else if (/\b(aws\s*lambda|lambda)\b/.test(text)) hints.infra = 'AWS Lambda';
  else if (/\b(fly\.?io)\b/.test(text)) hints.infra = 'Fly.io';
  else if (/\b(railway)\b/.test(text)) hints.infra = 'Railway';
  else if (/\b(render)\b/.test(text)) hints.infra = 'Render';
  else if (/\b(heroku)\b/.test(text)) hints.infra = 'Heroku';
  else if (/\b(docker)\b/.test(text)) hints.infra = 'Docker';
  else if (/\b(kubernetes|k8s)\b/.test(text)) hints.infra = 'Kubernetes';

  // Styling (append to frontend)
  const stylingMatch = text.match(/\b(tailwind|tailwindcss|shadcn|material[\s-]?ui|mui|chakra|bootstrap|ant[\s-]?design)\b/);
  if (stylingMatch && hints.frontend) {
    const styleMap: Record<string, string> = {
      tailwind: 'Tailwind CSS', tailwindcss: 'Tailwind CSS',
      shadcn: 'shadcn/ui', 'material-ui': 'Material UI', mui: 'Material UI',
      chakra: 'Chakra UI', bootstrap: 'Bootstrap', 'ant-design': 'Ant Design',
    };
    const style = styleMap[stylingMatch[1].toLowerCase().replace(/\s/g, '-')] || stylingMatch[1];
    if (!hints.frontend.includes(style)) hints.frontend += ` + ${style}`;
  }

  // Language (append to frontend)
  if (/\b(typescript)\b/.test(text) && hints.frontend && !hints.frontend.includes('TypeScript')) {
    hints.frontend = hints.frontend.replace(/(React|Vue|Svelte|Angular|SolidJS)/, '$1 + TypeScript');
  }

  // ORM
  if (/\b(drizzle)\b/.test(text) && hints.database) hints.database += ' + Drizzle ORM';
  else if (/\b(prisma)\b/.test(text) && hints.database) hints.database += ' + Prisma';
  else if (/\b(typeorm)\b/.test(text) && hints.database) hints.database += ' + TypeORM';
  else if (/\b(sqlalchemy)\b/.test(text) && hints.database) hints.database += ' + SQLAlchemy';
  else if (/\b(mongoose)\b/.test(text) && hints.database) hints.database += ' + Mongoose';

  return hints;
}

/**
 * Parse the Plan stage output to extract the tech stack the LLM recommended.
 * Looks for a structured block like:
 *
 *   ## Recommended Tech Stack
 *   - Frontend: React + TypeScript + Tailwind CSS
 *   - Backend: Cloudflare Workers + Hono
 *   - Database: Cloudflare D1 + Drizzle ORM
 *   - Storage: Cloudflare R2
 *   - Infrastructure: Cloudflare Workers
 */
export function parseTechStackFromPlan(planOutput: string): TechStackHint | null {
  const lines = planOutput.split('\n');

  let frontend = '';
  let backend = '';
  let database = '';
  let storage = 'none';
  let infra = '';

  for (const line of lines) {
    const trimmed = line.trim().replace(/^\*?\s*[-•]\s*/, '').replace(/\*\*/g, '');
    const match = trimmed.match(
      /^(Frontend|Backend|Database|Storage|Infrastructure|Infra|Deploy(?:ment)?|ORM|Platform)\s*[:：]\s*(.+)/i
    );
    if (match) {
      const key = match[1].toLowerCase();
      const value = match[2].trim();
      if (key === 'frontend') frontend = value;
      else if (key === 'backend') backend = value;
      else if (key === 'database' || key === 'orm') {
        database = database ? `${database} + ${value}` : value;
      }
      else if (key === 'storage') storage = value;
      else if (['infrastructure', 'infra', 'deploy', 'deployment', 'platform'].includes(key)) infra = value;
    }
  }

  if (!frontend && !backend && !database) return null;

  const fullLabel = [frontend, backend, database, storage !== 'none' ? storage : ''].filter(Boolean).join(' | ');
  return { frontend, backend, database, storage, infra, fullLabel };
}

/**
 * Merge explicit user requests with LLM recommendations.
 * User's explicit choices always win.
 */
export function resolveTechStack(
  explicit: Partial<TechStackHint>,
  fromPlan: TechStackHint | null,
): TechStackHint {
  const resolved = {
    frontend: explicit.frontend || fromPlan?.frontend || 'not specified',
    backend: explicit.backend || fromPlan?.backend || 'not specified',
    database: explicit.database || fromPlan?.database || 'not specified',
    storage: explicit.storage || fromPlan?.storage || 'none',
    infra: explicit.infra || fromPlan?.infra || 'not specified',
    fullLabel: '',
  };
  resolved.fullLabel = [resolved.frontend, resolved.backend, resolved.database,
    resolved.storage !== 'none' ? resolved.storage : ''].filter(Boolean).join(' | ');
  return resolved;
}

// ─── Pipeline Stages ─────────────────────────────────────────────────────────

export const PIPELINE_STAGES: { id: PipelineStage; label: string; description: string; model: string }[] = [
  { id: 'plan', label: 'Plan', description: 'Analyze requirements, recommend tech stack, create implementation plan', model: 'deepseek-v3.2' },
  { id: 'db', label: 'Database', description: 'Design schema and write migrations', model: 'qwen3-coder:480b' },
  { id: 'api', label: 'API', description: 'Generate API routes and business logic', model: 'qwen3-coder:480b' },
  { id: 'ui', label: 'UI', description: 'Build frontend components and pages', model: 'qwen3-coder:480b' },
  { id: 'ux_validation', label: 'UX Validation', description: 'Verify UI/UX wiring, accessibility, and integration', model: 'deepseek-v3.2' },
  { id: 'tests', label: 'Tests', description: 'Write unit and integration tests', model: 'qwen3-coder:480b' },
  { id: 'execute', label: 'Execute', description: 'Generate configs, setup, and seed data', model: 'qwen3-coder:480b' },
  { id: 'review', label: 'Review', description: 'AI code review and quality check', model: 'deepseek-v3.2' },
];

// ─── Store ───────────────────────────────────────────────────────────────────

interface PipelineState {
  runs: PipelineRun[];
  activeRunId: string | null;

  startRun: (featureDescription: string) => string;
  updateStage: (runId: string, stage: PipelineStage, updates: Partial<StageResult>) => void;
  setTechStack: (runId: string, techStack: TechStackHint) => void;
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
    stages[0].status = 'running';
    stages[0].startedAt = Date.now();

    const run: PipelineRun = {
      id,
      featureDescription,
      status: 'running',
      currentStage: 'plan',
      stages,
      totalTokens: 0,
      totalDurationMs: 0,
      createdAt: Date.now(),
      // techStack set after Plan stage via setTechStack()
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

  setTechStack: (runId, techStack) => {
    set((state) => ({
      runs: state.runs.map((run) =>
        run.id === runId ? { ...run, techStack } : run
      ),
    }));
  },

  advanceStage: (runId) => {
    set((state) => ({
      runs: state.runs.map((run) => {
        if (run.id !== runId) return run;
        const currentIdx = PIPELINE_STAGES.findIndex((s) => s.id === run.currentStage);
        if (currentIdx < 0 || currentIdx >= PIPELINE_STAGES.length - 1) return run;
        const nextStage = PIPELINE_STAGES[currentIdx + 1];
        return { ...run, currentStage: nextStage.id };
      }),
    }));
  },

  completeRun: (runId, status) => {
    set((state) => ({
      runs: state.runs.map((run) => {
        if (run.id !== runId) return run;
        const completedAt = Date.now();
        return {
          ...run,
          status,
          currentStage: null,
          completedAt,
          totalDurationMs: completedAt - run.createdAt,
          stages: run.stages.map((s) =>
            s.status === 'running'
              ? { ...s, status: (status === 'cancelled' ? 'skipped' : 'failed') as StageStatus, completedAt }
              : s.status === 'pending'
              ? { ...s, status: 'skipped' as StageStatus }
              : s
          ),
        };
      }),
    }));
  },

  setActiveRun: (runId) => set({ activeRunId: runId }),

  getActiveRun: () => {
    const state = get();
    return state.runs.find((r) => r.id === state.activeRunId);
  },
}));
