/**
 * stagePrompts.ts — Pure data module containing all 8+ stage prompt templates.
 * Extracted from PipelineView.tsx (Task 28). No JSX, no React dependencies.
 */

import type { PipelineStage, TechStackHint } from '@/stores/pipeline';
import { useEditorStore } from '@/stores/editor';

/** Max chars kept per previous-stage summary to prevent prompt bloat */
export const MAX_PREV_OUTPUT_CHARS = 4000;

/** Stage-specific instruction templates (pure data) */
export const STAGE_INSTRUCTIONS: Record<PipelineStage, string> = {
  plan: `Create a concise implementation plan for the requested feature.
1. Recommend the optimal tech stack (see instructions above).
2. List ALL files to create with their full paths and purpose.
3. For each file, note which framework/library from the stack it uses.
4. Include key architecture decisions (state management, routing, API structure, auth approach).
5. Do NOT write code yet — only the plan.`,

  db: `Generate the database schema and models using the tech stack's database and ORM.
- Match the ORM to the stack (e.g. Drizzle for D1/SQLite, Prisma for PostgreSQL, SQLAlchemy for Python, Mongoose for MongoDB).
- ALL models MUST have: id (primary key), createdAt/created_at, updatedAt/updated_at, isActive/is_active.
- Include all relationships, indexes, and constraints.
- Include migration files if applicable.
- For Cloudflare D1: output Drizzle schema + SQL migration files.
- For PostgreSQL: output Prisma schema or Drizzle schema.
- For MongoDB: output Mongoose models or schema definitions.
- Output complete, runnable code files.`,

  api: `Generate the API routes and business logic using the tech stack's backend framework.
- For Cloudflare Workers + Hono: use Hono router with typed routes, D1 bindings, R2 bindings if needed.
- For Node.js + Express: use Express router with TypeScript, middleware chain.
- For Python + FastAPI: use FastAPI router with Pydantic models.
- For any backend: include authentication endpoints (register, login, refresh token), input validation, error handling, CORS config.
- Output complete, runnable code files.`,

  ui: `Generate the frontend UI components and pages using the tech stack's frontend framework.
- Wire ALL buttons, forms, and links to real handlers — NO placeholder onClick, NO TODO comments.
- Include proper loading states, error states, and empty states for every view.
- Use fetch() or an HTTP client to call the API endpoints from the previous stage.
- Include responsive design (mobile, tablet, desktop).
- Every component must be a complete, working file.
- Output complete, runnable code files.`,

  ux_validation: `Perform a thorough UI/UX validation of ALL generated code from previous stages.
Check and report on:
1. **Wiring completeness**: Every button, form, and link must connect to a real handler/API call. Flag any placeholder onClick, TODO handlers, or console.log stubs.
2. **State management**: All UI state (loading, error, success, empty) must be handled.
3. **Accessibility**: aria-labels, keyboard navigation, focus management.
4. **Responsive design**: Mobile/tablet/desktop layouts.
5. **Error handling**: Every API call must have try/catch with user-visible error feedback.
6. **Cross-stage consistency**: API endpoints match what UI calls, DB schema matches models, imports resolve.
For each FAIL, provide the exact code fix as a complete corrected file.`,

  tests: `Generate unit and integration tests using the test framework appropriate for the stack.
- Node.js/TypeScript: Vitest or Jest + supertest for API tests.
- Python: pytest + pytest-asyncio + httpx AsyncClient for API tests.
- Go: Go testing package + httptest.
- Test happy paths, error cases, and edge cases.
- Output complete, runnable test files.`,

  execute: `Generate all remaining configuration and setup files for the chosen infrastructure.
- For Cloudflare Workers: wrangler.toml, D1 migrations, R2 bucket config, package.json, tsconfig.json.
- For Vercel/Netlify: vercel.json or netlify.toml, package.json, tsconfig.json.
- For Docker: Dockerfile, docker-compose.yml, .dockerignore.
- For all: .env.example, README.md with setup + deploy instructions, seed data script.
- Output complete files.`,

  review: `Review ALL previous stage outputs for:
- Bugs, logic errors, and missing features from the original request.
- Security issues (hardcoded secrets, missing auth checks, injection vulnerabilities).
- Cross-stage consistency (API endpoints match UI calls, DB schema matches models, imports resolve).
- Tech stack compliance (all code uses the chosen stack, no accidental language switches).
- Code quality (naming, structure, duplication).
List each issue with severity (critical/warning/info) and a specific fix.`,

  analyze: `Analyze the existing codebase to understand the current architecture, dependencies, and patterns.
- Identify relevant files and modules that relate to the requested change.
- Map the dependency graph for affected components.
- Note any existing patterns, conventions, or constraints.
- Summarize what needs to change and where.`,

  fix: `Apply targeted fixes to the identified issues.
- Use diff-based edits (minimal changes) rather than full file replacement.
- Preserve existing code style and conventions.
- Fix only what is broken — do not refactor unrelated code.
- Output the corrected files with clear before/after context.`,

  implement: `Implement the requested feature or change incrementally.
- Build on the existing codebase — do not rewrite working code.
- Follow existing patterns for routing, state management, and styling.
- Wire all new UI to real handlers and API calls.
- Include proper error handling and loading states.
- Output complete, runnable code files.`,

  enterprise: `Perform a mandatory enterprise production-readiness review of
ALL generated code from previous stages. This stage has zero tolerance for
missing enterprise patterns.

## SECTION 1 — Observability Audit
Check every backend service/route file. For each file report PASS or FAIL:
- [ ] /health endpoint present and returns dependency status
- [ ] Structured logging (not raw console.log) on all routes
- [ ] Request ID (UUID) generated per request and returned in X-Request-ID header
- [ ] Request duration (ms) logged on every route completion
- [ ] Global error handler catches and logs unhandled errors with stack trace

## SECTION 2 — API Versioning Audit
- [ ] All API routes are prefixed with /api/v1/ (not just /api/)
- [ ] Version header (API-Version: 1.0) returned on all responses
- [ ] If breaking changes exist across stages, a /api/v2/ path is introduced
     rather than modifying /api/v1/

## SECTION 3 — Multi-Environment Config Audit
- [ ] .env.example covers: development, staging, production variables
- [ ] No hardcoded environment-specific values (URLs, ports, credentials)
- [ ] Database connection strings use environment variables
- [ ] CORS origins use environment variables (not hardcoded domains)
- [ ] Log level is controlled by environment variable (LOG_LEVEL=info/debug/error)

## SECTION 4 — Database Migration Safety Audit
- [ ] All schema changes use migrations (not raw ALTER TABLE in app code)
- [ ] Migrations are additive where possible (add columns, do not rename or drop)
- [ ] Any column removal has a two-phase approach:
     Phase 1: mark deprecated, stop writing to it
     Phase 2: drop in a subsequent migration
- [ ] All migrations have a rollback (DOWN migration) defined
- [ ] No migration truncates or destroys existing data without explicit warning

## SECTION 5 — Test Quality Audit
- [ ] Tests cover happy path for every endpoint
- [ ] Tests cover at least 2 error cases per endpoint (invalid input, auth failure)
- [ ] Tests cover at least 1 edge case per endpoint (empty list, max values)
- [ ] Test file names match source file names (auth.test.ts for auth.ts)
- [ ] No test uses hardcoded test data that would fail in a different timezone

## SECTION 6 — Compliance Audit (context-dependent)
Apply ONLY the checks relevant to the user's stated domain:
- If POPIA applies: personal data fields are flagged, consent tracking exists,
  PII is masked in logs
- If financial data: amounts stored as integers (cents), never floats
- If medical/health data: audit trail on every record change exists
- If multi-tenant: every query includes tenant/company_id filter

## OUTPUT FORMAT
For each section list every item as PASS, FAIL, or N/A.
For every FAIL: output the complete corrected file(s) as markdown code blocks.
Do not output partial fixes — every corrected file must be complete and runnable.
Summary line at end: X/Y checks passed. Z files corrected.`,
};

