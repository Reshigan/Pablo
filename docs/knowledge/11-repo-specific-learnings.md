# Repository-Specific Learnings — From All User Projects

> Extracted from: SalesSync, Heirloom, MoreMeAI, VerifiAI, ARIA, Lokalapp, MetaRobot, Pablo

---

## 1. SalesSync — Field Force Automation

### Architecture
- **Dual backend**: Cloudflare Workers (Hono + D1) AND Node.js (Express + SQLite/PostgreSQL)
- **Frontend**: React + Vite PWA with Workbox service worker for offline-first
- **E2E Tests**: Playwright test suite with authenticated session storage

### Key Patterns Learned

#### Multi-Tenant Data Isolation
```javascript
// Every query uses getTenantId() helper
const tenantId = getTenantId(c);
const customers = await c.env.DB.prepare(
    "SELECT * FROM customers WHERE tenant_id = ?"
).bind(tenantId).all();
```

#### Offline-First PWA with Idempotency
```javascript
// Idempotency key prevents duplicate syncs from mobile agents
const idempotencyKey = SHA256(`${tenantId}:${agentId}:${entityType}:${date}:${keyFields}`);

// Check before insert
const existing = await db.prepare(
    "SELECT 1 FROM commission_events WHERE idempotency_key = ?"
).bind(idempotencyKey).first();
if (existing) return { status: 'duplicate', message: 'Already processed' };
```

#### GPS Validation (Haversine Formula)
```javascript
function haversineDistance(lat1, lon1, lat2, lon2) {
    const R = 6371000;
    const dLat = (lat2 - lat1) * Math.PI / 180;
    const dLon = (lon2 - lon1) * Math.PI / 180;
    const a = Math.sin(dLat/2)**2 + 
              Math.cos(lat1 * Math.PI/180) * Math.cos(lat2 * Math.PI/180) * 
              Math.sin(dLon/2)**2;
    return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
}
// Agent must be within 10m of customer for valid check-in
```

#### Commission Calculation Engine
```javascript
// Five commission types
const COMMISSION_TYPES = {
    flat: (rule, qty) => rule.rate,
    per_unit: (rule, qty) => rule.rate * qty,
    percentage: (rule, amount) => rule.rate / 100 * amount,
    tiered: (rule, amount) => calculateTiered(rule.tiers, amount),
    coverage: (rule, coverage) => rule.rate * (coverage / 100),
};

// State machine: pending_approval → approved → paid (or rejected)
```

#### Board Coverage Calculation (Shoelace Formula)
```javascript
// Polygon area = |Σ(x[i] * y[i+1] - x[i+1] * y[i])| / 2
function polygonArea(vertices) {
    let area = 0;
    for (let i = 0; i < vertices.length; i++) {
        const j = (i + 1) % vertices.length;
        area += vertices[i].x * vertices[j].y;
        area -= vertices[j].x * vertices[i].y;
    }
    return Math.abs(area / 2);
}
// Coverage % = board_area / storefront_area * 100
```

#### Visit Workflow
```
Check-in (GPS validate) → Complete Mandatory Tasks → 
  Optional Activities (boards, distributions, surveys) → 
  Commission Generation → Check-out (GPS validate)
```

#### Van Sales Workflow
```
Load Van (transfer from warehouse) → Start Route → 
  Customer Visits (sell + collect cash) → Close Route → 
  Cash Reconciliation (count vs expected) → Bank Deposit
```

### Database Abstraction Layer
```javascript
// Adapts between SQLite (dev) and PostgreSQL (production)
function getQuery(tenantId, sql, params) {
    if (isPostgres) {
        return pool.query(sql.replace(/\?/g, (_, i) => `$${i+1}`), [tenantId, ...params]);
    }
    return db.prepare(sql).bind(tenantId, ...params).all();
}
```

---

## 2. Heirloom — Digital Legacy Platform

### Architecture
- **Primary**: Cloudflare Workers (Hono) + D1 + R2 + KV + Workers AI
- **Alternative**: Docker Compose (Express + React + PostgreSQL + Nginx)
- **Frontend**: React SPA with Zustand + React Query

### Key Patterns Learned

