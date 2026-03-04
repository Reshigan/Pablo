/**
 * BaseAgent — Abstract base class for all 12 specialist agents.
 *
 * Every agent extends BaseAgent and implements:
 *   - buildPrompt(input) → the user-facing prompt string
 *   - (optionally) parseResponse(response) → extract files & artifacts
 *   - (optionally) validate(output, input) → check file scopes, quality gates
 *   - run(input, env, onEvent?) → full lifecycle (inherited)
 *
 * The Orchestrator calls agent.run() and passes outputs between agents
 * via upstreamOutputs.
 */

import { callModel, type EnvConfig, type ModelConfig } from '../modelRouter';
import { parseGeneratedFiles } from '../agentEngine';

// ─── Types ──────────────────────────────────────────────────────────

export interface AgentInput {
  userMessage: string;
  projectContext: {
    existingFiles: Map<string, string>;
    codebaseIndex?: CodebaseGraph;
    repoFullName?: string;
    branch?: string;
  };
  upstreamOutputs: Map<string, AgentOutput>;
  sessionId: string;
}

export interface AgentOutput {
  agentName: string;
  files: Array<{ path: string; content: string; language: string }>;
  artifacts: Record<string, unknown>;
  issues: string[];
  durationMs: number;
  tokensUsed: number;
}

export interface CodebaseGraph {
  files: Array<{
    path: string;
    type: string;
    imports: string[];
    exports: string[];
  }>;
  totalFiles: number;
}

export interface AgentConfig {
  name: string;
  role: string;
  systemPrompt: string;
  model: ModelConfig;
  fileScope: RegExp[];
  maxOutputTokens: number;
  temperature: number;
}

export type AgentEventCallback = (event: {
  type: 'thinking' | 'generating' | 'file_written' | 'issue_found' | 'complete' | 'error';
  agent: string;
  content: string;
  data?: unknown;
}) => void;

// ─── Base Class ─────────────────────────────────────────────────────

export abstract class BaseAgent {
  protected config: AgentConfig;

  constructor(config: AgentConfig) {
    this.config = config;
  }

  get name(): string { return this.config.name; }
  get role(): string { return this.config.role; }

  /**
   * Build the prompt for this agent given inputs and upstream outputs.
   * Each specialist overrides this.
   */
  abstract buildPrompt(input: AgentInput): string;

  /**
   * Parse the LLM response into structured output.
   * Default: extract code files. Specialists can override for custom artifacts.
   */
  parseResponse(response: string): Partial<AgentOutput> {
    const files = parseGeneratedFiles(response);
    return { files, artifacts: {}, issues: [] };
  }

  /**
   * Validate this agent's output before passing downstream.
   * Return issues array (empty = passed).
   */
  validate(output: AgentOutput, _input: AgentInput): string[] {
    const issues: string[] = [];
    for (const file of output.files) {
      const inScope = this.config.fileScope.length === 0 ||
        this.config.fileScope.some(re => re.test(file.path));
      if (!inScope) {
        issues.push(`${this.name} wrote to ${file.path} which is outside its file scope`);
      }
    }
    return issues;
  }

  /**
   * Run this agent: buildPrompt → callModel → parseResponse → validate → return
   */
  async run(
    input: AgentInput,
    env: EnvConfig,
    onEvent?: AgentEventCallback,
  ): Promise<AgentOutput> {
    const startTime = Date.now();
    onEvent?.({ type: 'thinking', agent: this.name, content: `${this.config.role} is analyzing the request...` });

    const prompt = this.buildPrompt(input);

    onEvent?.({ type: 'generating', agent: this.name, content: `${this.config.role} is generating output...` });

    let result: { content: string; tokens_used: number };
    try {
      result = await callModel({
        model: this.config.model,
        systemPrompt: this.config.systemPrompt,
        userMessage: prompt,
      }, env);
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : 'LLM call failed';
      onEvent?.({ type: 'error', agent: this.name, content: errorMsg });
      return {
        agentName: this.name,
        files: [],
        artifacts: {},
        issues: [errorMsg],
        durationMs: Date.now() - startTime,
        tokensUsed: 0,
      };
    }

    const parsed = this.parseResponse(result.content);

    const output: AgentOutput = {
      agentName: this.name,
      files: parsed.files ?? [],
      artifacts: parsed.artifacts ?? {},
      issues: parsed.issues ?? [],
      durationMs: Date.now() - startTime,
      tokensUsed: result.tokens_used,
    };

    // Validate
    const validationIssues = this.validate(output, input);
    output.issues.push(...validationIssues);

    // Emit file events
    for (const file of output.files) {
      onEvent?.({ type: 'file_written', agent: this.name, content: file.path, data: file });
    }

    for (const issue of output.issues) {
      onEvent?.({ type: 'issue_found', agent: this.name, content: issue });
    }

    onEvent?.({ type: 'complete', agent: this.name, content: `${this.config.role} complete: ${output.files.length} files, ${output.tokensUsed} tokens` });

    return output;
  }
}

// ─── Helpers ────────────────────────────────────────────────────────

/** Get artifact from upstream agent output */
export function getUpstream<T = unknown>(
  outputs: Map<string, AgentOutput>,
  agentName: string,
  artifactKey: string,
): T | undefined {
  const agentOutput = outputs.get(agentName);
  if (!agentOutput) return undefined;
  return agentOutput.artifacts[artifactKey] as T | undefined;
}

/** Get all files from upstream agents */
export function getUpstreamFiles(
  outputs: Map<string, AgentOutput>,
): Array<{ path: string; content: string; language: string }> {
  const files: Array<{ path: string; content: string; language: string }> = [];
  for (const output of outputs.values()) {
    files.push(...output.files);
  }
  return files;
}
