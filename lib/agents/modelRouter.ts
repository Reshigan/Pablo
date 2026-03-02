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

export type ModelProvider = 'workers_ai' | 'ollama_cloud';

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

// Model definitions
const MODELS = {
  // Cloudflare Workers AI models (fast, pay-per-use, edge-deployed)
  workers_r1_32b: {
    provider: 'workers_ai' as const,
    model: '@cf/deepseek-ai/deepseek-r1-distill-qwen-32b',
    description: 'DeepSeek R1 distilled 32B - reasoning, planning, review',
    max_tokens: 8192,
    temperature: 0.3,
    estimated_speed: '40-60 TPS',
  },
  workers_llama70b: {
    provider: 'workers_ai' as const,
    model: '@cf/meta/llama-3.3-70b-instruct-fp8-fast',
    description: 'Llama 3.3 70B - code generation, fixing',
    max_tokens: 8192,
    temperature: 0.2,
    estimated_speed: '30-50 TPS',
  },
  workers_glm_flash: {
    provider: 'workers_ai' as const,
    model: '@cf/zai-org/glm-4.7-flash',
    description: 'GLM 4.7 Flash - fast chat, tool calling, simple tasks',
    max_tokens: 4096,
    temperature: 0.4,
    estimated_speed: '100+ TPS',
  },
  workers_llama4_scout: {
    provider: 'workers_ai' as const,
    model: '@cf/meta/llama-4-scout-17b-16e-instruct',
    description: 'Llama 4 Scout MoE - function calling, multi-modal',
    max_tokens: 8192,
    temperature: 0.3,
    estimated_speed: '60-80 TPS',
  },

  // Ollama Cloud models (flat rate, frontier quality)
  ollama_qwen_coder: {
    provider: 'ollama_cloud' as const,
    model: 'qwen3-coder-next',
    description: 'Qwen3-Coder-Next 80B-A3B - frontier coding agent, 70.6% SWE-bench',
    max_tokens: 16384,
    temperature: 0.1,
    estimated_speed: '30-100 TPS',
  },
  ollama_deepseek_r1: {
    provider: 'ollama_cloud' as const,
    model: 'deepseek-r1',
    description: 'DeepSeek R1 - deep reasoning, complex planning',
    max_tokens: 16384,
    temperature: 0.2,
    estimated_speed: '20-50 TPS',
  },
};

