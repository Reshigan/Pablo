# Database Patterns — Comprehensive Knowledge Base

## 1. Schema Design

### Multi-Tenant Schema
```sql
-- Every table has company_id / tenant_id
CREATE TABLE companies (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    domain TEXT,
    settings JSONB DEFAULT '{}',
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE users (
    id TEXT PRIMARY KEY,
    email TEXT NOT NULL,
    password_hash TEXT NOT NULL,
    role TEXT DEFAULT 'user',  -- super-admin, admin, manager, user
    company_id TEXT NOT NULL REFERENCES companies(id),
    is_active BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(email, company_id)
);

-- Pattern: Every data table includes company_id
CREATE TABLE customers (
    id TEXT PRIMARY KEY,
    company_id TEXT NOT NULL REFERENCES companies(id),
    name TEXT NOT NULL,
    email TEXT,
    phone TEXT,
    address TEXT,
    metadata JSONB DEFAULT '{}',
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_customers_company ON customers(company_id);
CREATE INDEX idx_customers_email ON customers(company_id, email);
```

### ERP Schema Patterns

#### Order-to-Cash (O2C)
```sql
CREATE TABLE quotes (
    id TEXT PRIMARY KEY,
    company_id TEXT NOT NULL,
    customer_id TEXT REFERENCES customers(id),
    quote_number TEXT NOT NULL,
    status TEXT DEFAULT 'draft',  -- draft, sent, accepted, rejected, expired
    subtotal DECIMAL(12,2) DEFAULT 0,
    tax DECIMAL(12,2) DEFAULT 0,
    total DECIMAL(12,2) DEFAULT 0,
    valid_until DATE,
    created_by TEXT REFERENCES users(id),
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE quote_lines (
    id TEXT PRIMARY KEY,
    quote_id TEXT REFERENCES quotes(id) ON DELETE CASCADE,
    product_id TEXT REFERENCES products(id),
    description TEXT,
    quantity DECIMAL(10,2) NOT NULL,
    unit_price DECIMAL(12,2) NOT NULL,
    discount_percent DECIMAL(5,2) DEFAULT 0,
    tax_rate DECIMAL(5,2) DEFAULT 15.0,  -- South Africa VAT
    line_total DECIMAL(12,2) NOT NULL
);

-- Flow: Quote → Sales Order → Delivery → Invoice → Receipt
CREATE TABLE sales_orders (
    id TEXT PRIMARY KEY,
    company_id TEXT NOT NULL,
    customer_id TEXT REFERENCES customers(id),
    quote_id TEXT REFERENCES quotes(id),
    order_number TEXT NOT NULL,
    status TEXT DEFAULT 'pending',  -- pending, confirmed, shipped, delivered, cancelled
    total DECIMAL(12,2) NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE deliveries (
    id TEXT PRIMARY KEY,
    company_id TEXT NOT NULL,
    order_id TEXT REFERENCES sales_orders(id),
    delivery_number TEXT NOT NULL,
    status TEXT DEFAULT 'pending',  -- pending, in_transit, delivered
    delivered_at TIMESTAMP,
    tracking_number TEXT
);

CREATE TABLE invoices (
    id TEXT PRIMARY KEY,
    company_id TEXT NOT NULL,
    customer_id TEXT REFERENCES customers(id),
    order_id TEXT REFERENCES sales_orders(id),
    invoice_number TEXT NOT NULL,
    status TEXT DEFAULT 'draft',  -- draft, sent, paid, overdue, cancelled
    subtotal DECIMAL(12,2),
    tax DECIMAL(12,2),
    total DECIMAL(12,2),
    due_date DATE,
    paid_at TIMESTAMP
);
```

#### Procure-to-Pay (P2P)
```sql
CREATE TABLE suppliers (
    id TEXT PRIMARY KEY,
    company_id TEXT NOT NULL,
    name TEXT NOT NULL,
    email TEXT,
    phone TEXT,
    bbbee_level INTEGER,  -- South Africa compliance
    bbbee_certificate TEXT,
    bbbee_expiry DATE,
    tax_number TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Flow: Purchase Order → Goods Receipt → AP Invoice → Payment
CREATE TABLE purchase_orders (
    id TEXT PRIMARY KEY, company_id TEXT NOT NULL,
    supplier_id TEXT REFERENCES suppliers(id),
    po_number TEXT NOT NULL,
    status TEXT DEFAULT 'draft',
    total DECIMAL(12,2),
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);
```