#### Dead Man's Switch (Automated Posthumous Delivery)
```
States: ACTIVE → WARNING → GRACE_PERIOD → TRIGGERED → VERIFIED
- User sets check-in interval (7-90 days)
- Daily cron checks for missed check-ins
- After N missed: enter warning → grace period
- Legacy contacts (≥2) must verify before content release
- Shamir Secret Sharing distributes decryption key shares
```

#### Zero-Knowledge Encryption
```typescript
// Client-side only — server never sees passphrase
class EncryptionService {
    async setupEncryption(passphrase: string) {
        // 1. Derive key from passphrase (PBKDF2, 100k iterations)
        const salt = crypto.getRandomValues(new Uint8Array(16));
        const key = await this.deriveKey(passphrase, salt);
        
        // 2. Generate master key
        const masterKey = crypto.getRandomValues(new Uint8Array(32));
        
        // 3. Encrypt master key with derived key (AES-256-GCM)
        const encrypted = await this.encrypt(masterKey, key);
        
        // 4. Send encrypted key + salt to server (NEVER the passphrase)
        await api.post('/encryption/setup', { encryptedKey: encrypted, salt });
    }
}
```

#### Shamir Secret Sharing (K-of-N Recovery)
```typescript
// GF(256) finite field arithmetic + Lagrange interpolation
// Split master key into N shares, any K can reconstruct
// Use case: distribute decryption key across legacy contacts
```

#### Adoption Engine (11 Cron Jobs)
```
Daily (9 AM UTC):
1. processDripCampaigns     — Multi-step email sequences
2. startWelcomeCampaigns    — New user onboarding
3. processInactiveUsers     — Re-engagement (30+ days inactive)
4. processInfluencerOutreach — Partnership emails
5. processInfluencerFollowUps — Follow-up sequences
6. discoverNewProspects     — Find viral influencers
7. processStreakMaintenance  — Reset broken streaks
8. sendDateReminders        — Birthday/anniversary notifications
9. processAutomatedPayouts  — Influencer commissions
10. processEmailBounces     — Deliverability monitoring

Weekly (Sunday midnight):
11. sendContentPrompts      — Personalized creation suggestions
```

#### Sanctuary Theme (Glassmorphism)
```css
:root {
    --void: #0a0a0f;
    --paper: #f5f0e8;
    --gold: #c9a84c;
    --blood: #8b0000;
    --sanctuary-blue: #1a1a2e;
}
.glass {
    background: rgba(255, 255, 255, 0.05);
    backdrop-filter: blur(12px);
    border: 1px solid rgba(255, 255, 255, 0.08);
}
```

#### Tier-Based Access Control
```typescript
const TIER_LIMITS = {
    FREE:    { storage_gb: 0.5, memories: 10,  voice_min: 5,   letters: 3 },
    STARTER: { storage_gb: 5,   memories: 100, voice_min: 60,  letters: 25 },
    FAMILY:  { storage_gb: 50,  memories: -1,  voice_min: 300, letters: -1 },
    FOREVER: { storage_gb: 500, memories: -1,  voice_min: -1,  letters: -1 },
};
// -1 = unlimited
```

---

## 3. MoreMeAI — Employee Engagement Platform

### Architecture
- **Backend**: Cloudflare Workers (Hono + D1 + R2)
- **Frontend**: React + MUI + React Query
- **Legacy Backend**: Express + Sequelize (Node.js)

### Key Patterns Learned

#### Multi-Company User Login
```typescript
// User can belong to multiple companies
const login = async (email, password) => {
    const response = await api.post('/auth/login', { email, password });
    
    if (response.data.companyChoices) {
        // Show company selection dialog
        setCompanyChoices(response.data.companyChoices);
        // [{companyId, companyName, role, userId}]
        return;
    }
    
    // Single company — proceed normally
    setToken(response.data.token);
};
```

#### Module Settings (Dynamic Feature Flags)
```typescript
// Fetch on app mount, filter navigation dynamically
const { data: modules } = useQuery({
    queryKey: ['module-settings'],
    queryFn: () => api.get('/module-settings'),
});

// Navigation items filtered by enabled modules
const visibleItems = navItems.filter(item => 
    modules?.[item.moduleKey]?.enabled !== false
);
```

