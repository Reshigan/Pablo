'use client';

import {
  Play,
  Loader2,
  Paperclip,
  X,
  FileText,
  Sparkles,
  Download,
  LayoutTemplate,
  TestTube2,
  ShieldCheck,
  Container,
  Cloud,
  ImageIcon,
  Cpu,
} from 'lucide-react';
import { useState, useCallback, useRef, useEffect } from 'react';
import { MentionDropdown, resolveMentions, type MentionItem } from '@/components/pipeline/MentionDropdown';
import {
  usePipelineStore,
  PIPELINE_STAGES,
  extractExplicitStack,
  parseTechStackFromPlan,
  resolveTechStack,
  type PipelineStage,
  type PipelineRun,
  type TechStackHint,
} from '@/stores/pipeline';
import { useAgentStore } from '@/stores/agent';
import { useMetricsStore } from '@/stores/metrics';
import { useEditorStore } from '@/stores/editor';
import { useRepoStore } from '@/stores/repo';
import { useUIStore } from '@/stores/ui';
import { useToastStore, toast, toastSuccess, toastError } from '@/stores/toast';
import { useLearningStore } from '@/stores/learning';
import { parseGeneratedFiles } from '@/lib/code-parser';
import { generateId } from '@/lib/db/queries';
import { getDB } from '@/lib/db/drizzle';
import { enhancePrompt } from '@/lib/agents/promptEnhancer';
import { useActivityStore } from '@/stores/activity';
import { TemplatePickerModal } from '@/components/pipeline/TemplatePickerModal';
import { downloadProjectZip } from '@/lib/export/zipExport';

// Extracted sub-components (Task 28)
import { PipelineProgress } from './PipelineProgress';
import { PipelineOutputPanel } from './PipelineOutputPanel';
import { PipelineDeploySection } from './PipelineDeploySection';
import { ProductionReadinessCard } from './ProductionReadinessCard';
import { AgentRunCard } from './AgentRunCard';
import { buildStagePrompt } from './stagePrompts';
import { HeroPrompt } from './HeroPrompt';
import { quickReadinessCheck } from '@/lib/agents/productionReadiness';


// ─── RunCard (uses extracted sub-components) ───────────────────────────

function RunCard({ run, onCancel, onIterate }: { run: PipelineRun; onCancel?: () => void; onIterate?: (prompt: string) => void }) {
  return (
    <div className="rounded-lg border border-pablo-border bg-pablo-panel overflow-hidden">
      <PipelineProgress run={run} onCancel={onCancel} />
      <PipelineOutputPanel run={run} />
      {run.readinessScore && (
        <ProductionReadinessCard
          score={run.readinessScore}
          onIterate={onIterate}
        />
      )}
      <PipelineDeploySection run={run} />
    </div>
  );
}


/** Max time (ms) for a single pipeline stage before aborting.
 *  Using devstral-2:123b and gpt-oss:20b on Ollama Cloud. */
const STAGE_TIMEOUT_MS = 300_000;   // 5 min — plenty for devstral-2:123b / gpt-oss:20b
/** Max time (ms) to wait for the very first SSE token.
 *  Models typically respond within 10-30 seconds. */
const FIRST_TOKEN_TIMEOUT_MS = 120_000;  // 2 min — generous for Ollama Cloud models
/** Max inactivity (ms) — if no SSE data arrives for this long AFTER the first token, abort. */
const STREAM_IDLE_TIMEOUT_MS = 120_000;  // 2 min — models stream continuously
/** Number of retries per stage before marking as failed */
const MAX_STAGE_RETRIES = 3;

/**
 * Truncate a stage output to keep prompts manageable.
 * Keeps the first portion and a tail so the model sees both start and end.
 */

async function runStageWithChat(
  featureDescription: string,
  stage: { id: PipelineStage; label: string; description: string; model: string },
  previousOutputs: string[],
  abortSignal: AbortSignal,
  techStack?: TechStackHint,
  explicitHints?: Partial<TechStackHint>,
  businessRulesPrompt?: string,
): Promise<{ output: string; tokens: number }> {
  const prompt = buildStagePrompt(featureDescription, stage, previousOutputs, techStack, explicitHints, businessRulesPrompt);

  // Create a per-stage abort that fires on timeout OR user cancel
  const stageAbort = new AbortController();
  const stageTimer = setTimeout(() => stageAbort.abort(), STAGE_TIMEOUT_MS);
  // Forward user cancel to stage abort
  const onUserAbort = () => stageAbort.abort();
  abortSignal.addEventListener('abort', onUserAbort, { once: true });

  try {
    console.log(`[Pipeline] runStageWithChat: fetching /api/chat for stage=${stage.id} model=${stage.model}`);
    const response = await fetch('/api/chat', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        messages: [{ role: 'user', content: prompt }],
        mode: 'pipeline-stage',
        model: stage.model,
      }),
      signal: stageAbort.signal,
    });
    console.log(`[Pipeline] runStageWithChat: got response status=${response.status}`);

    if (!response.ok) throw new Error(`Chat API error: ${response.status}`);
    if (!response.body) throw new Error('No response body');

    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let output = '';
    let tokens = 0;
    let buffer = '';
    let receivedFirstToken = false;

    // Two-phase idle timeout:
    // Phase 1: wait up to FIRST_TOKEN_TIMEOUT_MS for the first token (model is processing prompt)
    // Phase 2: after first token, wait up to STREAM_IDLE_TIMEOUT_MS between chunks
    let idleTimer: ReturnType<typeof setTimeout> | null = null;
    const resetIdleTimer = () => {
      if (idleTimer) clearTimeout(idleTimer);
      const timeout = receivedFirstToken ? STREAM_IDLE_TIMEOUT_MS : FIRST_TOKEN_TIMEOUT_MS;
      idleTimer = setTimeout(() => stageAbort.abort(), timeout);
    };
    resetIdleTimer();

    try {
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        resetIdleTimer();
        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split('\n');
        buffer = lines.pop() ?? '';
        for (const line of lines) {
          if (!line.startsWith('data: ')) continue;
          const payload = line.slice(6).trim();
          if (payload === '[DONE]') continue;
          let parsed: { content?: string; tokens?: number; eval_count?: number; error?: string; thinking?: boolean };
          try {
            parsed = JSON.parse(payload);
          } catch {
            continue; // skip unparseable JSON
          }
          // Detect server-side stream errors (e.g. Ollama Cloud connection dropped)
          if (parsed.error) {
            throw new Error(`Stream error: ${parsed.error}`);
          }
          if (parsed.content) {
            // For pipeline stages, include ALL content (including thinking
            // tokens). Some models put their entire response in the thinking
            // field — filtering it would produce empty output.
            output += parsed.content;
            if (!receivedFirstToken) {
              receivedFirstToken = true;
              resetIdleTimer(); // switch to shorter idle timeout now that tokens are flowing
            }
          }
          if (parsed.eval_count) tokens = parsed.eval_count;
          else if (parsed.tokens) tokens = parsed.tokens;
        }
      }
    } finally {
      if (idleTimer) clearTimeout(idleTimer);
    }

    return { output: output || '(No output generated)', tokens };
  } finally {
    clearTimeout(stageTimer);
    abortSignal.removeEventListener('abort', onUserAbort);
  }
}

