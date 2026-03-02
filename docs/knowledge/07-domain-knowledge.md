# Domain-Specific Knowledge — Comprehensive Knowledge Base

## 1. Sales & CRM Systems

### Customer Lifecycle
```
Lead → Prospect → Qualified → Opportunity → Negotiation → Closed Won/Lost
                                                           ↓
                                                    Active Customer → Renewal → Churn Prevention
```

### Sales Pipeline Schema
```sql
CREATE TABLE leads (
    id TEXT PRIMARY KEY,
    company_id TEXT NOT NULL,
    name TEXT NOT NULL,
    email TEXT,
    phone TEXT,
    source TEXT,           -- website, referral, cold_call, trade_show, social_media
    status TEXT DEFAULT 'new',  -- new, contacted, qualified, disqualified
    score INTEGER DEFAULT 0,    -- Lead scoring (0-100)
    assigned_to TEXT REFERENCES users(id),
    converted_at TIMESTAMP,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE opportunities (
    id TEXT PRIMARY KEY,
    company_id TEXT NOT NULL,
    customer_id TEXT REFERENCES customers(id),
    lead_id TEXT REFERENCES leads(id),
    name TEXT NOT NULL,
    stage TEXT DEFAULT 'discovery',  -- discovery, proposal, negotiation, closed_won, closed_lost
    amount DECIMAL(15,2),
    probability INTEGER DEFAULT 50,  -- Win probability %
    expected_close DATE,
    actual_close DATE,
    loss_reason TEXT,
    assigned_to TEXT REFERENCES users(id),
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE activities (
    id TEXT PRIMARY KEY,
    company_id TEXT NOT NULL,
    type TEXT NOT NULL,        -- call, email, meeting, note, task
    subject TEXT NOT NULL,
    description TEXT,
    related_type TEXT,         -- lead, opportunity, customer, contact
    related_id TEXT,
    assigned_to TEXT REFERENCES users(id),
    due_date TIMESTAMP,
    completed_at TIMESTAMP,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);
```

### Sales Metrics / KPIs
```sql
-- Conversion rate
SELECT 
    COUNT(CASE WHEN stage = 'closed_won' THEN 1 END)::float / 
    NULLIF(COUNT(*), 0) * 100 AS win_rate
FROM opportunities 
WHERE company_id = ? AND created_at >= ?;

-- Average deal size
SELECT AVG(amount) FROM opportunities WHERE stage = 'closed_won' AND company_id = ?;

-- Sales velocity
-- = (# Opportunities × Win Rate × Avg Deal Size) / Sales Cycle Length

-- Pipeline value by stage
SELECT stage, COUNT(*) as count, SUM(amount) as total_value
FROM opportunities WHERE company_id = ? AND stage NOT LIKE 'closed_%'
GROUP BY stage ORDER BY CASE stage 
    WHEN 'discovery' THEN 1 WHEN 'proposal' THEN 2 
    WHEN 'negotiation' THEN 3 END;

-- Revenue forecast
SELECT 
    DATE_TRUNC('month', expected_close) as month,
    SUM(amount * probability / 100) as weighted_forecast
FROM opportunities 
WHERE company_id = ? AND stage NOT LIKE 'closed_%'
GROUP BY month ORDER BY month;
```

### Commission Tracking
```sql
CREATE TABLE commission_rules (
    id TEXT PRIMARY KEY,
    company_id TEXT NOT NULL,
    name TEXT NOT NULL,
    type TEXT DEFAULT 'percentage',  -- percentage, flat, tiered
    rate DECIMAL(5,2),               -- e.g., 10.00 for 10%
    tiers JSONB,                     -- [{"min": 0, "max": 10000, "rate": 5}, {"min": 10001, "rate": 8}]
    product_category TEXT,           -- null = all products
    is_active BOOLEAN DEFAULT TRUE
);

CREATE TABLE commissions (
    id TEXT PRIMARY KEY,
    company_id TEXT NOT NULL,
    agent_id TEXT REFERENCES users(id),
    order_id TEXT REFERENCES sales_orders(id),
    rule_id TEXT REFERENCES commission_rules(id),
    base_amount DECIMAL(12,2),
    commission_amount DECIMAL(12,2),
    status TEXT DEFAULT 'pending',  -- pending, approved, paid
    period TEXT,                    -- 2026-03
    paid_at TIMESTAMP
);
```

