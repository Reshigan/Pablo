# Common Pitfalls, Gotchas & Solutions — Comprehensive Knowledge Base

## 1. Cloudflare / Edge Computing

### Pages vs Workers Confusion
**Problem**: OpenNext produces a Worker, NOT static files. Deploying to Cloudflare Pages fails silently.
**Solution**: Always use `wrangler deploy` (Workers), never Pages auto-build for Next.js/OpenNext.

### Build-Time vs Runtime Environment Variables
**Problem**: Worker secrets set via `wrangler secret put` are only available at runtime. `process.env.X` during build gets `undefined`.
**Solution**: 
- Build-time vars: Set in CI `env:` block → inlined into code
- Runtime vars: Set as Worker secrets → available via `c.env.X` or `process.env.X` at request time
- NextAuth needs `AUTH_SECRET` at RUNTIME → must be a Worker secret

### Worker Secret Propagation
**Problem**: After setting Worker secrets via API, the Worker still returns 500.
**Solution**: Secrets may require a Worker redeploy to take effect. Push a dummy commit or run `wrangler deploy` again.

### D1 Prepared Statement Gotcha
**Problem**: `db.prepare("SELECT * FROM x WHERE a = ? AND b = ?").bind(a, b)` — bind order matters.
**Solution**: Always bind in the exact order params appear in the SQL. Use `.first()` for single row, `.all()` for multiple.

### Cloudflare Pages `_routes.json`
**Problem**: API routes hit the Pages static file handler instead of the Worker.
**Solution**: Add `_routes.json` in `public/`:
```json
{
    "version": 1,
    "include": ["/*"],
    "exclude": ["/api/*"]
}
```

### R2 Content-Type
**Problem**: Files uploaded to R2 without explicit Content-Type are served as `application/octet-stream`.
**Solution**: Always set `httpMetadata: { contentType: 'image/jpeg' }` on R2 put operations.

---

## 2. Next.js / React

### Server vs Client Component Boundary
**Problem**: Using `useState`, `useEffect`, or event handlers in a Server Component causes cryptic errors.
**Solution**: Add `'use client'` at the top of any file that uses hooks, event handlers, or browser APIs.

### Dynamic Import SSR Issues
**Problem**: Components using browser-only APIs (Monaco, xterm.js, Leaflet) crash during SSR.
**Solution**: Use dynamic import with `ssr: false`:
```typescript
const MonacoEditor = dynamic(() => import('./MonacoEditor'), { ssr: false });
```

### useEffect Cleanup
**Problem**: Intervals, event listeners, and subscriptions leak when component unmounts.
**Solution**: Always return cleanup function:
```typescript
useEffect(() => {
    const interval = setInterval(fn, 1000);
    window.addEventListener('keydown', handler);
    return () => {
        clearInterval(interval);
        window.removeEventListener('keydown', handler);
    };
}, []);
```

### Stale Closures in Event Handlers
**Problem**: Event handlers capture old state values from render time.
**Solution**: Use `useRef` for mutable values that event handlers need:
```typescript
const stateRef = useRef(state);
stateRef.current = state;
// In event handler: use stateRef.current instead of state
```

### Next.js Middleware Auth Loop
**Problem**: Middleware redirecting to `/login` also catches the `/login` route → infinite redirect.
**Solution**: Exclude auth routes from matcher:
```typescript
export const config = { matcher: ['/session/:path*', '/dashboard/:path*'] };
// Don't match /login, /api/auth/*
```

---

## 3. SSE / Streaming

### Partial JSON Across TCP Chunks
**Problem**: TCP doesn't guarantee message boundaries. A single `data: {...}` line may arrive in multiple chunks.
**Solution**: Buffer incomplete lines:
```typescript
let buffer = '';
buffer += decoder.decode(value, { stream: true });
const lines = buffer.split('\n');
buffer = lines.pop() || ''; // Keep incomplete line
```

