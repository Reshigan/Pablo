# Security Patterns — Comprehensive Knowledge Base

## 1. Authentication & Authorization

### JWT Token Architecture
```
Access Token (short-lived: 15min - 24hr)
├── Header: {"alg": "HS256", "typ": "JWT"}
├── Payload: {"sub": "user_id", "email": "...", "company_id": "...", "role": "admin", "exp": ..., "iat": ...}
└── Signature: HMACSHA256(base64(header) + "." + base64(payload), secret)

Refresh Token (long-lived: 7-30 days)
├── Stored in httpOnly cookie or secure storage
├── Used to obtain new access tokens
└── Rotated on each use (invalidates old one)
```

### Role-Based Access Control (RBAC)
```typescript
const ROLE_HIERARCHY = {
    'super-admin': ['admin', 'manager', 'user'],
    'admin': ['manager', 'user'],
    'manager': ['user'],
    'user': [],
};

const PERMISSIONS = {
    'super-admin': ['*'],
    'admin': ['users.manage', 'settings.manage', 'data.export', 'reports.view', 'data.write', 'data.read'],
    'manager': ['reports.view', 'data.write', 'data.read', 'team.manage'],
    'user': ['data.read', 'data.write'],
};

function hasPermission(userRole: string, requiredPermission: string): boolean {
    const perms = PERMISSIONS[userRole] || [];
    return perms.includes('*') || perms.includes(requiredPermission);
}

function hasRole(userRole: string, requiredRole: string): boolean {
    if (userRole === requiredRole) return true;
    return (ROLE_HIERARCHY[userRole] || []).includes(requiredRole);
}
```

### OAuth 2.0 Flow
```
1. Client redirects user to auth provider:
   GET https://provider.com/authorize?
     client_id=X&
     redirect_uri=https://app.com/callback&
     scope=openid+email+profile&
     response_type=code&
     state=random_csrf_token

2. User authenticates, provider redirects back:
   GET https://app.com/callback?code=AUTH_CODE&state=random_csrf_token

3. Server exchanges code for tokens:
   POST https://provider.com/token
   Body: { grant_type: "authorization_code", code: AUTH_CODE, client_id: X, client_secret: Y, redirect_uri: ... }
   Response: { access_token: "...", refresh_token: "...", expires_in: 3600, id_token: "..." }

4. Server validates id_token or calls userinfo endpoint
5. Server creates session/JWT for the user
```

### Multi-Factor Authentication (MFA/2FA)
```python
import pyotp

# Generate TOTP secret for user
secret = pyotp.random_base32()

# Generate QR code URI
uri = pyotp.totp.TOTP(secret).provisioning_uri(
    name=user.email,
    issuer_name='MyApp'
)

# Verify TOTP code
totp = pyotp.TOTP(secret)
is_valid = totp.verify(user_submitted_code, valid_window=1)  # Allow 30s drift
```

### API Key Authentication
```python
import hashlib, secrets

# Generate API key
def generate_api_key():
    key = secrets.token_urlsafe(32)
    key_hash = hashlib.sha256(key.encode()).hexdigest()
    # Store hash in DB, return plain key to user once
    return key, key_hash

# Verify API key
def verify_api_key(provided_key, stored_hash):
    return hashlib.sha256(provided_key.encode()).hexdigest() == stored_hash
```

## 2. Data Protection

### Encryption at Rest
```python
from cryptography.fernet import Fernet
from cryptography.hazmat.primitives import hashes
from cryptography.hazmat.primitives.kdf.pbkdf2 import PBKDF2HMAC
import base64, os

# Derive key from passphrase
def derive_key(passphrase: str, salt: bytes = None):
    if salt is None:
        salt = os.urandom(16)
    kdf = PBKDF2HMAC(
        algorithm=hashes.SHA256(),
        length=32,
        salt=salt,
        iterations=600000,
    )
    key = base64.urlsafe_b64encode(kdf.derive(passphrase.encode()))
    return key, salt

# Encrypt
def encrypt(data: str, key: bytes) -> str:
    f = Fernet(key)
    return f.encrypt(data.encode()).decode()

# Decrypt
def decrypt(encrypted: str, key: bytes) -> str:
    f = Fernet(key)
    return f.decrypt(encrypted.encode()).decode()
```

