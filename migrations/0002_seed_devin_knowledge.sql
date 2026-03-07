-- Seed Pablo's knowledge base with Devin's accumulated learnings
-- Source: Cross-session patterns from 111+ PRs of Pablo development
-- Run via: wrangler d1 execute pablo-db --file=./migrations/0002_seed_devin_knowledge.sql

-- ==========================================
-- CODE PATTERNS (8 entries)
-- ==========================================

INSERT OR IGNORE INTO patterns (id, type, trigger_text, action, confidence, usage_count, metadata, created_at)
VALUES
  ('devin-cp-001', 'code_pattern', 'React app with voice input',
   'Use Web Speech API: window.SpeechRecognition || window.webkitSpeechRecognition. Set continuous=false, interimResults=false, lang=en-US. Handle onresult, onerror, onend events.',
   0.95, 12, 'Voice-enabled React apps', datetime('now')),

  ('devin-cp-002', 'code_pattern', 'Text-to-speech output in browser',
   'Use window.speechSynthesis with SpeechSynthesisUtterance. Call speechSynthesis.speak(utterance). Add toggle state for enabling/disabling voice output.',
   0.95, 8, 'Browser TTS', datetime('now')),

  ('devin-cp-003', 'code_pattern', 'Vite React TypeScript project setup',
   'Use Vite scaffold with React+TS+Tailwind. Fix App.css: set max-width:none, width:100%, margin:0, padding:0, text-align:left. Use lucide-react for icons.',
   0.98, 25, 'Vite project setup', datetime('now')),

  ('devin-cp-004', 'code_pattern', 'Cloudflare Workers deployment',
   'Use wrangler.toml with compatibility_date. For D1: add [[d1_databases]] binding. Use Hono framework for Workers API. Deploy with wrangler deploy.',
   0.90, 15, 'CF Workers', datetime('now')),

  ('devin-cp-005', 'code_pattern', 'NextAuth on Cloudflare Workers',
   'Use lazy init pattern: export const { handlers, auth, signIn, signOut } = NextAuth(() => authConfig). Must use getCloudflareContext() for runtime env vars. Set trustHost=true.',
   0.95, 10, 'Auth on CF Workers', datetime('now')),

  ('devin-cp-006', 'code_pattern', 'Zustand store with D1 persistence',
   'Create hydrate() method that fetches from D1 API on mount. Use dedup by key when merging. Set hydrated flag to prevent double-fetch. Always handle D1 unavailability gracefully.',
   0.92, 9, 'Zustand + D1', datetime('now')),

  ('devin-cp-007', 'code_pattern', 'FAQ chatbot keyword matching',
   'Use regex word boundaries for greeting detection: new RegExp(`\\b${word}\\b`, "i"). For FAQ matching, use includes() on lowercased input against keyword arrays. Prevents "shipping" matching "hi".',
   0.97, 6, 'Chatbot NLP', datetime('now')),

  ('devin-cp-008', 'code_pattern', 'Prevent infinite re-render in React',
   'Never return new object/array references in Zustand selectors. Use shallow comparison or select individual primitives. Check useEffect deps for objects that recreate every render.',
   0.98, 18, 'React performance', datetime('now'));

-- ==========================================
-- ERROR FIXES (7 entries)
-- ==========================================

INSERT OR IGNORE INTO patterns (id, type, trigger_text, action, confidence, usage_count, metadata, created_at)
VALUES
  ('devin-ef-001', 'error_fix', 'Failed to resolve import lucide-react',
   'lucide-react must be in package.json dependencies. Run npm install lucide-react. For WebContainer/sandbox environments without npm, replace with inline SVG components or unicode emoji icons.',
   0.95, 5, 'Missing dependency', datetime('now')),

  ('devin-ef-002', 'error_fix', 'tsconfig.node.json missing in Vite project',
   'Create tsconfig.node.json with: {"compilerOptions":{"composite":true,"skipLibCheck":true,"module":"ESNext","moduleResolution":"bundler","allowSyntheticDefaultImports":true},"include":["vite.config.ts"]}',
   0.97, 4, 'Vite config', datetime('now')),

  ('devin-ef-003', 'error_fix', '500 error on all routes in Next.js on CF Workers',
   'Do NOT use NextAuth auth() wrapper in middleware on CF Workers. Use simple token check instead. AUTH_SECRET must be set as Worker secret via wrangler secret put, not in wrangler.toml.',
   0.96, 7, 'CF middleware', datetime('now')),

  ('devin-ef-004', 'error_fix', 'GitHub API 403 Forbidden',
   'Add User-Agent header to all GitHub API requests. GitHub rejects requests without User-Agent. Use: headers["User-Agent"] = "Pablo-IDE/1.0"',
   0.98, 11, 'GitHub API', datetime('now')),

  ('devin-ef-005', 'error_fix', 'Ollama streaming returns empty content',
   'Some models (qwen3) use thinking mode that wraps output in <think> tags. Filter thinking tokens from stream. If content is empty after filtering, switch to non-thinking model like devstral-2:123b.',
   0.93, 14, 'LLM streaming', datetime('now')),

  ('devin-ef-006', 'error_fix', 'Pipeline stuck on plan stage',
   'Check: 1) Ollama URL is correct (ollama.com/api, NOT api.ollama.ai/v1 which is dead). 2) Prompt enhancer timeout (use Promise.race with 10s). 3) Server-side timeout must match client (15min). 4) Model exists on Ollama Cloud.',
   0.96, 20, 'Pipeline debugging', datetime('now')),

  ('devin-ef-007', 'error_fix', 'D1 migration fails with exec()',
   'Use prepare(sql).run() instead of exec(sql) for D1 migrations. exec() has limitations on Cloudflare Workers. Split multi-statement SQL into individual prepare().run() calls.',
   0.97, 6, 'D1 migration', datetime('now'));

