# Backend Development Patterns — Comprehensive Knowledge Base

## 1. FastAPI (Python)

### Project Structure
```
backend/
├── app/
│   ├── main.py              # App creation, middleware, router includes
│   ├── api/                  # Route modules by domain
│   │   ├── auth.py
│   │   ├── customers.py
│   │   ├── orders.py
│   │   └── analytics.py
│   ├── services/             # Business logic layer
│   ├── models/               # Pydantic models + SQLAlchemy models
│   ├── core/
│   │   ├── database.py       # Connection management
│   │   ├── auth.py           # JWT authentication
│   │   ├── rbac.py           # Role-based access control
│   │   └── config.py         # Settings from env vars
│   └── utils/
│       └── helpers.py
├── migrations/               # SQL migration files
├── pyproject.toml            # Dependencies (Poetry)
├── .env                      # Environment variables
└── tests/
```

### Main App Pattern
```python
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

app = FastAPI(title="My API", version="1.0")

# CORS — MUST keep for deployment
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Include routers
app.include_router(auth_router, prefix="/auth", tags=["auth"])
app.include_router(customers_router, prefix="/api/customers", tags=["customers"])

@app.get("/health")
async def health(): return {"status": "ok"}
```

### Authentication
```python
from fastapi import Depends, HTTPException
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
import jwt

security = HTTPBearer()

async def get_current_user(credentials: HTTPAuthorizationCredentials = Depends(security)):
    try:
        payload = jwt.decode(credentials.credentials, SECRET_KEY, algorithms=["HS256"])
        return {"user_id": payload["sub"], "email": payload["email"], "company_id": payload.get("company_id")}
    except jwt.ExpiredSignatureError:
        raise HTTPException(401, "Token expired")
    except jwt.InvalidTokenError:
        raise HTTPException(401, "Invalid token")

async def require_permission(permission: str):
    def checker(user = Depends(get_current_user)):
        if permission not in user.get("permissions", []):
            raise HTTPException(403, "Insufficient permissions")
        return user
    return checker
```

### Database Patterns
```python
# SQLite with persistent volume
import sqlite3, os

DB_PATH = os.environ.get("DATABASE_URL", "/data/app.db")

def get_db():
    conn = sqlite3.connect(DB_PATH)
    conn.row_factory = sqlite3.Row
    conn.execute("PRAGMA journal_mode=WAL")
    conn.execute("PRAGMA foreign_keys=ON")
    return conn

# PostgreSQL with psycopg2
import psycopg2
from psycopg2.extras import RealDictCursor

def get_db():
    return psycopg2.connect(DATABASE_URL, cursor_factory=RealDictCursor)

# Always use parameterized queries
cursor.execute("SELECT * FROM customers WHERE company_id = %s AND id = %s", (company_id, customer_id))

# Multi-tenancy: EVERY query must filter by company_id/tenant_id
```

### Migration Pattern
```python
# Sequential numbered migration files
# migrations/001_initial.sql, 002_add_orders.sql, etc.

MIGRATIONS = [
    ("001_initial", """
        CREATE TABLE IF NOT EXISTS users (
            id TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(16)))),
            email TEXT UNIQUE NOT NULL,
            password_hash TEXT NOT NULL,
            role TEXT DEFAULT 'user',
            company_id TEXT NOT NULL,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        );
        CREATE TABLE IF NOT EXISTS schema_migrations (
            version TEXT PRIMARY KEY,
            applied_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        );
    """),
]

def run_migrations(db):
    for version, sql in MIGRATIONS:
        existing = db.execute("SELECT 1 FROM schema_migrations WHERE version = ?", (version,)).fetchone()
        if not existing:
            db.executescript(sql)
            db.execute("INSERT INTO schema_migrations (version) VALUES (?)", (version,))
            db.commit()
```