#### Financial Accounting
```sql
CREATE TABLE chart_of_accounts (
    id TEXT PRIMARY KEY,
    company_id TEXT NOT NULL,
    account_code TEXT NOT NULL,
    account_name TEXT NOT NULL,
    account_type TEXT NOT NULL,  -- asset, liability, equity, revenue, expense
    parent_id TEXT REFERENCES chart_of_accounts(id),
    balance DECIMAL(15,2) DEFAULT 0,
    is_active BOOLEAN DEFAULT TRUE
);

CREATE TABLE journal_entries (
    id TEXT PRIMARY KEY,
    company_id TEXT NOT NULL,
    entry_number TEXT NOT NULL,
    entry_date DATE NOT NULL,
    description TEXT,
    reference_type TEXT,  -- invoice, receipt, payment, manual
    reference_id TEXT,
    status TEXT DEFAULT 'draft',  -- draft, posted, reversed
    created_by TEXT REFERENCES users(id),
    posted_at TIMESTAMP
);

CREATE TABLE journal_lines (
    id TEXT PRIMARY KEY,
    entry_id TEXT REFERENCES journal_entries(id),
    account_id TEXT REFERENCES chart_of_accounts(id),
    debit DECIMAL(15,2) DEFAULT 0,
    credit DECIMAL(15,2) DEFAULT 0,
    description TEXT
);
```

#### Inventory Management
```sql
CREATE TABLE products (
    id TEXT PRIMARY KEY,
    company_id TEXT NOT NULL,
    sku TEXT NOT NULL,
    name TEXT NOT NULL,
    description TEXT,
    unit_price DECIMAL(12,2),
    cost_price DECIMAL(12,2),
    category TEXT,
    is_active BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE warehouses (
    id TEXT PRIMARY KEY,
    company_id TEXT NOT NULL,
    name TEXT NOT NULL,
    location TEXT,
    is_active BOOLEAN DEFAULT TRUE
);

CREATE TABLE stock_on_hand (
    id TEXT PRIMARY KEY,
    company_id TEXT NOT NULL,
    product_id TEXT REFERENCES products(id),
    warehouse_id TEXT REFERENCES warehouses(id),
    quantity DECIMAL(10,2) DEFAULT 0,
    reserved_quantity DECIMAL(10,2) DEFAULT 0,
    UNIQUE(product_id, warehouse_id)
);

CREATE TABLE stock_movements (
    id TEXT PRIMARY KEY,
    company_id TEXT NOT NULL,
    product_id TEXT REFERENCES products(id),
    warehouse_id TEXT REFERENCES warehouses(id),
    movement_type TEXT NOT NULL,  -- receipt, issue, transfer, adjustment
    quantity DECIMAL(10,2) NOT NULL,
    reference_type TEXT,
    reference_id TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);
```

### HR & Payroll Schema
```sql
CREATE TABLE employees (
    id TEXT PRIMARY KEY,
    company_id TEXT NOT NULL,
    user_id TEXT REFERENCES users(id),
    employee_number TEXT NOT NULL,
    first_name TEXT, last_name TEXT,
    department TEXT,
    position TEXT,
    hire_date DATE,
    salary DECIMAL(12,2),
    tax_number TEXT,
    bank_account TEXT,
    is_active BOOLEAN DEFAULT TRUE
);

CREATE TABLE payroll_runs (
    id TEXT PRIMARY KEY,
    company_id TEXT NOT NULL,
    period_start DATE, period_end DATE,
    status TEXT DEFAULT 'draft',  -- draft, calculated, approved, paid
    total_gross DECIMAL(15,2),
    total_tax DECIMAL(15,2),
    total_net DECIMAL(15,2),
    processed_at TIMESTAMP
);
```

### Field Operations Schema
```sql
CREATE TABLE visits (
    id TEXT PRIMARY KEY,
    company_id TEXT NOT NULL,
    agent_id TEXT REFERENCES users(id),
    customer_id TEXT REFERENCES customers(id),
    status TEXT DEFAULT 'planned',  -- planned, checked_in, completed, cancelled
    check_in_time TIMESTAMP,
    check_in_lat DECIMAL(10,7),
    check_in_lng DECIMAL(10,7),
    check_out_time TIMESTAMP,
    notes TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE visit_tasks (
    id TEXT PRIMARY KEY,
    visit_id TEXT REFERENCES visits(id),
    task_type TEXT NOT NULL,  -- survey, board_placement, distribution, photo
    status TEXT DEFAULT 'pending',
    is_mandatory BOOLEAN DEFAULT FALSE,
    sequence_order INTEGER,
    data JSONB DEFAULT '{}',
    completed_at TIMESTAMP
);
```

## 2. PostGIS (Geographic Extensions)

### Spatial Queries
```sql
-- Enable PostGIS
CREATE EXTENSION IF NOT EXISTS postgis;

-- Distance calculation (Haversine)
SELECT *, ST_Distance(
    ST_MakePoint(lng, lat)::geography,
    ST_MakePoint(target_lng, target_lat)::geography
) AS distance_meters
FROM locations
WHERE ST_DWithin(
    ST_MakePoint(lng, lat)::geography,
    ST_MakePoint(target_lng, target_lat)::geography,
    10  -- 10 meters radius
);

-- Heat map clustering
SELECT
    ST_X(ST_SnapToGrid(geom, 0.01)) AS grid_x,
    ST_Y(ST_SnapToGrid(geom, 0.01)) AS grid_y,
    COUNT(*) AS point_count
FROM detections
GROUP BY grid_x, grid_y;
```

