// lib/agents/multiTurnGenerator.ts
// Multi-turn generation pipeline for complex feature requests
// Decomposes a feature into 7 sequential steps, each building on previous output
// This is what takes Pablo from ~70% to 95%+ accuracy

import { callModel, type EnvConfig, type ModelConfig } from './modelRouter';
import { validateGeneratedCode, generateFixPrompt, type ValidationResult } from '../validation/codeValidator';

export interface GenerationStep {
  name: string;
  description: string;
  model_preference: 'reasoner' | 'coder' | 'fast';
  depends_on: number[];
  prompt_template: string;
}

export interface StepResult {
  step_name: string;
  content: string;
  model_used: string;
  tokens_used: number;
  duration_ms: number;
}

export interface GenerationResult {
  steps: StepResult[];
  files: ParsedFile[];
  total_lines: number;
  total_tokens: number;
  total_duration_ms: number;
  validation: ValidationResult | null;
  issues_found: number;
  issues_fixed: number;
}

export interface ParsedFile {
  filename: string;
  content: string;
  language: string;
  lines: number;
}

export type ProgressCallback = (step: string, status: 'starting' | 'complete' | 'error', detail?: string) => void;

// The 7-step backend generation plan
function createBackendPlan(spec: string): GenerationStep[] {
  return [
    {
      name: 'Configuration & Setup',
      description: 'Generate config.py with Pydantic Settings, database engine, Base, get_db dependency, logging',
      model_preference: 'coder',
      depends_on: [],
      prompt_template: `Generate a Python config.py file for this project:

SPEC: ${spec}

Requirements:
- Use pydantic-settings for Settings class
- Include all env vars: DATABASE_URL, JWT_SECRET_KEY, JWT_ALGORITHM=HS256, ACCESS_TOKEN_EXPIRE_MINUTES=30, REFRESH_TOKEN_EXPIRE_DAYS=7
- Create SQLAlchemy engine and SessionLocal
- Create declarative Base
- Create get_db dependency with proper try/finally
- Configure Python logging with format: %(asctime)s - %(name)s - %(levelname)s - %(message)s
- SQLite for dev, PostgreSQL for production (based on DATABASE_URL)

Output ONLY the complete config.py file in a code block. No explanations.`,
    },
    {
      name: 'Database Models',
      description: 'Generate models.py with all SQLAlchemy models, timestamps, enums, and relationships',
      model_preference: 'coder',
      depends_on: [0],
      prompt_template: `Generate models.py for this project. Use the config from Step 1.

SPEC: ${spec}

STEP 1 OUTPUT (config.py):
{step_0}

Requirements:
- Import Base from config
- ALL models must have: id (primary key), created_at (DateTime, default=utcnow), updated_at (DateTime, onupdate=utcnow), is_active (Boolean, default=True)
- Use proper Enum classes for status fields
- Add proper foreign key relationships with back_populates
- Proper __tablename__ on all models

Output ONLY the complete models.py file in a code block. No explanations.`,
    },
    {
      name: 'Pydantic Schemas',
      description: 'Generate schemas.py with Create/Update/Response schemas for each model',
      model_preference: 'coder',
      depends_on: [1],
      prompt_template: `Generate schemas.py with Pydantic schemas for all models.

SPEC: ${spec}

STEP 2 OUTPUT (models.py):
{step_1}

Requirements:
- For EACH model, create: XxxCreate, XxxUpdate, XxxResponse schemas
- XxxCreate: fields needed to create (no id, no timestamps)
- XxxUpdate: all fields Optional (for PATCH)
- XxxResponse: all fields including id, timestamps, with from_attributes=True
- Add proper field validation (EmailStr, min_length, etc.)
- Include Optional fields where appropriate

Output ONLY the complete schemas.py file in a code block. No explanations.`,
    },
    {
      name: 'Authentication System',
      description: 'Generate auth.py with bcrypt hashing, JWT tokens, register/login/refresh endpoints',
      model_preference: 'coder',
      depends_on: [0, 1, 2],
      prompt_template: `Generate auth.py with complete authentication system.

SPEC: ${spec}

STEP 1 (config.py): {step_0}
STEP 2 (models.py): {step_1}
STEP 3 (schemas.py): {step_2}

Requirements:
- Password hashing with passlib[bcrypt]: CryptContext(schemes=["bcrypt"], deprecated="auto")
- JWT token creation with python-jose: access_token (30 min), refresh_token (7 days)
- OAuth2PasswordBearer scheme
- get_current_user dependency that validates JWT
- Endpoints: POST /auth/register, POST /auth/login, POST /auth/refresh
- NEVER store plaintext passwords
- Return TokenResponse with access_token, refresh_token, token_type

Output ONLY the complete auth.py file in a code block. No explanations.`,
    },
    {
      name: 'Business Logic Services',
      description: 'Generate services.py with business logic functions, calculations, transitions, and aggregations',
      model_preference: 'coder',
      depends_on: [1],
      prompt_template: `Generate services.py with business logic functions.

SPEC: ${spec}

STEP 2 (models.py): {step_1}

Requirements:
- Implement ONLY the business rules described in the SPEC (do not assume country, currency, tax rate, or compliance regime)
- If the SPEC includes tax/sales tax, implement the formula exactly as specified
- If the SPEC includes commission tiers, implement the tiers exactly as specified
- Implement pipeline/stage transitions only if described in the SPEC
- Dashboard aggregation functions (total revenue, active deals, top rep, monthly trends) if relevant
- All functions properly typed with return types

Output ONLY the complete services.py file in a code block. No explanations.`,
    },
    {
      name: 'CRUD Routes',
      description: 'Generate routes.py with all endpoints, pagination, auth, error handling, OpenAPI tags',
      model_preference: 'coder',
      depends_on: [0, 1, 2, 3, 4],
      prompt_template: `Generate routes.py with all API endpoints.

SPEC: ${spec}

STEP 1 (config.py): {step_0}
STEP 2 (models.py): {step_1}
STEP 3 (schemas.py): {step_2}
STEP 4 (auth.py): {step_3}
STEP 5 (services.py): {step_4}

Requirements:
- All CRUD endpoints for each model
- ALL list endpoints must support pagination (skip: int = 0, limit: int = 20)
- ALL endpoints require auth via Depends(get_current_user) except login/register
- Proper error handling with HTTPException
- Proper OpenAPI tags for each resource
- DELETE endpoints use soft delete (set is_active=False)
- Include a dashboard endpoint with aggregated stats
- Deal stage transition endpoint (PATCH /deals/{id}/stage)

Output ONLY the complete routes.py file in a code block. No explanations.`,
    },
    {
      name: 'Seed Data & Main',
      description: 'Generate seed.py + main.py with realistic seed data, CORS, health check',
      model_preference: 'coder',
      depends_on: [0, 1, 2, 3, 4, 5],
      prompt_template: `Generate two files: seed.py and main.py

SPEC: ${spec}

STEP 1 (config.py): {step_0}
STEP 2 (models.py): {step_1}
STEP 3 (schemas.py): {step_2}
STEP 4 (auth.py): {step_3}
STEP 5 (services.py): {step_4}
STEP 6 (routes.py): {step_5}

Requirements for seed.py:
- Create realistic seed data appropriate for the domain
- Use generic, internationally-friendly names/companies unless the SPEC requests a specific locale
- Avoid placeholder-only data like John Doe / Jane Smith unless the SPEC requests it
- Create admin user with hashed password
- At least 5 customers, 5 products, 5 deals across different pipeline stages, 5 orders
- Run with: python seed.py

Requirements for main.py:
- Import app from routes
- Add CORS middleware (all origins for dev)
- Add health check endpoint: GET /health -> {"status": "healthy", "version": "1.0.0"}
- Create tables on startup
- Run with: uvicorn main:app --reload

Output BOTH files clearly labelled. Use code blocks with filenames.`,
    },
  ];
}

