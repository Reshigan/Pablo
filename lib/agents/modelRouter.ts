// lib/agents/modelRouter.ts
// Routes tasks to the optimal model based on complexity and type
// Uses Cloudflare Workers AI for fast tasks, Ollama Cloud for heavy generation

export type TaskType =
  | 'plan'           // Break down spec into steps -> R1 reasoner
  | 'generate'       // Write code from spec -> 70B coder
  | 'review'         // Review generated code -> R1 reasoner
  | 'fix'            // Fix issues in code -> 70B coder
  | 'explain'        // Explain code/concept -> fast model
  | 'chat'           // General conversation -> fast model
  | 'decompose'      // Break feature into sub-tasks -> R1 reasoner
  | 'seed_data'      // Generate seed/demo data -> fast model
  | 'test'           // Generate test code -> 70B coder
  | 'document';      // Generate docs/comments -> fast model

export type ModelProvider = 'ollama_cloud';

export interface ModelConfig {
  provider: ModelProvider;
  model: string;
  description: string;
  max_tokens: number;
  temperature: number;
  estimated_speed: string;
}

export interface RouteDecision {
  task_type: TaskType;
  primary: ModelConfig;
  fallback: ModelConfig;
  reasoning: string;
}

// Model definitions — Ollama Cloud only (hosted at ollama.com)
const MODELS = {
  ollama_qwen_coder: {
    provider: 'ollama_cloud' as const,
    model: 'qwen3-coder:480b',
    description: 'Qwen3-Coder 480B - frontier coding agent',
    max_tokens: 16384,
    temperature: 0.1,
    estimated_speed: '30-100 TPS',
  },
  ollama_deepseek_r1: {
    provider: 'ollama_cloud' as const,
    model: 'deepseek-v3.2',
    description: 'DeepSeek V3.2 - deep reasoning, complex planning',
    max_tokens: 16384,
    temperature: 0.2,
    estimated_speed: '20-50 TPS',
  },
  ollama_gpt_oss: {
    provider: 'ollama_cloud' as const,
    model: 'gpt-oss:120b',
    description: 'GPT-OSS 120B - general purpose, fast',
    max_tokens: 8192,
    temperature: 0.3,
    estimated_speed: '40-80 TPS',
  },
};

// Routing table
const ROUTING_TABLE: Record<TaskType, RouteDecision> = {
  plan: {
    task_type: 'plan',
    primary: MODELS.ollama_deepseek_r1,
    fallback: MODELS.ollama_gpt_oss,
    reasoning: 'Planning requires deep reasoning. DeepSeek V3.2 primary, GPT-OSS fallback.',
  },
  decompose: {
    task_type: 'decompose',
    primary: MODELS.ollama_deepseek_r1,
    fallback: MODELS.ollama_gpt_oss,
    reasoning: 'Decomposition needs the same deep reasoning as planning.',
  },
  generate: {
    task_type: 'generate',
    primary: MODELS.ollama_qwen_coder,
    fallback: MODELS.ollama_gpt_oss,
    reasoning: 'Code generation needs frontier quality. Qwen3-Coder primary, GPT-OSS fallback.',
  },
  fix: {
    task_type: 'fix',
    primary: MODELS.ollama_qwen_coder,
    fallback: MODELS.ollama_gpt_oss,
    reasoning: 'Fixing code requires the same quality as generating it.',
  },
  test: {
    task_type: 'test',
    primary: MODELS.ollama_qwen_coder,
    fallback: MODELS.ollama_gpt_oss,
    reasoning: 'Test generation via Qwen3-Coder on Ollama Cloud.',
  },
  review: {
    task_type: 'review',
    primary: MODELS.ollama_deepseek_r1,
    fallback: MODELS.ollama_gpt_oss,
    reasoning: 'Review needs reasoning. DeepSeek V3.2 primary, GPT-OSS fallback.',
  },
  explain: {
    task_type: 'explain',
    primary: MODELS.ollama_gpt_oss,
    fallback: MODELS.ollama_qwen_coder,
    reasoning: 'Explanations via GPT-OSS. Qwen3-Coder fallback.',
  },
  chat: {
    task_type: 'chat',
    primary: MODELS.ollama_gpt_oss,
    fallback: MODELS.ollama_qwen_coder,
    reasoning: 'General chat via GPT-OSS. Qwen3-Coder fallback.',
  },
  seed_data: {
    task_type: 'seed_data',
    primary: MODELS.ollama_gpt_oss,
    fallback: MODELS.ollama_qwen_coder,
    reasoning: 'Seed data via GPT-OSS. Qwen3-Coder fallback.',
  },
  document: {
    task_type: 'document',
    primary: MODELS.ollama_gpt_oss,
    fallback: MODELS.ollama_qwen_coder,
    reasoning: 'Documentation via GPT-OSS. Qwen3-Coder fallback.',
  },
};

