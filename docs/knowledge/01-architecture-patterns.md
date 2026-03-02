# Architecture Patterns — Comprehensive Devin LLM Knowledge Base

> This document captures ALL architectural patterns, infrastructure configurations, and deployment
> strategies learned across hundreds of projects spanning web apps, mobile, AI/ML, DevOps, and more.
> Intended as training data for Pablo's AI adapters.

---

## 1. Cloudflare Workers Architecture

### OpenNext + Next.js on Cloudflare Workers
- `@opennextjs/cloudflare` compiles Next.js into a Cloudflare Worker
- Build: `npx @opennextjs/cloudflare build` → `.open-next/worker.js` + `.open-next/assets/`
- Deploy: `npx wrangler deploy`
- Config: `wrangler.jsonc` with `main`, `assets`, `compatibility_flags: ["nodejs_compat"]`
- **Critical**: Pages CANNOT serve OpenNext output. Must use Workers + wrangler deploy.
- **Runtime env vars**: Must be set as Worker secrets, not just build-time env vars.
- NextAuth v5 needs `AUTH_SECRET` at runtime — add as Worker secret.

### Cloudflare D1 (Distributed SQLite)
- Edge-distributed SQLite database
- Access via `c.env.DB` in Workers
- Migrations: `wrangler d1 migrations create/apply`
- All queries must include `WHERE companyId = ?` for multi-tenancy
- Supports FTS5 for full-text search
- Read replicas for global performance
- Use prepared statements: `c.env.DB.prepare("SELECT * FROM x WHERE id = ?").bind(id).first()`

### Cloudflare R2 (Object Storage)
- S3-compatible object storage
- Access via `c.env.STORAGE` or `c.env.BUCKET` in Workers
- Direct client uploads with presigned URLs
- Use SHA256-based deduplication for files
- Content-Type must be set explicitly on upload

### Cloudflare KV (Key-Value Store)
- Eventually consistent key-value storage
- Good for: session data, caching, feature flags, rate limiting counters
- Access via `c.env.KV` in Workers
- TTL support for auto-expiring entries
- Max value size: 25MB, max key size: 512 bytes

### Cloudflare Workers AI
- Run AI models at the edge with zero cold start
- Models: Llama 3.1 8B (chat), Whisper (transcription), DistilBERT (classification)
- Access: `c.env.AI.run('@cf/meta/llama-3.1-8b-instruct', { messages })`
- Emotion classification: `@cf/huggingface/distilbert-base-uncased-emotion`
- Use for: intent classification, field extraction, content categorization

### Hono Framework (for Workers)
- Lightweight web framework optimized for edge computing
- Syntax: `const app = new Hono<AppEnv>()`, `app.get('/path', async (c) => { ... })`
- Middleware: `app.use('*', authMiddleware)`
- Route grouping: `app.route('/api/memories', memoriesRoutes)`
- Context object `c`: `c.env` (bindings), `c.req` (request), `c.json()` (response)
- Export default: `export default app`

### Durable Objects (Rate Limiting)
- Stateful objects at the edge
- Use for: rate limiting, counters, WebSocket coordination
- Binding: `RATE_LIMITER` in wrangler config
- IP-based request throttling pattern

### wrangler.jsonc Template
```jsonc
{
  "$schema": "node_modules/wrangler/config-schema.json",
  "main": ".open-next/worker.js",
  "name": "my-app",
  "compatibility_date": "2025-12-01",
  "compatibility_flags": ["nodejs_compat"],
  "assets": {
    "directory": ".open-next/assets",
    "binding": "ASSETS"
  },
  "vars": {
    "ENVIRONMENT": "production"
  }
}
```

## CI/CD with GitHub Actions + Cloudflare Workers

### Workflow Pattern
```yaml
name: CI / Deploy
on:
  push:
    branches: [main]
  pull_request:
    branches: [main]

jobs:
  build:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: '20'
          cache: 'npm'
      - run: npm ci
      - run: npx tsc --noEmit
      - name: Build with OpenNext
        run: npx @opennextjs/cloudflare build
        env:
          # Build-time env vars get inlined
          MY_VAR: ${{ secrets.MY_VAR }}
      - name: Deploy to Cloudflare Workers
        if: github.event_name == 'push' && github.ref == 'refs/heads/main'
        run: npx wrangler deploy
        env:
          CLOUDFLARE_ACCOUNT_ID: ${{ secrets.CLOUDFLARE_ACCOUNT_ID }}
          CLOUDFLARE_API_TOKEN: ${{ secrets.CLOUDFLARE_API_TOKEN }}
```

