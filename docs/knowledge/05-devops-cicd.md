# DevOps, CI/CD & Deployment — Comprehensive Knowledge Base

## 1. GitHub Actions

### Standard CI/CD Workflow
```yaml
name: CI / Deploy
on:
  push:
    branches: [main]
  pull_request:
    branches: [main]

jobs:
  lint-and-test:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: '20'
          cache: 'npm'
      - run: npm ci
      - run: npm run lint
      - run: npm run type-check
      - run: npm test -- --ci

  build-and-deploy:
    needs: lint-and-test
    if: github.event_name == 'push' && github.ref == 'refs/heads/main'
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with: { node-version: '20', cache: 'npm' }
      - run: npm ci
      - run: npm run build
        env:
          NODE_ENV: production
      - name: Deploy
        run: npx wrangler deploy
        env:
          CLOUDFLARE_ACCOUNT_ID: ${{ secrets.CLOUDFLARE_ACCOUNT_ID }}
          CLOUDFLARE_API_TOKEN: ${{ secrets.CLOUDFLARE_API_TOKEN }}
```

### Python CI Workflow
```yaml
jobs:
  test:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-python@v5
        with: { python-version: '3.12' }
      - run: pip install poetry
      - run: poetry install
      - run: poetry run pytest
      - run: poetry run ruff check .
      - run: poetry run mypy app/
```

### Secrets Management via API
```python
import requests
from nacl import encoding, public
import base64

def set_github_secret(owner, repo, pat, secret_name, secret_value):
    headers = {"Authorization": f"token {pat}", "Accept": "application/vnd.github+json"}
    
    # Get public key for encryption
    key_resp = requests.get(
        f"https://api.github.com/repos/{owner}/{repo}/actions/secrets/public-key",
        headers=headers
    ).json()
    
    # Encrypt using libsodium sealed box
    public_key = public.PublicKey(key_resp["key"].encode("utf-8"), encoding.Base64Encoder())
    sealed_box = public.SealedBox(public_key)
    encrypted = base64.b64encode(
        sealed_box.encrypt(secret_value.encode("utf-8"))
    ).decode("utf-8")
    
    # Set the secret
    requests.put(
        f"https://api.github.com/repos/{owner}/{repo}/actions/secrets/{secret_name}",
        headers=headers,
        json={"encrypted_value": encrypted, "key_id": key_resp["key_id"]}
    )
```

### Matrix Testing
```yaml
strategy:
  matrix:
    node-version: [18, 20, 22]
    os: [ubuntu-latest, macos-latest]
  fail-fast: false
```

## 2. Docker

### Multi-Stage Build (Node.js)
```dockerfile
# Build stage
FROM node:20-alpine AS builder
WORKDIR /app
COPY package*.json ./
RUN npm ci
COPY . .
RUN npm run build

# Production stage
FROM node:20-alpine
WORKDIR /app
COPY --from=builder /app/dist ./dist
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/package.json ./
EXPOSE 3000
CMD ["node", "dist/index.js"]
```

### Multi-Stage Build (Python)
```dockerfile
FROM python:3.12-slim AS builder
WORKDIR /app
RUN pip install poetry
COPY pyproject.toml poetry.lock ./
RUN poetry export -f requirements.txt > requirements.txt
RUN pip install --target=/deps -r requirements.txt

FROM python:3.12-slim
WORKDIR /app
COPY --from=builder /deps /usr/local/lib/python3.12/site-packages
COPY . .
EXPOSE 8000
CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8000"]
```

