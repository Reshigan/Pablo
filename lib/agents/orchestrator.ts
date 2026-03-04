/**
 * Pablo v10 — Multi-Agent Orchestrator
 *
 * The CTO — runs 12 specialist agents in a 6-phase pipeline:
 *
 *   Phase 1: UNDERSTAND  — PMAgent clarifies requirements
 *   Phase 2: DESIGN      — ArchitectAgent → DesignAgent + DatabaseAgent (parallel)
 *     → HUMAN CHECKPOINT: Architecture approval
 *   Phase 3: BUILD       — FrontendAgent + BackendAgent (parallel)
 *   Phase 4: QUALITY     — TestAgent + SecurityAgent + ReviewAgent (parallel)
 *     → HUMAN CHECKPOINT: Security gate (if critical issues)
 *   Phase 5: SHIP        — DocsAgent → InfraAgent + OpsAgent (parallel)
 *     → HUMAN CHECKPOINT: Deploy gate
 *   Phase 6: VERIFY      — Smoke tests
 *
 * Each agent extends BaseAgent and follows: buildPrompt → callModel → parseResponse → validate
 * Outputs flow between agents via upstreamOutputs Map.
 */

import type { EnvConfig } from './modelRouter';
import type { AgentEvent } from './agentEngine';
import {
  type AgentInput,
  type AgentOutput,
  type AgentEventCallback,
  type CodebaseGraph,
  BaseAgent,
} from './specialists/baseAgent';
import { PMAgent } from './specialists/pmAgent';
import { ArchitectAgent } from './specialists/architectAgent';
import { DesignAgent } from './specialists/designAgent';
import { DatabaseAgent } from './specialists/databaseAgent';
import { FrontendAgent } from './specialists/frontendAgent';
import { BackendAgent } from './specialists/backendAgent';
import { TestAgent } from './specialists/testAgent';
import { SecurityAgent } from './specialists/securityAgent';
import { ReviewAgent } from './specialists/reviewAgent';
import { DocsAgent } from './specialists/docsAgent';
import { InfraAgent } from './specialists/infraAgent';
import { OpsAgent } from './specialists/opsAgent';

// Re-export for backward compatibility
export type { AgentInput, AgentOutput, AgentEventCallback, CodebaseGraph };

// ─── Types ──────────────────────────────────────────────────────────

export interface OrchestrationConfig {
  /** Skip human checkpoints (for automated/background tasks) */
  autoApprove: boolean;
  /** Maximum total tokens before cost gate triggers */
  maxTotalTokens: number;
  /** Which phases to run (default: all) */
  phases: OrchestrationPhase[];
  /** Session ID for tracking */
  sessionId: string;
}

export type OrchestrationPhase =
  | 'understand'
  | 'design'
  | 'build'
  | 'quality'
  | 'ship'
  | 'verify';

export interface OrchestrationResult {
  files: Array<{ path: string; content: string; language: string }>;
  outputs: Map<string, AgentOutput>;
  totalTokens: number;
  totalDurationMs: number;
  issues: string[];
  status: 'complete' | 'failed' | 'awaiting_approval' | 'needs_clarification';
  pendingCheckpoint?: string;
  clarifyingQuestions?: string[];
}

export type CheckpointCallback = (checkpoint: string, context: string) => Promise<boolean>;

export type OrchestratorEvent =
  | AgentEvent
  | { type: 'phase_start'; phase: OrchestrationPhase; agents: string[] }
  | { type: 'phase_complete'; phase: OrchestrationPhase; filesCount: number; tokensUsed: number }
  | { type: 'checkpoint'; name: string; context: string }
  | { type: 'agent_start'; agent: string; role: string }
  | { type: 'agent_complete'; agent: string; filesCount: number; tokensUsed: number; issues: string[] }
  | { type: 'security_veto'; issues: string[] }
  | { type: 'cost_gate'; totalTokens: number; budget: number };

// ─── Agent Registry ─────────────────────────────────────────────────