### Zero-Knowledge Architecture
```
1. User provides passphrase (never transmitted to server)
2. Client derives encryption key via PBKDF2 (100k+ iterations)
3. Client encrypts data with AES-256-GCM
4. Server stores: encrypted_data + salt + IV (NEVER the key/passphrase)
5. To access data: client re-derives key from passphrase, decrypts locally
6. Server cannot read user data even if compromised
```

### Shamir Secret Sharing
```
Split master key into N shares, any K can reconstruct:
- K=3, N=5: Need any 3 of 5 shares to recover key
- Uses polynomial interpolation over finite field GF(256)
- Each share is independent — no partial information leaked
- Use for: disaster recovery, multi-party authorization
```

### Data Masking
```python
def mask_email(email: str) -> str:
    local, domain = email.split('@')
    return f"{local[0]}{'*' * (len(local)-2)}{local[-1]}@{domain}"

def mask_phone(phone: str) -> str:
    digits = ''.join(c for c in phone if c.isdigit())
    return f"{'*' * (len(digits)-4)}{digits[-4:]}"

def mask_card(number: str) -> str:
    return f"****-****-****-{number[-4:]}"

def mask_id(id_number: str) -> str:
    return f"{id_number[:2]}{'*' * (len(id_number)-4)}{id_number[-2:]}"
```

## 3. Input Validation & Sanitization

### SQL Injection Prevention
```python
# NEVER do this:
query = f"SELECT * FROM users WHERE email = '{email}'"  # VULNERABLE

# ALWAYS use parameterized queries:
cursor.execute("SELECT * FROM users WHERE email = %s", (email,))  # PostgreSQL
cursor.execute("SELECT * FROM users WHERE email = ?", (email,))   # SQLite
```

### XSS Prevention
```typescript
// Sanitize HTML output
function escapeHtml(text: string): string {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}

// React automatically escapes JSX — but beware of dangerouslySetInnerHTML
// NEVER: <div dangerouslySetInnerHTML={{ __html: userInput }} />

// Use DOMPurify for rich text:
import DOMPurify from 'dompurify';
const clean = DOMPurify.sanitize(dirtyHtml, { ALLOWED_TAGS: ['b', 'i', 'em', 'strong', 'a'] });
```

### Path Traversal Prevention
```typescript
// NEVER construct file paths from user input directly
// ALWAYS validate and sanitize:
function safePath(basePath: string, userPath: string): string {
    const resolved = path.resolve(basePath, userPath);
    if (!resolved.startsWith(basePath)) {
        throw new Error('Path traversal detected');
    }
    return resolved;
}

// URL path encoding
const safePath = segments.map(s => encodeURIComponent(s)).join('/');
```

### CSRF Protection
```python
# Token-based CSRF protection
import secrets

def generate_csrf_token():
    return secrets.token_hex(32)

# Validate on every state-changing request (POST, PUT, DELETE)
def validate_csrf(request_token, session_token):
    return secrets.compare_digest(request_token, session_token)
```

## 4. API Security

### Rate Limiting
```python
from collections import defaultdict
from time import time

class SlidingWindowRateLimiter:
    def __init__(self, max_requests: int = 100, window_seconds: int = 900):
        self.requests = defaultdict(list)
        self.max = max_requests
        self.window = window_seconds
    
    def is_allowed(self, key: str) -> tuple[bool, dict]:
        now = time()
        # Clean old entries
        self.requests[key] = [t for t in self.requests[key] if now - t < self.window]
        
        remaining = self.max - len(self.requests[key])
        headers = {
            'X-RateLimit-Limit': str(self.max),
            'X-RateLimit-Remaining': str(max(0, remaining)),
            'X-RateLimit-Reset': str(int(now + self.window)),
        }
        
        if remaining <= 0:
            return False, headers
        
        self.requests[key].append(now)
        return True, headers
```