## 2. E-Commerce Systems

### Product Catalog
```sql
CREATE TABLE products (
    id TEXT PRIMARY KEY,
    company_id TEXT NOT NULL,
    sku TEXT NOT NULL,
    name TEXT NOT NULL,
    description TEXT,
    short_description TEXT,
    price DECIMAL(12,2) NOT NULL,
    compare_at_price DECIMAL(12,2),  -- For showing discounts
    cost_price DECIMAL(12,2),
    category_id TEXT REFERENCES categories(id),
    brand TEXT,
    weight DECIMAL(8,2),
    dimensions JSONB,  -- {"length": 10, "width": 5, "height": 3, "unit": "cm"}
    images JSONB DEFAULT '[]',
    tags JSONB DEFAULT '[]',
    variants JSONB DEFAULT '[]',
    is_active BOOLEAN DEFAULT TRUE,
    stock_quantity INTEGER DEFAULT 0,
    low_stock_threshold INTEGER DEFAULT 10,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE categories (
    id TEXT PRIMARY KEY,
    company_id TEXT NOT NULL,
    name TEXT NOT NULL,
    slug TEXT NOT NULL,
    parent_id TEXT REFERENCES categories(id),
    description TEXT,
    image_url TEXT,
    sort_order INTEGER DEFAULT 0
);
```

### Shopping Cart & Checkout
```sql
CREATE TABLE carts (
    id TEXT PRIMARY KEY,
    user_id TEXT,          -- null for guest carts
    session_id TEXT,       -- For guest tracking
    items JSONB DEFAULT '[]',  -- [{product_id, variant_id, quantity, price}]
    coupon_code TEXT,
    subtotal DECIMAL(12,2) DEFAULT 0,
    discount DECIMAL(12,2) DEFAULT 0,
    tax DECIMAL(12,2) DEFAULT 0,
    total DECIMAL(12,2) DEFAULT 0,
    expires_at TIMESTAMP,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE orders (
    id TEXT PRIMARY KEY,
    company_id TEXT NOT NULL,
    order_number TEXT UNIQUE NOT NULL,
    customer_id TEXT REFERENCES customers(id),
    status TEXT DEFAULT 'pending',  -- pending, confirmed, processing, shipped, delivered, cancelled, refunded
    payment_status TEXT DEFAULT 'pending',  -- pending, paid, failed, refunded
    payment_method TEXT,  -- credit_card, eft, cash, payfast, stripe
    shipping_method TEXT,
    shipping_address JSONB,
    billing_address JSONB,
    items JSONB NOT NULL,
    subtotal DECIMAL(12,2),
    shipping_cost DECIMAL(12,2) DEFAULT 0,
    tax DECIMAL(12,2),
    discount DECIMAL(12,2) DEFAULT 0,
    total DECIMAL(12,2),
    notes TEXT,
    tracking_number TEXT,
    shipped_at TIMESTAMP,
    delivered_at TIMESTAMP,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);
```

### Payment Integration
```python
# PayFast (South Africa)
def create_payfast_payment(order):
    data = {
        'merchant_id': PAYFAST_MERCHANT_ID,
        'merchant_key': PAYFAST_MERCHANT_KEY,
        'return_url': f'{BASE_URL}/payment/success',
        'cancel_url': f'{BASE_URL}/payment/cancel',
        'notify_url': f'{BASE_URL}/api/payment/webhook',
        'amount': str(order.total),
        'item_name': f'Order #{order.order_number}',
    }
    # Generate signature
    signature = md5('&'.join(f'{k}={urllib.parse.quote_plus(v)}' for k, v in sorted(data.items())))
    data['signature'] = signature
    return f'https://www.payfast.co.za/eng/process?{urllib.parse.urlencode(data)}'

# Stripe
import stripe
stripe.api_key = STRIPE_SECRET_KEY

def create_checkout_session(order):
    session = stripe.checkout.Session.create(
        payment_method_types=['card'],
        line_items=[{
            'price_data': {
                'currency': 'zar',
                'product_data': {'name': item['name']},
                'unit_amount': int(item['price'] * 100),
            },
            'quantity': item['quantity'],
        } for item in order.items],
        mode='payment',
        success_url=f'{BASE_URL}/payment/success?session_id={{CHECKOUT_SESSION_ID}}',
        cancel_url=f'{BASE_URL}/payment/cancel',
    )
    return session.url
```

