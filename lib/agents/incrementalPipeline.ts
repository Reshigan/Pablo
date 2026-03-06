// lib/agents/incrementalPipeline.ts
// Incremental pipeline for bug fixes, feature additions, and refactoring
// Unlike the full 9-stage Build pipeline, this is a focused 4-stage pipeline:
// 1. Analyze → 2. Plan → 3. Implement → 4. Review

import { callModel, type EnvConfig } from './modelRouter';
import { analyzeCodebase, scoreRelevance, buildProjectSummary } from './contextAnalyzer';

// ─── Types ──────────────────────────────────────────────────────────

export type IncrementalMode = 'bug-fix' | 'add-feature' | 'refactor';

export interface FileEdit {
  path: string;
  oldContent: string;
  newContent: string;
  description: string;
}

export interface NewFile {
  path: string;
  content: string;
  language: string;
  description: string;
}

export interface IncrementalResult {
  mode: IncrementalMode;
  description: string;
  edits: FileEdit[];
  newFiles: NewFile[];
  explanation: string;
  relevantFiles: string[];
}

export interface IncrementalProgress {
  stage: 'analyze' | 'plan' | 'implement' | 'review';
  message: string;
  progress: number; // 0-100
}

// ─── Stage 1: Analyze ───────────────────────────────────────────────

function findRelevantFiles(
  description: string,
  files: Array<{ path: string; content: string; language: string }>,
  maxFiles: number = 15,
): Array<{ path: string; content: string; language: string; score: number }> {
  const scored = scoreRelevance(
    description,
    files.map((f) => ({ path: f.path, content: f.content })),
    maxFiles,
  );

  return scored
    .filter((s) => s.score > 0.1)
    .map((s) => {
      const file = files.find((f) => f.path === s.path);
      return {
        path: s.path,
        content: file?.content ?? '',
        language: file?.language ?? 'unknown',
        score: s.score,
      };
    });
}

// ─── Stage 2: Plan ──────────────────────────────────────────────────

const PLAN_SYSTEM_PROMPT = `You are a senior software engineer planning targeted code changes.
Given a task description and relevant source files, create a precise plan.

Return a JSON object with this exact structure:
{
  "approach": "brief description of the approach",
  "filesToEdit": [
    {"path": "file/path.ts", "changes": "what to change and why"}
  ],
  "filesToCreate": [
    {"path": "new/file.ts", "purpose": "what this file does", "language": "typescript"}
  ],
  "risks": ["potential risk 1", "potential risk 2"]
}

RULES:
- Be minimal: only touch files that NEED to change
- Prefer editing over creating new files
- Never rewrite entire files — describe specific changes
- Return ONLY the JSON object, no markdown fences`;

interface PlanResult {
  approach: string;
  filesToEdit: Array<{ path: string; changes: string }>;
  filesToCreate: Array<{ path: string; purpose: string; language: string }>;
  risks: string[];
}

async function createPlan(
  description: string,
  mode: IncrementalMode,
  relevantFiles: Array<{ path: string; content: string; language: string }>,
  projectSummary: string,
  env: EnvConfig,
): Promise<PlanResult> {
  const fileContext = relevantFiles
    .slice(0, 10)
    .map((f) => {
      const truncated = f.content.length > 4000 ? f.content.slice(0, 4000) + '\n// ... truncated' : f.content;
      return `--- ${f.path} (${f.language}) ---\n${truncated}`;
    })
    .join('\n\n');

  const modeLabel = mode === 'bug-fix' ? 'Bug Fix' : mode === 'add-feature' ? 'New Feature' : 'Refactor';

  const prompt = `MODE: ${modeLabel}
TASK: ${description}

${projectSummary}

RELEVANT FILES:
${fileContext}

Create a minimal, targeted plan for this ${modeLabel.toLowerCase()}.`;

  const MODEL = {
    provider: 'ollama_cloud' as const,
    model: 'qwen3:32b',
    description: 'Incremental planner',
    max_tokens: 4096,
    temperature: 0.2,
    estimated_speed: '40-80 TPS',
  };

  const response = await callModel(
    { model: MODEL, systemPrompt: PLAN_SYSTEM_PROMPT, userMessage: prompt },
    env,
  );

  let jsonStr = response.content.trim();
  const fenceMatch = jsonStr.match(/```(?:json)?\s*([\s\S]*?)```/);
  if (fenceMatch) jsonStr = fenceMatch[1].trim();

  try {
    return JSON.parse(jsonStr) as PlanResult;
  } catch {
    const objMatch = jsonStr.match(/\{[\s\S]*\}/);
    if (objMatch) {
      return JSON.parse(objMatch[0]) as PlanResult;
    }
    // Fallback plan
    return {
      approach: 'Direct implementation based on description',
      filesToEdit: relevantFiles.slice(0, 3).map((f) => ({ path: f.path, changes: description })),
      filesToCreate: [],
      risks: [],
    };
  }
}