/** Wrapper that retries a stage up to MAX_STAGE_RETRIES times */
async function runStageWithRetry(
  featureDescription: string,
  stage: { id: PipelineStage; label: string; description: string; model: string },
  previousOutputs: string[],
  abortSignal: AbortSignal,
  techStack?: TechStackHint,
  explicitHints?: Partial<TechStackHint>,
  businessRulesPrompt?: string,
): Promise<{ output: string; tokens: number }> {
  let lastError: Error | null = null;
  for (let attempt = 0; attempt <= MAX_STAGE_RETRIES; attempt++) {
    if (abortSignal.aborted) throw new Error('Aborted');
    try {
      return await runStageWithChat(featureDescription, stage, previousOutputs, abortSignal, techStack, explicitHints, businessRulesPrompt);
    } catch (err) {
      lastError = err instanceof Error ? err : new Error(String(err));
      if (abortSignal.aborted) throw lastError;
      // Exponential backoff before retry: 5s, 15s, 45s (base 5s × 3^attempt)
      if (attempt < MAX_STAGE_RETRIES) {
        const backoffMs = 5000 * Math.pow(3, attempt);
        console.warn(`[Pipeline] Stage "${stage.id}" attempt ${attempt + 1} failed: ${lastError.message}. Retrying in ${backoffMs / 1000}s...`);
        await new Promise<void>(resolve => {
          const timer = setTimeout(resolve, backoffMs);
          const onAbort = () => { clearTimeout(timer); resolve(); };
          abortSignal.addEventListener('abort', onAbort, { once: true });
        });
      }
    }
  }
  throw lastError ?? new Error('Stage failed after retries');
}


// ─── Main PipelineView ────────────────────────────────────────────────

/** Suggested next actions after pipeline completion */
const SUGGESTED_ACTIONS = [
  { label: 'Add Tests', icon: TestTube2, prompt: 'Add comprehensive unit tests and integration tests for all generated code' },
  { label: 'Add Auth', icon: ShieldCheck, prompt: 'Add user authentication with JWT, login/register pages, and protected routes' },
  { label: 'Dockerize', icon: Container, prompt: 'Add Dockerfile, docker-compose.yml, and deployment configuration' },
  { label: 'Deploy', icon: Cloud, prompt: 'Deploy this project to Cloudflare Pages with production configuration' },
  { label: 'Download ZIP', icon: Download, prompt: '__ZIP_DOWNLOAD__' },
];

