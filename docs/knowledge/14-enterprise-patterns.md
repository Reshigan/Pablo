# Enterprise Production Patterns — Knowledge Base

> Mandatory patterns for enterprise-grade code generation. These patterns apply
> to ALL backend services regardless of tech stack or domain.

---

## 1. Observability

### Health Check Endpoint

Every backend service MUST expose a `/health` endpoint.

```typescript
// Node.js / Express example
app.get('/health', async (req, res) => {
  const startTime = process.uptime();
  const checks: Record<string, boolean> = {};

  // Check database
  try {
    await db.execute('SELECT 1');
    checks.db = true;
  } catch {
    checks.db = false;
  }

  // Check cache (if applicable)
  try {
    await redis.ping();
    checks.cache = true;
  } catch {
    checks.cache = false;
  }

  const allHealthy = Object.values(checks).every(Boolean);

  res.status(allHealthy ? 200 : 503).json({
    status: allHealthy ? 'ok' : 'degraded',
    version: process.env.APP_VERSION || '1.0.0',
    uptime: startTime,
    timestamp: new Date().toISOString(),
    checks,
  });
});
```

```python
# Python / FastAPI example
@app.get("/health")
async def health_check():
    checks = {}
    try:
        await db.execute("SELECT 1")
        checks["db"] = True
    except Exception:
        checks["db"] = False

    all_healthy = all(checks.values())
    return JSONResponse(
        status_code=200 if all_healthy else 503,
        content={
            "status": "ok" if all_healthy else "degraded",
            "version": os.getenv("APP_VERSION", "1.0.0"),
            "uptime": time.time() - START_TIME,
            "timestamp": datetime.utcnow().isoformat(),
            "checks": checks,
        },
    )
```

### Structured Logging

Never use raw `console.log` in production. Always use a structured logger.

```typescript
// Node.js structured logger
interface LogEntry {
  timestamp: string;
  level: 'info' | 'warn' | 'error' | 'debug';
  message: string;
  requestId?: string;
  userId?: string;
  method?: string;
  path?: string;
  statusCode?: number;
  durationMs?: number;
  error?: { message: string; stack?: string };
  [key: string]: unknown;
}

const logger = {
  info: (msg: string, meta?: Partial<LogEntry>) =>
    console.log(JSON.stringify({ timestamp: new Date().toISOString(), level: 'info', message: msg, ...meta })),
  warn: (msg: string, meta?: Partial<LogEntry>) =>
    console.warn(JSON.stringify({ timestamp: new Date().toISOString(), level: 'warn', message: msg, ...meta })),
  error: (msg: string, meta?: Partial<LogEntry>) =>
    console.error(JSON.stringify({ timestamp: new Date().toISOString(), level: 'error', message: msg, ...meta })),
};
```

```python
# Python structured logging with structlog
import structlog

structlog.configure(
    processors=[
        structlog.processors.TimeStamper(fmt="iso"),
        structlog.processors.add_log_level,
        structlog.processors.JSONRenderer(),
    ],
)
logger = structlog.get_logger()

# Usage
logger.info("request_completed", method="GET", path="/api/users", status_code=200, duration_ms=45)
```

### Request ID Middleware

Every request MUST have a unique ID for tracing.

```typescript
// Express middleware
import { randomUUID } from 'crypto';

app.use((req, res, next) => {
  const requestId = req.headers['x-request-id'] as string || randomUUID();
  req.requestId = requestId;
  res.setHeader('X-Request-ID', requestId);
  next();
});
```

```python
# FastAPI middleware
from uuid import uuid4

@app.middleware("http")
async def add_request_id(request: Request, call_next):
    request_id = request.headers.get("X-Request-ID", str(uuid4()))
    request.state.request_id = request_id
    response = await call_next(request)
    response.headers["X-Request-ID"] = request_id
    return response
```

### Request Duration Logging

```typescript
// Express middleware — log duration on every request
app.use((req, res, next) => {
  const start = Date.now();
  res.on('finish', () => {
    logger.info('request_completed', {
      requestId: req.requestId,
      method: req.method,
      path: req.path,
      statusCode: res.statusCode,
      durationMs: Date.now() - start,
    });
  });
  next();
});
```

### Global Error Handler

```typescript
// Express global error handler
app.use((err: Error, req: Request, res: Response, _next: NextFunction) => {
  logger.error('unhandled_error', {
    requestId: req.requestId,
    error: { message: err.message, stack: err.stack },
    method: req.method,
    path: req.path,
  });

  res.status(500).json({
    error: 'Internal Server Error',
    requestId: req.requestId,
  });
});
```

---

## 2. API Versioning

### URL Prefix Pattern

All API routes MUST be versioned.

```typescript
// Express
const v1Router = express.Router();
v1Router.get('/users', listUsers);
v1Router.post('/users', createUser);
app.use('/api/v1', v1Router);

// Version header on all responses
app.use((req, res, next) => {
  res.setHeader('API-Version', '1.0');
  next();
});
```

```python
# FastAPI
v1_router = APIRouter(prefix="/api/v1")

@v1_router.get("/users")
async def list_users(): ...

app.include_router(v1_router)
```

### Breaking Change Strategy

When introducing breaking changes:
1. Create a `/api/v2/` path for the new version
2. Keep `/api/v1/` working for at least 6 months
3. Add a `Sunset` header to v1 responses with the deprecation date
4. Log usage of deprecated endpoints to track migration progress

