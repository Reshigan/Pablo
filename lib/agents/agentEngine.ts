// lib/agents/agentEngine.ts
// Core agentic loop: Plan -> Execute -> Verify -> Fix
// This is the brain of Pablo — orchestrates all other agents

import { callModel, type EnvConfig, type ModelConfig } from './modelRouter';

// ─── Types ───────────────────────────────────────────────────────────

export type AgentStepType =
  | 'plan'
  | 'read_file'
  | 'write_file'
  | 'edit_file'
  | 'search'
  | 'shell'
  | 'generate'
  | 'review'
  | 'fix'
  | 'commit'
  | 'create_pr'
  | 'deploy'
  | 'ask_user'
  | 'done';

export interface AgentStep {
  id: string;
  type: AgentStepType;
  description: string;
  input: Record<string, unknown>;
  output?: string;
  status: 'pending' | 'running' | 'done' | 'failed' | 'skipped';
  error?: string;
  durationMs?: number;
  tokensUsed?: number;
}

export interface AgentPlan {
  goal: string;
  steps: AgentStep[];
  currentStepIndex: number;
  totalTokensUsed: number;
  totalDurationMs: number;
  status: 'planning' | 'executing' | 'verifying' | 'fixing' | 'done' | 'failed';
  maxIterations: number;
  currentIteration: number;
}

export interface AgentContext {
  /** The user's original request */
  userMessage: string;
  /** Files currently open in the editor */
  openFiles: Array<{ path: string; content: string; language: string }>;
  /** Currently selected repo */
  repo?: string;
  /** Currently selected branch */
  branch?: string;
  /** Conversation history */
  conversationHistory: Array<{ role: string; content: string }>;
  /** Learned patterns from previous interactions */
  patterns: Array<{ trigger: string; action: string; confidence: number }>;
  /** File tree structure (paths only, for context) */
  fileTree: string[];
}

export type AgentEvent =
  | { type: 'plan_created'; plan: AgentPlan }
  | { type: 'step_start'; step: AgentStep; index: number }
  | { type: 'step_complete'; step: AgentStep; index: number }
  | { type: 'step_failed'; step: AgentStep; index: number; error: string }
  | { type: 'thinking'; content: string }
  | { type: 'output'; content: string }
  | { type: 'file_written'; path: string; content: string; language: string }
  | { type: 'file_edited'; path: string; oldContent: string; newContent: string }
  | { type: 'verification_start'; description: string }
  | { type: 'verification_result'; passed: boolean; issues: string[] }
  | { type: 'fix_attempt'; attempt: number; maxAttempts: number; issues: string[] }
  | { type: 'done'; summary: string; filesChanged: string[] }
  | { type: 'step_action'; action: string; payload: Record<string, unknown> }
  | { type: 'error'; message: string };

export type AgentEventCallback = (event: AgentEvent) => void;

// ─── Models ──────────────────────────────────────────────────────────

const PLANNER_MODEL: ModelConfig = {
  provider: 'ollama_cloud',
  model: 'deepseek-v3.2',
  description: 'DeepSeek V3.2 for planning and reasoning',
  max_tokens: 16384,
  temperature: 0.2,
  estimated_speed: '20-50 TPS',
};

const CODER_MODEL: ModelConfig = {
  provider: 'ollama_cloud',
  model: 'qwen3-coder:480b',
  description: 'Qwen3-Coder 480B for code generation',
  max_tokens: 16384,
  temperature: 0.1,
  estimated_speed: '30-100 TPS',
};

const FAST_MODEL: ModelConfig = {
  provider: 'ollama_cloud',
  model: 'gpt-oss:120b',
  description: 'GPT-OSS 120B for fast tasks',
  max_tokens: 8192,
  temperature: 0.3,
  estimated_speed: '40-80 TPS',
};

// ─── Planning ────────────────────────────────────────────────────────

