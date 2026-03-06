# Testing Pablo IDE

## Overview
Pablo is an AI-powered IDE deployed on Cloudflare Workers via OpenNext. It uses Next.js 16, NextAuth v5 for GitHub OAuth, D1 for persistence, and Ollama Cloud for AI code generation.

## Production URL
- **App**: https://pablo.vantax.co.za
- **Login page**: https://pablo.vantax.co.za/login
- **New session**: https://pablo.vantax.co.za/session/new (redirects to login if unauthenticated)
- **Chat info endpoint**: https://pablo.vantax.co.za/api/chat (GET returns current model config)

## Devin Secrets Needed
- `CLOUDFLARE_API_KEY` -- Cloudflare Global API key for wrangler tail/deploy
- `CLOUDFLARE_EMAIL` -- Cloudflare account email (reshigan@vantax.co.za)
- GitHub OAuth credentials are configured as Cloudflare Worker secrets (not needed by Devin directly)
- `OLLAMA_API_KEY` -- Ollama Cloud API key (configured as Worker secret, not available in local env)

## Architecture Notes

### Middleware (Critical)
- **File**: `middleware.ts`
- The middleware CANNOT use NextAuth's `auth()` wrapper -- it's incompatible with OpenNext Cloudflare Edge runtime
- Turbopack evaluates the `auth()` lazy-init callback eagerly at module-init time, causing the bundled middleware to fail to export a callable function
- The middleware uses cookie-based session checking instead (`authjs.session-token` / `__Secure-authjs.session-token`)
- If you see "The Middleware file must export a function named middleware" error, it means someone re-introduced the `auth()` wrapper
- Actual JWT validation happens server-side in API routes, not in middleware

### Cloudflare Worker Secrets vs Vars
- `vars` in wrangler.jsonc are available at module-init time via `process.env`
- `secrets` (AUTH_SECRET, GITHUB_CLIENT_ID, etc.) are only available at request-time
- Never throw errors based on missing secrets during module initialization -- use console.warn instead

### AI Model Stack
- Pablo uses **Ollama Cloud** (ollama.com/api) as the AI backend
- Models may change over time as Ollama Cloud rotates availability
- The current model stack is defined in `lib/agents/modelRouter.ts` (MODELS constant)
- The chat route (`app/api/chat/route.ts`) has a `MODEL_ALIASES` map that remaps legacy model names to current ones
- The `/api/chat` GET endpoint returns the current model configuration (version, engine, models object)
- **Key files for model references**: modelRouter.ts, chat/route.ts, agent/route.ts, all specialist agents in `lib/agents/specialists/`, ChatPanel.tsx, StatusBar.tsx, Terminal.tsx, MetricsPanel.tsx

## Testing Procedures

### 1. Verify Middleware (After Any Middleware Changes)
```bash
# Should return 307 redirect to /login (NOT 500)
curl -s -w "HTTP_CODE:%{http_code}" -o /dev/null https://pablo.vantax.co.za/session/new

# Should return 401 with JSON {"error":"Unauthorized"}
curl -s https://pablo.vantax.co.za/api/sessions

# Should return 200 with login page HTML
curl -s -w "HTTP_CODE:%{http_code}" -o /dev/null https://pablo.vantax.co.za/login
```

### 2. Verify AI Models (After Model Name Changes)
1. **Check `/api/chat` info endpoint**: `GET https://pablo.vantax.co.za/api/chat` -- returns JSON with `models` object showing current reasoning, code_generation, and fast_chat model names
2. **Send a chat message**: Login to Pablo, switch to Chat mode, type a simple question like "What is 2+2?". Verify the AI responds with streaming text. The response bubble shows the model name used, token count, and cost.
3. **Check StatusBar**: Hover over the bottom status bar -- the expanded detail row shows the current model name
4. **Check Terminal welcome**: Click Terminal tab -- the welcome banner may list available models
5. **Note**: The OLLAMA_API_KEY is only available as a Cloudflare Worker secret, not in local env. You cannot directly call the Ollama Cloud API from your machine. Testing must be done through the production site or wrangler dev.

### 3. Local Testing with Wrangler Dev
```bash
npx @opennextjs/cloudflare build
npx wrangler dev --port 8788
# Then test the same endpoints on localhost:8788
```

### 4. Viewing Worker Logs
```bash
npx wrangler tail pablo --format json
# Then make requests in another terminal and observe the logs
# IMPORTANT: Kill wrangler tail before running curl tests -- it pollutes stdout
```

### 5. Git Workflow Testing (Through Pablo Frontend)
1. Navigate to https://pablo.vantax.co.za and login with GitHub
2. Select a repo from the file explorer sidebar
3. Click the Git icon (source control) in the left sidebar
4. **Create repo**: Click "Create New Repository" at the bottom of Git panel
5. **Create branch**: Click the branch name dropdown -> type new branch name -> click "+ Create"
6. **Edit a file**: Click a file in file explorer -> edit in Monaco editor
7. **Commit**: In Git panel, type commit message -> click "Commit & Push"
8. **Create PR**: Expand "Create Pull Request" -> fill title/description -> click "Create Pull Request"
9. **Merge**: PR opens on GitHub in new tab -> merge there (Pablo doesn't have merge UI)

### 6. AI Pipeline Testing
- The Feature Factory pipeline requires Ollama Cloud API key configured as a Worker secret
- If you see "No AI backend available" or "Stream error: no_backend", the OLLAMA_URL and OLLAMA_API_KEY Worker secrets may need to be reconfigured
- Pipeline has 8 stages: Plan -> Database -> API -> UI -> UX Validation -> Tests -> Execute -> Review
- Each stage timeout varies by model size; check `PipelineView.tsx` for current STAGE_TIMEOUT_MS
- The routing table in `modelRouter.ts` determines which model handles each task type, with fallback to a different model for resilience

## Known Issues & Workarounds
- **Middleware + NextAuth**: Never use `auth()` as middleware wrapper -- always use plain `NextRequest` middleware with cookie checks
- **Pipeline timeouts**: Large models can be slow; stage timeouts should match the model's expected response time
- **Wrangler tail + curl**: Running `wrangler tail` in the same shell as `curl` commands will mix JSON log output with curl results -- always kill tail processes before running curl verification
- **Deploy propagation**: After merging a PR, Cloudflare Pages deployment may take 60-120 seconds to propagate. If you see stale 500 errors, wait and retry.
- **Session switching**: To test with a different repo, you may need to create a new session -- the current session is tied to the initially selected repo
- **Model name changes**: Ollama Cloud periodically rotates available models. If the pipeline or chat stops working, check `ollama.com/api/tags` (requires auth) or send a test chat message to see which model responds. The `MODEL_ALIASES` map in `chat/route.ts` provides backward compatibility for legacy model names.
- **Stale model references**: Model names appear in many files across UI, stores, agents, and API routes. When updating model names, use grep to find all occurrences -- they exist in string literals, description text, speed estimates, and routing tables. Check specialist agents in `lib/agents/specialists/` which each have their own `model`, `description`, and `estimated_speed` fields.