### CRUD Route Pattern
```python
@router.get("/")
async def list_items(
    page: int = 1,
    limit: int = 20,
    search: str = "",
    user = Depends(get_current_user)
):
    offset = (page - 1) * limit
    db = get_db()
    query = "SELECT * FROM items WHERE company_id = ?"
    params = [user["company_id"]]
    
    if search:
        query += " AND (name LIKE ? OR description LIKE ?)"
        params.extend([f"%{search}%", f"%{search}%"])
    
    query += " ORDER BY created_at DESC LIMIT ? OFFSET ?"
    params.extend([limit, offset])
    
    items = db.execute(query, params).fetchall()
    total = db.execute("SELECT COUNT(*) FROM items WHERE company_id = ?", [user["company_id"]]).fetchone()[0]
    
    return {"items": [dict(r) for r in items], "total": total, "page": page, "pages": (total + limit - 1) // limit}

@router.post("/")
async def create_item(data: ItemCreate, user = Depends(get_current_user)):
    db = get_db()
    id = str(uuid4())
    db.execute(
        "INSERT INTO items (id, name, description, company_id, created_by) VALUES (?, ?, ?, ?, ?)",
        (id, data.name, data.description, user["company_id"], user["user_id"])
    )
    db.commit()
    return {"id": id, "message": "Created"}
```

### File Upload
```python
from fastapi import UploadFile, File

@router.post("/upload")
async def upload_file(file: UploadFile = File(...)):
    contents = await file.read()
    # Save to R2, S3, or local storage
    filename = f"{uuid4()}_{file.filename}"
    with open(f"/data/uploads/{filename}", "wb") as f:
        f.write(contents)
    return {"filename": filename, "size": len(contents)}
```

## 2. Express.js / Node.js

### Project Structure
```
server/
├── src/
│   ├── index.js             # Express app setup, middleware
│   ├── routes/              # Route handlers by domain
│   │   ├── auth.js
│   │   ├── customers.js
│   │   └── orders.js
│   ├── middleware/
│   │   ├── auth.js          # JWT verification
│   │   ├── rateLimiter.js   # Rate limiting
│   │   └── validator.js     # Input validation
│   ├── models/              # Database models (Knex/Sequelize)
│   └── services/            # Business logic
├── migrations/              # Database migrations
└── package.json
```

### Express Middleware Pipeline
```javascript
// Order matters!
app.use(morgan('combined'));           // Logging
app.use(cors({ origin: ALLOWED_ORIGINS }));  // CORS
app.use(helmet());                      // Security headers
app.use(express.json({ limit: '10mb' }));   // Body parsing
app.use(rateLimit({ windowMs: 15*60*1000, max: 100 })); // Rate limiting
app.use('/api', authMiddleware);        // Auth (protected routes only)
```

### Error Handling Pattern
```javascript
// asyncHandler wrapper
const asyncHandler = (fn) => (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);

// Usage
router.get('/', asyncHandler(async (req, res) => {
    const data = await db.query('SELECT * FROM items WHERE tenant_id = ?', [req.user.tenantId]);
    res.json(data);
}));

// Global error handler
app.use((err, req, res, next) => {
    console.error(err.stack);
    res.status(err.status || 500).json({ error: err.message || 'Internal server error' });
});
```

### Knex.js Database
```javascript
const knex = require('knex')({
    client: 'pg',
    connection: process.env.DATABASE_URL,
    pool: { min: 2, max: 10 },
});

// Query builder
const customers = await knex('customers')
    .where('tenant_id', tenantId)
    .where('name', 'like', `%${search}%`)
    .orderBy('created_at', 'desc')
    .limit(20).offset(0);
```

## 3. Authentication Patterns

### JWT Authentication
```python
# Token generation
def create_token(user_id, email, company_id, role):
    payload = {
        "sub": user_id,
        "email": email,
        "company_id": company_id,
        "role": role,
        "exp": datetime.utcnow() + timedelta(hours=24),
        "iat": datetime.utcnow(),
    }
    return jwt.encode(payload, SECRET_KEY, algorithm="HS256")

# Token refresh
def create_refresh_token(user_id):
    payload = {
        "sub": user_id,
        "exp": datetime.utcnow() + timedelta(days=30),
        "type": "refresh",
    }
    return jwt.encode(payload, SECRET_KEY, algorithm="HS256")
```

### OAuth 2.0 (GitHub Example)
```
1. User clicks "Login with GitHub"
2. Redirect to: https://github.com/login/oauth/authorize?client_id=X&scope=read:user+repo
3. GitHub redirects back with ?code=AUTH_CODE
4. Server exchanges code for access_token via POST https://github.com/login/oauth/access_token
5. Server uses access_token to fetch user info from https://api.github.com/user
6. Server creates JWT and returns to client
```

