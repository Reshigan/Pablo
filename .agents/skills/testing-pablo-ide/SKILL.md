# Testing Pablo IDE Locally

## Prerequisites
- Node.js 22+
- `.env.local` file with required env vars (copy from `.env.example`)

## Devin Secrets Needed
- `OLLAMA_API_KEY` — Ollama Cloud API key for LLM calls
- `GITHUB_CLIENT_ID` / `GITHUB_CLIENT_SECRET` — GitHub OAuth App credentials (only needed for production OAuth testing)
- `AUTH_SECRET` — NextAuth secret (auto-generated fallback in dev mode)
- `CLOUDFLARE_API_TOKEN` — Only needed for deploy testing

## Local Dev Login (Bypassing GitHub OAuth)

The GitHub OAuth App callback URL is locked to `https://pablo.vantax.co.za`, so OAuth won't work on localhost. A dev-mode Credentials provider is available instead:

1. Run `npm run dev` to start the local server at `http://localhost:3000`
2. Navigate to `http://localhost:3000/login`
3. Click the **"Dev Login (localhost only)"** button below the GitHub button
4. Enter any email (default: `dev@localhost`) and click **"Sign in as Dev User"**
5. You'll be redirected to a new session page

### Known Limitations of Dev Login
- **No GitHub access token**: The Files panel will show "Not authenticated. Please sign in with GitHub" because the dev session has no `accessToken`. Features requiring GitHub API access (repo browsing, file fetch, commits, PRs) will not work.
- **Shared user ID**: All dev logins use `dev-user-1` regardless of email. Session data may be shared across dev logins.
- **Dev login is NOT available in production**: The Credentials provider only registers when `NODE_ENV=development`, and the button only renders when `hostname === 'localhost'`.

## Testing the Pipeline / Build Feature

The pipeline requires an Ollama Cloud API key. Ensure `OLLAMA_API_KEY` is set in `.env.local`.

1. Log in via dev login
2. In the hero prompt, type a feature description (e.g., "Build a todo app with React")
3. Click **"Generate"** to start the 8-stage pipeline
4. Monitor stages in the pipeline output panel
5. After completion, the **Production Readiness Card** should appear showing a score

## Testing Production Readiness Score Engine

You can test the scoring engine directly without running the full pipeline:

```bash
# From the Pablo repo root:
npx tsx test-readiness-quick.ts
```

Or import and call `quickReadinessCheck()` from `lib/agents/productionReadiness.ts` with sample file data.

## Testing on Production

Production URL: `https://pablo.vantax.co.za`
- Uses GitHub OAuth (works with the production callback URL)
- Full GitHub integration (repos, files, commits)
- Ollama Cloud API key must be set in Cloudflare Worker secrets

## Common Issues

- **"Invalid Redirect URI" on GitHub OAuth locally**: This is expected. Use the Dev Login instead.
- **Pipeline stalls**: Check that `OLLAMA_URL` is set to `https://ollama.com` (not `api.ollama.ai` or `api.pawan.krd`)
- **500 errors after deploy**: Check Cloudflare Worker logs; often caused by missing secrets (AUTH_SECRET, GITHUB_CLIENT_ID, etc.)
- **Hydration mismatches**: The `isLocalhost` check uses `typeof window !== 'undefined'` which may cause SSR/client mismatch warnings — these are cosmetic only.