## 3. Document Management Systems

### Document Schema
```sql
CREATE TABLE documents (
    id TEXT PRIMARY KEY,
    company_id TEXT NOT NULL,
    title TEXT NOT NULL,
    description TEXT,
    file_path TEXT NOT NULL,
    file_type TEXT,           -- pdf, docx, xlsx, jpg, etc.
    file_size INTEGER,
    mime_type TEXT,
    version INTEGER DEFAULT 1,
    status TEXT DEFAULT 'active',  -- active, archived, deleted
    category TEXT,
    tags JSONB DEFAULT '[]',
    metadata JSONB DEFAULT '{}',
    uploaded_by TEXT REFERENCES users(id),
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE document_versions (
    id TEXT PRIMARY KEY,
    document_id TEXT REFERENCES documents(id),
    version_number INTEGER,
    file_path TEXT NOT NULL,
    file_size INTEGER,
    change_summary TEXT,
    uploaded_by TEXT REFERENCES users(id),
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE document_shares (
    id TEXT PRIMARY KEY,
    document_id TEXT REFERENCES documents(id),
    shared_with TEXT REFERENCES users(id),
    permission TEXT DEFAULT 'view',  -- view, edit, admin
    expires_at TIMESTAMP,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);
```

### OCR + AI Document Processing
```
1. Upload document (PDF/image)
2. Extract text via OCR (Tesseract / Textract)
3. Classify document type (invoice, receipt, contract, etc.)
4. Extract structured fields:
   - Invoice: vendor, amount, date, line items, tax
   - Receipt: merchant, total, date, items
   - Contract: parties, dates, terms, signatures
5. Store extracted data as structured JSON
6. Index for search (full-text + vector)
```

## 4. HR & Employee Management

### Employee Lifecycle
```
Recruitment → Onboarding → Active → Performance Review → 
  → Promotion/Transfer → Exit/Offboarding
```

### Leave Management
```sql
CREATE TABLE leave_types (
    id TEXT PRIMARY KEY,
    company_id TEXT NOT NULL,
    name TEXT NOT NULL,        -- Annual, Sick, Family Responsibility, Study, Maternity
    days_per_year INTEGER,
    carry_over BOOLEAN DEFAULT FALSE,
    requires_documentation BOOLEAN DEFAULT FALSE
);

CREATE TABLE leave_requests (
    id TEXT PRIMARY KEY,
    company_id TEXT NOT NULL,
    employee_id TEXT REFERENCES employees(id),
    leave_type_id TEXT REFERENCES leave_types(id),
    start_date DATE NOT NULL,
    end_date DATE NOT NULL,
    days_requested DECIMAL(4,1),
    status TEXT DEFAULT 'pending',  -- pending, approved, rejected, cancelled
    reason TEXT,
    approved_by TEXT REFERENCES users(id),
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);
```

### South African Labour Law Compliance
- BCEA (Basic Conditions of Employment Act):
  - Annual leave: 21 consecutive days per year
  - Sick leave: 30 days over 3-year cycle
  - Family responsibility: 3 days per year
  - Maternity: 4 months
- UIF (Unemployment Insurance Fund): 2% contribution (1% employee, 1% employer)
- SDL (Skills Development Levy): 1% of payroll
- PAYE tax tables (progressive: 18% → 45%)

## 5. Inventory & Warehouse Management

### Stock Management Patterns
```sql
-- Available stock = On hand - Reserved - On order (outgoing) + In transit (incoming)

-- Stock valuation methods
-- FIFO (First In, First Out)
-- LIFO (Last In, First Out)  
-- Weighted Average Cost

-- Reorder point calculation
-- Reorder Point = (Average Daily Usage × Lead Time) + Safety Stock
-- Safety Stock = Z-score × σ(demand) × √(lead time)

-- ABC Analysis
-- A items: 80% of value, 20% of items → tight control
-- B items: 15% of value, 30% of items → moderate control
-- C items: 5% of value, 50% of items → loose control
```

### Barcode/QR Integration
```typescript
// Generate QR code
import QRCode from 'qrcode';
const qrDataUrl = await QRCode.toDataURL(`PRODUCT:${productId}:${sku}`);

// Scan barcode (browser)
import { BrowserMultiFormatReader } from '@zxing/library';
const reader = new BrowserMultiFormatReader();
const result = await reader.decodeFromVideoDevice(null, videoRef.current);
```