/**
 * Truncate a stage output to keep prompts manageable.
 * Keeps the first portion and a tail so the model sees both start and end.
 */
export function truncateOutput(text: string, maxChars: number): string {
  if (text.length <= maxChars) return text;
  const half = Math.floor(maxChars / 2);
  return text.slice(0, half) + '\n\n... (truncated) ...\n\n' + text.slice(-half);
}

/**
 * Build a focused prompt for each pipeline stage.
 *  - Plan stage: asks LLM to recommend the optimal tech stack
 *  - All other stages: receive the resolved tech stack as a mandatory constraint
 */
export function buildStagePrompt(
  featureDescription: string,
  stage: { id: PipelineStage; label: string; description: string },
  previousOutputs: string[],
  techStack?: TechStackHint,
  explicitHints?: Partial<TechStackHint>,
): string {
  const trimmedPrevious = previousOutputs.map((o) => truncateOutput(o, MAX_PREV_OUTPUT_CHARS));

  // For Plan stage: ask LLM to recommend a stack
  // For all other stages: inject the resolved stack as mandatory
  let stackBlock = '';
  if (stage.id === 'plan') {
    const userConstraints = explicitHints && Object.keys(explicitHints).length > 0
      ? `\nThe user has explicitly requested these technologies (you MUST use them):\n${Object.entries(explicitHints).map(([k, v]) => `  - ${k}: ${v}`).join('\n')}\nFill in anything they didn't specify with your best recommendation.\n`
      : '\nThe user did not specify a tech stack. Recommend the best one for this project.\n';

    stackBlock = `
## Tech Stack Recommendation (REQUIRED in your output)

${userConstraints}
Evaluate the project requirements and recommend the optimal tech stack. Consider ALL of these options:

**Frontend:** React, Vue, Svelte, Angular, SolidJS, HTMX, plain HTML — pick what fits the complexity.
**Backend:** Cloudflare Workers + Hono, Node.js + Express, Node.js + NestJS, Python + FastAPI, Python + Django, Go, Rust + Axum, Java + Spring Boot, .NET — pick what fits the scale and deployment target.
**Database:** Cloudflare D1 (SQLite, edge), PostgreSQL (via Neon/Supabase/self-hosted), MySQL (PlanetScale), MongoDB, SQLite, DynamoDB, Firebase, Turso (libSQL), Redis — pick what fits the data model.
**ORM:** Drizzle, Prisma, TypeORM, SQLAlchemy, Django ORM, Mongoose — pick what matches the backend.
**Storage:** Cloudflare R2, AWS S3, Google Cloud Storage, MinIO, Azure Blob — only if the project needs file/object storage.
**Infrastructure:** Cloudflare Workers, Cloudflare Pages, Vercel, Netlify, AWS Lambda, Docker, Fly.io, Railway, Render — pick what fits the backend choice.

Your output MUST include this exact structure (the pipeline parses it):

## Recommended Tech Stack
- Frontend: [your choice + reasoning in parentheses]
- Backend: [your choice + reasoning]
- Database: [your choice + reasoning]
- Storage: [your choice, or "none" if not needed]
- Infrastructure: [your choice + reasoning]
`;
  } else if (techStack && techStack.fullLabel) {
    stackBlock = `
## Tech Stack (MANDATORY — use ONLY these technologies)
- Frontend: ${techStack.frontend}
- Backend: ${techStack.backend}
- Database: ${techStack.database}
- Storage: ${techStack.storage}
- Infrastructure: ${techStack.infra}

Do NOT use any other framework, language, or library. Do NOT switch languages. Every file you output must use the stack above.
`;
  }

  // Feature 11: Inject .pablo project rules if present
  let pabloRulesBlock = '';
  try {
    const pabloTab = useEditorStore.getState().tabs.find((t) => t.path === '.pablo' || t.path.endsWith('/.pablo'));
    if (pabloTab?.content) {
      pabloRulesBlock = `\n## Project Rules (.pablo)\nThe following project-specific rules MUST be followed:\n${pabloTab.content}\n`;
    }
  } catch {
    // Non-blocking — .pablo rules are optional
  }

  const parts = [
    `Feature: ${featureDescription}`,
    stackBlock,
    pabloRulesBlock,
    `\nYour task (${stage.label}): ${STAGE_INSTRUCTIONS[stage.id]}`,
    '\nOutput format: For any code, respond with markdown code blocks that include filenames with full paths (e.g. ```tsx src/components/Dashboard.tsx).',
  ];

  // Feature 6: Add vision instructions when images are attached
  if (featureDescription.includes('[Image attached as base64 data')) {
    if (stage.id === 'plan') {
      parts.push('\n## Image-to-Code Instructions\nAn image/screenshot has been attached. Analyze the visual layout, colors, typography, spacing, and component structure. Your plan should describe what you see and map each visual element to UI components.');
    } else if (stage.id === 'ui') {
      parts.push('\n## Image-to-Code Instructions\nRecreate the attached image/screenshot as faithfully as possible. Match colors, spacing, layout, typography, and component hierarchy. Use the tech stack specified above.');
    }
  }

  if (trimmedPrevious.length > 0) {
    parts.push(`\nContext from previous stages:\n${trimmedPrevious.join('\n---\n')}`);
  }

  return parts.join('\n');
}