// ─── Stage 3: Implement ─────────────────────────────────────────────

const IMPLEMENT_SYSTEM_PROMPT = `You are a precise code editor. Given a file and a description of changes, return the COMPLETE updated file content.

RULES:
1. Return the ENTIRE file with changes applied — not just the diff
2. Make MINIMAL changes — only modify what's needed
3. Preserve all existing code style, formatting, and conventions
4. Add necessary imports at the top
5. Do NOT add comments like "// changed" or "// added"
6. Return ONLY the code in a single code block, no explanations

\`\`\`<language>
<complete file content>
\`\`\``;

async function implementFileEdit(
  filePath: string,
  fileContent: string,
  language: string,
  changeDescription: string,
  env: EnvConfig,
): Promise<string> {
  const prompt = `File: ${filePath}
Language: ${language}
Change: ${changeDescription}

Current file content:
\`\`\`${language}
${fileContent}
\`\`\`

Return the COMPLETE updated file with the changes applied.`;

  const MODEL = {
    provider: 'ollama_cloud' as const,
    model: 'qwen2.5-coder:32b',
    description: 'Incremental implementer',
    max_tokens: 8192,
    temperature: 0.1,
    estimated_speed: '40-80 TPS',
  };

  const response = await callModel(
    { model: MODEL, systemPrompt: IMPLEMENT_SYSTEM_PROMPT, userMessage: prompt },
    env,
  );

  // Extract code from response
  const codeMatch = response.content.match(/```[\w]*\n([\s\S]*?)```/);
  if (codeMatch) {
    return codeMatch[1].trim();
  }

  // If no code block, use response as-is if it looks like code
  const content = response.content.trim();
  if (content.length > 50 && !content.startsWith('I ') && !content.startsWith('Here')) {
    return content;
  }

  // Return original if LLM response doesn't look like code
  return fileContent;
}

const CREATE_FILE_SYSTEM_PROMPT = `You are a code generator. Create a new file based on the description.

RULES:
1. Write production-quality code
2. Include all necessary imports
3. Follow the project's existing conventions
4. Return ONLY the code in a single code block

\`\`\`<language>
<file content>
\`\`\``;

async function implementNewFile(
  filePath: string,
  language: string,
  purpose: string,
  projectContext: string,
  env: EnvConfig,
): Promise<string> {
  const prompt = `Create file: ${filePath}
Language: ${language}
Purpose: ${purpose}

Project context:
${projectContext}

Generate the complete file content.`;

  const MODEL = {
    provider: 'ollama_cloud' as const,
    model: 'qwen2.5-coder:32b',
    description: 'File creator',
    max_tokens: 8192,
    temperature: 0.1,
    estimated_speed: '40-80 TPS',
  };

  const response = await callModel(
    { model: MODEL, systemPrompt: CREATE_FILE_SYSTEM_PROMPT, userMessage: prompt },
    env,
  );

  const codeMatch = response.content.match(/```[\w]*\n([\s\S]*?)```/);
  return codeMatch ? codeMatch[1].trim() : response.content.trim();
}

// ─── Stage 4: Review ────────────────────────────────────────────────

const REVIEW_SYSTEM_PROMPT = `You are a code reviewer. Summarize the changes that were made in 2-3 sentences. Be concise and specific about what changed and why. Return plain text, not JSON.`;