### `[DONE]` Sentinel Handling
**Problem**: OpenAI-compatible APIs send `data: [DONE]` which isn't valid JSON.
**Solution**: Check for `[DONE]` before attempting JSON.parse.

### Undefined Content on Abort
**Problem**: When user aborts a stream, `delta.content` may be `undefined`, causing "undefined" text in UI.
**Solution**: Always use nullish coalescing: `content ?? ''`

### Mock SSE Interval Leak
**Problem**: `setInterval` used for mock SSE doesn't get cleaned up when stream is cancelled.
**Solution**: Add `cancel()` handler to ReadableStream:
```typescript
new ReadableStream({
    start(controller) { intervalId = setInterval(...); },
    cancel() { clearInterval(intervalId); },
});
```

---

## 4. Authentication

### JWT Token Refresh Race Condition
**Problem**: Multiple simultaneous API calls fail with 401, all try to refresh → multiple refresh requests.
**Solution**: Queue requests while refresh is in progress:
```typescript
let isRefreshing = false;
let failedQueue: { resolve, reject }[] = [];

api.interceptors.response.use(null, async (error) => {
    if (error.response?.status === 401 && !error.config._retry) {
        if (isRefreshing) {
            return new Promise((resolve, reject) => failedQueue.push({ resolve, reject }));
        }
        isRefreshing = true;
        try {
            const newToken = await refreshToken();
            failedQueue.forEach(p => p.resolve(api(p.config)));
            return api(error.config);
        } finally {
            isRefreshing = false;
            failedQueue = [];
        }
    }
});
```

### OAuth Callback URL Mismatch
**Problem**: GitHub OAuth returns error because callback URL in app settings doesn't match the deployment domain.
**Solution**: OAuth app callback must exactly match: `https://yourdomain.com/api/auth/callback/github`

### Multi-Company JWT Confusion
**Problem**: User belongs to multiple companies, JWT has wrong company_id.
**Solution**: Detect multi-company on login, show company selector, re-issue JWT with correct company_id.

---

## 5. Database

### Multi-Tenant Query Leak
**Problem**: Forgetting `WHERE company_id = ?` allows cross-tenant data access.
**Solution**: 
- Add company_id filter to EVERY query (no exceptions)
- Use middleware that auto-injects company_id
- Add DB-level row security policies if using PostgreSQL

### SQLite WAL Mode
**Problem**: Default SQLite journal mode causes write locks that block reads.
**Solution**: `PRAGMA journal_mode=WAL;` — enables concurrent readers during writes.

### Migration Order
**Problem**: Running migrations out of order causes foreign key violations.
**Solution**: Use numbered sequential files (001_, 002_, etc.) and a migration tracking table.

### N+1 Query Problem
**Problem**: Loading a list of orders, then loading customer for each order individually.
**Solution**: Use JOINs or batch loading:
```sql
SELECT o.*, c.name AS customer_name 
FROM orders o 
JOIN customers c ON o.customer_id = c.id 
WHERE o.company_id = ?;
```

---

## 6. CSS / Styling

### Tailwind Class Conflicts
**Problem**: `className="p-4 p-2"` — later class doesn't override earlier one due to CSS specificity.
**Solution**: Use `cn()` utility with `tailwind-merge`:
```typescript
import { clsx } from 'clsx';
import { twMerge } from 'tailwind-merge';
export function cn(...inputs) { return twMerge(clsx(inputs)); }
```

### Z-Index Wars
**Problem**: Modals, dropdowns, and tooltips fight for z-index priority.
**Solution**: Define a z-index scale:
```css
--z-dropdown: 100;
--z-overlay: 200;
--z-modal: 300;
--z-toast: 400;
--z-tooltip: 500;
```

### Glassmorphism Browser Support
**Problem**: `backdrop-filter: blur()` doesn't work in all browsers.
**Solution**: Add fallback background color:
```css
.glass {
    background: rgba(13, 15, 18, 0.8); /* Fallback */
    backdrop-filter: blur(12px);
    -webkit-backdrop-filter: blur(12px);
}
```

