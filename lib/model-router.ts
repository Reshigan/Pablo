/**
 * Model Router - Dual-model routing for Pablo v5
 * 
 * DeepSeek-R1: Reasoning tasks (planning, review, analysis)
 * Qwen3-Coder-Next: Code generation tasks (db, api, ui, tests, execute)
 */

export type ModelId = 'deepseek-r1' | 'qwen3-coder-next';

export interface ModelConfig {
  id: ModelId;
  name: string;
  specialty: string;
  maxTokens: number;
  temperature: number;
}

export const MODELS: Record<ModelId, ModelConfig> = {
  'deepseek-r1': {
    id: 'deepseek-r1',
    name: 'DeepSeek-R1',
    specialty: 'Reasoning & Analysis',
    maxTokens: 8192,
    temperature: 0.3,
  },
  'qwen3-coder-next': {
    id: 'qwen3-coder-next',
    name: 'Qwen3-Coder-Next',
    specialty: 'Code Generation',
    maxTokens: 16384,
    temperature: 0.7,
  },
};

export type TaskType = 'plan' | 'db' | 'api' | 'ui' | 'tests' | 'execute' | 'review' | 'chat' | 'explain' | 'refactor';

const TASK_MODEL_MAP: Record<TaskType, ModelId> = {
  plan: 'deepseek-r1',
  review: 'deepseek-r1',
  explain: 'deepseek-r1',
  db: 'qwen3-coder-next',
  api: 'qwen3-coder-next',
  ui: 'qwen3-coder-next',
  tests: 'qwen3-coder-next',
  execute: 'qwen3-coder-next',
  refactor: 'qwen3-coder-next',
  chat: 'deepseek-r1',
};

/**
 * Route a task to the appropriate model based on task type
 */
export function routeTask(taskType: TaskType): ModelConfig {
  const modelId = TASK_MODEL_MAP[taskType];
  return MODELS[modelId];
}

/**
 * Get the system prompt for a given task type
 */
export function getSystemPrompt(taskType: TaskType): string {
  const prompts: Record<TaskType, string> = {
    plan: `You are an expert software architect. Analyze the feature request and create a detailed implementation plan.
Include: 1) Requirements analysis 2) File structure 3) Database schema changes 4) API endpoints 5) UI components 6) Edge cases.
Be thorough and specific. Output a structured plan.`,

    db: `You are a database expert. Generate Drizzle ORM schema definitions and migrations.
Follow conventions: Use SQLite-compatible types, add proper indexes, include created_at/updated_at fields.
Output complete, working TypeScript schema code.`,

    api: `You are a Next.js API expert. Generate API route handlers with proper validation and error handling.
Follow conventions: Use App Router route.ts files, proper HTTP methods, typed request/response bodies.
Output complete, working TypeScript API routes.`,

    ui: `You are a React/Next.js UI expert. Generate components using the project's design system.
Follow conventions: Use Tailwind CSS with pablo-* tokens, Zustand for state, lucide-react for icons.
Output complete, working TypeScript React components.`,

    tests: `You are a testing expert. Generate comprehensive unit and integration tests.
Follow conventions: Use vitest, test edge cases, mock external dependencies.
Output complete, working test files.`,

    execute: `You are a code execution expert. Run tests, check for errors, and fix any issues found.
Report: 1) Test results 2) Errors found 3) Fixes applied 4) Final status.
Be thorough and fix all issues.`,

    review: `You are a senior code reviewer. Review the generated code for quality, security, and best practices.
Check: 1) TypeScript strict mode compliance 2) Error handling 3) Security vulnerabilities 4) Performance 5) Code style.
Output actionable feedback with specific line references.`,

    chat: `You are Pablo, an AI-powered coding assistant. Help the user with their coding questions.
Be helpful, concise, and provide code examples when relevant.`,

    explain: `You are a code explanation expert. Analyze the code and explain its purpose, logic, and potential improvements.
Be clear and thorough, using simple language when possible.`,

    refactor: `You are a refactoring expert. Improve the code structure while maintaining functionality.
Focus on: readability, maintainability, performance, and modern patterns.
Output the refactored code with explanations of changes.`,
  };

  return prompts[taskType];
}