async function reviewChanges(
  edits: FileEdit[],
  newFiles: NewFile[],
  mode: IncrementalMode,
  description: string,
  env: EnvConfig,
): Promise<string> {
  const changesSummary = [
    ...edits.map((e) => `Edited ${e.path}: ${e.description}`),
    ...newFiles.map((f) => `Created ${f.path}: ${f.description}`),
  ].join('\n');

  const prompt = `Mode: ${mode}
Task: ${description}

Changes made:
${changesSummary}

Summarize what was done and any important notes.`;

  const MODEL = {
    provider: 'ollama_cloud' as const,
    model: 'qwen3:32b',
    description: 'Change reviewer',
    max_tokens: 1024,
    temperature: 0.3,
    estimated_speed: '40-80 TPS',
  };

  try {
    const response = await callModel(
      { model: MODEL, systemPrompt: REVIEW_SYSTEM_PROMPT, userMessage: prompt },
      env,
    );
    return response.content.trim();
  } catch {
    return `Applied ${edits.length} file edit(s) and created ${newFiles.length} new file(s) for: ${description}`;
  }
}

// ─── Main Pipeline ──────────────────────────────────────────────────

export async function runIncrementalPipeline(
  description: string,
  mode: IncrementalMode,
  files: Array<{ path: string; content: string; language: string }>,
  env: EnvConfig,
  onProgress?: (progress: IncrementalProgress) => void,
): Promise<IncrementalResult> {
  // Stage 1: Analyze
  onProgress?.({ stage: 'analyze', message: 'Analyzing codebase and finding relevant files...', progress: 10 });
  const analysis = analyzeCodebase(files);
  const projectSummary = buildProjectSummary(analysis);
  const relevantFiles = findRelevantFiles(description, files);
  onProgress?.({ stage: 'analyze', message: `Found ${relevantFiles.length} relevant files`, progress: 25 });

  // Stage 2: Plan
  onProgress?.({ stage: 'plan', message: 'Creating implementation plan...', progress: 30 });
  const plan = await createPlan(description, mode, relevantFiles, projectSummary, env);
  onProgress?.({ stage: 'plan', message: `Plan: ${plan.approach}`, progress: 45 });

  // Stage 3: Implement
  const edits: FileEdit[] = [];
  const newFiles: NewFile[] = [];
  const totalWork = plan.filesToEdit.length + plan.filesToCreate.length;
  let completed = 0;

  // Edit existing files
  for (const fileToEdit of plan.filesToEdit) {
    onProgress?.({
      stage: 'implement',
      message: `Editing ${fileToEdit.path}...`,
      progress: 50 + Math.floor((completed / Math.max(totalWork, 1)) * 35),
    });

    const existing = files.find((f) => f.path === fileToEdit.path);
    if (!existing) {
      completed++;
      continue;
    }

    const newContent = await implementFileEdit(
      fileToEdit.path,
      existing.content,
      existing.language,
      fileToEdit.changes,
      env,
    );

    // Only add edit if content actually changed
    if (newContent !== existing.content) {
      edits.push({
        path: fileToEdit.path,
        oldContent: existing.content,
        newContent,
        description: fileToEdit.changes,
      });
    }

    completed++;
  }

  // Create new files
  for (const fileToCreate of plan.filesToCreate) {
    onProgress?.({
      stage: 'implement',
      message: `Creating ${fileToCreate.path}...`,
      progress: 50 + Math.floor((completed / Math.max(totalWork, 1)) * 35),
    });

    const content = await implementNewFile(
      fileToCreate.path,
      fileToCreate.language,
      fileToCreate.purpose,
      projectSummary,
      env,
    );

    newFiles.push({
      path: fileToCreate.path,
      content,
      language: fileToCreate.language,
      description: fileToCreate.purpose,
    });

    completed++;
  }

  // Stage 4: Review
  onProgress?.({ stage: 'review', message: 'Reviewing changes...', progress: 90 });
  const explanation = await reviewChanges(edits, newFiles, mode, description, env);
  onProgress?.({ stage: 'review', message: 'Complete', progress: 100 });

  return {
    mode,
    description,
    edits,
    newFiles,
    explanation,
    relevantFiles: relevantFiles.map((f) => f.path),
  };
}

/**
 * Detect the incremental mode from user input
 */
export function detectIncrementalMode(input: string): IncrementalMode {
  const lower = input.toLowerCase();

  // Bug fix patterns
  if (/\b(fix|bug|error|crash|broken|issue|not\s+work|fail|wrong|incorrect)\b/.test(lower)) {
    return 'bug-fix';
  }

  // Refactor patterns
  if (/\b(refactor|clean\s*up|reorganize|restructure|simplify|optimize|improve\s+code)\b/.test(lower)) {
    return 'refactor';
  }

  // Default to add-feature
  return 'add-feature';
}