## 6. Field Operations & Trade Marketing

### Route Planning
```sql
CREATE TABLE routes (
    id TEXT PRIMARY KEY,
    company_id TEXT NOT NULL,
    name TEXT NOT NULL,
    agent_id TEXT REFERENCES users(id),
    day_of_week INTEGER,  -- 0=Monday
    stops JSONB DEFAULT '[]',  -- [{customer_id, sequence, estimated_time}]
    is_active BOOLEAN DEFAULT TRUE
);

-- Optimized visit scheduling
-- Consider: geographic clustering, visit frequency requirements,
-- agent capacity, customer priority, time windows
```

### GPS Check-in Validation
```javascript
// Validate agent is within 50m of customer location
function validateCheckIn(agentLat, agentLng, customerLat, customerLng) {
    const distance = haversineDistance(agentLat, agentLng, customerLat, customerLng);
    return {
        valid: distance <= 50,
        distance: Math.round(distance),
        message: distance <= 50 ? 'Valid check-in' : `Too far (${Math.round(distance)}m away)`,
    };
}
```

### Survey & Data Collection
```sql
CREATE TABLE survey_templates (
    id TEXT PRIMARY KEY,
    company_id TEXT NOT NULL,
    name TEXT NOT NULL,
    description TEXT,
    questions JSONB NOT NULL,  -- [{id, type, label, options, required, validation}]
    is_active BOOLEAN DEFAULT TRUE
);

-- Question types: text, number, select, multi_select, rating (1-5), 
-- photo, location, barcode, date, yes_no
```

## 7. Financial Systems

### Double-Entry Bookkeeping
```
Every transaction has equal debits and credits:
- Revenue: Credit Revenue, Debit Cash/AR
- Expense: Debit Expense, Credit Cash/AP
- Asset Purchase: Debit Asset, Credit Cash
- Invoice: Debit AR, Credit Revenue + Tax
- Payment Received: Debit Cash, Credit AR
```

### Tax Calculation (South Africa)
```python
# VAT (15%)
def calculate_vat(amount, inclusive=True):
    if inclusive:
        vat = amount - (amount / 1.15)
        excl = amount / 1.15
    else:
        vat = amount * 0.15
        excl = amount
    return {"exclusive": round(excl, 2), "vat": round(vat, 2), "inclusive": round(excl + vat, 2)}

# PAYE Tax Tables (2025/2026)
TAX_BRACKETS = [
    (237100, 0.18, 0),
    (370500, 0.26, 42678),
    (512800, 0.31, 77362),
    (673000, 0.36, 121475),
    (857900, 0.39, 179147),
    (1817000, 0.41, 251258),
    (float('inf'), 0.45, 644489),
]
```

### Aging Analysis
```sql
-- AR Aging Report
SELECT 
    customer_id,
    SUM(CASE WHEN CURRENT_DATE - due_date <= 0 THEN amount_due ELSE 0 END) AS current,
    SUM(CASE WHEN CURRENT_DATE - due_date BETWEEN 1 AND 30 THEN amount_due ELSE 0 END) AS "30_days",
    SUM(CASE WHEN CURRENT_DATE - due_date BETWEEN 31 AND 60 THEN amount_due ELSE 0 END) AS "60_days",
    SUM(CASE WHEN CURRENT_DATE - due_date BETWEEN 61 AND 90 THEN amount_due ELSE 0 END) AS "90_days",
    SUM(CASE WHEN CURRENT_DATE - due_date > 90 THEN amount_due ELSE 0 END) AS "90_plus"
FROM invoices 
WHERE company_id = ? AND status IN ('sent', 'overdue')
GROUP BY customer_id;
```

## 8. Social Media & Content Platforms

### Memory/Journal System
```sql
CREATE TABLE memories (
    id TEXT PRIMARY KEY,
    user_id TEXT NOT NULL,
    content TEXT NOT NULL,
    emotion TEXT,          -- joy, sadness, love, gratitude, etc.
    location TEXT,
    weather TEXT,
    tags JSONB DEFAULT '[]',
    media JSONB DEFAULT '[]',  -- [{url, type, caption}]
    is_private BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Relationship tracking
CREATE TABLE connections (
    id TEXT PRIMARY KEY,
    user_id TEXT NOT NULL,
    name TEXT NOT NULL,
    relationship_type TEXT,  -- partner, family, friend, colleague
    importance_level INTEGER DEFAULT 5,  -- 1-10
    reminders JSONB DEFAULT '[]',  -- birthdays, anniversaries
    last_interaction TIMESTAMP
);
```

