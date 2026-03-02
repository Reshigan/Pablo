# South African Business Patterns — Comprehensive Knowledge Base

> Specific patterns, compliance requirements, and business logic for South African markets.

---

## 1. Tax & Compliance

### VAT (Value Added Tax)
- Standard rate: **15%**
- Registration threshold: R1 million turnover in 12 months
- Filing: Monthly or bi-monthly (VAT201 return)
- Zero-rated: exports, basic food items, fuel levy, public transport
- Exempt: financial services, residential rental, educational services

```python
def calculate_vat(amount, inclusive=True, rate=0.15):
    if inclusive:
        excl = round(amount / (1 + rate), 2)
        vat = round(amount - excl, 2)
    else:
        vat = round(amount * rate, 2)
        excl = amount
    return {"exclusive": excl, "vat": vat, "inclusive": round(excl + vat, 2)}
```

### PAYE (Pay As You Earn) Tax Tables 2025/2026
```python
# Progressive tax brackets
TAX_BRACKETS = [
    (237100,  0.18, 0),       # 0 - 237,100: 18%
    (370500,  0.26, 42678),   # 237,101 - 370,500: 26%
    (512800,  0.31, 77362),   # 370,501 - 512,800: 31%
    (673000,  0.36, 121475),  # 512,801 - 673,000: 36%
    (857900,  0.39, 179147),  # 673,001 - 857,900: 39%
    (1817000, 0.41, 251258),  # 857,901 - 1,817,000: 41%
    (float('inf'), 0.45, 644489),  # 1,817,001+: 45%
]

# Tax rebates (annual)
PRIMARY_REBATE = 17235       # All taxpayers
SECONDARY_REBATE = 9444      # Age 65+
TERTIARY_REBATE = 3145       # Age 75+

# Medical tax credits
MEDICAL_CREDIT_MAIN = 364     # Main member per month
MEDICAL_CREDIT_FIRST_DEP = 364  # First dependent per month
MEDICAL_CREDIT_OTHER = 246     # Additional dependents per month

def calculate_paye(annual_income, age=30):
    tax = 0
    remaining = annual_income
    
    for threshold, rate, base in TAX_BRACKETS:
        if annual_income <= threshold:
            tax = base + (remaining * rate) if base else remaining * rate
            break
        remaining = annual_income - threshold
    
    # Apply rebates
    tax -= PRIMARY_REBATE
    if age >= 65: tax -= SECONDARY_REBATE
    if age >= 75: tax -= TERTIARY_REBATE
    
    return max(0, round(tax, 2))
```

### Employer Contributions
```python
# UIF (Unemployment Insurance Fund)
UIF_RATE = 0.01  # 1% employee + 1% employer = 2% total
UIF_CEILING = 17712.00  # Monthly ceiling (2025)

# SDL (Skills Development Levy)
SDL_RATE = 0.01  # 1% of total payroll
SDL_THRESHOLD = 500000  # Annual payroll threshold for exemption

# COIDA (Compensation for Occupational Injuries)
# Rate varies by industry (0.11% to 8.26% of earnings)
```

### EMP201 Monthly Filing
```python
def generate_emp201(company_id, period):
    """Monthly employer return to SARS"""
    employees = get_active_employees(company_id, period)
    
    total_paye = sum(e.paye_deducted for e in employees)
    total_uif_employee = sum(min(e.gross * UIF_RATE, UIF_CEILING * UIF_RATE) for e in employees)
    total_uif_employer = total_uif_employee  # Matched contribution
    total_sdl = sum(e.gross for e in employees) * SDL_RATE
    
    return {
        "filing_type": "EMP201",
        "period": period,
        "paye": total_paye,
        "uif_employee": total_uif_employee,
        "uif_employer": total_uif_employer,
        "sdl": total_sdl,
        "total_liability": total_paye + total_uif_employee + total_uif_employer + total_sdl,
    }
```