-- ==========================================
-- ARCHITECTURE PATTERNS (4 entries)
-- ==========================================

INSERT OR IGNORE INTO patterns (id, type, trigger_text, action, confidence, usage_count, metadata, created_at)
VALUES
  ('devin-ar-001', 'architecture', 'AI-powered IDE pipeline design',
   'Use multi-agent pipeline: Plan > Database > Backend > Frontend > Tests > UX Validation > Review > Deploy. Each stage gets focused prompt with tech stack context. Use SSE streaming for real-time progress. Include enterprise audit stage for production apps.',
   0.90, 8, 'IDE architecture', datetime('now')),

  ('devin-ar-002', 'architecture', 'Session persistence design',
   'Store session snapshots in D1 with: messages, generated files, active workspace tab, pipeline state, chat history. Restore on login by loading last active session. Auto-save on pipeline complete and tab switch. Use snapshot versioning for rollback.',
   0.94, 12, 'Session management', datetime('now')),

  ('devin-ar-003', 'architecture', 'LLM model routing strategy',
   'Use model router with fallback chain: fast models (32b) for planning/enhancing, medium models (70-123b) for code generation, large models (400b+) for complex reasoning. Always have 2-deep fallback. Monitor token costs per stage.',
   0.88, 10, 'LLM routing', datetime('now')),

  ('devin-ar-004', 'architecture', 'Preview system for generated code',
   'Three-layer preview: 1) WebContainers for full Node.js runtime (best, requires COOP/COEP headers), 2) Pyodide for Python WASM, 3) srcDoc iframe for simple HTML/CSS/JS. Fallback gracefully between layers. Auto-detect tech stack to choose layer.',
   0.85, 7, 'Preview system', datetime('now'));

-- ==========================================
-- CONVENTIONS (3 entries)
-- ==========================================

INSERT OR IGNORE INTO patterns (id, type, trigger_text, action, confidence, usage_count, metadata, created_at)
VALUES
  ('devin-cv-001', 'convention', 'Git branch naming for PRs',
   'Use format: devin/{timestamp}-{descriptive-slug}. Example: devin/1709856000-fix-session-persistence. Never force push. Prefer merge over rebase to preserve history.',
   0.98, 30, 'Git conventions', datetime('now')),

  ('devin-cv-002', 'convention', 'Cloudflare environment variables',
   'Set secrets via wrangler secret put (never in wrangler.toml). In code, use getCloudflareContext().env for runtime access. Never hardcode secrets. Use .dev.vars for local dev. Empty string in wrangler.toml overrides Worker secrets.',
   0.95, 15, 'CF env vars', datetime('now')),

  ('devin-cv-003', 'convention', 'API route error handling pattern',
   'Always wrap in try/catch. Return proper HTTP status codes (400 for bad input, 401 for unauth, 403 for forbidden, 500 for internal). Log errors with route context: console.error("[METHOD /api/route]", err). Return JSON error objects.',
   0.93, 20, 'API conventions', datetime('now'));

-- ==========================================
-- SHORTCUTS (2 entries)
-- ==========================================

INSERT OR IGNORE INTO patterns (id, type, trigger_text, action, confidence, usage_count, metadata, created_at)
VALUES
  ('devin-sc-001', 'shortcut', 'Quick React app with zero external dependencies',
   'Use unicode emoji for icons instead of lucide-react (avoids npm install). Use inline CSS styles object instead of Tailwind (avoids PostCSS config). Import only from react. Works in any sandbox/WebContainer.',
   0.92, 5, 'Minimal React', datetime('now')),

  ('devin-sc-002', 'shortcut', 'Debug Cloudflare Workers issues quickly',
   'Check wrangler tail for live logs. Hit /api/health endpoint for quick status. Verify wrangler.toml vars dont override Worker secrets (empty string overrides). Check compatibility_date for API availability.',
   0.90, 8, 'CF debugging', datetime('now'));

-- ==========================================
-- DOMAIN KNOWLEDGE BASE (12 entries)
-- ==========================================