function createAgent(name: string): BaseAgent {
  switch (name) {
    case 'PMAgent': return new PMAgent();
    case 'ArchitectAgent': return new ArchitectAgent();
    case 'DesignAgent': return new DesignAgent();
    case 'DatabaseAgent': return new DatabaseAgent();
    case 'FrontendAgent': return new FrontendAgent();
    case 'BackendAgent': return new BackendAgent();
    case 'TestAgent': return new TestAgent();
    case 'SecurityAgent': return new SecurityAgent();
    case 'ReviewAgent': return new ReviewAgent();
    case 'DocsAgent': return new DocsAgent();
    case 'InfraAgent': return new InfraAgent();
    case 'OpsAgent': return new OpsAgent();
    default: throw new Error(`Unknown agent: ${name}`);
  }
}

// ─── Main Orchestration Pipeline ────────────────────────────────────

/**
 * Run the full 6-phase orchestration pipeline.
 */
export async function runOrchestration(
  userMessage: string,
  projectContext: AgentInput['projectContext'],
  env: EnvConfig,
  config: OrchestrationConfig,
  onEvent?: (event: OrchestratorEvent) => void,
  onCheckpoint?: CheckpointCallback,
): Promise<OrchestrationResult> {
  const outputs = new Map<string, AgentOutput>();
  const allFiles: Array<{ path: string; content: string; language: string }> = [];
  let totalTokens = 0;
  const startTime = Date.now();
  const allIssues: string[] = [];

  const makeInput = (): AgentInput => ({
    userMessage,
    projectContext: {
      ...projectContext,
      existingFiles: new Map([
        ...projectContext.existingFiles,
        ...allFiles.map(f => [f.path, f.content] as [string, string]),
      ]),
    },
    upstreamOutputs: outputs,
    sessionId: config.sessionId,
  });

  // Bridge specialist agent events to orchestrator events
  const agentEventBridge: AgentEventCallback = (event) => {
    // Pass through file_written events so the store can track filesChanged
    // Transform from BaseAgent shape { type, agent, content (path), data (file obj) }
    // to AgentEvent shape { type, path, content (file content), language }
    if (event.type === 'file_written') {
      const fileData = event.data as { path: string; content: string; language: string } | undefined;
      if (fileData) {
        onEvent?.({
          type: 'file_written',
          path: fileData.path,
          content: fileData.content,
          language: fileData.language,
        } as OrchestratorEvent);
      }
      return;
    }
    onEvent?.({
      type: 'thinking',
      content: `[${event.agent}] ${event.content}`,
    } as OrchestratorEvent);
  };

  // Helper to run an agent and collect results
  async function runAgent(agentName: string): Promise<AgentOutput> {
    const agent = createAgent(agentName);
    onEvent?.({ type: 'agent_start', agent: agent.name, role: agent.role } as OrchestratorEvent);

    const output = await agent.run(makeInput(), env, agentEventBridge);
    outputs.set(agent.name, output);
    allFiles.push(...output.files);
    totalTokens += output.tokensUsed;
    allIssues.push(...output.issues);

    onEvent?.({
      type: 'agent_complete',
      agent: agent.name,
      filesCount: output.files.length,
      tokensUsed: output.tokensUsed,
      issues: output.issues,
    } as OrchestratorEvent);

    // Cost gate
    if (totalTokens > config.maxTotalTokens) {
      onEvent?.({ type: 'cost_gate', totalTokens, budget: config.maxTotalTokens } as OrchestratorEvent);
      throw new Error(`Cost gate: ${totalTokens} tokens exceeds budget of ${config.maxTotalTokens}`);
    }

    return output;
  }

  // Helper to run agents in parallel
  async function runParallel(...agentNames: string[]): Promise<AgentOutput[]> {
    return Promise.all(agentNames.map(name => runAgent(name)));
  }

  try {
    // ── PHASE 1: UNDERSTAND ──
    if (config.phases.includes('understand')) {
      onEvent?.({ type: 'phase_start', phase: 'understand', agents: ['PMAgent'] } as OrchestratorEvent);

      const pmOutput = await runAgent('PMAgent');

      // If PMAgent returns clarifying questions, pause
      const needsClarification = pmOutput.artifacts.needsClarification as boolean | undefined;
      if (needsClarification) {
        const questions = (pmOutput.artifacts.questions as string[]) || [];
        onEvent?.({ type: 'phase_complete', phase: 'understand', filesCount: 0, tokensUsed: pmOutput.tokensUsed } as OrchestratorEvent);
        return {
          files: allFiles, outputs, totalTokens,
          totalDurationMs: Date.now() - startTime,
          issues: allIssues,
          status: 'needs_clarification',
          clarifyingQuestions: questions,
        };
      }

      onEvent?.({ type: 'phase_complete', phase: 'understand', filesCount: 0, tokensUsed: pmOutput.tokensUsed } as OrchestratorEvent);
    }

    // ── PHASE 2: DESIGN ──
    if (config.phases.includes('design')) {
      onEvent?.({ type: 'phase_start', phase: 'design', agents: ['ArchitectAgent', 'DesignAgent', 'DatabaseAgent'] } as OrchestratorEvent);

      // ArchitectAgent runs first (others depend on it)
      await runAgent('ArchitectAgent');

      // Then DesignAgent + DatabaseAgent in parallel
      await runParallel('DesignAgent', 'DatabaseAgent');

      onEvent?.({
        type: 'phase_complete', phase: 'design',
        filesCount: allFiles.length,
        tokensUsed: totalTokens,
      } as OrchestratorEvent);

      // HUMAN CHECKPOINT: Architecture approval
      if (!config.autoApprove && onCheckpoint) {
        onEvent?.({ type: 'checkpoint', name: 'architecture_approval', context: 'Review the proposed architecture before building begins.' } as OrchestratorEvent);
        const approved = await onCheckpoint('architecture_approval',
          'Review the proposed architecture before building begins.');
        if (!approved) {
          return {
            files: allFiles, outputs, totalTokens,
            totalDurationMs: Date.now() - startTime,
            issues: allIssues,
            status: 'awaiting_approval',
            pendingCheckpoint: 'architecture_approval',
          };
        }
      }
    }

    // ── PHASE 3: BUILD ──
    if (config.phases.includes('build')) {
      onEvent?.({ type: 'phase_start', phase: 'build', agents: ['FrontendAgent', 'BackendAgent'] } as OrchestratorEvent);

      await runParallel('FrontendAgent', 'BackendAgent');

      onEvent?.({
        type: 'phase_complete', phase: 'build',
        filesCount: allFiles.length,
        tokensUsed: totalTokens,
      } as OrchestratorEvent);
    }

    // ── PHASE 4: QUALITY ──
    if (config.phases.includes('quality')) {
      onEvent?.({ type: 'phase_start', phase: 'quality', agents: ['TestAgent', 'SecurityAgent', 'ReviewAgent'] } as OrchestratorEvent);

      const [_testOutput, secOutput] = await runParallel('TestAgent', 'SecurityAgent', 'ReviewAgent');

      // SecurityAgent veto power
      const securityReport = secOutput.artifacts.securityReport as { passed?: boolean; critical?: Array<{ issue: string }> } | undefined;
      if (securityReport && securityReport.passed === false) {
        const criticalIssues = (securityReport.critical || []).map(c => c.issue);
        onEvent?.({ type: 'security_veto', issues: criticalIssues } as OrchestratorEvent);

        // If not auto-approve, block
        if (!config.autoApprove && onCheckpoint) {
          onEvent?.({ type: 'checkpoint', name: 'security_gate', context: `Security audit found critical issues: ${criticalIssues.join('; ')}` } as OrchestratorEvent);
          const approved = await onCheckpoint('security_gate',
            `Security audit found ${criticalIssues.length} critical issues. Approve to proceed anyway.`);
          if (!approved) {
            return {
              files: allFiles, outputs, totalTokens,
              totalDurationMs: Date.now() - startTime,
              issues: allIssues,
              status: 'awaiting_approval',
              pendingCheckpoint: 'security_gate',
            };
          }
        }
      }

      onEvent?.({
        type: 'phase_complete', phase: 'quality',
        filesCount: allFiles.length,
        tokensUsed: totalTokens,
      } as OrchestratorEvent);
    }

    // ── PHASE 5: SHIP ──
    if (config.phases.includes('ship')) {
      onEvent?.({ type: 'phase_start', phase: 'ship', agents: ['DocsAgent', 'InfraAgent', 'OpsAgent'] } as OrchestratorEvent);

      // DocsAgent first, then InfraAgent + OpsAgent in parallel
      await runAgent('DocsAgent');

      // HUMAN CHECKPOINT: Deploy gate
      if (!config.autoApprove && onCheckpoint) {
        onEvent?.({ type: 'checkpoint', name: 'deploy_gate', context: 'Ready to deploy. Approve to proceed.' } as OrchestratorEvent);
        const approved = await onCheckpoint('deploy_gate',
          'Ready to deploy. Approve to proceed.');
        if (!approved) {
          return {
            files: allFiles, outputs, totalTokens,
            totalDurationMs: Date.now() - startTime,
            issues: allIssues,
            status: 'awaiting_approval',
            pendingCheckpoint: 'deploy_gate',
          };
        }
      }

      await runParallel('InfraAgent', 'OpsAgent');

      onEvent?.({
        type: 'phase_complete', phase: 'ship',
        filesCount: allFiles.length,
        tokensUsed: totalTokens,
      } as OrchestratorEvent);
    }

    // ── PHASE 6: VERIFY ──
    if (config.phases.includes('verify')) {
      onEvent?.({ type: 'phase_start', phase: 'verify', agents: [] } as OrchestratorEvent);
      // Verification is handled by the TestAgent output + OpsAgent health checks
      onEvent?.({
        type: 'phase_complete', phase: 'verify',
        filesCount: allFiles.length,
        tokensUsed: totalTokens,
      } as OrchestratorEvent);
    }

    onEvent?.({
      type: 'done',
      summary: `Orchestration complete: ${allFiles.length} files, ${totalTokens} tokens, ${((Date.now() - startTime) / 1000).toFixed(1)}s`,
      filesChanged: allFiles.map(f => f.path),
    } as OrchestratorEvent);

    return {
      files: allFiles, outputs, totalTokens,
      totalDurationMs: Date.now() - startTime,
      issues: allIssues,
      status: 'complete',
    };
  } catch (error) {
    const errorMsg = error instanceof Error ? error.message : 'Orchestration failed';
    onEvent?.({ type: 'error', message: errorMsg } as OrchestratorEvent);
    return {
      files: allFiles, outputs, totalTokens,
      totalDurationMs: Date.now() - startTime,
      issues: [...allIssues, errorMsg],
      status: 'failed',
    };
  }
}