### CORS Configuration
```python
# Strict CORS (production)
ALLOWED_ORIGINS = [
    "https://app.example.com",
    "https://admin.example.com",
]

app.add_middleware(
    CORSMiddleware,
    allow_origins=ALLOWED_ORIGINS,
    allow_credentials=True,
    allow_methods=["GET", "POST", "PUT", "DELETE", "PATCH"],
    allow_headers=["Authorization", "Content-Type", "X-CSRF-Token"],
)

# Development: allow_origins=["*"]
```

### Security Headers
```python
SECURITY_HEADERS = {
    "X-Content-Type-Options": "nosniff",
    "X-Frame-Options": "DENY",
    "X-XSS-Protection": "1; mode=block",
    "Strict-Transport-Security": "max-age=31536000; includeSubDomains; preload",
    "Referrer-Policy": "strict-origin-when-cross-origin",
    "Permissions-Policy": "camera=(), microphone=(), geolocation=(self)",
    "Content-Security-Policy": "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'",
}
```

### API Versioning
```
# URL versioning (most common)
GET /api/v1/customers
GET /api/v2/customers

# Header versioning
Accept: application/vnd.myapp.v2+json

# Query parameter
GET /api/customers?version=2
```

## 5. Compliance & Privacy

### POPIA (South Africa) / GDPR Requirements
```
1. Consent: Obtain explicit consent before processing personal data
2. Purpose limitation: Only collect data for stated purposes
3. Data minimization: Collect only necessary data
4. Storage limitation: Delete data when no longer needed
5. Integrity: Keep data accurate and up-to-date
6. Security: Implement appropriate technical measures
7. Accountability: Document processing activities
8. Right to access: Users can request their data
9. Right to erasure: Users can request deletion
10. Data breach notification: Report within 72 hours
```

### Data Retention Policy
```sql
-- Soft delete (preserve for audit)
UPDATE customers SET is_deleted = TRUE, deleted_at = CURRENT_TIMESTAMP WHERE id = ?;

-- Hard delete with cascade
DELETE FROM customer_notes WHERE customer_id = ?;
DELETE FROM customer_contacts WHERE customer_id = ?;
DELETE FROM customers WHERE id = ?;

-- Automated cleanup (cron)
DELETE FROM audit_log WHERE created_at < DATE_SUB(NOW(), INTERVAL 7 YEAR);
DELETE FROM sessions WHERE expires_at < NOW();
```

### B-BBEE Compliance (South Africa)
```sql
-- Track supplier B-BBEE levels for procurement compliance
CREATE TABLE supplier_bbbee (
    supplier_id TEXT PRIMARY KEY REFERENCES suppliers(id),
    bbbee_level INTEGER CHECK (bbbee_level BETWEEN 1 AND 8),
    certificate_url TEXT,
    certificate_expiry DATE,
    ownership_percentage DECIMAL(5,2),
    turnover_category TEXT,  -- EME, QSE, Generic
    verified_by TEXT,
    verified_at TIMESTAMP
);

-- Procurement targets
-- Level 1: 135% recognition
-- Level 2: 125% recognition
-- Level 3: 110% recognition
-- Level 4: 100% recognition
```

## 6. Infrastructure Security

### Environment Variable Management
```
# NEVER commit secrets to git
# Use .env files (gitignored) for local dev
# Use platform secret managers for production:
# - GitHub Actions: Repository Secrets
# - Cloudflare Workers: wrangler secret put
# - Fly.io: fly secrets set
# - AWS: Secrets Manager / Parameter Store
# - Docker: Docker Secrets

# .env.example (commit this — no real values)
DATABASE_URL=postgresql://user:password@localhost:5432/myapp
JWT_SECRET=change-me-in-production
API_KEY=your-api-key-here
```

### Dependency Security
```bash
# Node.js
npm audit
npm audit fix

# Python
pip-audit
safety check

# Keep dependencies updated
npx npm-check-updates -u
```