INSERT OR IGNORE INTO domain_kb (id, category, title, content, tags, source, confidence, created_at, updated_at)
VALUES
  ('devin-kb-001', 'framework', 'Ollama Cloud API',
   'Base URL: ollama.com/api (NOT api.ollama.ai/v1 which is dead). Supports /chat endpoint with streaming. Models: devstral-2:123b (fast code), gpt-oss:20b (chat), qwen3-next:80b (reasoning but has thinking mode issues). No API key needed for public models.',
   'ollama,llm,api', 'devin-session-learnings', 0.95, datetime('now'), datetime('now')),

  ('devin-kb-002', 'framework', 'NextAuth v5 on Cloudflare Workers',
   'Must use lazy initialization pattern. Cannot use auth() in middleware (causes 500). Set trustHost=true for reverse proxy. AUTH_SECRET must be Worker secret (not env var in wrangler.toml). GitHub OAuth works but needs proper callback URL.',
   'nextauth,auth,cloudflare', 'devin-session-learnings', 0.95, datetime('now'), datetime('now')),

  ('devin-kb-003', 'framework', 'Cloudflare D1 Database',
   'SQLite-compatible. Use prepare().run() for migrations (not exec()). Supports RETURNING clause. Has 1MB query size limit. Use batch() for multiple operations. Self-healing schema: check table existence and auto-migrate on first use.',
   'd1,database,cloudflare,sqlite', 'devin-session-learnings', 0.94, datetime('now'), datetime('now')),

  ('devin-kb-004', 'framework', 'Vite + React + TypeScript Stack',
   'Scaffold with create_react_app. Fix App.css max-width for full-width apps. Use lucide-react for icons. Use shadcn/ui for pre-built components. Tailwind CSS for styling (no arbitrary values). Build with npm run build, output in dist/.',
   'vite,react,typescript,tailwind', 'devin-session-learnings', 0.98, datetime('now'), datetime('now')),

  ('devin-kb-005', 'pattern', 'WebContainer Preview System',
   'WebContainers require COOP/COEP headers (Cross-Origin-Opener-Policy, Cross-Origin-Embedder-Policy). Preview iframe may appear blank if headers not set. Fallback to srcDoc iframe for environments without proper headers. Dev server runs on localhost:5173 inside WebContainer.',
   'webcontainer,preview,iframe', 'devin-session-learnings', 0.85, datetime('now'), datetime('now')),

  ('devin-kb-006', 'pattern', 'Zustand State Management',
   'Use create() with typed state interface. Avoid returning new references in selectors (causes infinite re-render). Use shallow comparison for object selectors. Implement hydrate() for D1 persistence. Clear stores on session switch to prevent data leaking.',
   'zustand,state,react', 'devin-session-learnings', 0.92, datetime('now'), datetime('now')),

  ('devin-kb-007', 'pattern', 'LLM Streaming with SSE',
   'Use EventSource or fetch with ReadableStream. Parse chunks for content field. Handle thinking tokens from reasoning models (filter <think> tags). Implement Promise.race timeout for first-token wait. Exponential backoff for retries.',
   'llm,streaming,sse', 'devin-session-learnings', 0.90, datetime('now'), datetime('now')),

  ('devin-kb-008', 'convention', 'Pablo Pipeline Stages',
   'Plan > Database > Backend (API) > Frontend (UI) > Tests > UX Validation > Review > Enterprise > Deploy. Each stage uses focused prompt with tech stack from plan. Stages can fail gracefully. Progress shown via SSE events.',
   'pipeline,stages,pablo', 'devin-session-learnings', 0.90, datetime('now'), datetime('now')),

  ('devin-kb-009', 'api', 'GitHub API Integration',
   'Always include User-Agent header (403 without it). Use Octokit or raw fetch. Rate limit: 5000 req/hr with token. For file operations: use GET /repos/:owner/:repo/contents/:path, PUT for create/update with base64 content. Handle 404 gracefully for new repos.',
   'github,api,rest', 'devin-session-learnings', 0.95, datetime('now'), datetime('now')),

  ('devin-kb-010', 'config', 'Cloudflare Pages Deployment',
   'Use Direct Upload API for Pablo deploy: POST /accounts/:id/pages/projects/:project/deployments with FormData. Set Content-Type to multipart/form-data. Include all files with correct paths. Bearer token required. Custom domains via CNAME to pages.dev.',
   'cloudflare,pages,deploy', 'devin-session-learnings', 0.90, datetime('now'), datetime('now')),

  ('devin-kb-011', 'pattern', 'Session Persistence Architecture',
   'Store in D1: session metadata, messages, files, pipeline runs, workspace tab state. Snapshot on: pipeline complete, tab switch, manual save. Restore on: session click in sidebar. Auto-save indicator in status bar. Clear all stores on session create/switch to prevent data bleed.',
   'session,persistence,d1', 'devin-session-learnings', 0.94, datetime('now'), datetime('now')),

  ('devin-kb-012', 'pattern', 'Web Speech API Integration',
   'SpeechRecognition for input: check window.SpeechRecognition || window.webkitSpeechRecognition. Set lang, continuous, interimResults. Handle onresult (get transcript), onerror, onend. SpeechSynthesis for output: new SpeechSynthesisUtterance(text), speechSynthesis.speak().',
   'speech,voice,browser', 'devin-session-learnings', 0.95, datetime('now'), datetime('now'));