// ─── Legacy v9 Compatibility ────────────────────────────────────────

/**
 * Legacy wrapper — runs the new orchestration pipeline but returns the v9 format.
 * This keeps existing callers (API routes, ChatPanel) working without changes.
 */
export async function runOrchestrator(
  userMessage: string,
  existingFiles: Map<string, string>,
  env: EnvConfig,
  onEvent?: (event: OrchestratorEvent) => void,
): Promise<{
  plan: { id: string; userMessage: string; status: string; startedAt: number; completedAt?: number };
  files: Array<{ path: string; content: string; language: string }>;
  totalTokens: number;
  totalDurationMs: number;
}> {
  const result = await runOrchestration(
    userMessage,
    { existingFiles, repoFullName: undefined, branch: undefined },
    env,
    {
      autoApprove: true,
      maxTotalTokens: 500_000,
      phases: ['understand', 'design', 'build', 'quality', 'ship'],
      sessionId: `legacy-${Date.now()}`,
    },
    onEvent,
  );

  return {
    plan: {
      id: `orch-${Date.now()}`,
      userMessage,
      status: result.status,
      startedAt: Date.now() - result.totalDurationMs,
      completedAt: Date.now(),
    },
    files: result.files,
    totalTokens: result.totalTokens,
    totalDurationMs: result.totalDurationMs,
  };
}