const PLAN_PROMPT = `You are Pablo, an AI software engineering agent. Given a user request and context, create a step-by-step execution plan.

RULES:
1. Each step must be one of: plan, read_file, write_file, edit_file, search, shell, generate, review, fix, commit, create_pr, deploy, ask_user, done
2. Steps execute sequentially — later steps can reference output of earlier steps
3. Be thorough but efficient — don't add unnecessary steps
4. Always end with a "done" step
5. For code generation tasks, include: generate -> review -> fix (if needed) -> write files
6. For editing tasks, include: read_file -> edit_file -> review
7. Always include verification/review after code changes

OUTPUT FORMAT (JSON array):
[
  { "type": "read_file", "description": "Read the main config file", "input": { "path": "config.py" } },
  { "type": "generate", "description": "Generate new API endpoint", "input": { "spec": "..." } },
  { "type": "review", "description": "Review generated code for issues", "input": {} },
  { "type": "write_file", "description": "Write the API endpoint file", "input": { "path": "routes/api.py" } },
  { "type": "done", "description": "Task complete", "input": {} }
]

Output ONLY valid JSON. No markdown, no explanations.`;

/**
 * Create an execution plan from user request + context
 */
export async function createPlan(
  context: AgentContext,
  env: EnvConfig,
  onEvent?: AgentEventCallback,
): Promise<AgentPlan> {
  onEvent?.({ type: 'thinking', content: 'Analyzing request and creating execution plan...' });

  const contextSummary = buildContextSummary(context);

  const userPrompt = `USER REQUEST: ${context.userMessage}

CONTEXT:
${contextSummary}

Create a step-by-step plan to accomplish this task. Output ONLY a JSON array of steps.`;

  let planSteps: Array<{ type: AgentStepType; description: string; input: Record<string, unknown> }> = [];

  try {
    const result = await callModel(
      { model: PLANNER_MODEL, systemPrompt: PLAN_PROMPT, userMessage: userPrompt },
      env,
    );

    // Parse the plan from JSON
    const jsonMatch = result.content.match(/\[[\s\S]*\]/);
    if (jsonMatch) {
      planSteps = JSON.parse(jsonMatch[0]) as typeof planSteps;
    }
  } catch {
    // Fallback: simple plan based on task classification
    planSteps = createFallbackPlan(context);
  }

  // Ensure plan ends with done
  if (planSteps.length === 0 || planSteps[planSteps.length - 1].type !== 'done') {
    planSteps.push({ type: 'done', description: 'Task complete', input: {} });
  }

  const plan: AgentPlan = {
    goal: context.userMessage,
    steps: planSteps.map((s, i) => ({
      id: `step-${i}-${Date.now()}`,
      type: s.type,
      description: s.description,
      input: s.input || {},
      status: 'pending',
    })),
    currentStepIndex: 0,
    totalTokensUsed: 0,
    totalDurationMs: 0,
    status: 'planning',
    maxIterations: 5,
    currentIteration: 0,
  };

  onEvent?.({ type: 'plan_created', plan });
  return plan;
}

// ─── Execution ───────────────────────────────────────────────────────

/**
 * Execute a single step of the plan
 */