### VAT201 Return
```python
def generate_vat201(company_id, period_start, period_end):
    """Bi-monthly VAT return to SARS"""
    # Output VAT (collected from customers)
    output_vat = db.execute("""
        SELECT COALESCE(SUM(tax_amount), 0) 
        FROM customer_invoices 
        WHERE company_id = ? AND invoice_date BETWEEN ? AND ? AND status = 'posted'
    """, (company_id, period_start, period_end)).fetchone()[0]
    
    # Input VAT (paid to suppliers)
    input_vat = db.execute("""
        SELECT COALESCE(SUM(tax_amount), 0) 
        FROM ap_invoices 
        WHERE company_id = ? AND invoice_date BETWEEN ? AND ? AND status = 'posted'
    """, (company_id, period_start, period_end)).fetchone()[0]
    
    return {
        "filing_type": "VAT201",
        "output_vat": output_vat,
        "input_vat": input_vat,
        "net_vat": output_vat - input_vat,  # Positive = pay SARS, Negative = refund
        "period": f"{period_start} to {period_end}",
    }
```

## 2. B-BBEE (Broad-Based Black Economic Empowerment)

### Scoring Elements
```python
BBBEE_SCORECARD = {
    'ownership': 25,              # Black ownership percentage
    'management_control': 15,     # Black representation in management
    'skills_development': 20,     # Training spend on black employees
    'enterprise_development': 15, # Support for black-owned businesses
    'supplier_development': 10,   # Procurement from black-owned suppliers
    'socio_economic_dev': 5,      # CSI spend
    'yes_targets': 10,            # Youth employment
}

# Level determination
BBBEE_LEVELS = {
    1: (100, 135),   # ≥100 points → 135% procurement recognition
    2: (95, 125),    # 95-99 → 125%
    3: (90, 110),    # 90-94 → 110%
    4: (80, 100),    # 80-89 → 100%
    5: (75, 80),     # 75-79 → 80%
    6: (70, 60),     # 70-74 → 60%
    7: (55, 50),     # 55-69 → 50%
    8: (40, 10),     # 40-54 → 10%
    # Below 40 = Non-Compliant (0% recognition)
}
```

### Supplier B-BBEE Tracking
```sql
CREATE TABLE supplier_bbbee (
    supplier_id TEXT PRIMARY KEY REFERENCES suppliers(id),
    bbbee_level INTEGER CHECK (bbbee_level BETWEEN 1 AND 8),
    bbbee_score DECIMAL(5,2),
    certificate_number TEXT,
    certificate_url TEXT,
    certificate_expiry DATE,
    verification_agency TEXT,
    ownership_percentage DECIMAL(5,2),
    turnover_category TEXT,  -- EME (<R10M), QSE (R10M-R50M), Generic (>R50M)
    verified_at TIMESTAMP,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- EME (Exempted Micro Enterprise): turnover < R10M → automatic Level 4 (or 1 if ≥51% black-owned)
-- QSE (Qualifying Small Enterprise): R10M-R50M → simplified scorecard
-- Generic: >R50M → full scorecard
```

### Procurement Compliance Report
```sql
-- Calculate preferential procurement spend
SELECT 
    s.bbbee_level,
    COUNT(DISTINCT po.supplier_id) AS supplier_count,
    SUM(po.total) AS total_spend,
    SUM(po.total * CASE s.bbbee_level
        WHEN 1 THEN 1.35
        WHEN 2 THEN 1.25
        WHEN 3 THEN 1.10
        WHEN 4 THEN 1.00
        WHEN 5 THEN 0.80
        WHEN 6 THEN 0.60
        WHEN 7 THEN 0.50
        WHEN 8 THEN 0.10
        ELSE 0
    END) AS recognized_spend
FROM purchase_orders po
JOIN supplier_bbbee s ON po.supplier_id = s.supplier_id
WHERE po.company_id = ? AND po.order_date BETWEEN ? AND ?
GROUP BY s.bbbee_level
ORDER BY s.bbbee_level;
```

## 3. South African Banking