### Multi-Tenant Authentication
- JWT payload includes `company_id` / `tenant_id`
- Every DB query filters by tenant: `WHERE company_id = ?`
- Users can belong to multiple companies (company selection on login)
- Role hierarchy: super-admin > company-admin > manager > user

### Password Hashing
```python
import bcrypt

# Hash password
password_hash = bcrypt.hashpw(password.encode(), bcrypt.gensalt()).decode()

# Verify password
if bcrypt.checkpw(password.encode(), stored_hash.encode()):
    # Valid
```

## 4. API Design Patterns

### RESTful Conventions
```
GET    /api/customers          # List (with pagination, search, filters)
GET    /api/customers/:id      # Get single
POST   /api/customers          # Create
PUT    /api/customers/:id      # Update (full)
PATCH  /api/customers/:id      # Update (partial)
DELETE /api/customers/:id      # Delete

# Nested resources
GET    /api/customers/:id/orders
POST   /api/customers/:id/orders

# Actions
POST   /api/orders/:id/approve
POST   /api/orders/:id/cancel
```

### Pagination Response
```json
{
  "items": [...],
  "total": 150,
  "page": 1,
  "limit": 20,
  "pages": 8,
  "has_next": true,
  "has_prev": false
}
```

### Error Response
```json
{
  "error": "Validation failed",
  "details": [
    {"field": "email", "message": "Invalid email format"},
    {"field": "name", "message": "Required field"}
  ]
}
```

### Input Validation (Pydantic)
```python
from pydantic import BaseModel, EmailStr, Field
from typing import Optional
from datetime import datetime

class CustomerCreate(BaseModel):
    name: str = Field(..., min_length=1, max_length=200)
    email: EmailStr
    phone: Optional[str] = None
    address: Optional[str] = None
    
class CustomerUpdate(BaseModel):
    name: Optional[str] = Field(None, min_length=1, max_length=200)
    email: Optional[EmailStr] = None
    phone: Optional[str] = None

class CustomerResponse(BaseModel):
    id: str
    name: str
    email: str
    created_at: datetime
```

## 5. Real-Time Patterns

### Server-Sent Events (SSE)
```python
# FastAPI SSE
from fastapi.responses import StreamingResponse

@app.post("/api/chat")
async def chat(request: ChatRequest):
    async def generate():
        async for chunk in llm.stream(request.message):
            yield f"data: {json.dumps({'content': chunk})}\n\n"
        yield "data: [DONE]\n\n"
    
    return StreamingResponse(generate(), media_type="text/event-stream")
```

### WebSocket
```python
# FastAPI WebSocket
@app.websocket("/ws/{room_id}")
async def websocket_endpoint(websocket: WebSocket, room_id: str):
    await websocket.accept()
    rooms[room_id].add(websocket)
    try:
        while True:
            data = await websocket.receive_text()
            for client in rooms[room_id]:
                if client != websocket:
                    await client.send_text(data)
    except WebSocketDisconnect:
        rooms[room_id].remove(websocket)
```

### Polling Fallback (Cloudflare Workers)
```typescript
// When WebSockets aren't available (e.g., Cloudflare Workers without Durable Objects)
// Poll for online users every 30 seconds
useEffect(() => {
    const interval = setInterval(async () => {
        const res = await fetch('/api/realtime/online-users');
        setOnlineUsers(await res.json());
    }, 30000);
    return () => clearInterval(interval);
}, []);
```

## 6. Background Jobs & Cron

### Cloudflare Workers Cron
```typescript
// In worker fetch handler
export default {
    async fetch(request, env) { /* handle requests */ },
    async scheduled(event, env, ctx) {
        switch (event.cron) {
            case '0 9 * * *': // Daily at 9 AM
                await processDailyJobs(env);
                break;
            case '0 0 * * 0': // Weekly (Sunday midnight)
                await processWeeklyJobs(env);
                break;
        }
    },
};
```

### Adoption Engine Pattern (Automated User Lifecycle)
- Welcome campaigns → Drip sequences → Re-engagement → Churn prevention
- Influencer outreach with commission tracking
- Streak maintenance with freeze/reset
- Date reminders (birthdays, anniversaries)
- Content prompts (weekly suggestions)

## 7. AI/LLM Integration