// Routing table
const ROUTING_TABLE: Record<TaskType, RouteDecision> = {
  plan: {
    task_type: 'plan',
    primary: MODELS.ollama_deepseek_r1,
    fallback: MODELS.workers_r1_32b,
    reasoning: 'Planning requires deep reasoning. R1 on Ollama for quality, Workers R1 as fallback.',
  },
  decompose: {
    task_type: 'decompose',
    primary: MODELS.ollama_deepseek_r1,
    fallback: MODELS.workers_r1_32b,
    reasoning: 'Decomposition needs the same deep reasoning as planning.',
  },
  generate: {
    task_type: 'generate',
    primary: MODELS.ollama_qwen_coder,
    fallback: MODELS.workers_llama70b,
    reasoning: 'Code generation needs frontier quality. Qwen3-Coder-Next primary. Llama 70B fallback.',
  },
  fix: {
    task_type: 'fix',
    primary: MODELS.ollama_qwen_coder,
    fallback: MODELS.workers_llama70b,
    reasoning: 'Fixing code requires the same quality as generating it.',
  },
  test: {
    task_type: 'test',
    primary: MODELS.workers_llama70b,
    fallback: MODELS.ollama_qwen_coder,
    reasoning: 'Test generation is structured. 70B on Workers AI is fast enough.',
  },
  review: {
    task_type: 'review',
    primary: MODELS.workers_r1_32b,
    fallback: MODELS.ollama_deepseek_r1,
    reasoning: 'Review needs reasoning. Workers R1 is fast for this.',
  },
  explain: {
    task_type: 'explain',
    primary: MODELS.workers_glm_flash,
    fallback: MODELS.workers_llama70b,
    reasoning: 'Explanations are simple text tasks. Use the fastest model.',
  },
  chat: {
    task_type: 'chat',
    primary: MODELS.workers_glm_flash,
    fallback: MODELS.workers_llama70b,
    reasoning: 'General chat is simple. Use the fastest model.',
  },
  seed_data: {
    task_type: 'seed_data',
    primary: MODELS.workers_glm_flash,
    fallback: MODELS.workers_llama70b,
    reasoning: 'Seed data generation is templated. Fast model is sufficient.',
  },
  document: {
    task_type: 'document',
    primary: MODELS.workers_glm_flash,
    fallback: MODELS.workers_llama70b,
    reasoning: 'Documentation is structured text. Fast model handles it well.',
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
  duration_ms: number;
}

export interface EnvConfig {
  CLOUDFLARE_ACCOUNT_ID?: string;
  CLOUDFLARE_API_TOKEN?: string;
  OLLAMA_URL?: string;
  OLLAMA_API_KEY?: string;
}

export async function callModel(request: LLMRequest, env: EnvConfig): Promise<LLMResponse> {
  const startTime = Date.now();

  if (request.model.provider === 'workers_ai') {
    return callWorkersAI(request, startTime, env);
  } else {
    return callOllamaCloud(request, startTime, env);
  }
}

interface WorkersAIResult {
  result?: {
    response?: string;
    choices?: Array<{ message?: { content?: string } }>;
    usage?: { total_tokens?: number };
  };
}

async function callWorkersAI(request: LLMRequest, startTime: number, env: EnvConfig): Promise<LLMResponse> {
  // Try the Workers AI binding first (works in deployed Workers without REST API credentials)
  try {
    const { getCloudflareContext } = await import('@opennextjs/cloudflare');
    const ctx = await getCloudflareContext({ async: true });
    const ai = (ctx.env as Record<string, unknown>).AI;
    if (ai) {
      const aiBinding = ai as {
        run: (
          model: string,
          input: Record<string, unknown>,
          options?: Record<string, unknown>
        ) => Promise<ReadableStream | string | Record<string, unknown>>;
      };

      const result = await aiBinding.run(request.model.model, {
        messages: [
          { role: 'system', content: request.systemPrompt },
          { role: 'user', content: request.userMessage },
        ],
        max_tokens: request.model.max_tokens,
        temperature: request.model.temperature,
        stream: false,
      });

      // Parse binding response
      if (typeof result === 'string') {
        return {
          content: result,
          model: request.model.model,
          provider: 'workers_ai',
          tokens_used: 0,
          duration_ms: Date.now() - startTime,
        };
      }
      const bindingResult = result as { response?: string; usage?: { total_tokens?: number } };
      return {
        content: bindingResult.response || '',
        model: request.model.model,
        provider: 'workers_ai',
        tokens_used: bindingResult.usage?.total_tokens || 0,
        duration_ms: Date.now() - startTime,
      };
    }
  } catch {
    // AI binding not available (local dev), fall through to REST API
  }

  // Fallback to REST API (requires CLOUDFLARE_ACCOUNT_ID and CLOUDFLARE_API_TOKEN)
  const ACCOUNT_ID = env.CLOUDFLARE_ACCOUNT_ID;
  const AUTH_TOKEN = env.CLOUDFLARE_API_TOKEN;

  if (!ACCOUNT_ID || !AUTH_TOKEN) {
    throw new Error('Workers AI not configured: AI binding unavailable and missing CLOUDFLARE_ACCOUNT_ID or CLOUDFLARE_API_TOKEN');
  }

  const response = await fetch(
    `https://api.cloudflare.com/client/v4/accounts/${ACCOUNT_ID}/ai/run/${request.model.model}`,
    {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${AUTH_TOKEN}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        messages: [
          { role: 'system', content: request.systemPrompt },
          { role: 'user', content: request.userMessage },
        ],
        max_tokens: request.model.max_tokens,
        temperature: request.model.temperature,
        stream: request.stream ?? false,
      }),
    }
  );

  const data = await response.json() as WorkersAIResult;
  return {
    content: data.result?.response || data.result?.choices?.[0]?.message?.content || '',
    model: request.model.model,
    provider: 'workers_ai',
    tokens_used: data.result?.usage?.total_tokens || 0,
    duration_ms: Date.now() - startTime,
  };
}

interface OllamaCloudResult {
  message?: { content?: string };
  eval_count?: number;
}

async function callOllamaCloud(request: LLMRequest, startTime: number, env: EnvConfig): Promise<LLMResponse> {
  const OLLAMA_URL = env.OLLAMA_URL || 'https://api.pawan.krd/cosmosrp/v1';
  const OLLAMA_KEY = env.OLLAMA_API_KEY;

  const isOpenAICompatible = OLLAMA_URL.includes('/v1') || OLLAMA_URL.includes('openai') || OLLAMA_URL.includes('pawan');

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
    });

    interface OpenAIResult {
      choices?: Array<{ message?: { content?: string } }>;
      usage?: { total_tokens?: number };
    }

    const data = await response.json() as OpenAIResult;
    return {
      content: data.choices?.[0]?.message?.content || '',
      model: request.model.model,
      provider: 'ollama_cloud',
      tokens_used: data.usage?.total_tokens || 0,
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
  });

  const data = await response.json() as OllamaCloudResult;
  return {
    content: data.message?.content || '',
    model: request.model.model,
    provider: 'ollama_cloud',
    tokens_used: data.eval_count || 0,
    duration_ms: Date.now() - startTime,
  };
}