### Bank Account Validation
```python
SA_BANK_CODES = {
    '250655': 'ABSA Bank',
    '198765': 'Standard Bank',
    '470010': 'Capitec Bank',
    '580105': 'Capitec Bank (alternative)',
    '632005': 'ABSA Bank (alternative)',
    '460005': 'Nedbank',
    '051001': 'Standard Bank (alternative)',
    '679000': 'Discovery Bank',
    '678910': 'TymeBank',
    '430000': 'Nedbank (alternative)',
    '350005': 'First National Bank',
}

# Account number format: 6-11 digits
# Branch code: 6 digits (universal for major banks)
```

### Payment Methods
```python
PAYMENT_METHODS = [
    'eft',            # Electronic Funds Transfer (most common)
    'debit_order',    # Direct debit
    'credit_card',    # Visa/Mastercard
    'payfast',        # PayFast gateway (SA-specific)
    'snapscan',       # SnapScan (mobile QR)
    'zapper',         # Zapper (mobile QR)
    'ozow',           # Instant EFT
    'cash',           # Cash (field agents)
    'cheque',         # Legacy (declining usage)
]
```

### PayFast Integration
```python
# South Africa's leading payment gateway
PAYFAST_SANDBOX_URL = 'https://sandbox.payfast.co.za/eng/process'
PAYFAST_LIVE_URL = 'https://www.payfast.co.za/eng/process'

def generate_payfast_form(order):
    data = {
        'merchant_id': PAYFAST_MERCHANT_ID,
        'merchant_key': PAYFAST_MERCHANT_KEY,
        'return_url': f'{BASE_URL}/payment/success',
        'cancel_url': f'{BASE_URL}/payment/cancel',
        'notify_url': f'{BASE_URL}/api/payment/webhook',
        'amount': f'{order.total:.2f}',
        'item_name': f'Order #{order.order_number}',
        'email_address': order.customer_email,
    }
    # Generate MD5 signature
    param_string = '&'.join(f'{k}={urllib.parse.quote_plus(str(v))}' for k, v in sorted(data.items()))
    data['signature'] = hashlib.md5(param_string.encode()).hexdigest()
    return data
```

## 4. South African Address Format

```python
SA_PROVINCES = [
    'Gauteng', 'Western Cape', 'KwaZulu-Natal', 'Eastern Cape',
    'Free State', 'Mpumalanga', 'Limpopo', 'North West', 'Northern Cape'
]

# Address format
class SAAddress:
    street_number: str
    street_name: str
    suburb: str         # e.g., Sandton, Rondebosch, Umhlanga
    city: str           # e.g., Johannesburg, Cape Town, Durban
    province: str       # One of 9 provinces
    postal_code: str    # 4 digits
    country: str = 'South Africa'
    
# Phone format: +27 XX XXX XXXX
# ID number: 13 digits (YYMMDD SSSS C A Z)
# Tax number: 10 digits (starts with 0-9)
```

## 5. South African Business Data (Seed Data)

### Major Retailers
```python
SA_CUSTOMERS = [
    {"name": "Shoprite Holdings", "email": "orders@shoprite.co.za", "city": "Cape Town", "province": "Western Cape"},
    {"name": "Pick n Pay", "email": "supply@pnp.co.za", "city": "Cape Town", "province": "Western Cape"},
    {"name": "Woolworths SA", "email": "buyers@woolworths.co.za", "city": "Cape Town", "province": "Western Cape"},
    {"name": "Spar Group", "email": "procurement@spar.co.za", "city": "Pinetown", "province": "KwaZulu-Natal"},
    {"name": "Checkers / Shoprite", "email": "buyers@checkers.co.za", "city": "Cape Town", "province": "Western Cape"},
    {"name": "Makro SA", "email": "supply@makro.co.za", "city": "Johannesburg", "province": "Gauteng"},
    {"name": "Game Stores", "email": "orders@game.co.za", "city": "Johannesburg", "province": "Gauteng"},
    {"name": "Dis-Chem Pharmacies", "email": "supply@dischem.co.za", "city": "Johannesburg", "province": "Gauteng"},
    {"name": "Clicks Group", "email": "procurement@clicks.co.za", "city": "Cape Town", "province": "Western Cape"},
    {"name": "Mr Price Group", "email": "supply@mrprice.co.za", "city": "Durban", "province": "KwaZulu-Natal"},
]
```