### Gamification System
```sql
CREATE TABLE streaks (
    id TEXT PRIMARY KEY,
    user_id TEXT NOT NULL,
    type TEXT NOT NULL,        -- daily_journal, gratitude, exercise
    current_count INTEGER DEFAULT 0,
    longest_count INTEGER DEFAULT 0,
    last_completed DATE,
    freeze_available BOOLEAN DEFAULT FALSE,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE achievements (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    description TEXT,
    icon TEXT,
    requirement_type TEXT,    -- streak, count, milestone
    requirement_value INTEGER,
    xp_reward INTEGER DEFAULT 100
);
```

## 9. Verification & Compliance

### Document Verification Pipeline
```
1. Upload document image
2. Pre-processing (deskew, denoise, enhance)
3. OCR text extraction
4. Field extraction via NER/regex
5. Cross-reference with database
6. Fraud detection (image manipulation, data mismatch)
7. Manual review queue for flagged items
8. Approval/rejection with audit trail
```

### Audit Trail
```sql
CREATE TABLE audit_log (
    id TEXT PRIMARY KEY,
    company_id TEXT NOT NULL,
    user_id TEXT,
    action TEXT NOT NULL,      -- create, update, delete, login, export
    entity_type TEXT NOT NULL,  -- customer, order, invoice, user
    entity_id TEXT,
    old_values JSONB,
    new_values JSONB,
    ip_address TEXT,
    user_agent TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_audit_entity ON audit_log(company_id, entity_type, entity_id);
CREATE INDEX idx_audit_user ON audit_log(company_id, user_id, created_at DESC);
```

## 10. Multi-Language / i18n

### Translation Pattern
```typescript
const translations = {
    en: {
        'nav.dashboard': 'Dashboard',
        'nav.customers': 'Customers',
        'nav.orders': 'Orders',
        'common.save': 'Save',
        'common.cancel': 'Cancel',
        'error.required': '{{field}} is required',
    },
    af: { // Afrikaans
        'nav.dashboard': 'Paneelbord',
        'nav.customers': 'Kliënte',
        'nav.orders': 'Bestellings',
        'common.save': 'Stoor',
        'common.cancel': 'Kanselleer',
    },
    zu: { // Zulu
        'nav.dashboard': 'Ibhodi',
        'nav.customers': 'Amakhasimende',
    }
};

function t(key: string, params?: Record<string, string>): string {
    let text = translations[currentLocale]?.[key] || translations['en'][key] || key;
    if (params) {
        Object.entries(params).forEach(([k, v]) => {
            text = text.replace(`{{${k}}}`, v);
        });
    }
    return text;
}
```

## 11. Robotics & IoT

### Sensor Data Pipeline
```
Sensor → MQTT Broker → Worker (process) → D1 (store) → Dashboard (visualize)
```

### Robot Command Interface
```typescript
interface RobotCommand {
    type: 'move' | 'rotate' | 'grab' | 'release' | 'scan' | 'speak';
    params: Record<string, number | string>;
    priority: number;
    timeout_ms: number;
}

// Command queue with priority
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

## 12. Local Business / Marketplace

### Service Booking System
```sql
CREATE TABLE services (
    id TEXT PRIMARY KEY,
    provider_id TEXT REFERENCES users(id),
    category TEXT NOT NULL,  -- plumbing, electrical, cleaning, tutoring
    name TEXT NOT NULL,
    description TEXT,
    price DECIMAL(10,2),
    price_type TEXT DEFAULT 'fixed',  -- fixed, hourly, quote
    duration_minutes INTEGER,
    is_active BOOLEAN DEFAULT TRUE
);

CREATE TABLE bookings (
    id TEXT PRIMARY KEY,
    service_id TEXT REFERENCES services(id),
    customer_id TEXT REFERENCES users(id),
    provider_id TEXT REFERENCES users(id),
    status TEXT DEFAULT 'pending',  -- pending, confirmed, in_progress, completed, cancelled
    scheduled_date DATE,
    scheduled_time TIME,
    address TEXT,
    lat DECIMAL(10,7), lng DECIMAL(10,7),
    total_price DECIMAL(10,2),
    rating INTEGER,  -- 1-5 after completion
    review TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);
```