// Task classification
export function classifyTask(userMessage: string): TaskType {
  const msg = userMessage.toLowerCase();

  // Feature/spec detection - triggers decompose + generate pipeline
  const featurePatterns = [
    /build\s+(a|an|me|the)\s+\w+.*system/i,
    /create\s+(a|an|me|the)\s+\w+.*(?:app|api|backend|frontend|service)/i,
    /implement\s/i,
    /generate\s+(a|an|the)\s+(?:complete|full|entire)/i,
    /with\s+(?:auth|crud|dashboard|api)/i,
  ];
  if (featurePatterns.some(p => p.test(userMessage))) return 'generate';

  // Planning
  if (/plan|architect|design|structure|break\s*down|decompose/i.test(msg)) return 'plan';

  // Review
  if (/review|check|audit|validate|find\s*(?:issues|bugs|errors)/i.test(msg)) return 'review';

  // Fix
  if (/fix|debug|repair|correct|resolve|patch/i.test(msg)) return 'fix';

  // Test
  if (/test|spec|unittest|pytest|jest/i.test(msg)) return 'test';

  // Explain
  if (/explain|what\s+(?:is|does|are)|how\s+(?:does|do|to)|why/i.test(msg)) return 'explain';

  // Document
  if (/document|readme|docstring|jsdoc|comment/i.test(msg)) return 'document';

  // Default to chat
  return 'chat';
}

// Main router
export function routeTask(userMessage: string): RouteDecision {
  const taskType = classifyTask(userMessage);
  return ROUTING_TABLE[taskType];
}

// For complex tasks, determine if we should use multi-turn generation
export function shouldDecompose(userMessage: string): boolean {
  const msg = userMessage.toLowerCase();

  const requirementIndicators = [
    /auth/i, /crud/i, /dashboard/i, /api/i, /database/i,
    /login/i, /register/i, /pipeline/i, /vat/i, /commission/i,
    /report/i, /export/i, /import/i, /notification/i, /email/i,
    /payment/i, /invoice/i, /search/i, /filter/i, /sort/i,
  ];

  const matchCount = requirementIndicators.filter(p => p.test(msg)).length;
  return matchCount >= 3;
}

// Provider clients
export interface LLMRequest {
  model: ModelConfig;
  systemPrompt: string;
  userMessage: string;
  stream?: boolean;
}

export interface LLMResponse {
  content: string;
  model: string;
  provider: ModelProvider;
  tokens_used: number;
  tokens_in: number;
  tokens_out: number;
  duration_ms: number;
}

export interface EnvConfig {
  OLLAMA_URL?: string;
  OLLAMA_API_KEY?: string;
}

/** Timeout for non-streaming API calls (ms). Ollama Cloud 480B can take a while. */
const NON_STREAMING_TIMEOUT_MS = 600_000; // 10 min

/**
 * callModelTracked — calls the model AND logs to D1 agent_runs.
 * Use this from specialist agents for automatic cost/run tracking.
 */
export async function callModelTracked(
  request: LLMRequest,
  env: EnvConfig,
  meta: { sessionId: string; orchestrationId: string; agentName: string; phase: string },
): Promise<LLMResponse> {
  const result = await callModel(request, env);

  // Log agent run to D1 (non-blocking)
  try {
    const { d1CreateAgentRun } = await import('@/lib/db/d1-agent-runs');
    void d1CreateAgentRun({
      sessionId: meta.sessionId,
      orchestrationId: meta.orchestrationId,
      agentName: meta.agentName,
      phase: meta.phase,
      status: 'complete',
      inputSummary: request.userMessage.slice(0, 500),
      outputSummary: result.content.slice(0, 500),
      filesGenerated: 0,
      tokensUsed: result.tokens_used,
      durationMs: result.duration_ms,
      issues: '',
    }).catch(() => { /* non-blocking */ });
  } catch {
    // Cost tracking failure should never block the response
  }

  return result;
}