### Beverage Industry (Common for Field Operations)
```python
SA_BEVERAGES = [
    {"sku": "BEV-001", "name": "Castle Lager 330ml (24pk)", "price": 249.99, "category": "Beer"},
    {"sku": "BEV-002", "name": "Windhoek Draught 440ml (24pk)", "price": 299.99, "category": "Beer"},
    {"sku": "BEV-003", "name": "Heineken 330ml (24pk)", "price": 349.99, "category": "Beer"},
    {"sku": "BEV-004", "name": "Savanna Dry 330ml (24pk)", "price": 289.99, "category": "Cider"},
    {"sku": "BEV-005", "name": "Hunters Gold 330ml (24pk)", "price": 269.99, "category": "Cider"},
    {"sku": "BEV-006", "name": "Coca-Cola 2L (6pk)", "price": 89.99, "category": "Soft Drinks"},
    {"sku": "BEV-007", "name": "Sprite 2L (6pk)", "price": 84.99, "category": "Soft Drinks"},
    {"sku": "BEV-008", "name": "Red Bull 250ml (24pk)", "price": 599.99, "category": "Energy"},
]
```

### Geographic Reference Points
```python
SA_CITIES = {
    "Johannesburg": {"lat": -26.2041, "lng": 28.0473, "province": "Gauteng"},
    "Cape Town": {"lat": -33.9249, "lng": 18.4241, "province": "Western Cape"},
    "Durban": {"lat": -29.8587, "lng": 31.0218, "province": "KwaZulu-Natal"},
    "Pretoria": {"lat": -25.7479, "lng": 28.2293, "province": "Gauteng"},
    "Port Elizabeth": {"lat": -33.9608, "lng": 25.6022, "province": "Eastern Cape"},
    "Bloemfontein": {"lat": -29.0852, "lng": 26.1596, "province": "Free State"},
    "East London": {"lat": -33.0292, "lng": 27.8546, "province": "Eastern Cape"},
    "Polokwane": {"lat": -23.9045, "lng": 29.4689, "province": "Limpopo"},
    "Nelspruit": {"lat": -25.4753, "lng": 30.9694, "province": "Mpumalanga"},
    "Kimberley": {"lat": -28.7323, "lng": 24.7628, "province": "Northern Cape"},
}
```

## 6. Currency & Number Formatting

```python
# South African Rand (ZAR)
def format_zar(amount):
    """Format as R 1,234.56"""
    return f"R {amount:,.2f}"

# Number formatting: space as thousands separator in some contexts
# R 1 234,56 (formal/financial) or R1,234.56 (digital)

# Date format: DD/MM/YYYY or YYYY-MM-DD (ISO)
# Time: 24-hour format standard

# Phone: +27 XX XXX XXXX or 0XX XXX XXXX (local)
def format_sa_phone(phone):
    digits = ''.join(c for c in phone if c.isdigit())
    if digits.startswith('27'):
        digits = '0' + digits[2:]
    if len(digits) == 10:
        return f"{digits[:3]} {digits[3:6]} {digits[6:]}"
    return phone
```

## 7. Labour Law (BCEA)