---

## 3. Multi-Environment Configuration

### .env.example Template

Every project MUST include a `.env.example` with ALL required variables.

```bash
# .env.example — copy to .env and fill in values

# Application
NODE_ENV=development          # development | staging | production
APP_VERSION=1.0.0
PORT=3000
LOG_LEVEL=info                # debug | info | warn | error

# Database
DATABASE_URL=postgresql://user:pass@localhost:5432/mydb
DATABASE_POOL_SIZE=10

# Authentication
JWT_SECRET=change-me-in-production
JWT_ACCESS_EXPIRY=30m
JWT_REFRESH_EXPIRY=7d

# CORS
CORS_ORIGINS=http://localhost:3000,http://localhost:5173

# External Services
REDIS_URL=redis://localhost:6379
S3_BUCKET=my-bucket
S3_REGION=us-east-1

# Monitoring
SENTRY_DSN=
```

### Environment Validation

```typescript
// Validate all required env vars at startup — fail fast
function validateEnv(): void {
  const required = ['DATABASE_URL', 'JWT_SECRET'];
  const missing = required.filter((key) => !process.env[key]);
  if (missing.length > 0) {
    throw new Error(`Missing required environment variables: ${missing.join(', ')}`);
  }
}
```

---

## 4. Database Migration Safety

### Migration Rules

1. **Always use migration files** — never raw ALTER TABLE in application code
2. **Migrations are additive** — prefer ADD COLUMN over RENAME or DROP
3. **Two-phase column removal:**
   - Phase 1: Stop writing to the column, mark deprecated in code
   - Phase 2: DROP COLUMN in a subsequent migration after confirming no reads
4. **Every migration has a rollback** (DOWN migration)
5. **Never truncate or destroy data** without explicit warning

### Migration Template

```typescript
// Drizzle migration example
export async function up(db: Database): Promise<void> {
  await db.execute(`
    ALTER TABLE users ADD COLUMN phone TEXT;
    ALTER TABLE users ADD COLUMN verified_at TIMESTAMP;
  `);
}

export async function down(db: Database): Promise<void> {
  await db.execute(`
    ALTER TABLE users DROP COLUMN phone;
    ALTER TABLE users DROP COLUMN verified_at;
  `);
}
```

---

## 5. Test Quality Standards

### Coverage Requirements

- **Happy path**: Every endpoint has at least 1 test for the success case
- **Error cases**: At least 2 error tests per endpoint (invalid input, auth failure)
- **Edge cases**: At least 1 edge case per endpoint (empty list, max values, boundary)
- **Naming**: Test files MUST match source files (`auth.ts` → `auth.test.ts`)
- **No timezone-dependent data**: Use fixed timestamps, not relative dates

### Test Template

```typescript
// Vitest example
describe('POST /api/v1/users', () => {
  // Happy path
  it('creates a user with valid data', async () => {
    const res = await request(app)
      .post('/api/v1/users')
      .send({ name: 'Test User', email: 'test@example.com', password: 'SecureP@ss1' });
    expect(res.status).toBe(201);
    expect(res.body).toHaveProperty('id');
  });

  // Error case: invalid input
  it('rejects missing email', async () => {
    const res = await request(app)
      .post('/api/v1/users')
      .send({ name: 'Test User', password: 'SecureP@ss1' });
    expect(res.status).toBe(400);
  });

  // Error case: auth failure
  it('rejects unauthenticated request to protected endpoint', async () => {
    const res = await request(app).get('/api/v1/users/me');
    expect(res.status).toBe(401);
  });

  // Edge case: duplicate email
  it('rejects duplicate email', async () => {
    await createUser({ email: 'dup@example.com' });
    const res = await request(app)
      .post('/api/v1/users')
      .send({ name: 'Another', email: 'dup@example.com', password: 'SecureP@ss1' });
    expect(res.status).toBe(409);
  });
});
```

---

## 6. Compliance Patterns

### Financial Data

- **NEVER store monetary amounts as floats** — use integers (cents/pence)
- Store currency code alongside every amount
- All calculations in integers, convert to display format only at presentation layer

```typescript
// Correct: store as cents
interface Transaction {
  amountCents: number;  // 1999 = R19.99
  currency: string;     // 'ZAR'
}

// Display helper
function formatCurrency(cents: number, currency: string): string {
  return new Intl.NumberFormat('en-ZA', {
    style: 'currency',
    currency,
  }).format(cents / 100);
}
```

### Multi-Tenant Isolation

Every database query in a multi-tenant system MUST include tenant filtering.

```typescript
// CORRECT: always filter by tenantId
const users = await db.query(
  'SELECT * FROM users WHERE tenant_id = ? AND is_active = 1',
  [req.tenantId]
);

// WRONG: no tenant filter — data leak across tenants
const users = await db.query('SELECT * FROM users WHERE is_active = 1');
```

### Audit Trail

For regulated data (financial, medical, legal), every change MUST be logged.

```typescript
interface AuditEntry {
  id: string;
  entityType: string;       // 'user', 'transaction', 'record'
  entityId: string;
  action: 'create' | 'update' | 'delete' | 'view';
  userId: string;
  tenantId: string;
  changes?: {
    field: string;
    oldValue: unknown;
    newValue: unknown;
  }[];
  timestamp: Date;
  requestId: string;
  ipAddress: string;
}
```