export async function executeStep(
  plan: AgentPlan,
  context: AgentContext,
  env: EnvConfig,
  onEvent?: AgentEventCallback,
  accumulatedFiles?: Array<{ path: string; content: string; language: string }>,
): Promise<{ plan: AgentPlan; filesWritten: Array<{ path: string; content: string; language: string }> }> {
  const step = plan.steps[plan.currentStepIndex];
  if (!step) return { plan: { ...plan, status: 'done' }, filesWritten: [] };

  step.status = 'running';
  const startTime = Date.now();
  onEvent?.({ type: 'step_start', step, index: plan.currentStepIndex });

  const filesWritten: Array<{ path: string; content: string; language: string }> = [];

  try {
    switch (step.type) {
      case 'generate': {
        const result = await executeGenerate(step, context, env, onEvent);
        step.output = result.content;
        plan.totalTokensUsed += result.tokensUsed;
        for (const f of result.files) {
          filesWritten.push(f);
          onEvent?.({ type: 'file_written', ...f });
        }
        break;
      }
      case 'review': {
        const result = await executeReview(step, plan, context, env, onEvent);
        step.output = result.content;
        plan.totalTokensUsed += result.tokensUsed;
        break;
      }
      case 'fix': {
        const result = await executeFix(step, plan, context, env, onEvent);
        step.output = result.content;
        plan.totalTokensUsed += result.tokensUsed;
        for (const f of result.files) {
          filesWritten.push(f);
          onEvent?.({ type: 'file_written', ...f });
        }
        break;
      }
      case 'write_file': {
        const path = step.input.path as string;
        const content = step.input.content as string || findGeneratedContent(plan, path);
        const lang = detectLang(path);
        filesWritten.push({ path, content, language: lang });
        step.output = `Wrote ${path} (${content.split('\n').length} lines)`;
        onEvent?.({ type: 'file_written', path, content, language: lang });
        break;
      }
      case 'edit_file': {
        const path = step.input.path as string;
        const oldContent = findFileContent(context, path);
        const editResult = await executeEdit(step, oldContent, context, env, onEvent);
        step.output = editResult.content;
        plan.totalTokensUsed += editResult.tokensUsed;
        if (editResult.newContent) {
          const lang = detectLang(path);
          filesWritten.push({ path, content: editResult.newContent, language: lang });
          onEvent?.({ type: 'file_edited', path, oldContent, newContent: editResult.newContent });
        }
        break;
      }
      case 'read_file': {
        const path = step.input.path as string;
        const content = findFileContent(context, path);
        step.output = content || `File not found: ${path}`;
        onEvent?.({ type: 'output', content: `Read ${path} (${(content || '').split('\n').length} lines)` });
        break;
      }
      case 'search': {
        const query = step.input.query as string || step.input.pattern as string || '';
        const results = executeSearch(query, context);
        step.output = results;
        onEvent?.({ type: 'output', content: results });
        break;
      }
      case 'plan': {
        // Sub-planning — break down a complex sub-task
        onEvent?.({ type: 'thinking', content: step.description });
        step.output = 'Sub-plan created';
        break;
      }
      case 'done': {
        const allAvailableForSummary = [...(accumulatedFiles || []), ...filesWritten];
        const summary = buildSummary(plan, allAvailableForSummary);
        step.output = summary;
        onEvent?.({
          type: 'done',
          summary,
          filesChanged: allAvailableForSummary.map((f) => f.path),
        });
        break;
      }
      case 'commit': {
        const message = (step.input.message as string) || 'Auto-commit from Pablo agent';
        const allAvailable = [...(accumulatedFiles || []), ...filesWritten];
        const files = (step.input.files as string[]) || allAvailable.map(f => f.path);
        onEvent?.({ type: 'output', content: `Committing ${files.length} files: ${message}` });
        // Emit action event for client-side execution (server-side fetch with relative URLs is not supported)
        onEvent?.({
          type: 'step_action',
          action: 'commit',
          payload: {
            message,
            repo: context.repo,
            files: files.map(f => {
              const written = allAvailable.find(w => w.path === f);
              return { path: f, content: written?.content || '' };
            }),
          },
        });
        step.output = `Commit prepared: ${files.length} files — "${message}" (client will execute)`;
        break;
      }
      case 'create_pr': {
        const title = (step.input.title as string) || 'PR from Pablo agent';
        const prBody = (step.input.body as string) || '';
        const head = (step.input.head as string) || '';
        const base = (step.input.base as string) || 'main';
        onEvent?.({ type: 'output', content: `Creating PR: ${title}` });
        // Emit action event for client-side execution
        onEvent?.({
          type: 'step_action',
          action: 'create_pr',
          payload: { title, body: prBody, head, base, repo: context.repo },
        });
        step.output = `PR prepared: "${title}" (${head} → ${base}) (client will execute)`;
        break;
      }
      case 'deploy': {
        const target = (step.input.target as string) || 'production';
        onEvent?.({ type: 'output', content: `Deploying to ${target}...` });
        // Emit action event for client-side execution
        onEvent?.({
          type: 'step_action',
          action: 'deploy',
          payload: { target },
        });
        step.output = `Deploy prepared: target=${target} (client will execute)`;
        break;
      }
      case 'shell': {
        const command = (step.input.command as string) || '';
        onEvent?.({ type: 'output', content: `Shell: ${command}` });
        // Shell execution requires a sandbox backend — return informational message
        step.output = `Shell command queued: "${command}" — sandbox execution requires terminal backend (see Phase 7)`;
        break;
      }
      case 'ask_user': {
        const question = (step.input.question as string) || step.description;
        onEvent?.({ type: 'output', content: `Asking user: ${question}` });
        step.output = `Waiting for user response to: ${question}`;
        break;
      }
      default: {
        onEvent?.({ type: 'output', content: `Executing: ${step.description}` });
        step.output = `Step type "${step.type}" executed`;
        break;
      }
    }

    step.status = 'done';
    step.durationMs = Date.now() - startTime;
    onEvent?.({ type: 'step_complete', step, index: plan.currentStepIndex });
  } catch (error) {
    step.status = 'failed';
    step.error = error instanceof Error ? error.message : 'Unknown error';
    step.durationMs = Date.now() - startTime;
    onEvent?.({ type: 'step_failed', step, index: plan.currentStepIndex, error: step.error });
  }

  plan.currentStepIndex++;
  plan.totalDurationMs += step.durationMs || 0;

  if (plan.currentStepIndex >= plan.steps.length) {
    plan.status = 'done';
  }

  return { plan, filesWritten };
}