### Leave Entitlements
```python
LEAVE_TYPES = {
    'annual': {
        'days': 21,  # 21 consecutive days (15 working days)
        'accrual': 'monthly',  # 1.25 days per month
        'carry_over': True,
        'max_carry': 30,  # Max accumulated days
    },
    'sick': {
        'days': 30,  # Over 3-year cycle
        'first_6_months': 1,  # 1 day per 26 worked in first 6 months
        'documentation': 'Required for 2+ consecutive days',
    },
    'family_responsibility': {
        'days': 3,  # Per annual cycle
        'eligible_events': ['child_birth', 'child_illness', 'death_of_family'],
    },
    'maternity': {
        'days': 120,  # 4 months (unpaid by employer, UIF pays)
        'start': '4 weeks before due date or earlier',
        'cannot_work': '6 weeks after birth',
    },
    'paternity': {
        'days': 10,  # Per new legislation
    },
}
```

### Working Hours
```python
WORKING_HOURS = {
    'max_ordinary_hours': 45,     # Per week
    'max_daily_hours': 9,         # 5-day week
    'max_daily_hours_6day': 8,    # 6-day week
    'overtime_rate': 1.5,         # 1.5x normal rate
    'sunday_rate': 2.0,           # 2x normal rate
    'public_holiday_rate': 2.0,   # 2x normal rate
    'night_shift_allowance': 0.1, # 10% premium for work between 18:00-06:00
    'max_overtime_per_week': 10,  # Hours
}

SA_PUBLIC_HOLIDAYS_2026 = [
    "2026-01-01",  # New Year's Day
    "2026-03-21",  # Human Rights Day
    "2026-04-03",  # Good Friday
    "2026-04-06",  # Family Day
    "2026-04-27",  # Freedom Day
    "2026-05-01",  # Workers' Day
    "2026-06-16",  # Youth Day
    "2026-08-09",  # National Women's Day
    "2026-09-24",  # Heritage Day
    "2026-12-16",  # Day of Reconciliation
    "2026-12-25",  # Christmas Day
    "2026-12-26",  # Day of Goodwill
]
```

## 8. POPIA (Protection of Personal Information Act)

### Compliance Requirements
```python
POPIA_REQUIREMENTS = {
    'consent': 'Must obtain explicit consent before processing personal info',
    'purpose_limitation': 'Collect only for stated, lawful purposes',
    'minimality': 'Collect only what is necessary',
    'retention': 'Delete when no longer needed',
    'security': 'Implement appropriate safeguards',
    'data_subject_rights': [
        'Right to access their personal information',
        'Right to correction of inaccurate data',
        'Right to deletion (subject to retention requirements)',
        'Right to object to processing',
        'Right to data portability',
    ],
    'breach_notification': 'Notify Information Regulator and affected persons ASAP',
    'penalties': 'Up to R10 million fine and/or imprisonment',
}

# Implementation pattern
class POPIACompliance:
    @staticmethod
    def anonymize_for_export(data):
        """Remove or mask PII for analytics/reporting"""
        return {
            **data,
            'name': mask_name(data['name']),
            'email': mask_email(data['email']),
            'phone': mask_phone(data['phone']),
            'id_number': mask_id(data.get('id_number', '')),
        }
    
    @staticmethod
    def get_consent_record(user_id):
        """Track what user consented to and when"""
        return db.execute(
            "SELECT * FROM consent_records WHERE user_id = ? ORDER BY created_at DESC",
            (user_id,)
        ).fetchall()
```

## 9. Industry-Specific Patterns

### Liquor Industry (VerifiAI)
```python
# Liquor license requirements vary by province
# NFC tags for anti-counterfeit
# Track: bottle serial → NFC tag → scan location → verification result
# Geographic patterns indicate counterfeit hotspots
```

### FMCG Distribution (SalesSync)
```python
# Fast-Moving Consumer Goods field operations
# Van sales: load → sell → reconcile cash
# Route optimization by geographic cluster
# Board placement: marketing material at retail outlets
# Coverage calculation: board_area / storefront_area
# Commission types: flat, per-unit, percentage, tiered, coverage-based
```

### Financial Services (ARIA)
```python
# Chart of Accounts: follows SA standard
# Double-entry bookkeeping
# VAT-inclusive pricing (default)
# Multi-currency support (ZAR primary)
# Aging analysis: Current, 30, 60, 90, 90+ days
```