export function PipelineView() {
  const { runs, startRun, updateStage, advanceStage, completeRun, pendingPrompt, setPendingPrompt } = usePipelineStore();
  const agentStore = useAgentStore();
  const [featureInput, setFeatureInput] = useState('');
  const [isBuilding, setIsBuilding] = useState(false);
  const [attachments, setAttachments] = useState<Array<{ name: string; content: string; type: string }>>([]);
  const [enhanceEnabled, setEnhanceEnabled] = useState(true);
  const [showTemplates, setShowTemplates] = useState(false);
  const abortRef = useRef<AbortController | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  // Feature 8: @-Mentions state
  const [showMentionDropdown, setShowMentionDropdown] = useState(false);
  const [mentionQuery, setMentionQuery] = useState('');
  const [selectedMentions, setSelectedMentions] = useState<string[]>([]);
  const [mentionDropdownPos, setMentionDropdownPos] = useState({ top: 0, left: 0 });
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  // Auto-execute pipeline when HeroPrompt queues a prompt via pendingPrompt.
  // HeroPrompt sets pendingPrompt → EditorPanel renders PipelineView →
  // this effect picks up the prompt, sets featureInput, and directly calls
  // handleStart which calls startRun() synchronously. Only AFTER startRun()
  // creates a run (making runs.length > 0) do we clear pendingPrompt.
  //
  // This avoids the race condition where clearing pendingPrompt before
  // startRun() would cause EditorPanel to see pendingPrompt=null +
  // runs.length=0 and flip back to HeroPrompt.
  const pendingRef = useRef(false);
  useEffect(() => {
    if (pendingPrompt && !pendingRef.current && !isBuilding) {
      pendingRef.current = true;
      setFeatureInput(pendingPrompt);
    }
  }, [pendingPrompt, isBuilding]);

  // Once featureInput is set from pendingPrompt, directly invoke handleStart.
  // handleStart calls startRun() synchronously which adds a run to the store
  // (runs.length > 0). We clear pendingPrompt AFTER startRun inside handleStart.
  useEffect(() => {
    if (pendingRef.current && featureInput && !isBuilding) {
      pendingRef.current = false;
      // Call handleStart directly — no setTimeout, no DOM query.
      // handleStart will call startRun() synchronously, then clear pendingPrompt.
      handleStart();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [featureInput, isBuilding]);

  const handleZipDownload = useCallback(() => {
    const tabs = useEditorStore.getState().tabs;
    if (tabs.length === 0) {
      toast('No files', 'No files to download');
      return;
    }
    const files = tabs.filter(t => t.content).map(t => ({ path: t.path, content: t.content }));
    downloadProjectZip(files, 'pablo-project').catch(() => {
      toast('Download failed', 'Could not create ZIP');
    });
  }, []);

  const handleSuggestedAction = useCallback((prompt: string) => {
    if (prompt === '__ZIP_DOWNLOAD__') {
      handleZipDownload();
      return;
    }
    setFeatureInput(prompt);
  }, [handleZipDownload]);

  const handleStart = useCallback(async () => {
    if (!featureInput.trim() || isBuilding) return;
    setIsBuilding(true); // Immediately prevent double-clicks
    try {
    console.log('[Pipeline] handleStart fired');
    let description = featureInput.trim();

    // Include attached documents in the feature description
    if (attachments.length > 0) {
      const attachmentText = attachments
        .map((att) => {
          // Feature 6: Image attachments get vision instructions
          if (att.type.startsWith('image/')) {
            return `\n\n--- Attached Image: ${att.name} ---\n[Image attached as base64 data — analyze and recreate this UI]\ndata:${att.type};base64,${att.content}`;
          }
          return `\n\n--- Attached: ${att.name} ---\n${att.content}`;
        })
        .join('');
      description += attachmentText;
      setAttachments([]);
    }
    // Feature 8: Include @-mention context
    if (selectedMentions.length > 0) {
      const mentionContext = resolveMentions(selectedMentions);
      if (mentionContext) {
        description += `\n\n--- Referenced Context ---\n${mentionContext}`;
      }
      setSelectedMentions([]);
    }

    // Start the pipeline run IMMEDIATELY so the UI shows progress.
    // Prompt enhancement runs concurrently with the Plan stage setup.
    console.log('[Pipeline] calling startRun');
    const runId = startRun(description);
    // Clear pendingPrompt AFTER startRun so EditorPanel always sees
    // runs.length > 0 before pendingPrompt becomes null — prevents
    // the HeroPrompt flicker race condition.
    if (pendingPrompt) {
      setPendingPrompt(null);
    }
    setFeatureInput('');

    // Feature 21: Activity tracking
    useActivityStore.getState().addEntry('pipeline_started', `Pipeline started: ${description.slice(0, 80)}...`);

    // Feature 9: Prompt Enhancement — SKIPPED for long prompts (>200 chars).
    // Also wrapped in a timeout to prevent blocking the pipeline.
    console.log('[Pipeline] prompt length:', description.length, 'enhanceEnabled:', enhanceEnabled);
    if (enhanceEnabled && description.length < 200) {
      try {
        console.log('[Pipeline] enhancing prompt...');
        const enhanced = await Promise.race([
          enhancePrompt(description),
          new Promise<string>((_, reject) => setTimeout(() => reject(new Error('enhance-timeout')), 5000)),
        ]);
        if (enhanced && enhanced !== description) {
          description = enhanced;
          useActivityStore.getState().addEntry('prompt_enhanced', `Prompt enhanced: "${featureInput.trim().slice(0, 60)}..."`  );
        }
        console.log('[Pipeline] prompt enhancement done');
      } catch {
        console.log('[Pipeline] prompt enhancement skipped (timeout or error)');
      }
    }

    // Extract what the user explicitly requested (no defaults applied)
    console.log('[Pipeline] extracting explicit stack hints');
    const explicitHints = extractExplicitStack(description);

    // Enterprise: business rules are fetched via API route, not client-side D1.
    // Previously this did a dynamic import of d1-business-rules which imports
    // @opennextjs/cloudflare (server-only) and could hang forever in the browser.
    // Now we just skip business rules on the client — they're optional.
    const businessRulesPrompt = '';
    console.log('[Pipeline] skipping business rules (server-only module)');

    const controller = new AbortController();
    abortRef.current = controller;
    const previousOutputs: string[] = [];
    let resolvedStack: TechStackHint | undefined;
    // Track all files extracted progressively across stages
    const allParsedFiles: Array<{ filename: string; language: string; content: string }> = [];
    const seenFiles = new Set<string>();
    let navigatedToDiff = false;

    try {
      console.log('[Pipeline] entering stage loop, stages:', PIPELINE_STAGES.length);
      for (let i = 0; i < PIPELINE_STAGES.length; i++) {
        if (controller.signal.aborted) break;
        const stage = PIPELINE_STAGES[i];
        console.log(`[Pipeline] starting stage ${i}: ${stage.id} (model: ${stage.model})`);

        if (i > 0) advanceStage(runId);
        updateStage(runId, stage.id, { status: 'running', startedAt: Date.now() });

        try {
          const startTime = Date.now();
          const result = await runStageWithRetry(
            description, stage, previousOutputs, controller.signal,
            resolvedStack,    // undefined for Plan, resolved for stages 2-8
            explicitHints,    // user's explicit mentions (Plan stage uses these)
            businessRulesPrompt, // enterprise rules injected into review + enterprise stages
          );
          const durationMs = Date.now() - startTime;

          updateStage(runId, stage.id, {
            status: 'completed',
            output: result.output,
            tokens: result.tokens,
            durationMs,
            model: stage.model,
            completedAt: Date.now(),
          });

          useMetricsStore.getState().addTokens(result.tokens);
          useMetricsStore.getState().recordRequest(true);
          useMetricsStore.getState().recordModelCall(stage.model);
          useMetricsStore.getState().recordPipelineStage(stage.id);

          previousOutputs.push(`## ${stage.label}\n${result.output}`);

          // Progressive file extraction: parse files from THIS stage immediately
          // so they appear in the Diff tab as each stage completes
          const stageFiles = parseGeneratedFiles(result.output);
          if (stageFiles.length > 0) {
            const editorStore = useEditorStore.getState();
            let newFileCount = 0;
            for (const file of stageFiles) {
              if (seenFiles.has(file.filename)) {
                // Update existing diff with newer content from later stage
                const existingDiff = editorStore.pendingDiffs.find(d => d.filename === file.filename);
                if (existingDiff && existingDiff.status === 'pending') {
                  // Still pending — upsert in place
                  editorStore.addDiff({
                    fileId: existingDiff.fileId,
                    filename: file.filename,
                    language: file.language,
                    oldContent: existingDiff.oldContent ?? '',
                    newContent: file.content,
                  });
                } else if (existingDiff && existingDiff.status !== 'pending') {
                  // User already accepted/rejected — create a NEW diff entry
                  // using current tab content as oldContent (earlier version was applied)
                  const currentTab = editorStore.tabs.find(t => t.path === file.filename);
                  const freshId = generateId('diff');
                  editorStore.addDiff({
                    fileId: freshId,
                    filename: file.filename,
                    language: file.language,
                    oldContent: currentTab?.content ?? '',
                    newContent: file.content,
                  });
                  newFileCount++;
                }
              } else {
                seenFiles.add(file.filename);
                const fileId = generateId('diff');
                const existingTab = editorStore.tabs.find(t => t.path === file.filename);
                editorStore.addDiff({
                  fileId,
                  filename: file.filename,
                  language: file.language,
                  oldContent: existingTab?.content ?? '',
                  newContent: file.content,
                });
                newFileCount++;
              }
              // Keep running list for readiness check at the end
              const idx = allParsedFiles.findIndex(f => f.filename === file.filename);
              if (idx >= 0) allParsedFiles[idx] = file;
              else allParsedFiles.push(file);
            }

            if (newFileCount > 0) {
              useToastStore.getState().addToast({
                type: 'success',
                title: `${stage.label} Complete`,
                message: `${newFileCount} new file(s) added to Diff tab`,
                duration: 3000,
              });
            }

            // Auto-navigate to Diff tab on first file extraction
            if (!navigatedToDiff) {
              useUIStore.getState().setActiveWorkspaceTab('diff');
              navigatedToDiff = true;
            }
          }

          // After Plan stage: parse the recommended tech stack from LLM output
          // and lock it in for all subsequent stages
          if (stage.id === 'plan') {
            const llmStack = parseTechStackFromPlan(result.output);
            resolvedStack = resolveTechStack(explicitHints, llmStack);
            usePipelineStore.getState().setTechStack(runId, resolvedStack);
          }
        } catch (stageError) {
          if (controller.signal.aborted) break;
          const errorMsg = stageError instanceof Error ? stageError.message : 'Stage failed';
          const isTimeout = errorMsg.includes('abort') || errorMsg.includes('timeout');
          updateStage(runId, stage.id, {
            status: 'failed',
            output: isTimeout
              ? `Stage timed out after ${STAGE_TIMEOUT_MS / 1000}s (API may be slow — skipping to next stage)`
              : errorMsg,
            completedAt: Date.now(),
          });
          useMetricsStore.getState().recordRequest(false);

          // If Plan stage failed, still resolve stack from explicit hints so stages 2-8
          // get the user's explicit tech choices instead of running unconstrained
          if (stage.id === 'plan' && !resolvedStack) {
            resolvedStack = resolveTechStack(explicitHints, null);
            usePipelineStore.getState().setTechStack(runId, resolvedStack);
          }

          // Continue to next stage instead of killing the entire pipeline
          previousOutputs.push(`## ${stage.label}\n(failed: ${isTimeout ? 'timeout' : 'error'})`);
          continue;
        }
      }

      if (!controller.signal.aborted) {
        // Determine final status: 'completed' if at least one stage succeeded
        const currentRun = usePipelineStore.getState().runs.find(r => r.id === runId);
        const anyCompleted = currentRun?.stages.some(s => s.status === 'completed') ?? false;
        completeRun(runId, anyCompleted ? 'completed' : 'failed');
        if (anyCompleted) useMetricsStore.getState().incrementFeatures();

        // Files were already extracted progressively per-stage above.
        // Now run final readiness check + learning capture on ALL accumulated files.
        const completedRun = usePipelineStore.getState().runs.find(r => r.id === runId);
        if (completedRun && allParsedFiles.length > 0) {
          useToastStore.getState().addToast({
            type: 'success',
            title: 'Pipeline Complete',
            message: `${allParsedFiles.length} total file(s) ready for review in Diff tab`,
            duration: 5000,
          });

          // Ensure we're on the Diff tab
          if (!navigatedToDiff) {
            useUIStore.getState().setActiveWorkspaceTab('diff');
          }

          // Auto-commit generated files to GitHub repo if one is selected
          try {
            const repoState = useRepoStore.getState();
            const selectedRepo = repoState.selectedRepo;
            const selectedBranch = repoState.selectedBranch;
            if (selectedRepo && allParsedFiles.length > 0) {
              const commitFiles = allParsedFiles.map(f => ({
                path: f.filename,
                content: f.content,
              }));
              const commitMsg = `feat: ${description.slice(0, 72)} (generated by Pablo pipeline)`;
              useToastStore.getState().addToast({
                type: 'info',
                title: 'Committing to GitHub...',
                message: `Pushing ${commitFiles.length} file(s) to ${selectedRepo.full_name}:${selectedBranch}`,
                duration: 4000,
              });
              const commitResp = await fetch('/api/github/commit', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                  repo: selectedRepo.full_name,
                  branch: selectedBranch,
                  message: commitMsg,
                  files: commitFiles,
                }),
              });
              if (commitResp.ok) {
                const commitData = await commitResp.json() as { sha?: string; url?: string };
                useToastStore.getState().addToast({
                  type: 'success',
                  title: 'Committed to GitHub',
                  message: `${commitFiles.length} file(s) pushed to ${selectedRepo.full_name}:${selectedBranch}`,
                  duration: 5000,
                });
                useActivityStore.getState().addEntry(
                  'git_commit',
                  `Auto-committed ${commitFiles.length} files to ${selectedRepo.full_name} (${commitData.sha?.slice(0, 7) ?? 'unknown'})`
                );
              } else {
                const errText = await commitResp.text();
                console.warn('[Pipeline] Auto-commit failed:', commitResp.status, errText);
                useToastStore.getState().addToast({
                  type: 'warning',
                  title: 'Auto-commit failed',
                  message: `Files are in Diff tab but were not pushed to GitHub: ${commitResp.status}`,
                  duration: 6000,
                });
              }
            }
          } catch (commitErr) {
            console.warn('[Pipeline] Auto-commit error:', commitErr);
            // Non-blocking — files are still available in Diff tab
          }

          // Standards Enforcer — run built-in rule detectors on all generated files
          try {
            const { enforceRules, formatReport } = await import('@/lib/agents/standardsEnforcer');
            const allOutput = previousOutputs.join('\n---\n');
            const enforcementReport = await enforceRules(allOutput);
            if (enforcementReport.totalViolations > 0) {
              const reportText = formatReport(enforcementReport);
              // Append enforcement report to the enterprise stage output
              const enterpriseStage = completedRun.stages.find(s => s.stage === 'enterprise');
              if (enterpriseStage) {
                updateStage(runId, 'enterprise', {
                  output: (enterpriseStage.output ?? '') + '\n\n' + reportText,
                });
              }
              useToastStore.getState().addToast({
                type: enforcementReport.errors > 0 ? 'error' : 'warning',
                title: `Standards: ${enforcementReport.passRate} pass rate`,
                message: `${enforcementReport.totalViolations} violation(s) found (${enforcementReport.errors} errors, ${enforcementReport.warnings} warnings)`,
                duration: 6000,
              });
            }
          } catch {
            // Non-blocking — standards enforcement is optional
          }

          // Production Readiness Score — evaluate generated code quality
          try {
            const readinessFiles = allParsedFiles.map(f => ({
              path: f.filename,
              content: f.content,
              language: f.language,
            }));
            const readinessResult = quickReadinessCheck(readinessFiles);
            usePipelineStore.getState().setReadinessScore(runId, readinessResult);

            if (readinessResult.score < 70) {
              useToastStore.getState().addToast({
                type: 'warning',
                title: `Readiness: ${readinessResult.grade} (${readinessResult.score}/100)`,
                message: `${readinessResult.issues.length} issues found — click "Iterate" to improve`,
                duration: 6000,
              });
            }

            // Auto-iteration (Autonomy Spec — System 1)
            const autoIterate = useUIStore.getState().autoIterateEnabled ?? false;
            const targetScore = useUIStore.getState().iterationTargetScore ?? 95;
            if (autoIterate && readinessResult.score < targetScore) {
              useToastStore.getState().addToast({
                type: 'info',
                title: 'Auto-iterating...',
                message: `Score ${readinessResult.score}/100 — iterating to reach ${targetScore}`,
                duration: 4000,
              });

              try {
                const { runIterationLoop } = await import('@/lib/agents/iterationEngine');
                const iterResult = await runIterationLoop(
                  readinessFiles,
                  description,
                  { targetScore, maxIterations: 5, autoApprove: true },
                  (event) => {
                    if (event.type === 'score_update') {
                      toast(`Iteration ${event.iteration}: ${event.oldScore} → ${event.newScore} (${event.grade})`);
                    } else if (event.type === 'converged') {
                      toastSuccess('Target reached', `Score ${event.finalScore}/100 after ${event.iterations} iteration(s)`);
                    } else if (event.type === 'stalled') {
                      toastError('Iteration stalled', event.message);
                    }
                  },
                  async (stageName, prompt, files) => {
                    // Map stage name to a proper stage object for runStageWithChat
                    const stageObj = PIPELINE_STAGES.find(s => s.id === stageName) || PIPELINE_STAGES[0];
                    const abortCtrl = new AbortController();
                    try {
                      const stageResult = await runStageWithChat(prompt, stageObj, [], abortCtrl.signal);
                      if (stageResult && stageResult.output) {
                        return parseGeneratedFiles(stageResult.output).map(f => ({
                          path: f.filename, content: f.content, language: f.language,
                        }));
                      }
                    } catch {
                      // Stage failed — return original files
                    }
                    return files;
                  },
                );

                // Update the readiness score with the final iteration result
                usePipelineStore.getState().setReadinessScore(runId, {
                  ...readinessResult,
                  score: iterResult.finalScore,
                  grade: iterResult.finalScore >= 90 ? 'A' : iterResult.finalScore >= 80 ? 'B' : iterResult.finalScore >= 70 ? 'C' : iterResult.finalScore >= 60 ? 'D' : 'F',
                });

                // Add iterated files to editor
                for (const file of iterResult.files) {
                  const fileId = `iter-${file.path}`;
                  const fileName = file.path.split('/').pop() || file.path;
                  useEditorStore.getState().openFile({
                    id: fileId,
                    path: file.path,
                    name: fileName,
                    language: file.language,
                    content: file.content,
                  });
                }
              } catch {
                // Non-blocking — auto-iteration failure shouldn't crash the pipeline
              }
            }
          } catch {
            // Non-blocking — readiness evaluation is optional
          }

          // Auto-capture patterns from generated code (Self-Learning)
          try {
            const learningStore = useLearningStore.getState();
            for (const file of allParsedFiles) {
              const baseTags = [file.language, 'pipeline-generated'];
              if (file.filename.includes('api/') || file.filename.includes('route')) {
                learningStore.addPattern({
                  type: 'architecture',
                  trigger: `API route: ${file.filename}`,
                  action: `Generated ${file.language} API route with ${file.content.split('\n').length} lines`,
                  confidence: 0.6,
                  tags: [...baseTags, 'api'],
                  context: description,
                });
              }
              if (file.filename.includes('schema') || file.filename.includes('migration') || file.filename.includes('.sql')) {
                learningStore.addPattern({
                  type: 'code_pattern',
                  trigger: `DB schema: ${file.filename}`,
                  action: `Generated ${file.language} database schema`,
                  confidence: 0.6,
                  tags: [...baseTags, 'database'],
                  context: description,
                });
              }
              if (file.filename.includes('test') || file.filename.includes('spec')) {
                learningStore.addPattern({
                  type: 'code_pattern',
                  trigger: `Test: ${file.filename}`,
                  action: `Generated test file in ${file.language}`,
                  confidence: 0.6,
                  tags: [...baseTags, 'tests'],
                  context: description,
                });
              }
            }
          } catch {
            // Non-blocking
          }
        }

        // Persist pipeline run to DB — always, regardless of whether files were parsed
        if (completedRun) {
          try {
            const db = getDB();
            db.createPipelineRun({
              id: runId,
              sessionId: 'default',
              featureDescription: description,
              status: 'completed',
              currentStage: (completedRun.stages[completedRun.stages.length - 1]?.stage ?? 'enterprise') as 'plan' | 'db' | 'api' | 'ui' | 'ux_validation' | 'tests' | 'execute' | 'review' | 'enterprise',
              totalTokens: completedRun.totalTokens,
              totalDurationMs: completedRun.totalDurationMs,
            });
          } catch {
            // Non-blocking
          }
        }
      }
    } catch {
      completeRun(runId, 'failed');
    } finally {
      abortRef.current = null;
    }
    } finally {
      setIsBuilding(false);
    }
  }, [featureInput, isBuilding, attachments, enhanceEnabled, selectedMentions, startRun, updateStage, advanceStage, completeRun, pendingPrompt, setPendingPrompt]);

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault();
        handleStart();
      }
    },
    [handleStart]
  );

  const handleFileAttach = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files) return;
    Array.from(files).forEach((file) => {
      // Feature 6: Handle image files differently (read as base64)
      if (file.type.startsWith('image/')) {
        const reader = new FileReader();
        reader.onload = () => {
          const dataUrl = reader.result as string;
          // Extract base64 portion after the data:image/...;base64, prefix
          const base64 = dataUrl.split(',')[1] || dataUrl;
          setAttachments((prev) => [...prev, { name: file.name, content: base64, type: file.type }]);
        };
        reader.readAsDataURL(file);
      } else {
        const reader = new FileReader();
        reader.onload = () => {
          const text = reader.result as string;
          setAttachments((prev) => [...prev, { name: file.name, content: text, type: file.type }]);
        };
        reader.readAsText(file);
      }
    });
    e.target.value = '';
  }, []);

  const removeAttachment = useCallback((index: number) => {
    setAttachments((prev) => prev.filter((_, i) => i !== index));
  }, []);

  // Feature 8: Track cursor position for accurate mention replacement
  const mentionCursorRef = useRef<number>(0);
  const mentionQueryRef = useRef<string>('');

  // Feature 8: Handle @-mention input detection
  const handleInputChange = useCallback((e: React.ChangeEvent<HTMLTextAreaElement>) => {
    const value = e.target.value;
    setFeatureInput(value);

    // Detect @ trigger
    const cursorPos = e.target.selectionStart || 0;
    const textBeforeCursor = value.slice(0, cursorPos);
    const atMatch = textBeforeCursor.match(/@(\S*)$/);

    if (atMatch) {
      mentionCursorRef.current = cursorPos;
      mentionQueryRef.current = atMatch[1];
      setMentionQuery(atMatch[1]);
      setShowMentionDropdown(true);
      // Position dropdown near textarea
      const rect = e.target.getBoundingClientRect();
      setMentionDropdownPos({ top: rect.bottom + 4, left: rect.left + 12 });
    } else {
      setShowMentionDropdown(false);
    }
  }, []);

  // Feature 8: Handle mention selection
  const handleMentionSelect = useCallback((item: MentionItem) => {
    setSelectedMentions(prev => [...prev, item.value]);
    // Replace only the @query portion, preserving text before and after
    const cursorPos = mentionCursorRef.current;
    const queryLen = mentionQueryRef.current.length;
    setFeatureInput(prev => {
      const atStart = cursorPos - queryLen - 1; // -1 for the @ sign
      if (atStart >= 0 && prev[atStart] === '@') {
        return prev.slice(0, atStart) + item.label + ' ' + prev.slice(cursorPos);
      }
      // Fallback: find closest @ before cursor
      const atIdx = prev.lastIndexOf('@', cursorPos - 1);
      if (atIdx >= 0) {
        return prev.slice(0, atIdx) + item.label + ' ' + prev.slice(cursorPos);
      }
      return prev;
    });
    setShowMentionDropdown(false);
  }, []);

  const removeMention = useCallback((index: number) => {
    setSelectedMentions(prev => prev.filter((_, i) => i !== index));
  }, []);

  // Production Readiness: feed issues back as a new iteration prompt
  const handleIterate = useCallback((iterationPrompt: string) => {
    setFeatureInput(iterationPrompt);
    // Auto-scroll textarea to show the prompt
    setTimeout(() => {
      textareaRef.current?.focus();
      textareaRef.current?.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }, 100);
  }, []);

  return (
    <div className="flex h-full flex-col bg-pablo-panel">
      {/* Template Picker Modal */}
      <TemplatePickerModal
        open={showTemplates}
        onClose={() => setShowTemplates(false)}
        onSelect={(prompt) => setFeatureInput(prompt)}
      />

      {/* Header */}
      <div className="flex h-9 shrink-0 items-center justify-between border-b border-pablo-border px-3">
        <span className="font-ui text-xs font-semibold uppercase tracking-wider text-pablo-text-dim">
          Feature Factory
        </span>
        <div className="flex items-center gap-2">
          <button
            onClick={() => setShowTemplates(true)}
            className="flex items-center gap-1 rounded px-1.5 py-0.5 font-ui text-[10px] text-pablo-text-muted transition-colors hover:bg-pablo-hover hover:text-pablo-text-dim"
            title="Starter Templates"
          >
            <LayoutTemplate size={12} />
            Templates
          </button>
          <button
            onClick={handleZipDownload}
            className="flex items-center gap-1 rounded px-1.5 py-0.5 font-ui text-[10px] text-pablo-text-muted transition-colors hover:bg-pablo-hover hover:text-pablo-text-dim"
            title="Download project as ZIP"
          >
            <Download size={12} />
            ZIP
          </button>
          <span className="font-ui text-[10px] text-pablo-text-muted">
            {runs.length} runs
          </span>
        </div>
      </div>

      {/* Feature input */}
      <div className="shrink-0 border-b border-pablo-border p-3">
        <div className="flex items-end gap-2">
          <textarea
            ref={textareaRef}
            value={featureInput}
            onChange={handleInputChange}
            onKeyDown={handleKeyDown}
            placeholder="Describe a feature to build... (use @ to reference files/context)"
            className="min-h-[48px] max-h-24 flex-1 resize-none rounded-lg border border-pablo-border bg-pablo-input px-3 py-2 font-ui text-xs text-pablo-text outline-none placeholder:text-pablo-text-muted focus:border-pablo-gold/50"
            rows={2}
          />
          {/* Feature 8: @-Mentions Dropdown */}
          {showMentionDropdown && (
            <MentionDropdown
              query={mentionQuery}
              onSelect={handleMentionSelect}
              position={mentionDropdownPos}
            />
          )}
          <div className="flex flex-col gap-1">
            <input
              ref={fileInputRef}
              type="file"
              multiple
              accept=".txt,.md,.json,.csv,.xml,.yaml,.yml,.toml,.ts,.tsx,.js,.jsx,.py,.html,.css,.sql,.env,.sh,.rs,.go,.java,.rb,.php,.swift,.kt,.c,.cpp,.h,.pdf,.doc,.docx,.png,.jpg,.jpeg,.gif,.webp,.svg,.bmp"
              onChange={handleFileAttach}
              className="hidden"
            />
            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              className={`flex h-8 w-8 items-center justify-center rounded-lg border border-pablo-border transition-colors ${
                attachments.length > 0
                  ? 'text-pablo-gold border-pablo-gold/30 bg-pablo-gold/5'
                  : 'text-pablo-text-muted hover:bg-pablo-hover hover:text-pablo-text-dim'
              }`}
              title="Attach document"
              aria-label="Attach document"
            >
              <Paperclip size={14} />
            </button>
            {/* Feature 9: Prompt Enhance toggle */}
            <button
              type="button"
              onClick={() => setEnhanceEnabled(!enhanceEnabled)}
              className={`flex h-8 w-8 items-center justify-center rounded-lg border transition-colors ${
                enhanceEnabled
                  ? 'border-pablo-gold/30 bg-pablo-gold/10 text-pablo-gold'
                  : 'border-pablo-border text-pablo-text-muted hover:bg-pablo-hover'
              }`}
              title={enhanceEnabled ? 'Prompt enhancement ON' : 'Prompt enhancement OFF'}
              aria-label="Toggle prompt enhancement"
            >
              <Sparkles size={14} />
            </button>
            <button
              data-testid="pipeline-start"
              data-pipeline-start
              onClick={handleStart}
              disabled={!featureInput.trim() || isBuilding}
              className="flex h-8 items-center gap-1.5 rounded-lg bg-pablo-gold px-3 font-ui text-xs font-medium text-pablo-bg transition-colors hover:bg-pablo-gold-dim disabled:opacity-30 disabled:cursor-not-allowed"
            >
              {isBuilding ? <Loader2 size={12} className="animate-spin" /> : <Play size={12} />}
              {isBuilding ? 'Building...' : 'Build'}
            </button>
          </div>
        </div>
        {/* Attachment chips */}
        {attachments.length > 0 && (
          <div className="mt-1.5 flex flex-wrap gap-1">
            {attachments.map((att, i) => (
              <span
                key={`${att.name}-${i}`}
                className={`flex items-center gap-1 rounded-md px-2 py-0.5 font-ui text-[10px] ${
                  att.type.startsWith('image/') ? 'bg-purple-500/10 text-purple-400' : 'bg-pablo-gold/10 text-pablo-gold'
                }`}
              >
                {att.type.startsWith('image/') ? <ImageIcon size={10} /> : <FileText size={10} />}
                {att.name}
                <button
                  type="button"
                  onClick={() => removeAttachment(i)}
                  className="ml-0.5 rounded-full hover:bg-pablo-gold/20"
                  aria-label={`Remove ${att.name}`}
                >
                  <X size={10} />
                </button>
              </span>
            ))}
          </div>
        )}
        {/* Feature 8: Selected @-mention pills */}
        {selectedMentions.length > 0 && (
          <div className="mt-1 flex flex-wrap gap-1">
            {selectedMentions.map((mention, i) => (
              <span
                key={`mention-${mention}-${i}`}
                className="flex items-center gap-1 rounded-md bg-pablo-blue/10 px-2 py-0.5 font-ui text-[10px] text-pablo-blue"
              >
                @{mention}
                <button
                  type="button"
                  onClick={() => removeMention(i)}
                  className="ml-0.5 rounded-full hover:bg-pablo-blue/20"
                  aria-label={`Remove @${mention}`}
                >
                  <X size={10} />
                </button>
              </span>
            ))}
          </div>
        )}
        <div className="mt-1.5 flex items-center gap-2 overflow-x-auto scrollbar-none">
          <span className="font-ui text-[10px] text-pablo-text-muted shrink-0">{PIPELINE_STAGES.length}-Stage Pipeline:</span>
          <div className="flex items-center gap-1 shrink-0">
            {PIPELINE_STAGES.map((s, i) => (
              <span key={s.id} className="flex items-center gap-1 shrink-0">
                <span className="font-ui text-[10px] text-pablo-gold whitespace-nowrap">{s.label}</span>
                {i < PIPELINE_STAGES.length - 1 && (
                  <span className="text-pablo-text-muted">&rarr;</span>
                )}
              </span>
            ))}
          </div>
        </div>
      </div>

      {/* Agent Runs */}
      {agentStore.runs.length > 0 && (
        <div className="shrink-0 border-b border-pablo-border p-3">
          <div className="flex items-center gap-2 mb-2">
            <Cpu size={12} className="text-pablo-gold" />
            <span className="font-ui text-[10px] font-semibold uppercase tracking-wider text-pablo-gold">Agent Runs</span>
            <span className="font-ui text-[10px] text-pablo-text-muted">Plan → Execute → Verify → Fix</span>
          </div>
          <div className="flex flex-col gap-2">
            {agentStore.runs.map((run) => (
              <AgentRunCard key={run.id} run={run} />
            ))}
          </div>
        </div>
      )}

      {/* Pipeline Runs list */}
      <div className="flex-1 overflow-y-auto p-3">
        {runs.length === 0 && agentStore.runs.length === 0 ? (
          <HeroPrompt />
        ) : (
          <div className="flex flex-col gap-3">
            {runs.map((run) => (
              <RunCard
                key={run.id}
                run={run}
                onCancel={run.status === 'running' ? () => {
                  abortRef.current?.abort();
                  completeRun(run.id, 'cancelled');
                } : undefined}
                onIterate={run.readinessScore ? handleIterate : undefined}
              />
            ))}

            {/* Feature 20: Suggested Next Actions */}
            {runs.length > 0 && runs[runs.length - 1].status !== 'running' && (
              <div className="rounded-lg border border-pablo-border bg-pablo-bg p-3">
                <p className="mb-2 font-ui text-[10px] font-medium text-pablo-text-dim">Suggested Next Actions</p>
                <div className="flex flex-wrap gap-1.5">
                  {SUGGESTED_ACTIONS.map((action) => {
                    const ActionIcon = action.icon;
                    return (
                      <button
                        key={action.label}
                        onClick={() => handleSuggestedAction(action.prompt)}
                        className="flex items-center gap-1 rounded-lg border border-pablo-border px-2.5 py-1 font-ui text-[10px] text-pablo-text-dim transition-colors hover:border-pablo-gold/40 hover:bg-pablo-gold/5 hover:text-pablo-gold"
                      >
                        <ActionIcon size={11} />
                        {action.label}
                      </button>
                    );
                  })}
                </div>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