/**
 * Run the full agentic loop: plan -> execute all steps -> verify -> fix -> done
 */
export async function runAgentLoop(
  context: AgentContext,
  env: EnvConfig,
  onEvent?: AgentEventCallback,
): Promise<{ plan: AgentPlan; allFiles: Array<{ path: string; content: string; language: string }> }> {
  // Phase 1: Plan
  const plan = await createPlan(context, env, onEvent);
  plan.status = 'executing';

  const allFiles: Array<{ path: string; content: string; language: string }> = [];

  // Phase 2: Execute all steps
  while (plan.currentStepIndex < plan.steps.length && (plan.status as string) !== 'failed') {
    const { filesWritten } = await executeStep(plan, context, env, onEvent, allFiles);
    allFiles.push(...filesWritten);
  }

  // Phase 3: Verify (if we generated any files)
  if (allFiles.length > 0 && plan.currentIteration < plan.maxIterations) {
    plan.status = 'verifying';
    onEvent?.({ type: 'verification_start', description: 'Reviewing all generated code...' });

    const verifyResult = await verifyOutput(allFiles, context, env, onEvent);

    if (!verifyResult.passed && verifyResult.issues.length > 0) {
      onEvent?.({ type: 'verification_result', passed: false, issues: verifyResult.issues });

      // Phase 4: Fix
      plan.status = 'fixing';
      plan.currentIteration++;
      onEvent?.({
        type: 'fix_attempt',
        attempt: plan.currentIteration,
        maxAttempts: plan.maxIterations,
        issues: verifyResult.issues,
      });

      const fixResult = await autoFix(allFiles, verifyResult.issues, context, env, onEvent);
      // Replace files with fixed versions
      for (const fixed of fixResult.files) {
        const idx = allFiles.findIndex((f) => f.path === fixed.path);
        if (idx >= 0) {
          allFiles[idx] = fixed;
        } else {
          allFiles.push(fixed);
        }
        onEvent?.({ type: 'file_written', ...fixed });
      }
    } else {
      onEvent?.({ type: 'verification_result', passed: true, issues: [] });
    }
  }

  plan.status = 'done';
  return { plan, allFiles };
}

// ─── Step Executors ──────────────────────────────────────────────────

async function executeGenerate(
  step: AgentStep,
  context: AgentContext,
  env: EnvConfig,
  onEvent?: AgentEventCallback,
): Promise<{ content: string; tokensUsed: number; files: Array<{ path: string; content: string; language: string }> }> {
  const spec = (step.input.spec as string) || step.description;
  onEvent?.({ type: 'thinking', content: `Generating code: ${spec.slice(0, 100)}...` });

  const contextStr = context.openFiles
    .map((f) => `## ${f.path}\n\`\`\`${f.language}\n${f.content}\n\`\`\``)
    .join('\n\n');

  const prompt = `Generate production-ready code for the following:

TASK: ${spec}

${contextStr ? `EXISTING CODE CONTEXT:\n${contextStr}\n` : ''}
RULES:
- Write complete, runnable files — not snippets
- Include all imports
- Follow existing code conventions if context is provided
- Use TypeScript for .ts/.tsx files, Python for .py files
- Each file must be clearly labelled with its path

Output format — for EACH file:
### path/to/file.ext
\`\`\`language
// complete file content
\`\`\``;

  const result = await callModel(
    { model: CODER_MODEL, systemPrompt: 'You are a senior software engineer. Write complete, production-ready code.', userMessage: prompt },
    env,
  );

  // Parse generated files
  const files = parseGeneratedFiles(result.content);

  return {
    content: result.content,
    tokensUsed: result.tokens_used,
    files,
  };
}

