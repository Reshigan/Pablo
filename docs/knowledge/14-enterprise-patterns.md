# Enterprise Software Patterns — Production Standards

## 1. API Versioning

```typescript
// ALL routes must be prefixed /api/v1/
// Hono (Cloudflare Workers):
const v1 = new Hono();
v1.get("/users", listUsers);
app.route("/api/v1", v1);

// Version response headers (add to every response):
res.setHeader("API-Version", "1.0");

// Non-breaking (safe to add to v1):
//   + New optional response fields
//   + New optional query params
//   + New endpoints
// Breaking (requires /api/v2/):
//   - Removing or renaming fields
//   - Changing field types
//   - Removing endpoints
```

## 2. Structured Logging

```typescript
const logger = {
  info:  (msg, meta?) => log("info",  msg, meta),
  warn:  (msg, meta?) => log("warn",  msg, meta),
  error: (msg, meta?) => log("error", msg, meta),
};

function log(level, message, meta) {
  const entry = { timestamp: new Date().toISOString(), level, message, ...meta };
  console.log(JSON.stringify(entry)); // JSON in prod, pretty in dev
}

// Request logging middleware:
function requestLogger(req, res, next) {
  const requestId = crypto.randomUUID();
  const start = Date.now();
  res.setHeader("X-Request-ID", requestId);
  res.on("finish", () => logger.info("Request completed", {
    requestId, method: req.method, path: req.path,
    statusCode: res.statusCode, durationMs: Date.now() - start,
  }));
  next();
}
```

## 3. Health Check Endpoints

```typescript
// Simple: GET /health
app.get("/health", (req, res) => res.json({
  status: "ok", version: process.env.APP_VERSION,
  uptime: Math.floor(process.uptime()),
  timestamp: new Date().toISOString(),
}));

// Deep: GET /health/deep — checks dependencies
app.get("/health/deep", async (req, res) => {
  const checks = {};
  try { await db.execute("SELECT 1"); checks.database = true; }
  catch { checks.database = false; }
  const ok = Object.values(checks).every(Boolean);
  res.status(ok ? 200 : 503).json({
    status: ok ? "ok" : "degraded", checks,
    timestamp: new Date().toISOString(),
  });
});
```

## 4. Multi-Environment Configuration

```typescript
// Validate env on startup — fail fast if misconfigured
const EnvSchema = z.object({
  NODE_ENV:      z.enum(["development", "staging", "production"]),
  DATABASE_URL:  z.string().url(),
  JWT_SECRET:    z.string().min(32),
  CORS_ORIGINS:  z.string(),
  LOG_LEVEL:     z.enum(["debug","info","warn","error"]).default("info"),
  PORT:          z.coerce.number().default(3000),
});
export const env = EnvSchema.parse(process.env);
```

```bash
# .env.example template:
NODE_ENV=development
PORT=3000
LOG_LEVEL=debug
DATABASE_URL=postgresql://user:password@localhost:5432/dbname
JWT_SECRET=replace-with-32-char-minimum-random-string
JWT_ACCESS_EXPIRY=30m
JWT_REFRESH_EXPIRY=7d
CORS_ORIGINS=http://localhost:3000,https://staging.yourapp.com
```

## 5. Database Migration Safety

```sql
-- Migration naming convention:
-- 0001_init.sql
-- 0002_add_users_table.sql
-- 0003_add_soft_delete_to_orders.sql  -- additive
-- 0004_deprecate_legacy_col.sql        -- phase 1: stop writing
-- 0005_drop_legacy_col.sql             -- phase 2: remove (separate deploy)

-- Safe migration template:
-- Type: ADDITIVE (no data loss)
-- UP
ALTER TABLE orders ADD COLUMN is_active BOOLEAN NOT NULL DEFAULT 1;
ALTER TABLE orders ADD COLUMN deleted_at TIMESTAMP;
CREATE INDEX idx_orders_active ON orders(is_active);

-- DOWN (always provide rollback)
-- DROP INDEX idx_orders_active;
-- ALTER TABLE orders DROP COLUMN deleted_at;
-- ALTER TABLE orders DROP COLUMN is_active;

-- NEVER do this in a migration:
-- TRUNCATE TABLE users;      -- data loss
-- DROP TABLE orders;          -- data loss
-- UPDATE users SET password = 'reset';  -- destroys all passwords
```

## 6. Financial Data Integrity

```typescript
// WRONG — floating point errors in financial calculations
const price = 19.99;       // 19.990000000000001 in IEEE 754

// CORRECT — store as integer cents, format only for display
const priceCents = 1999;   // R19.99 stored as 1999 cents
const vatCents = Math.round(priceCents * 0.15); // 300 cents

function formatCents(cents, currency = "ZAR") {
  return new Intl.NumberFormat("en-ZA", {
    style: "currency", currency, minimumFractionDigits: 2,
  }).format(cents / 100);
}
```

```sql
-- Financial audit trail (MANDATORY):
CREATE TABLE financial_audit (
  id TEXT PRIMARY KEY,
  table_name TEXT NOT NULL, record_id TEXT NOT NULL,
  action TEXT NOT NULL,     -- 'insert'|'update'|'delete'
  changed_by TEXT NOT NULL, changed_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  old_values TEXT,          -- JSON
  new_values TEXT,          -- JSON
  reason TEXT               -- Required for adjustments
);
```

## 7. Multi-Tenancy Patterns

```typescript
// Every query MUST include company_id — enforce at middleware level
function tenantMiddleware(req, res, next) {
  const companyId = req.user?.companyId;
  if (!companyId) return res.status(403).json({ error: "No tenant context" });
  req.tenantId = companyId;
  next();
}

// Always pass tenantId from JWT — never trust client-sent tenant
async function getOrders(tenantId, filters) {
  return db.execute(
    "SELECT * FROM orders WHERE company_id = ? AND is_active = 1",
    [tenantId]  // from JWT, not from request body
  );
}
```