### OpenAI-Compatible API
```python
import httpx

async def chat_completion(messages, model="gpt-4"):
    async with httpx.AsyncClient() as client:
        response = await client.post(
            f"{OLLAMA_URL}/chat/completions",
            headers={"Authorization": f"Bearer {API_KEY}"},
            json={"model": model, "messages": messages, "stream": True},
        )
        async for line in response.aiter_lines():
            if line.startswith("data: "):
                data = line[6:]
                if data == "[DONE]": break
                chunk = json.loads(data)
                yield chunk["choices"][0]["delta"].get("content", "")
```

### Intent Classification (Two-Tier)
```typescript
// 1. Rule-based (fast path) — regex patterns with confidence >= 0.7
const rules = [
    { pattern: /create (invoice|order|quote)/i, intent: 'create_transaction', confidence: 0.9 },
    { pattern: /show (dashboard|metrics|analytics)/i, intent: 'view_analytics', confidence: 0.85 },
];

// 2. AI-based (fallback) — LLM classification
const aiResult = await env.AI.run('@cf/meta/llama-3.1-8b-instruct', {
    messages: [{ role: 'system', content: 'Classify intent...' }, { role: 'user', content: userMessage }],
});
```

### Dual-Model Routing
- **Reasoning model** (DeepSeek-R1, GPT-4): Complex planning, architecture decisions
- **Implementation model** (Qwen3-Coder, GPT-3.5): Fast code generation, simple tasks
- Route based on task complexity assessment

### AI Bot/Agent Pattern
```python
class Bot:
    name: str
    description: str
    capabilities: list[str]
    
    async def execute(self, context, params):
        # 1. Pre-execution analysis
        analysis = await self.analyze(context)
        # 2. Execute business logic
        result = await self.run(params)
        # 3. Post-execution summary
        return await self.summarize(result)
```

## 8. Email & Notifications

### Email Templates (HTML)
```python
def send_email(to, subject, html_body):
    # Using Resend
    requests.post("https://api.resend.com/emails",
        headers={"Authorization": f"Bearer {RESEND_API_KEY}"},
        json={"from": "noreply@app.com", "to": to, "subject": subject, "html": html_body})
    
    # Using Microsoft Graph
    requests.post(f"https://graph.microsoft.com/v1.0/users/{sender}/sendMail",
        headers={"Authorization": f"Bearer {ms_token}"},
        json={"message": {"subject": subject, "body": {"contentType": "HTML", "content": html_body},
            "toRecipients": [{"emailAddress": {"address": to}}]}})
```

### Push Notifications Pattern
- Store push subscriptions in DB
- Process queue every 5 minutes via cron
- Batch send to reduce API calls
- Track delivery status

## 9. Security Best Practices

### Input Sanitization
- Always use parameterized queries (never string interpolation for SQL)
- Validate and sanitize all user inputs
- Use Pydantic models for request validation
- Encode path segments: `encodeURIComponent(path)` to prevent traversal

### Rate Limiting
```python
from collections import defaultdict
from time import time

class RateLimiter:
    def __init__(self, max_requests=100, window_seconds=900):
        self.requests = defaultdict(list)
        self.max = max_requests
        self.window = window_seconds
    
    def is_allowed(self, key):
        now = time()
        self.requests[key] = [t for t in self.requests[key] if now - t < self.window]
        if len(self.requests[key]) >= self.max:
            return False
        self.requests[key].append(now)
        return True
```

### Security Headers
```python
@app.middleware("http")
async def security_headers(request, call_next):
    response = await call_next(request)
    response.headers["X-Content-Type-Options"] = "nosniff"
    response.headers["X-Frame-Options"] = "DENY"
    response.headers["X-XSS-Protection"] = "1; mode=block"
    response.headers["Strict-Transport-Security"] = "max-age=31536000; includeSubDomains"
    response.headers["Content-Security-Policy"] = "default-src 'self'"
    return response
```

### Encryption Patterns
```python
# Zero-knowledge encryption (client-side)
# 1. PBKDF2 key derivation (100k iterations)
# 2. AES-256-GCM encryption with random IV
# 3. Encrypted key stored on server, passphrase never transmitted

# Shamir Secret Sharing (K-of-N recovery)
# Split master key into N shares, any K can reconstruct
# Use GF(256) finite field arithmetic + Lagrange interpolation
```