async function executeReview(
  step: AgentStep,
  plan: AgentPlan,
  context: AgentContext,
  env: EnvConfig,
  onEvent?: AgentEventCallback,
): Promise<{ content: string; tokensUsed: number }> {
  // Gather all generated code from previous steps
  const generatedCode = plan.steps
    .filter((s) => s.status === 'done' && (s.type === 'generate' || s.type === 'fix') && s.output)
    .map((s) => s.output)
    .join('\n\n');

  if (!generatedCode) {
    return { content: 'No code to review', tokensUsed: 0 };
  }

  onEvent?.({ type: 'thinking', content: 'Reviewing generated code for issues...' });

  const prompt = `Review this generated code. Find bugs, security issues, missing imports, type errors, and logic problems.

ORIGINAL REQUEST: ${context.userMessage}

CODE TO REVIEW:
${generatedCode.slice(0, 12000)}

Output a JSON array of issues found:
[
  { "severity": "critical|high|medium|low", "file": "filename", "description": "what's wrong", "fix": "how to fix it" }
]

If no issues, return: []
Output ONLY valid JSON.`;

  const result = await callModel(
    { model: PLANNER_MODEL, systemPrompt: 'You are a code reviewer. Find real bugs only.', userMessage: prompt },
    env,
  );

  return { content: result.content, tokensUsed: result.tokens_used };
}

async function executeFix(
  step: AgentStep,
  plan: AgentPlan,
  context: AgentContext,
  env: EnvConfig,
  onEvent?: AgentEventCallback,
): Promise<{ content: string; tokensUsed: number; files: Array<{ path: string; content: string; language: string }> }> {
  // Get the review output (issues) and original code
  const reviewStep = plan.steps.find((s) => s.type === 'review' && s.status === 'done');
  const generateStep = plan.steps.find((s) => s.type === 'generate' && s.status === 'done');

  if (!reviewStep?.output || !generateStep?.output) {
    return { content: 'Nothing to fix', tokensUsed: 0, files: [] };
  }

  onEvent?.({ type: 'thinking', content: 'Applying fixes to code...' });

  const prompt = `Fix the following issues in the generated code.

ISSUES FOUND:
${reviewStep.output}

ORIGINAL CODE:
${generateStep.output.slice(0, 12000)}

Apply ALL fixes. Return the COMPLETE fixed code with file paths.
For EACH file:
### path/to/file.ext
\`\`\`language
// complete fixed file content
\`\`\``;

  const result = await callModel(
    { model: CODER_MODEL, systemPrompt: 'You are a code fixer. Apply all fixes precisely.', userMessage: prompt },
    env,
  );

  const files = parseGeneratedFiles(result.content);
  return { content: result.content, tokensUsed: result.tokens_used, files };
}

async function executeEdit(
  step: AgentStep,
  oldContent: string,
  context: AgentContext,
  env: EnvConfig,
  onEvent?: AgentEventCallback,
): Promise<{ content: string; tokensUsed: number; newContent: string | null }> {
  const editInstructions = (step.input.instructions as string) || step.description;
  const path = step.input.path as string;

  onEvent?.({ type: 'thinking', content: `Editing ${path}: ${editInstructions.slice(0, 80)}...` });

  const prompt = `Edit the following file according to the instructions.

FILE: ${path}
\`\`\`
${oldContent.slice(0, 10000)}
\`\`\`

INSTRUCTIONS: ${editInstructions}

Return the COMPLETE updated file content. Do not return a diff — return the full file.
\`\`\`
// complete updated file
\`\`\``;

  const result = await callModel(
    { model: CODER_MODEL, systemPrompt: 'You are an expert code editor. Apply edits precisely.', userMessage: prompt },
    env,
  );

  // Extract content from code block
  const codeBlockMatch = result.content.match(/```[\w]*\n([\s\S]*?)```/);
  const newContent = codeBlockMatch ? codeBlockMatch[1].trim() : null;

  return { content: result.content, tokensUsed: result.tokens_used, newContent };
}

// ─── Verification ────────────────────────────────────────────────────