### GPS Validation (Haversine Formula)
```javascript
function haversineDistance(lat1, lon1, lat2, lon2) {
    const R = 6371000; // Earth radius in meters
    const dLat = (lat2 - lat1) * Math.PI / 180;
    const dLon = (lon2 - lon1) * Math.PI / 180;
    const a = Math.sin(dLat/2)**2 + 
              Math.cos(lat1 * Math.PI/180) * Math.cos(lat2 * Math.PI/180) * 
              Math.sin(dLon/2)**2;
    return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
}
// Validate agent is within 10m of customer location
```

## 3. Migration Strategies

### Numbered Sequential Migrations
```
migrations/
├── 001_initial_schema.sql
├── 002_add_orders.sql
├── 003_add_inventory.sql
├── 004_add_field_operations.sql
└── 005_add_commissions.sql
```

### Migration Runner Pattern
```python
def run_migrations(db):
    db.execute("""
        CREATE TABLE IF NOT EXISTS schema_migrations (
            version TEXT PRIMARY KEY,
            applied_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        )
    """)
    
    migration_files = sorted(glob.glob('migrations/*.sql'))
    for filepath in migration_files:
        version = os.path.basename(filepath)
        if not db.execute("SELECT 1 FROM schema_migrations WHERE version = ?", (version,)).fetchone():
            with open(filepath) as f:
                db.executescript(f.read())
            db.execute("INSERT INTO schema_migrations (version) VALUES (?)", (version,))
            db.commit()
            print(f"Applied: {version}")
```

### D1 Migrations (Cloudflare)
```bash
# Create migration
wrangler d1 migrations create my-db add_users_table

# Apply locally
wrangler d1 migrations apply my-db --local

# Apply to production
wrangler d1 migrations apply my-db --remote
```

## 4. Query Optimization

### Indexing Strategy
```sql
-- Primary lookup patterns
CREATE INDEX idx_table_company_id ON table_name(company_id);
CREATE INDEX idx_table_status ON table_name(company_id, status);
CREATE INDEX idx_table_created ON table_name(company_id, created_at DESC);
CREATE INDEX idx_table_search ON table_name(company_id, name);

-- Composite indexes for common query patterns
CREATE INDEX idx_invoices_aging ON invoices(company_id, status, due_date) WHERE status != 'paid';

-- Full-text search
CREATE VIRTUAL TABLE items_fts USING fts5(name, description, content='items', content_rowid='rowid');
```

### SQLite Performance
```sql
PRAGMA journal_mode=WAL;        -- Write-Ahead Logging
PRAGMA foreign_keys=ON;          -- Enforce FK constraints
PRAGMA synchronous=NORMAL;       -- Faster writes (safe with WAL)
PRAGMA cache_size=-64000;        -- 64MB cache
```

## 5. Data Seeding

### Realistic Test Data Pattern
```python
def seed_production_data(db, company_id):
    # South African business data
    customers = [
        {"name": "Shoprite Holdings", "email": "orders@shoprite.co.za", "phone": "+27 21 980 4000"},
        {"name": "Pick n Pay", "email": "supply@pnp.co.za", "phone": "+27 21 658 1000"},
        {"name": "Woolworths SA", "email": "buyers@woolworths.co.za", "phone": "+27 21 407 9111"},
    ]
    
    products = [
        {"sku": "BEV-001", "name": "Castle Lager 330ml (24pk)", "price": 249.99, "category": "Beverages"},
        {"sku": "BEV-002", "name": "Windhoek Draught 440ml (24pk)", "price": 299.99, "category": "Beverages"},
    ]
    
    # Generate realistic transactions
    for i in range(50):
        create_quote(db, company_id, random.choice(customers), random.sample(products, k=random.randint(1,5)))
```

## 6. Caching Strategies

### In-Memory Cache (Worker)
```typescript
const cache = new Map<string, { data: any; expires: number }>();
const CACHE_TTL = 60000; // 60 seconds

function getCached(key: string) {
    const entry = cache.get(key);
    if (entry && Date.now() < entry.expires) return entry.data;
    cache.delete(key);
    return null;
}

function setCache(key: string, data: any) {
    // LRU eviction at 5000 entries
    if (cache.size >= 5000) {
        const firstKey = cache.keys().next().value;
        cache.delete(firstKey);
    }
    cache.set(key, { data, expires: Date.now() + CACHE_TTL });
}
```

### Redis Caching
```javascript
// Cache with TTL
await redis.setex(`dashboard:${companyId}`, 300, JSON.stringify(data)); // 5 min TTL

// Cache-aside pattern
async function getDashboard(companyId) {
    const cached = await redis.get(`dashboard:${companyId}`);
    if (cached) return JSON.parse(cached);
    
    const data = await db.query('SELECT ...');
    await redis.setex(`dashboard:${companyId}`, 300, JSON.stringify(data));
    return data;
}
```
