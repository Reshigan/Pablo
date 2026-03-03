// lib/agents/taskDecomposer.ts
// Breaks complex user prompts into atomic, executable sub-tasks
// Devin pattern: never try to do everything at once — decompose first

import { callModel, type EnvConfig } from './modelRouter';

export interface SubTask {
  id: string;
  title: string;
  description: string;
  type: 'setup' | 'generate' | 'edit' | 'test' | 'review' | 'deploy' | 'config';
  dependencies: string[]; // IDs of tasks that must complete first
  status: 'pending' | 'in_progress' | 'completed' | 'failed' | 'skipped';
  output?: string;
  estimatedComplexity: 'low' | 'medium' | 'high';
  files: string[]; // Files this task will create or modify
}

export interface DecompositionResult {
  originalRequest: string;
  projectType: 'frontend' | 'backend' | 'fullstack' | 'library' | 'script' | 'config' | 'unknown';
  framework: string;
  tasks: SubTask[];
  totalEstimatedSteps: number;
}

const DECOMPOSE_PROMPT = `You are an expert task decomposition agent. Break down the user's request into atomic, executable sub-tasks.

RULES:
1. Each sub-task should be small enough to complete in one step
2. Order tasks by dependency — foundational tasks first
3. Identify the project type and framework
4. Include setup/config tasks before implementation
5. Include test and review tasks after implementation
6. Each task should specify which files it creates/modifies

OUTPUT FORMAT (JSON):
{
  "projectType": "frontend|backend|fullstack|library|script|config",
  "framework": "next.js|fastapi|express|react|etc",
  "tasks": [
    {
      "id": "task-1",
      "title": "Short title",
      "description": "Detailed description of what to do",
      "type": "setup|generate|edit|test|review|deploy|config",
      "dependencies": [],
      "estimatedComplexity": "low|medium|high",
      "files": ["path/to/file.ts"]
    }
  ]
}

Output ONLY valid JSON. No markdown.`;

/**
 * Decompose a complex request into atomic sub-tasks
 */
export async function decomposeTask(
  userMessage: string,
  contextFiles: string[],
  env: EnvConfig,
): Promise<DecompositionResult> {
  const contextStr = contextFiles.length > 0
    ? `\nEXISTING FILES IN PROJECT:\n${contextFiles.slice(0, 100).join('\n')}`
    : '';

  const prompt = `USER REQUEST: ${userMessage}
${contextStr}

Decompose this into atomic sub-tasks.`;

  const MODEL = {
    provider: 'ollama_cloud' as const,
    model: 'deepseek-v3.2',
    description: 'DeepSeek V3.2 for task decomposition',
    max_tokens: 8192,
    temperature: 0.2,
    estimated_speed: '20-50 TPS',
  };

  try {
    const result = await callModel(
      { model: MODEL, systemPrompt: DECOMPOSE_PROMPT, userMessage: prompt },
      env,
    );

    const jsonMatch = result.content.match(/\{[\s\S]*\}/);
    if (jsonMatch) {
      const parsed = JSON.parse(jsonMatch[0]) as {
        projectType?: string;
        framework?: string;
        tasks?: Array<{
          id?: string;
          title?: string;
          description?: string;
          type?: string;
          dependencies?: string[];
          estimatedComplexity?: string;
          files?: string[];
        }>;
      };

      const tasks: SubTask[] = (parsed.tasks || []).map((t, i) => ({
        id: t.id || `task-${i + 1}`,
        title: t.title || `Task ${i + 1}`,
        description: t.description || '',
        type: (t.type as SubTask['type']) || 'generate',
        dependencies: t.dependencies || [],
        status: 'pending' as const,
        estimatedComplexity: (t.estimatedComplexity as SubTask['estimatedComplexity']) || 'medium',
        files: t.files || [],
      }));

      return {
        originalRequest: userMessage,
        projectType: (parsed.projectType as DecompositionResult['projectType']) || 'unknown',
        framework: parsed.framework || 'unknown',
        tasks,
        totalEstimatedSteps: tasks.length,
      };
    }
  } catch {
    // Fall through to heuristic decomposition
  }

  // Heuristic fallback
  return heuristicDecompose(userMessage);
}