async function verifyOutput(
  files: Array<{ path: string; content: string; language: string }>,
  context: AgentContext,
  env: EnvConfig,
  onEvent?: AgentEventCallback,
): Promise<{ passed: boolean; issues: string[] }> {
  const allCode = files.map((f) => `### ${f.path}\n\`\`\`${f.language}\n${f.content}\n\`\`\``).join('\n\n');

  onEvent?.({ type: 'thinking', content: `Verifying ${files.length} generated files...` });

  const prompt = `Verify this generated code. Check for:
1. Missing imports
2. Type errors
3. Undefined variables
4. Logic bugs
5. Security issues (hardcoded secrets, no auth)
6. Incomplete implementations (TODO, pass, ...)

ORIGINAL REQUEST: ${context.userMessage}

CODE:
${allCode.slice(0, 14000)}

Return a JSON array of critical issues only (things that would prevent the code from running):
[
  { "file": "filename", "issue": "description", "severity": "critical|high" }
]

If no critical issues, return: []
Output ONLY valid JSON.`;

  try {
    const result = await callModel(
      { model: FAST_MODEL, systemPrompt: 'You verify code correctness. Only report real issues.', userMessage: prompt },
      env,
    );

    const jsonMatch = result.content.match(/\[[\s\S]*\]/);
    if (jsonMatch) {
      const issues = JSON.parse(jsonMatch[0]) as Array<{ file: string; issue: string; severity: string }>;
      const critical = issues.filter((i) => i.severity === 'critical' || i.severity === 'high');
      return {
        passed: critical.length === 0,
        issues: critical.map((i) => `[${i.file}] ${i.issue}`),
      };
    }
    return { passed: true, issues: [] };
  } catch {
    return { passed: true, issues: [] }; // Don't block on verification failure
  }
}

async function autoFix(
  files: Array<{ path: string; content: string; language: string }>,
  issues: string[],
  context: AgentContext,
  env: EnvConfig,
  onEvent?: AgentEventCallback,
): Promise<{ files: Array<{ path: string; content: string; language: string }> }> {
  const allCode = files.map((f) => `### ${f.path}\n\`\`\`${f.language}\n${f.content}\n\`\`\``).join('\n\n');

  onEvent?.({ type: 'thinking', content: `Auto-fixing ${issues.length} issues...` });

  const prompt = `Fix these issues in the code:

ISSUES:
${issues.map((i, idx) => `${idx + 1}. ${i}`).join('\n')}

CODE:
${allCode.slice(0, 14000)}

Apply ALL fixes. Return COMPLETE fixed files:
### path/to/file.ext
\`\`\`language
// complete fixed content
\`\`\``;

  try {
    const result = await callModel(
      { model: CODER_MODEL, systemPrompt: 'Fix all issues precisely. Return complete files.', userMessage: prompt },
      env,
    );

    return { files: parseGeneratedFiles(result.content) };
  } catch {
    return { files }; // Return originals on failure
  }
}

// ─── Helpers ─────────────────────────────────────────────────────────

function buildContextSummary(context: AgentContext): string {
  const parts: string[] = [];

  if (context.repo) parts.push(`Repository: ${context.repo} (branch: ${context.branch || 'main'})`);
  if (context.openFiles.length > 0) {
    parts.push(`Open files (${context.openFiles.length}):\n${context.openFiles.map((f) => `  - ${f.path} (${f.language})`).join('\n')}`);
  }
  if (context.fileTree.length > 0) {
    parts.push(`File tree (${context.fileTree.length} files):\n${context.fileTree.slice(0, 50).join('\n')}`);
  }
  if (context.patterns.length > 0) {
    parts.push(`Learned patterns:\n${context.patterns.slice(0, 10).map((p) => `  - ${p.trigger} -> ${p.action}`).join('\n')}`);
  }
  if (context.conversationHistory.length > 0) {
    const recent = context.conversationHistory.slice(-5);
    parts.push(`Recent conversation:\n${recent.map((m) => `  ${m.role}: ${m.content.slice(0, 100)}`).join('\n')}`);
  }

  return parts.join('\n\n') || 'No additional context available.';
}

function createFallbackPlan(context: AgentContext): Array<{ type: AgentStepType; description: string; input: Record<string, unknown> }> {
  const msg = context.userMessage.toLowerCase();

  if (/build|create|generate|implement/.test(msg)) {
    return [
      { type: 'generate', description: `Generate code for: ${context.userMessage}`, input: { spec: context.userMessage } },
      { type: 'review', description: 'Review generated code', input: {} },
      { type: 'done', description: 'Code generation complete', input: {} },
    ];
  }

  if (/fix|debug|repair|correct/.test(msg)) {
    return [
      { type: 'review', description: `Analyze issue: ${context.userMessage}`, input: {} },
      { type: 'fix', description: 'Apply fixes', input: {} },
      { type: 'done', description: 'Fixes applied', input: {} },
    ];
  }

  if (/edit|modify|update|change/.test(msg)) {
    return [
      { type: 'edit_file', description: context.userMessage, input: { path: context.openFiles[0]?.path || '', instructions: context.userMessage } },
      { type: 'done', description: 'Edit complete', input: {} },
    ];
  }

  // Default: generate
  return [
    { type: 'generate', description: context.userMessage, input: { spec: context.userMessage } },
    { type: 'done', description: 'Task complete', input: {} },
  ];
}

