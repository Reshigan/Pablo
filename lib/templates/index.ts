/**
 * Feature 12: Starter Templates
 * Pre-built project templates with proven prompts.
 */

export interface StarterTemplate {
  id: string;
  name: string;
  description: string;
  icon: string;
  category: 'saas' | 'api' | 'landing' | 'dashboard' | 'ecommerce' | 'mobile';
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
