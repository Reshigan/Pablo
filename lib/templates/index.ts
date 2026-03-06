/**
 * Feature 12: Starter Templates
 * Pre-built project templates with proven prompts.
 */

export interface StarterTemplate {
  id: string;
  name: string;
  description: string;
  icon: string;
  category: 'saas' | 'api' | 'landing' | 'dashboard' | 'ecommerce' | 'mobile' | 'gonxt';
  prompt: string;
  tags: string[];
}

export const TEMPLATES: StarterTemplate[] = [
  {
    id: 'saas-dashboard',
    name: 'SaaS Dashboard',
    icon: '📊',
    category: 'dashboard',
    description: 'Admin dashboard with user management, analytics, and settings',
    tags: ['react', 'tailwind', 'charts', 'auth'],
    prompt: `Build a SaaS admin dashboard with: sidebar navigation (Dashboard, Users, Analytics, Settings), header with user avatar and notifications, dashboard page with 4 metric cards (total users, revenue, active sessions, growth %), line chart for monthly trends, recent activity table with pagination, user management page with CRUD table (name, email, role, status, actions), settings page with profile form and notification preferences, JWT authentication with login/register pages, responsive design for mobile/tablet/desktop.`,
  },
  {
    id: 'rest-api',
    name: 'REST API',
    icon: '🔌',
    category: 'api',
    description: 'Production-ready API with auth, CRUD, and docs',
    tags: ['api', 'auth', 'crud'],
    prompt: `Build a REST API with: JWT authentication (register, login, refresh, logout), user model (id, name, email, password_hash, role, is_active, timestamps), resource CRUD with pagination/filtering/sorting, role-based access control (admin, user), input validation on all endpoints, error handling with consistent error response format, health check endpoint, OpenAPI/Swagger documentation, seed data with 10 users and 50 resources, rate limiting middleware.`,
  },
  {
    id: 'landing-page',
    name: 'Landing Page',
    icon: '🚀',
    category: 'landing',
    description: 'Marketing landing page with hero, features, pricing, CTA',
    tags: ['landing', 'marketing', 'responsive'],
    prompt: `Build a landing page with: hero section (headline, subheadline, CTA button, hero image), features grid (6 features with icons and descriptions), pricing section (3 tiers: Free/Pro/Enterprise with feature comparison), testimonials carousel (3 testimonials with avatar, name, role, quote), FAQ accordion (6 questions), footer with links and newsletter signup, fully responsive, smooth scroll navigation, subtle animations on scroll.`,
  },
  {
    id: 'ecommerce',
    name: 'E-Commerce Store',
    icon: '🛒',
    category: 'ecommerce',
    description: 'Product catalog, cart, checkout',
    tags: ['ecommerce', 'cart', 'products'],
    prompt: `Build an e-commerce storefront with: product listing page with grid/list toggle, filters (category, price range, rating), and sorting, product detail page with image gallery, description, reviews, add-to-cart, shopping cart with quantity controls and total calculation, checkout flow (shipping info, payment placeholder, order summary), user auth (login/register), order history page, responsive mobile-first design, 20 seed products across 4 categories.`,
  },
  {
    id: 'crm',
    name: 'CRM System',
    icon: '👥',
    category: 'saas',
    description: 'Customer relationship management with pipeline view',
    tags: ['crm', 'pipeline', 'contacts'],
    prompt: `Build a CRM system with: Kanban-style deal pipeline (drag-and-drop columns: Lead, Qualified, Proposal, Negotiation, Closed Won, Closed Lost), contacts list with search and filters, contact detail page (info, notes, activities, deals), deal creation form with value and probability, activity log (calls, emails, meetings), dashboard with pipeline value chart and conversion funnel, team view showing deals per salesperson, CSV import for contacts.`,
  },
  {
    id: 'blog',
    name: 'Blog Platform',
    icon: '📝',
    category: 'saas',
    description: 'Blog with markdown editor, tags, comments',
    tags: ['blog', 'markdown', 'cms'],
    prompt: `Build a blog platform with: markdown editor with live preview for creating posts, post listing page with featured image, title, excerpt, tags, and date, single post page with rendered markdown, author info, and related posts, tag-based filtering and search, comment system with nested replies, admin dashboard for managing posts (draft/published/archived), user profiles with avatar and bio, RSS feed generation, SEO meta tags for each post.`,
  },
  // Phase 3.1: GONXT Platform Templates
  {
    id: 'gonxt-erp',
    name: 'GONXT ERP',
    icon: '🏢',
    category: 'gonxt',
    description: 'Enterprise Resource Planning — inventory, procurement, HR, finance modules',
    tags: ['erp', 'enterprise', 'inventory', 'finance', 'hr', 'gonxt'],
    prompt: `Build a full ERP system with these modules:
1. Dashboard: KPI cards (revenue, orders, stock levels, employees), charts for monthly trends
2. Inventory: Product catalog with SKU, stock levels, reorder alerts, barcode support, warehouse locations
3. Procurement: Purchase orders, supplier management, approval workflows, goods received notes
4. Finance: General ledger, accounts payable/receivable, invoice generation, bank reconciliation
5. HR: Employee directory, leave management, payroll calculator, org chart
6. Reports: Exportable reports for each module, date range filters, PDF/CSV export
Use a sidebar navigation, role-based access (admin/manager/user), audit trail on all changes.`,
  },
  {
    id: 'gonxt-field-force',
    name: 'GONXT Field Force',
    icon: '📍',
    category: 'gonxt',
    description: 'Field service management — scheduling, GPS tracking, job cards, mobile-first',
    tags: ['field-service', 'gps', 'scheduling', 'mobile', 'gonxt'],
    prompt: `Build a field force management system:
1. Dashboard: Map view with live agent locations, job stats (pending/in-progress/completed), daily schedule
2. Job Management: Create/assign/close jobs, job card with photos/notes/signature capture, priority levels
3. Scheduling: Calendar view, drag-and-drop assignment, route optimization suggestions, recurring jobs
4. Agent Tracking: GPS check-in/out, time logging, distance traveled, offline mode support
5. Customer Portal: Job status tracking, appointment booking, feedback/rating
6. Reports: Agent performance, SLA compliance, job completion rates, travel analytics
Mobile-first responsive design, offline-capable with sync.`,
  },
  {
    id: 'gonxt-solar-ppa',
    name: 'GONXT Solar PPA',
    icon: '☀️',
    category: 'gonxt',
    description: 'Solar Power Purchase Agreement — proposals, monitoring, billing, ROI calculator',
    tags: ['solar', 'energy', 'ppa', 'monitoring', 'billing', 'gonxt'],
    prompt: `Build a Solar PPA management platform:
1. Dashboard: Total kWh generated, CO2 offset, revenue, system health status, weather integration
2. Proposal Builder: Site assessment form, panel layout designer, financial modeling (IRR, payback period, NPV), PDF proposal generation
3. System Monitoring: Real-time inverter data, panel performance, fault alerts, historical trends
4. Billing: Usage-based invoicing, tariff management, payment tracking, escalation schedules
5. Customer Portal: Energy dashboard, savings tracker, carbon credits, support tickets
6. Admin: Site management, installer scheduling, equipment inventory, warranty tracking
Include ROI calculator widget and energy production forecasting.`,
  },
  {
    id: 'gonxt-legacy',
    name: 'GONXT Legacy Modernizer',
    icon: '🔄',
    category: 'gonxt',
    description: 'Legacy system migration — API wrapper, data mapping, phased rollout',
    tags: ['legacy', 'migration', 'api', 'modernization', 'gonxt'],
    prompt: `Build a legacy system modernization toolkit:
1. Dashboard: Migration progress (% complete), data integrity checks, error log, system health
2. API Gateway: REST wrapper for legacy SOAP/XML endpoints, request/response transformation, rate limiting
3. Data Mapper: Visual field mapping between legacy and modern schemas, transformation rules, validation
4. Migration Runner: Batch data migration with rollback, dry-run mode, incremental sync, conflict resolution
5. Testing Suite: Automated comparison tests (legacy vs modern responses), regression test runner, data validation
6. Phased Rollout: Feature flags, traffic splitting (% to legacy vs modern), instant rollback, A/B comparison
Include comprehensive logging and audit trail for compliance.`,
  },
  {
    id: 'gonxt-medical',
    name: 'GONXT Medical',
    icon: '🏥',
    category: 'gonxt',
    description: 'Healthcare practice management — patient records, appointments, billing, prescriptions',
    tags: ['medical', 'healthcare', 'patients', 'appointments', 'prescriptions', 'gonxt'],
    prompt: `Build a medical practice management system:
1. Dashboard: Today's appointments, patient queue, revenue summary, upcoming follow-ups
2. Patient Records: Demographics, medical history, allergies, chronic conditions, visit notes (SOAP format), file attachments
3. Appointments: Calendar with doctor availability, booking with conflict detection, waiting room queue, SMS reminders
4. Prescriptions: Drug database search, interaction checker, dosage calculator, prescription history, print/email
5. Billing: Consultation fees, procedure coding (ICD-10), medical aid claims, statement generation, payment tracking
6. Reports: Patient demographics, consultation volumes, revenue by doctor, most common diagnoses
HIPAA-compliant design with role-based access (doctor/nurse/admin/receptionist).`,
  },
  {
    id: 'gonxt-promo',
    name: 'GONXT Promo Engine',
    icon: '🎯',
    category: 'gonxt',
    description: 'Promotions & loyalty — campaigns, coupons, rewards, A/B testing, analytics',
    tags: ['promotions', 'loyalty', 'coupons', 'campaigns', 'analytics', 'gonxt'],
    prompt: `Build a promotions and loyalty engine:
1. Dashboard: Active campaigns, redemption rates, revenue impact, top performing promos, customer segments
2. Campaign Builder: Create promotions (% off, fixed discount, BOGO, bundle deals), date ranges, target audiences, budget caps
3. Coupon System: Generate unique/bulk codes, usage limits (per user/total), expiry dates, QR code generation
4. Loyalty Program: Points system, tier management (bronze/silver/gold/platinum), rewards catalog, earn/burn rules
5. A/B Testing: Split test campaigns, statistical significance calculator, auto-winner selection
6. Analytics: Campaign ROI, customer lifetime value impact, segment performance, redemption heatmaps
Include REST API for POS integration and webhook notifications.`,
  },
  {
    id: 'gonxt-marketplace',
    name: 'GONXT Marketplace',
    icon: '🏪',
    category: 'gonxt',
    description: 'Multi-vendor marketplace — storefronts, orders, payments, reviews, admin',
    tags: ['marketplace', 'multi-vendor', 'ecommerce', 'payments', 'gonxt'],
    prompt: `Build a multi-vendor marketplace platform:
1. Buyer Dashboard: Product discovery (search, filters, categories), product pages with reviews, cart, wishlist
2. Vendor Dashboard: Store setup, product listing (images, variants, pricing), order management, payout tracking
3. Order System: Checkout with multi-vendor cart splitting, order tracking, returns/refunds, dispute resolution
4. Payment Processing: Commission calculation, vendor payouts, escrow system, transaction history
5. Review System: Product reviews with photos, vendor ratings, verified purchase badges, review moderation
6. Admin Panel: Vendor approval, commission settings, featured products, platform analytics, content moderation
Include search with faceted filters, responsive mobile design, and webhook-based notifications.`,
  },
];

export function getTemplatesByCategory(category: string): StarterTemplate[] {
  return TEMPLATES.filter((t) => t.category === category);
}

export function searchTemplates(query: string): StarterTemplate[] {
  const lower = query.toLowerCase();
  return TEMPLATES.filter(
    (t) =>
      t.name.toLowerCase().includes(lower) ||
      t.description.toLowerCase().includes(lower) ||
      t.tags.some((tag) => tag.includes(lower))
  );
}