#### Gamification System
```typescript
// Game state machine
type GamePhase = 'select' | 'content' | 'play' | 'results';

// Score calculation
const calculateScore = (correct, total, timeBonus, streak) => {
    const basePoints = correct * 100;
    const accuracyBonus = (correct / total) * 200;
    const streakBonus = streak * 50;
    return basePoints + accuracyBonus + streakBonus + timeBonus;
};

// Star rating (1-3 stars)
const stars = accuracy >= 90 ? 3 : accuracy >= 70 ? 2 : accuracy >= 50 ? 1 : 0;
```

#### Wellness AI Companion (Aira)
```typescript
// Four-tab AI interface: Chat, Mood, Goals, Tips
// Proactive daily wellness check-in prompts
// Voice interaction via browser Speech API
// Personalized recommendations based on mood history

// Fallback techniques by mood category
const FALLBACK_TECHNIQUES = {
    positive: ['Gratitude journaling', 'Share your joy with a colleague'],
    neutral: ['5-minute mindfulness break', 'Desk stretching routine'],
    negative: ['Deep breathing: 4-7-8 technique', 'Quick walk outside'],
};
```

#### LMS Content Hierarchy
```
Course → Modules → Lessons
  └── metadata: difficulty, duration, category, instructor
          └── content types: video, article, quiz, document, external_link, assignment, scorm
              └── quiz: 70% pass threshold, multiple attempts
```

#### Response Caching (Worker-Level)
```typescript
const cache = new Map<string, { data: any; expires: number }>();
const CACHE_TTL = 60000; // 60 seconds
const MAX_ENTRIES = 5000;

// Cache key: ${method}:${pathname}:${userId}:${companyId}
function getCacheKey(c: Context) {
    return `${c.req.method}:${new URL(c.req.url).pathname}:${c.get('user')?.userId}:${c.get('user')?.companyId}`;
}
```

---

## 4. VerifiAI — Counterfeit Detection Platform

### Architecture
- **Frontend**: React 18 + Vite + Tailwind CSS + Leaflet (maps) + Chart.js
- **Backend**: Node.js + Express + Knex.js (ORM)
- **Database**: PostgreSQL 15 + PostGIS
- **Cache**: Redis 7
- **Infrastructure**: Docker Compose with 5 containers + Nginx

### Key Patterns Learned

#### Docker Compose Production Setup (5 Containers)
```yaml
services:
  postgres:
    image: postgres:16-alpine
    extensions: [postgis]
    healthcheck: pg_isready
  redis:
    image: redis:7-alpine
    healthcheck: redis-cli ping
  backend:
    depends_on: [postgres (healthy), redis (started)]
    healthcheck: GET /health
  frontend:
    depends_on: [backend]
    healthcheck: GET /
  nginx:
    depends_on: [frontend, backend]
    ports: [9080:80, 9443:443]
```

#### PostGIS Heat Map Clustering
```sql
-- Aggregate counterfeit detections into grid cells
SELECT
    ST_X(ST_SnapToGrid(geom, 0.01)) AS grid_x,
    ST_Y(ST_SnapToGrid(geom, 0.01)) AS grid_y,
    COUNT(*) AS point_count,
    AVG(confidence_score) AS avg_confidence
FROM counterfeit_detections
WHERE detection_date BETWEEN $1 AND $2
GROUP BY grid_x, grid_y;
```

#### Leaflet Heat Map Integration
```typescript
import { MapContainer, TileLayer } from 'react-leaflet';
import 'leaflet.heat';

// Heat map layer with intensity based on detection count
const heatData = detections.map(d => [d.lat, d.lng, d.count]);
L.heatLayer(heatData, { radius: 25, blur: 15, maxZoom: 17 }).addTo(map);
```

#### NFC Product Verification Flow
```
Scan NFC Tag → POST /api/verify/nfc →
  Validate JWT (Redis session) →
  Query NXTTAG system →
  Cross-reference products table →
  PostGIS geographic check (suspicious location?) →
  AI counterfeit detection →
  Log to interactions table →
  Update heat map cache (Redis, 5min TTL) →
  Return authenticity result
```

---

