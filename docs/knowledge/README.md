# Pablo Knowledge Base — AI Training Adapters

> Comprehensive knowledge dump from ALL Devin learnings across all users and repositories.
> Intended as training data for Pablo's AI adapters and self-learning system.

## Contents

| # | File | Topics | Lines |
|---|------|--------|-------|
| 01 | [Architecture Patterns](./01-architecture-patterns.md) | Cloudflare Workers, OpenNext, D1/R2/KV, Hono, NextAuth, Zustand, GitHub OAuth | ~230 |
| 02 | [Frontend Patterns](./02-frontend-patterns.md) | React, Next.js 15, State Management, Tailwind, Monaco, xterm.js, Charts, Forms | ~450 |
| 03 | [Backend Patterns](./03-backend-patterns.md) | FastAPI, Express.js, JWT Auth, CRUD, SSE, WebSocket, File Upload, AI Integration | ~500 |
| 04 | [Database Patterns](./04-database-patterns.md) | Multi-tenant Schema, ERP (O2C/P2P/GL), HR, PostGIS, Migrations, Caching | ~450 |
| 05 | [DevOps & CI/CD](./05-devops-cicd.md) | GitHub Actions, Docker, Cloudflare Deploy, Fly.io, Nginx, SSL, PM2, Monitoring | ~400 |
| 06 | [AI/ML Patterns](./06-ai-ml-patterns.md) | LLM Integration, SSE Streaming, Dual-Model Routing, RAG, Computer Vision, NLP | ~400 |
| 07 | [Domain Knowledge](./07-domain-knowledge.md) | Sales/CRM, E-Commerce, Document Mgmt, HR, Inventory, Finance, Social, Robotics | ~500 |
| 08 | [Security Patterns](./08-security-patterns.md) | Auth, Encryption, RBAC, OAuth, CSRF, Rate Limiting, CORS, POPIA/GDPR, B-BBEE | ~400 |
| 09 | [Mobile Patterns](./09-mobile-patterns.md) | React Native, PWA, Offline-First, Camera, GPS, Push Notifications, Responsive | ~300 |
| 10 | [Testing Patterns](./10-testing-patterns.md) | Vitest, pytest, Playwright E2E, API Testing, Load Testing, CI Pipeline | ~300 |
| 11 | [Repo-Specific Learnings](./11-repo-specific-learnings.md) | SalesSync, Heirloom, MoreMeAI, VerifiAI, ARIA, Pablo, Lokalapp, MetaRobot | ~400 |
| 12 | [Common Pitfalls](./12-common-pitfalls.md) | Cloudflare, React, SSE, Auth, Database, CSS, Git, Docker, API, Performance | ~400 |
| 13 | [South African Business](./13-south-african-business.md) | VAT, PAYE, B-BBEE, Banking, POPIA, Labour Law, Industry Patterns | ~400 |

**Total: ~5,000+ lines of structured knowledge across 13 files**

## Source Repositories

Knowledge extracted from the following repositories:
- **Reshigan/SalesSync** — Field force automation, van sales, commissions, PWA
- **Reshigan/Heirloom** — Digital legacy platform, encryption, Dead Man's Switch
- **Reshigan/MoreMeAI** — Employee engagement, LMS, gamification, wellness AI
- **Reshigan/VerifiAI** — Counterfeit detection, NFC verification, heat maps
- **Reshigan/Aria---Document-Management-Employee** — ERP system, 67 AI agents, SAP integration
- **Reshigan/Pablo** — AI-powered IDE, code editor, feature factory
- **Reshigan/Lokalapp** — Local services marketplace, wallet system
- **Reshigan/MetaRobot** — Robotics/automation command queue

## Usage

These files serve as:
1. **Training data** for Pablo's AI adapters (pattern recognition, code generation)
2. **Reference documentation** for architecture decisions
3. **Knowledge base** for the self-learning system's context builder
4. **Prompt engineering** source material for system prompts

## Cross-Cutting Patterns

The most commonly used patterns across all projects:
- Cloudflare Workers + Hono (5/8 repos)
- Multi-tenant data isolation via `company_id` (4/8 repos)
- JWT authentication (8/8 repos)
- React frontend with component-based architecture (7/8 repos)
- SSE streaming for real-time AI responses (3/8 repos)
- Docker Compose for production deployment (2/8 repos)
- Zustand/React Query for state management (4/8 repos)