### Setting GitHub Secrets via API
```python
from nacl import encoding, public
import base64

# Get repo public key
key_resp = requests.get(f"https://api.github.com/repos/{owner}/{repo}/actions/secrets/public-key",
    headers={"Authorization": f"token {pat}"})
key_id = key_resp.json()["key_id"]
pub_key = key_resp.json()["key"]

# Encrypt the secret
public_key = public.PublicKey(pub_key.encode("utf-8"), encoding.Base64Encoder())
sealed_box = public.SealedBox(public_key)
encrypted = sealed_box.encrypt(secret_value.encode("utf-8"))
encrypted_b64 = base64.b64encode(encrypted).decode("utf-8")

# Set the secret
requests.put(f"https://api.github.com/repos/{owner}/{repo}/actions/secrets/{secret_name}",
    headers={"Authorization": f"token {pat}"},
    json={"encrypted_value": encrypted_b64, "key_id": key_id})
```

### Setting Worker Secrets via Cloudflare API
```bash
curl -X PUT "https://api.cloudflare.com/client/v4/accounts/{account_id}/workers/scripts/{script_name}/secrets" \
  -H "X-Auth-Email: email@example.com" \
  -H "X-Auth-Key: {global_api_key}" \
  -H "Content-Type: application/json" \
  -d '{"name": "SECRET_NAME", "text": "secret_value", "type": "secret_text"}'
```

## Custom Domain Setup for Workers

### Steps
1. Ensure zone exists in Cloudflare
2. Add Worker custom domain via API:
```bash
curl -X PUT "https://api.cloudflare.com/client/v4/accounts/{account_id}/workers/domains" \
  -d '{"hostname": "app.example.com", "service": "worker-name", "environment": "production", "zone_id": "..."}'
```
3. Cloudflare auto-creates AAAA record pointing to `100::` and provisions SSL
4. If a CNAME record already exists for the domain, delete it first to avoid conflicts

## State Management with Zustand

### Pattern
```typescript
import { create } from 'zustand';

interface MyStore {
  value: string;
  setValue: (v: string) => void;
}

export const useMyStore = create<MyStore>((set) => ({
  value: '',
  setValue: (v) => set({ value: v }),
}));
```

### Best Practices
- One store per domain (ui, chat, pipeline, learning, etc.)
- Keep stores flat, avoid deep nesting
- Use `useCallback` in components that subscribe to store actions
- Never put React components or JSX in stores

## Next.js 15 App Router Patterns

### Server vs Client Components
- Default is Server Component (no `'use client'` directive)
- Use `'use client'` only when you need: hooks, event handlers, browser APIs
- Server Components can import Client Components, not vice versa
- Use Server Components for data fetching and auth checks

### Auth Pattern (NextAuth v5)
```typescript
// lib/auth.ts
import NextAuth from 'next-auth';
import GitHub from 'next-auth/providers/github';

export const { handlers, signIn, signOut, auth } = NextAuth({
  providers: [GitHub({
    clientId: process.env.GITHUB_CLIENT_ID,
    clientSecret: process.env.GITHUB_CLIENT_SECRET,
    authorization: { params: { scope: 'read:user user:email repo' } },
  })],
  pages: { signIn: '/login' },
  callbacks: {
    async jwt({ token, account }) {
      if (account) token.accessToken = account.access_token;
      return token;
    },
    async session({ session, token }) {
      return { ...session, accessToken: token.accessToken as string };
    },
  },
});

// middleware.ts - protect routes
export { auth as middleware } from '@/lib/auth';
export const config = { matcher: ['/session/:path*'] };

// app/api/auth/[...nextauth]/route.ts
import { handlers } from '@/lib/auth';
export const { GET, POST } = handlers;
```

### GitHub OAuth App Setup
- Create at https://github.com/settings/developers
- Or via API: `POST https://api.github.com/orgs/{org}/applications` (requires org admin)
- Callback URL: `https://yourdomain.com/api/auth/callback/github`
- Scopes: `read:user user:email repo` for IDE access to repos