## 5. ARIA — AI-Powered ERP System

### Architecture
- **Frontend**: React/Next.js (port 12001)
- **Workers API**: Cloudflare Workers (Hono + D1 + R2 + Workers AI)
- **Backend**: FastAPI + PostgreSQL (port 8000)
- **Process Management**: PM2

### Key Patterns Learned

#### 67 AI Automation Agents
```python
BOT_CATEGORIES = {
    'Financial': 11,      # Invoice reconciliation, expense coding, AR collections
    'Procurement': 10,    # PO matching, supplier scoring, inventory optimization
    'Manufacturing': 11,  # BOM management, production scheduling, quality control
    'Sales': 6,           # Lead scoring, pipeline forecasting, customer segmentation
    'HR': 8,              # Payroll processing, leave management, compliance
    'Projects': 5,        # Resource allocation, milestone tracking, budget monitoring
    'Field Service': 4,   # Dispatch optimization, SLA monitoring
    'Compliance': 5,      # VAT filing, BBBEE reporting, SARS submissions
    'Treasury': 3,        # Cash flow forecasting, bank reconciliation
    'Analytics': 4,       # KPI dashboards, trend analysis, anomaly detection
}
```

#### ARIA Controller Engine (Multi-Turn)
```python
class AriaController:
    def process_message(self, conversation_id, user_message):
        # 1. Fast path: direct bot intent detection (regex)
        tool_name, args = detect_bot_intent(user_message)
        if tool_name:
            return self._execute_tool(tool_name, args)
        
        # 2. Load conversation history + slot values
        messages = self.conversation_manager.get_messages(conversation_id)
        slots = self.slot_manager.get_slots(conversation_id)
        
        # 3. LLM with tools (max 4 iterations)
        for i in range(4):
            response = self.llm_client.chat(messages, tools, temp=0.7)
            if response.tool_calls:
                for tc in response.tool_calls:
                    result = self._execute_tool(tc.name, tc.args)
                    messages.append({"role": "tool", "content": result})
            else:
                return response.content
```

#### Document Processing Pipeline
```
Upload PDF/Excel/Image → R2 Storage →
  OCR (Tesseract/pdf2image) → Text Extraction →
  Document Classification (invoice/PO/receipt/quote) →
  Field Extraction (vendor, amount, date, line items) →
  Confidence Scoring →
  Post to ARIA ERP (create AP invoice, etc.) OR
  Export to SAP (mapped field templates)
```

#### SAP Integration Mapping
```python
SAP_FIELD_MAPPINGS = {
    'AP_INVOICE_NON_PO': {
        'CompCode': 'company_code',
        'DocDate': 'invoice_date',
        'PostDate': 'posting_date',
        'Reference': 'invoice_number',
        'Vendor': 'supplier_code',
        'Amount': 'total_amount',
        'TaxCode': 'tax_code',
        'GLAccount': 'gl_account',
    }
}
```

#### Mega Menu Navigation (6 Categories)
```typescript
const MEGA_MENU_CATEGORIES = [
    { name: 'Financial', icon: DollarSign, items: [
        'General Ledger', 'Accounts Receivable', 'Accounts Payable',
        'Banking & Reconciliation', 'VAT Reporting', 'Budgets'
    ]},
    { name: 'Operations', icon: Truck, items: [
        'Sales Orders', 'Quotes', 'Deliveries', 'Invoices',
        'Purchase Orders', 'Goods Receipts'
    ]},
    { name: 'People', icon: Users, items: [
        'Employees', 'Payroll', 'Leave Management', 'Tax Filings'
    ]},
    { name: 'Services', icon: Wrench, items: [
        'Projects', 'Work Orders', 'Field Service'
    ]},
    { name: 'Compliance', icon: Shield, items: [
        'BBBEE Reporting', 'SARS Filing', 'Audit Trail'
    ]},
    { name: 'Admin', icon: Settings, items: [
        'Company Settings', 'User Management', 'Bot Configuration'
    ]},
];
```

---

## 6. Pablo — AI-Powered IDE