### Docker Compose (Full Stack)
```yaml
version: '3.8'
services:
  db:
    image: postgres:16-alpine
    environment:
      POSTGRES_DB: myapp
      POSTGRES_USER: postgres
      POSTGRES_PASSWORD: postgres
    volumes:
      - pgdata:/var/lib/postgresql/data
    ports: ["5432:5432"]
    healthcheck:
      test: ["CMD-SHELL", "pg_isready -U postgres"]
      interval: 5s
      timeout: 5s
      retries: 5

  redis:
    image: redis:7-alpine
    ports: ["6379:6379"]

  backend:
    build: ./backend
    ports: ["3001:3001"]
    env_file: ./backend/.env
    depends_on:
      db: { condition: service_healthy }
      redis: { condition: service_started }

  frontend:
    build: ./frontend
    ports: ["3000:80"]
    depends_on: [backend]

  nginx:
    image: nginx:alpine
    ports: ["80:80", "443:443"]
    volumes:
      - ./nginx/conf.d:/etc/nginx/conf.d
      - ./nginx/ssl:/etc/nginx/ssl
    depends_on: [frontend, backend]

volumes:
  pgdata:
```

## 3. Cloudflare Deployment

### Worker Deployment
```bash
# Install wrangler
npm install -g wrangler

# Login (interactive)
wrangler login

# Deploy
wrangler deploy

# Set secrets
wrangler secret put AUTH_SECRET
wrangler secret put DATABASE_URL

# Tail logs
wrangler tail
```

### Worker Custom Domain Setup
```bash
# 1. Get zone ID
curl "https://api.cloudflare.com/client/v4/zones?name=example.com" \
  -H "X-Auth-Email: email" -H "X-Auth-Key: key"

# 2. Remove existing DNS records if needed
curl -X DELETE "https://api.cloudflare.com/client/v4/zones/{zone_id}/dns_records/{record_id}"

# 3. Add Worker custom domain
curl -X PUT "https://api.cloudflare.com/client/v4/accounts/{account_id}/workers/domains" \
  -d '{"hostname": "app.example.com", "service": "worker-name", "environment": "production", "zone_id": "..."}'

# Cloudflare auto-creates AAAA record → 100:: and provisions SSL
```

### Pages Deployment
```bash
# Direct upload
wrangler pages deploy ./dist --project-name=my-app

# Or via API
curl -X POST "https://api.cloudflare.com/client/v4/accounts/{id}/pages/projects/{name}/deployments" \
  -F "manifest=..." -F "file1=@dist/index.html"
```

## 4. Fly.io Deployment (FastAPI)

### Deployment Steps
```bash
# 1. Create app
fly launch --name my-api --region iad

# 2. Set secrets
fly secrets set DATABASE_URL=...
fly secrets set JWT_SECRET=...

# 3. Deploy
fly deploy

# 4. Add persistent volume (SQLite)
fly volumes create data --size 1 --region iad
# Mount at /data in fly.toml
```

### Fly.toml Configuration
```toml
app = "my-api"
primary_region = "iad"

[build]
  builder = "paketobuildpacks/builder:base"

[env]
  PORT = "8000"

[http_service]
  internal_port = 8000
  force_https = true
  auto_stop_machines = true
  auto_start_machines = true

[[vm]]
  cpu_kind = "shared"
  cpus = 1
  memory_mb = 256

[mounts]
  source = "data"
  destination = "/data"
```

## 5. Nginx Configuration

### Full Production Config
```nginx
# Rate limiting
limit_req_zone $binary_remote_addr zone=api:10m rate=30r/s;

server {
    listen 443 ssl http2;
    server_name app.example.com;
    
    ssl_certificate /etc/ssl/certs/fullchain.pem;
    ssl_certificate_key /etc/ssl/private/privkey.pem;
    ssl_protocols TLSv1.2 TLSv1.3;
    ssl_ciphers HIGH:!aNULL:!MD5;
    
    # Security headers
    add_header X-Frame-Options "DENY" always;
    add_header X-Content-Type-Options "nosniff" always;
    add_header X-XSS-Protection "1; mode=block" always;
    add_header Strict-Transport-Security "max-age=31536000" always;
    add_header Referrer-Policy "strict-origin-when-cross-origin" always;
    
    # Gzip
    gzip on;
    gzip_types text/css application/javascript application/json image/svg+xml;
    gzip_min_length 1000;
    
    # Static files
    location /assets {
        root /usr/share/nginx/html;
        expires 1y;
        add_header Cache-Control "public, immutable";
    }
    
    # Frontend
    location / {
        proxy_pass http://frontend:3000;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }
    
    # API with rate limiting
    location /api/ {
        limit_req zone=api burst=20 nodelay;
        proxy_pass http://backend:3001;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
    }
    
    # WebSocket support
    location /ws/ {
        proxy_pass http://backend:3001;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection "upgrade";
    }
}

# HTTP → HTTPS redirect
server {
    listen 80;
    server_name app.example.com;
    return 301 https://$host$request_uri;
}
```