// Extract files from LLM output
export function extractFiles(content: string, stepName: string): ParsedFile[] {
  const files: ParsedFile[] = [];

  // Try to match ```filename.ext\n...``` or ```python\n...```
  const codeBlockRegex = /```[a-zA-Z0-9_]*\s*\n([\s\S]*?)```/g;
  const fileHeaderRegex = /(?:#+\s*)?(?:File:\s*|Filename:\s*)?([a-zA-Z0-9_\-/.]+\.(?:py|ts|js|sql|json))/gi;

  let match: RegExpExecArray | null;
  const blocks: string[] = [];

  while ((match = codeBlockRegex.exec(content)) !== null) {
    blocks.push(match[1].trim());
  }

  if (blocks.length === 0) {
    // No code blocks found, treat entire content as one file
    const inferredFilename = stepName.toLowerCase().replace(/[^a-z0-9]/g, '_') + '.py';
    files.push({
      filename: inferredFilename,
      content: content,
      language: 'python',
      lines: content.split('\n').length,
    });
    return files;
  }

  // Try to match filenames from headers
  const headerMatches: string[] = [];
  let headerMatch: RegExpExecArray | null;
  while ((headerMatch = fileHeaderRegex.exec(content)) !== null) {
    headerMatches.push(headerMatch[1]);
  }

  for (let i = 0; i < blocks.length; i++) {
    const filename = headerMatches[i] || inferFilename(stepName, i);
    const ext = filename.split('.').pop() || 'py';
    files.push({
      filename,
      content: blocks[i],
      language: ext === 'py' ? 'python' : ext === 'ts' ? 'typescript' : ext,
      lines: blocks[i].split('\n').length,
    });
  }

  return files;
}

function inferFilename(stepName: string, index: number): string {
  const nameMap: Record<string, string[]> = {
    'Configuration & Setup': ['config.py'],
    'Database Models': ['models.py'],
    'Pydantic Schemas': ['schemas.py'],
    'Authentication System': ['auth.py'],
    'Business Logic Services': ['services.py'],
    'CRUD Routes': ['routes.py'],
    'Seed Data & Main': ['seed.py', 'main.py'],
  };
  return nameMap[stepName]?.[index] || `step_${index}.py`;
}

// Model resolution
interface ModelSet {
  reasoner: ModelConfig;
  coder: ModelConfig;
  fast: ModelConfig;
}

function getModels(): ModelSet {
  return {
    reasoner: {
      provider: 'ollama_cloud',
      model: 'deepseek-v3.2',
      description: 'DeepSeek V3.2 for reasoning (Ollama Cloud)',
      max_tokens: 16384,
      temperature: 0.2,
      estimated_speed: '20-50 TPS',
    },
    coder: {
      provider: 'ollama_cloud',
      model: 'qwen3-coder:480b',
      description: 'Qwen3-Coder 480B for code gen (Ollama Cloud)',
      max_tokens: 16384,
      temperature: 0.1,
      estimated_speed: '30-100 TPS',
    },
    fast: {
      provider: 'ollama_cloud',
      model: 'gpt-oss:120b',
      description: 'GPT-OSS 120B for fast tasks (Ollama Cloud)',
      max_tokens: 8192,
      temperature: 0.3,
      estimated_speed: '40-80 TPS',
    },
  };
}

// Main generation function
export async function generateFeature(
  spec: string,
  systemPrompt: string,
  env: EnvConfig,
  onProgress?: ProgressCallback,
): Promise<GenerationResult> {
  const plan = createBackendPlan(spec);
  const models = getModels();
  const stepResults: StepResult[] = [];
  const allFiles: ParsedFile[] = [];
  let totalTokens = 0;
  const startTime = Date.now();

  for (let i = 0; i < plan.length; i++) {
    const step = plan[i];
    onProgress?.(step.name, 'starting', step.description);

    // Build prompt with context from dependencies
    let prompt = step.prompt_template;
    for (const dep of step.depends_on) {
      const depResult = stepResults[dep];
      if (depResult) {
        prompt = prompt.replace(`{step_${dep}}`, () => depResult.content);
      }
    }

    // Select model
    const model = models[step.model_preference];

    try {
      const result = await callModel(
        { model, systemPrompt, userMessage: prompt, stream: false },
        env
      );

      stepResults.push({
        step_name: step.name,
        content: result.content,
        model_used: result.model,
        tokens_used: result.tokens_used,
        duration_ms: result.duration_ms,
      });

      totalTokens += result.tokens_used;

      // Extract files from this step
      const files = extractFiles(result.content, step.name);
      allFiles.push(...files);

      onProgress?.(step.name, 'complete', `${files.length} file(s), ${result.tokens_used} tokens`);
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      onProgress?.(step.name, 'error', errorMessage);

      stepResults.push({
        step_name: step.name,
        content: `// Error: ${errorMessage}`,
        model_used: model.model,
        tokens_used: 0,
        duration_ms: 0,
      });
    }
  }

  const totalLines = allFiles.reduce((sum, f) => sum + f.lines, 0);

  return {
    steps: stepResults,
    files: allFiles,
    total_lines: totalLines,
    total_tokens: totalTokens,
    total_duration_ms: Date.now() - startTime,
    validation: null,
    issues_found: 0,
    issues_fixed: 0,
  };
}

// Full pipeline: generate -> validate -> auto-fix loop
export async function generateAndValidate(
  spec: string,
  systemPrompt: string,
  env: EnvConfig,
  onProgress?: ProgressCallback,
  maxFixAttempts: number = 3,
): Promise<GenerationResult> {
  // Step 1: Generate
  const result = await generateFeature(spec, systemPrompt, env, onProgress);

  // Step 2: Concatenate all code for validation
  const allCode = result.files.map(f => `# === ${f.filename} ===\n${f.content}`).join('\n\n');

  // Step 3: Validate
  onProgress?.('Validation', 'starting', 'Running 16 automated checks...');
  const validation = validateGeneratedCode(allCode, 'python');
  result.validation = validation;
  result.issues_found = validation.issues.length;

  if (validation.passed && validation.issues.filter(i => i.severity !== 'low').length === 0) {
    onProgress?.('Validation', 'complete', `Score: ${validation.score}/100, ${validation.issues.length} issues`);
    return result;
  }

  onProgress?.('Validation', 'complete', `Score: ${validation.score}/100, ${validation.issues.length} issues found`);

  // Step 4: Auto-fix loop
  const fixableIssues = validation.issues.filter(i => i.auto_fixable);
  if (fixableIssues.length === 0) return result;

  const models = getModels();
  let fixedCode = allCode;
  let currentValidation = validation;

  for (let attempt = 0; attempt < maxFixAttempts; attempt++) {
    const currentFixable = currentValidation.issues.filter(i => i.auto_fixable);
    if (currentFixable.length === 0) break;

    onProgress?.('Auto-Fix', 'starting', `Attempt ${attempt + 1}/${maxFixAttempts}: fixing ${currentFixable.length} issues`);

    const fixPrompt = generateFixPrompt(fixedCode, currentFixable);

    try {
      const fixResult = await callModel(
        { model: models.coder, systemPrompt: 'You are a code fixer. Apply all requested fixes precisely.', userMessage: fixPrompt, stream: false },
        env
      );

      // Strip markdown fences if present, but preserve existing # === filename === headers
      // (the input to the fixer already contains section headers, so don't re-wrap)
      // Collect ALL fence blocks (LLM may return one per file)
      const fenceRegex = /```[a-zA-Z0-9_]*\s*\n([\s\S]*?)```/g;
      const fenceBlocks: string[] = [];
      let fenceMatch: RegExpExecArray | null;
      while ((fenceMatch = fenceRegex.exec(fixResult.content)) !== null) {
        fenceBlocks.push(fenceMatch[1].trim());
      }
      if (fenceBlocks.length > 0) {
        fixedCode = fenceBlocks.join('\n\n');
      } else {
        fixedCode = fixResult.content;
      }
      result.total_tokens += fixResult.tokens_used;

      // Re-validate
      currentValidation = validateGeneratedCode(fixedCode, 'python');

      if (currentValidation.issues.filter(i => i.auto_fixable).length === 0) {
        onProgress?.('Auto-Fix', 'complete', `All auto-fixable issues resolved. Score: ${currentValidation.score}/100`);
        break;
      }
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      onProgress?.('Auto-Fix', 'error', errorMessage);
      break;
    }
  }

  // Update result with fixed code — split on # === filename === headers
  // (extractFiles won't work here because fixedCode has no markdown fences)
  const fixedFiles: ParsedFile[] = [];
  const sectionRegex = /^# === (.+?) ===/gm;
  let sectionMatch: RegExpExecArray | null;
  const sectionStarts: { filename: string; start: number }[] = [];
  while ((sectionMatch = sectionRegex.exec(fixedCode)) !== null) {
    sectionStarts.push({ filename: sectionMatch[1], start: sectionMatch.index + sectionMatch[0].length });
  }
  if (sectionStarts.length > 0) {
    for (let i = 0; i < sectionStarts.length; i++) {
      const start = sectionStarts[i].start;
      const end = i + 1 < sectionStarts.length
        ? fixedCode.lastIndexOf('# ===', sectionStarts[i + 1].start - 1)
        : fixedCode.length;
      const content = fixedCode.slice(start, end).trim();
      const ext = sectionStarts[i].filename.split('.').pop() || 'py';
      fixedFiles.push({
        filename: sectionStarts[i].filename,
        content,
        language: ext === 'py' ? 'python' : ext === 'ts' ? 'typescript' : ext,
        lines: content.split('\n').length,
      });
    }
  } else {
    // Fallback: try extractFiles in case the fixer wrapped code in fences
    fixedFiles.push(...extractFiles(fixedCode, 'fixed_output'));
  }
  if (fixedFiles.length > 0) {
    result.files = fixedFiles;
    result.total_lines = fixedFiles.reduce((sum, f) => sum + f.lines, 0);
  }

  result.validation = currentValidation;
  result.issues_fixed = result.issues_found - currentValidation.issues.length;

  return result;
}