### Architecture
- **Framework**: Next.js 15 (App Router) + Cloudflare Workers (OpenNext)
- **State**: Zustand (one store per domain)
- **Editor**: Monaco Editor + xterm.js Terminal
- **Auth**: NextAuth v5 + GitHub OAuth
- **AI**: Ollama cloud API (OpenAI-compatible)

### Key Patterns Learned

#### Three-Column IDE Layout
```
┌──────────────┬─────────────────────────┬──────────────┐
│   Sidebar    │     Workspace Area      │  Chat Panel  │
│  (48-280px)  │   (flexible, min 400)   │  (280-600px) │
│              │                         │              │
│ - Files      │ - Code Editor (Monaco)  │ - Messages   │
│ - Search     │ - Terminal (xterm.js)   │ - Input      │
│ - Git        │ - Diff Viewer           │ - Actions    │
│ - Memory     │ - API Tester            │              │
│ - Metrics    │ - DB Designer           │              │
│ - MCP        │ - Live Preview          │              │
│              │ - Pipeline View         │              │
└──────────────┴─────────────────────────┴──────────────┘
```

#### Feature Factory Pipeline (7 Stages)
```typescript
const PIPELINE_STAGES = [
    'UNDERSTAND',   // Parse request, identify intent
    'PLAN',         // Break into tasks, identify files
    'IMPLEMENT',    // Generate code changes
    'REVIEW',       // Self-review for bugs, style
    'TEST',         // Generate and run tests
    'INTEGRATE',    // Merge, resolve conflicts
    'DEPLOY',       // Build, deploy, verify
];
// Failed stage → remaining marked as 'skipped' (not 'failed')
```

#### SSE Stream Buffering Fix
```typescript
// TCP chunks may split mid-JSON — must buffer
let buffer = '';
while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    
    buffer += decoder.decode(value, { stream: true });
    const lines = buffer.split('\n');
    buffer = lines.pop() || ''; // Keep incomplete line in buffer
    
    for (const line of lines) {
        if (line.startsWith('data: ')) {
            const data = line.slice(6).trim();
            if (data === '[DONE]') return;
            try {
                const parsed = JSON.parse(data);
                const content = parsed.choices?.[0]?.delta?.content ?? '';
                if (content) yield content;
            } catch { /* partial JSON */ }
        }
    }
}
```

---

## 7. Lokalapp — Local Services Marketplace

### Key Concept: Wallet System
- Digital wallet for local service transactions
- Location-based service discovery
- Service provider ↔ customer matching

---

## 8. MetaRobot — Robotics/Automation

### Key Concept: Robot Command Queue
```typescript
interface RobotCommand {
    type: 'move' | 'rotate' | 'grab' | 'release' | 'scan' | 'speak';
    params: Record<string, number | string>;
    priority: number;
    timeout_ms: number;
}

// Priority queue with FIFO within same priority
class CommandQueue {
    private queue: RobotCommand[] = [];
    enqueue(cmd: RobotCommand) {
        this.queue.push(cmd);
        this.queue.sort((a, b) => b.priority - a.priority);
    }
    dequeue(): RobotCommand | undefined {
        return this.queue.shift();
    }
}
```

---

## Cross-Repo Pattern Summary

| Pattern | Used In |
|---------|---------|
| Cloudflare Workers + Hono | SalesSync, Heirloom, MoreMeAI, ARIA, Pablo |
| D1 Database | SalesSync, Heirloom, MoreMeAI, ARIA |
| R2 Storage | Heirloom, MoreMeAI, ARIA |
| Multi-Tenancy (company_id) | SalesSync, MoreMeAI, ARIA |
| JWT Auth | All repos |
| React + Vite | SalesSync, VerifiAI |
| Next.js App Router | Pablo |
| React + MUI | MoreMeAI |
| Docker Compose | VerifiAI, Heirloom |
| Zustand | Pablo, Heirloom |
| React Query | MoreMeAI, Heirloom |
| PWA/Service Worker | SalesSync, MoreMeAI |
| PostGIS | VerifiAI, SalesSync |
| FastAPI | ARIA |
| Express.js | VerifiAI, ARIA (legacy), SalesSync |
| Workers AI | Heirloom, ARIA, MoreMeAI |
| Playwright E2E | SalesSync |
| PM2 Process Mgmt | ARIA, MoreMeAI |