export async function callModel(request: LLMRequest, env: EnvConfig): Promise<LLMResponse> {
  const startTime = Date.now();
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), NON_STREAMING_TIMEOUT_MS);
  try {
    const result = await callOllamaCloud(request, startTime, env, controller.signal);

    // Cost tracking: log directly to D1 (works server-side, no relative URL needed)
    try {
      const { d1LogLLMCall, estimateCost } = await import('@/lib/db/d1-costs');
      const cost = estimateCost(result.model, result.tokens_in, result.tokens_out);
      void d1LogLLMCall({
        model: result.model,
        tokensIn: result.tokens_in,
        tokensOut: result.tokens_out,
        durationMs: result.duration_ms,
        costUsd: cost,
        source: request.model.description || 'model-router',
      }).catch(() => { /* non-blocking */ });
    } catch {
      // Cost tracking failure should never block the response
    }

    return result;
  } finally {
    clearTimeout(timer);
  }
}

interface OllamaCloudResult {
  message?: { content?: string };
  prompt_eval_count?: number;
  eval_count?: number;
}

async function callOllamaCloud(request: LLMRequest, startTime: number, env: EnvConfig, signal?: AbortSignal): Promise<LLMResponse> {
  const OLLAMA_URL = env.OLLAMA_URL || 'https://ollama.com';
  const OLLAMA_KEY = env.OLLAMA_API_KEY;

  const isOpenAICompatible = OLLAMA_URL.includes('/v1') || OLLAMA_URL.includes('openai');

  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  if (OLLAMA_KEY) {
    headers['Authorization'] = `Bearer ${OLLAMA_KEY}`;
  }

  let response: Response;
  if (isOpenAICompatible) {
    response = await fetch(`${OLLAMA_URL}/chat/completions`, {
      method: 'POST',
      headers,
      body: JSON.stringify({
        model: request.model.model,
        messages: [
          { role: 'system', content: request.systemPrompt },
          { role: 'user', content: request.userMessage },
        ],
        max_tokens: request.model.max_tokens,
        temperature: request.model.temperature,
        stream: false,
      }),
      signal,
    });

    interface OpenAIResult {
      choices?: Array<{ message?: { content?: string } }>;
      usage?: { prompt_tokens?: number; completion_tokens?: number; total_tokens?: number };
    }

    const data = await response.json() as OpenAIResult;
    const promptTokens = data.usage?.prompt_tokens || 0;
    const completionTokens = data.usage?.completion_tokens || 0;
    return {
      content: data.choices?.[0]?.message?.content || '',
      model: request.model.model,
      provider: 'ollama_cloud',
      tokens_used: data.usage?.total_tokens || (promptTokens + completionTokens),
      tokens_in: promptTokens,
      tokens_out: completionTokens,
      duration_ms: Date.now() - startTime,
    };
  }

  response = await fetch(`${OLLAMA_URL}/api/chat`, {
    method: 'POST',
    headers,
    body: JSON.stringify({
      model: request.model.model,
      messages: [
        { role: 'system', content: request.systemPrompt },
        { role: 'user', content: request.userMessage },
      ],
      stream: false,
      options: {
        temperature: request.model.temperature,
        num_predict: request.model.max_tokens,
      },
    }),
    signal,
  });

  const data = await response.json() as OllamaCloudResult;
  const promptTokens = data.prompt_eval_count || 0;
  const evalTokens = data.eval_count || 0;
  return {
    content: data.message?.content || '',
    model: request.model.model,
    provider: 'ollama_cloud',
    tokens_used: promptTokens + evalTokens,
    tokens_in: promptTokens,
    tokens_out: evalTokens,
    duration_ms: Date.now() - startTime,
  };
}