---

## 7. Git / CI/CD

### Force Push Disasters
**Problem**: `git push --force` overwrites collaborators' work.
**Solution**: NEVER force push. Use `git merge` instead of `git rebase` for shared branches.

### CI Secrets Not Available in PRs from Forks
**Problem**: GitHub Actions doesn't expose secrets to PRs from forks (security feature).
**Solution**: Use `pull_request_target` event cautiously, or skip deploy step for PRs.

### Build Cache Miss
**Problem**: Every CI run installs all dependencies from scratch.
**Solution**: Use actions/cache or setup-node with `cache: 'npm'`:
```yaml
- uses: actions/setup-node@v4
  with:
    node-version: '20'
    cache: 'npm'
```

---

## 8. Docker

### Container Dependencies
**Problem**: Backend starts before database is ready → connection refused.
**Solution**: Use `depends_on` with `condition: service_healthy`:
```yaml
backend:
    depends_on:
        db: { condition: service_healthy }
```

### Node Modules in Docker
**Problem**: `node_modules` from host conflicts with container's architecture.
**Solution**: Use multi-stage build; never mount host `node_modules` into container.

### Docker Build Context Too Large
**Problem**: Docker sends entire project (including node_modules, .git) as build context.
**Solution**: Add `.dockerignore`:
```
node_modules
.git
*.md
.env*
```

---

## 9. API Design

### CORS Preflight Failures
**Problem**: Browser sends OPTIONS request before POST; backend doesn't handle it.
**Solution**: Configure CORS middleware to handle OPTIONS and allow required headers:
```python
app.add_middleware(
    CORSMiddleware,
    allow_origins=["https://app.example.com"],
    allow_methods=["*"],
    allow_headers=["*"],
    allow_credentials=True,
)
```

### Large Payload Timeouts
**Problem**: File upload or large JSON body exceeds default timeout/size limit.
**Solution**: Increase limits:
```javascript
app.use(express.json({ limit: '10mb' }));
```
```python
# FastAPI: default is 1MB for JSON, use File for uploads
@app.post("/upload")
async def upload(file: UploadFile = File(...)):
    ...
```

### Rate Limiting Header Standards
```
X-RateLimit-Limit: 100         # Max requests per window
X-RateLimit-Remaining: 47      # Remaining requests
X-RateLimit-Reset: 1672531200  # Unix timestamp when window resets
Retry-After: 60                # Seconds to wait (on 429)
```

---

## 10. Performance

### Bundle Size Bloat
**Problem**: Importing entire library when only using one function.
**Solution**: Import specific functions:
```typescript
// BAD: imports entire library
import * as _ from 'lodash';
// GOOD: imports only what's needed
import debounce from 'lodash/debounce';
```

### Memory Leaks in SPAs
**Problem**: Event listeners, timers, WebSocket connections accumulate over time.
**Solution**: 
- Clean up in `useEffect` return
- Use `AbortController` for fetch requests
- Implement connection pooling for WebSockets
- Use WeakMap/WeakRef for caches

### Image Loading Performance
**Problem**: Loading full-resolution images for thumbnails.
**Solution**: 
- Use `next/image` for automatic optimization
- Serve different sizes via srcSet
- Use WebP format
- Lazy load below-fold images: `loading="lazy"`

---

## 11. TypeScript

### `any` Type Escape Hatch
**Problem**: Using `any` bypasses type checking, hiding bugs.
**Solution**: Use proper types. If truly unknown, use `unknown` and narrow with type guards.

### Optional Chaining Overuse
**Problem**: `data?.items?.map(...)` — silently returns `undefined` instead of showing the actual bug.
**Solution**: Validate data shape at API boundary, then use non-null assertions internally.

### Enum vs Union Type
**Problem**: TypeScript enums add runtime overhead and are harder to tree-shake.
**Solution**: Use union types:
```typescript
// Instead of: enum Status { Active, Inactive }
type Status = 'active' | 'inactive';
```