## 6. SSL / HTTPS

### Certbot (Let's Encrypt)
```bash
# Install
apt install certbot python3-certbot-nginx

# Get certificate
certbot --nginx -d app.example.com -d www.example.com

# Auto-renewal (cron)
0 0 1 * * certbot renew --post-hook "systemctl reload nginx"
```

### Cloudflare SSL
- Automatic SSL for custom domains
- Edge certificates (managed by Cloudflare)
- Origin certificates (for nginx ↔ Cloudflare communication)
- Full (strict) mode recommended

## 7. PM2 Process Management

### ecosystem.config.js
```javascript
module.exports = {
  apps: [
    {
      name: 'backend',
      script: './backend/dist/index.js',
      instances: 'max',
      exec_mode: 'cluster',
      env_production: {
        NODE_ENV: 'production',
        PORT: 3001,
      },
    },
    {
      name: 'frontend',
      script: 'serve',
      args: '-s frontend/dist -l 3000',
    },
  ],
};
```

## 8. Monitoring & Logging

### Health Check Endpoint
```python
@app.get("/health")
async def health():
    # Check DB connection
    try:
        db = get_db()
        db.execute("SELECT 1")
        db_ok = True
    except:
        db_ok = False
    
    return {
        "status": "healthy" if db_ok else "degraded",
        "version": "1.0.0",
        "timestamp": datetime.utcnow().isoformat(),
        "components": {
            "database": "ok" if db_ok else "error",
        }
    }
```

### Structured Logging
```python
import logging, json

class JSONFormatter(logging.Formatter):
    def format(self, record):
        return json.dumps({
            "level": record.levelname,
            "message": record.getMessage(),
            "timestamp": self.formatTime(record),
            "module": record.module,
            "function": record.funcName,
        })
```

## 9. Environment Management

### .env File Pattern
```env
# App
NODE_ENV=production
PORT=3000
BASE_URL=https://app.example.com

# Auth
JWT_SECRET=your-secret-here
AUTH_SECRET=your-nextauth-secret

# Database
DATABASE_URL=postgresql://user:pass@localhost:5432/myapp
# or for SQLite: DATABASE_URL=/data/app.db

# External APIs
GITHUB_CLIENT_ID=xxx
GITHUB_CLIENT_SECRET=xxx
OLLAMA_URL=https://api.example.com/v1
OLLAMA_API_KEY=xxx

# Cloudflare
CLOUDFLARE_ACCOUNT_ID=xxx
CLOUDFLARE_API_TOKEN=xxx
```

### Multi-Environment Config
```
.env                # Shared defaults
.env.local          # Local overrides (gitignored)
.env.production     # Production values
.env.example        # Template for new devs
```

## 10. DNS Configuration

### Cloudflare DNS API
```bash
# List records
curl "https://api.cloudflare.com/client/v4/zones/{zone_id}/dns_records" \
  -H "X-Auth-Email: email" -H "X-Auth-Key: key"

# Create A record
curl -X POST "https://api.cloudflare.com/client/v4/zones/{zone_id}/dns_records" \
  -d '{"type": "A", "name": "app", "content": "1.2.3.4", "proxied": true}'

# Create CNAME
curl -X POST "https://api.cloudflare.com/client/v4/zones/{zone_id}/dns_records" \
  -d '{"type": "CNAME", "name": "app", "content": "my-app.pages.dev", "proxied": true}'
```