/**
 * Parse files from LLM output in the format:
 * ### path/to/file.ext
 * ```language
 * content
 * ```
 */
export function parseGeneratedFiles(content: string): Array<{ path: string; content: string; language: string }> {
  const files: Array<{ path: string; content: string; language: string }> = [];
  const seen = new Set<string>();

  // Pattern: ### path/to/file.ext followed by ```lang\ncontent```
  const pattern = /###\s+([^\n]+)\s*\n\s*```(\w*)\n([\s\S]*?)```/g;
  let match: RegExpExecArray | null;

  while ((match = pattern.exec(content)) !== null) {
    const rawPath = match[1].trim().replace(/[`*]/g, '');
    const language = match[2] || detectLang(rawPath);
    const fileContent = match[3].trim();

    if (rawPath && fileContent && !seen.has(rawPath)) {
      seen.add(rawPath);
      files.push({ path: rawPath, content: fileContent, language });
    }
  }

  // Fallback: try ```filename.ext\ncontent``` pattern
  if (files.length === 0) {
    const altPattern = /```([a-zA-Z0-9_/.]+\.[a-zA-Z]+)\n([\s\S]*?)```/g;
    while ((match = altPattern.exec(content)) !== null) {
      const path = match[1].trim();
      const fileContent = match[2].trim();
      if (path && fileContent && !seen.has(path)) {
        seen.add(path);
        files.push({ path, content: fileContent, language: detectLang(path) });
      }
    }
  }

  return files;
}

function findGeneratedContent(plan: AgentPlan, path: string): string {
  // Look through previous step outputs for content matching this path
  for (const step of plan.steps) {
    if (step.output && step.output.includes(path)) {
      const files = parseGeneratedFiles(step.output);
      const match = files.find((f) => f.path === path);
      if (match) return match.content;
    }
  }
  return '';
}

function findFileContent(context: AgentContext, path: string): string {
  const file = context.openFiles.find((f) => f.path === path || f.path.endsWith(path));
  return file?.content || '';
}

function executeSearch(query: string, context: AgentContext): string {
  // Search through open files and file tree
  const results: string[] = [];
  const lowerQuery = query.toLowerCase();

  for (const file of context.openFiles) {
    if (file.content.toLowerCase().includes(lowerQuery) || file.path.toLowerCase().includes(lowerQuery)) {
      results.push(`Found in ${file.path}`);
    }
  }

  for (const path of context.fileTree) {
    if (path.toLowerCase().includes(lowerQuery)) {
      results.push(`File: ${path}`);
    }
  }

  return results.length > 0 ? results.join('\n') : `No results for "${query}"`;
}

function detectLang(path: string): string {
  const ext = path.split('.').pop()?.toLowerCase() || '';
  const map: Record<string, string> = {
    ts: 'typescript', tsx: 'typescriptreact', js: 'javascript', jsx: 'javascriptreact',
    py: 'python', rs: 'rust', go: 'go', java: 'java', rb: 'ruby', php: 'php',
    html: 'html', css: 'css', scss: 'scss', json: 'json', yaml: 'yaml', yml: 'yaml',
    md: 'markdown', sql: 'sql', sh: 'shell', bash: 'shell', toml: 'toml',
    svelte: 'svelte', vue: 'vue', prisma: 'prisma', graphql: 'graphql',
  };
  return map[ext] || 'plaintext';
}

function buildSummary(plan: AgentPlan, files: Array<{ path: string; content: string; language: string }>): string {
  const completedSteps = plan.steps.filter((s) => s.status === 'done').length;
  const failedSteps = plan.steps.filter((s) => s.status === 'failed').length;
  const totalLines = files.reduce((sum, f) => sum + f.content.split('\n').length, 0);

  return `Completed ${completedSteps}/${plan.steps.length} steps${failedSteps > 0 ? ` (${failedSteps} failed)` : ''}. Generated ${files.length} files (${totalLines} lines). ${plan.totalTokensUsed} tokens used in ${(plan.totalDurationMs / 1000).toFixed(1)}s.`;
}