/**
 * Heuristic decomposition when LLM fails
 */
function heuristicDecompose(userMessage: string): DecompositionResult {
  const msg = userMessage.toLowerCase();
  const tasks: SubTask[] = [];
  let projectType: DecompositionResult['projectType'] = 'unknown';
  let framework = 'unknown';

  // Detect project type
  if (/api|backend|endpoint|fastapi|express|flask|django/.test(msg)) {
    projectType = 'backend';
    framework = /fastapi/.test(msg) ? 'fastapi' : /express/.test(msg) ? 'express' : /django/.test(msg) ? 'django' : 'fastapi';
  } else if (/frontend|react|next|vue|svelte|ui|dashboard/.test(msg)) {
    projectType = 'frontend';
    framework = /next/.test(msg) ? 'next.js' : /vue/.test(msg) ? 'vue' : /svelte/.test(msg) ? 'svelte' : 'react';
  } else if (/full.?stack|app|system|platform/.test(msg)) {
    projectType = 'fullstack';
    framework = 'next.js + fastapi';
  }

  // Detect components to build
  const components: Array<{ keyword: RegExp; title: string; type: SubTask['type']; complexity: SubTask['estimatedComplexity'] }> = [
    { keyword: /config|setup|init/, title: 'Project setup and configuration', type: 'config', complexity: 'low' },
    { keyword: /database|model|schema|table/, title: 'Database models and schemas', type: 'generate', complexity: 'medium' },
    { keyword: /auth|login|register|jwt|oauth/, title: 'Authentication system', type: 'generate', complexity: 'high' },
    { keyword: /api|endpoint|route|crud/, title: 'API endpoints and routes', type: 'generate', complexity: 'high' },
    { keyword: /dashboard|ui|component|page/, title: 'UI components and pages', type: 'generate', complexity: 'high' },
    { keyword: /test|spec/, title: 'Tests', type: 'test', complexity: 'medium' },
    { keyword: /deploy|publish|ci/, title: 'Deployment configuration', type: 'deploy', complexity: 'low' },
  ];

  let taskIndex = 0;
  for (const comp of components) {
    if (comp.keyword.test(msg) || projectType === 'fullstack') {
      taskIndex++;
      tasks.push({
        id: `task-${taskIndex}`,
        title: comp.title,
        description: `${comp.title} for: ${userMessage.slice(0, 200)}`,
        type: comp.type,
        dependencies: taskIndex > 1 ? [`task-${taskIndex - 1}`] : [],
        status: 'pending',
        estimatedComplexity: comp.complexity,
        files: [],
      });
    }
  }

  // Always add review
  taskIndex++;
  tasks.push({
    id: `task-${taskIndex}`,
    title: 'Review and verify',
    description: 'Review all generated code for correctness, security, and completeness',
    type: 'review',
    dependencies: tasks.map((t) => t.id),
    status: 'pending',
    estimatedComplexity: 'medium',
    files: [],
  });

  return {
    originalRequest: userMessage,
    projectType,
    framework,
    tasks,
    totalEstimatedSteps: tasks.length,
  };
}

/**
 * Get the next executable task (all dependencies satisfied)
 */
export function getNextTask(tasks: SubTask[]): SubTask | null {
  return tasks.find((t) =>
    t.status === 'pending' &&
    t.dependencies.every((depId) => {
      const dep = tasks.find((d) => d.id === depId);
      return dep && (dep.status === 'completed' || dep.status === 'skipped');
    })
  ) || null;
}

/**
 * Check if all tasks are complete
 */
export function isDecompositionComplete(tasks: SubTask[]): boolean {
  return tasks.every((t) => t.status === 'completed' || t.status === 'skipped' || t.status === 'failed');
}
