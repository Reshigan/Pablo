# Frontend Development Patterns — Comprehensive Knowledge Base

## 1. React Architecture Patterns

### Component Organization
```
src/
├── components/
│   ├── layout/        # MainLayout, Sidebar, TopBar, NavigationRail, MobileNav
│   ├── ui/            # Button, Card, Badge, Input, Progress (shadcn/ui style)
│   ├── shared/        # ToastContainer, StatusBadge, ConfirmDialog
│   ├── modals/        # CommandPalette, SettingsModal
│   ├── chat/          # ChatPanel, MessageBubble
│   └── workspace/     # CodeEditor, Terminal, DiffViewer, APITester
├── pages/             # Page-level components (or app/ for Next.js)
├── stores/            # Zustand stores
├── services/          # API client services
├── contexts/          # React Context providers
├── hooks/             # Custom hooks
├── lib/               # Utility functions
├── types/             # TypeScript definitions
└── styles/            # Global CSS, theme tokens
```

### Server Components vs Client Components (Next.js 15)
- **Server Components** (default): No 'use client' directive needed
  - Use for: data fetching, auth checks, SEO metadata, static content
  - Can import Client Components
  - Cannot use hooks, event handlers, browser APIs
  - Access `process.env` server-side secrets directly
- **Client Components**: Add `'use client'` at top of file
  - Use for: interactivity, hooks (useState, useEffect), event handlers
  - Can use browser APIs (localStorage, window, document)
  - Cannot import Server Components directly (pass as children)

### Lazy Loading / Code Splitting
```typescript
// Next.js
import dynamic from 'next/dynamic';
const HeavyComponent = dynamic(() => import('./Heavy'), { ssr: false });

// React Router
const LazyPage = React.lazy(() => import('./pages/HeavyPage'));
<Suspense fallback={<Spinner />}><LazyPage /></Suspense>
```

## 2. State Management

### Zustand (Recommended for most apps)
```typescript
import { create } from 'zustand';

interface UIStore {
  sidebarOpen: boolean;
  chatOpen: boolean;
  chatWidth: number;
  toggleSidebar: () => void;
  toggleChat: () => void;
  setChatWidth: (w: number) => void;
}

export const useUIStore = create<UIStore>((set) => ({
  sidebarOpen: true,
  chatOpen: true,
  chatWidth: 380,
  toggleSidebar: () => set((s) => ({ sidebarOpen: !s.sidebarOpen })),
  toggleChat: () => set((s) => ({ chatOpen: !s.chatOpen })),
  setChatWidth: (w) => set({ chatWidth: Math.max(280, Math.min(600, w)) }),
}));
```

**Best Practices:**
- One store per domain (ui, auth, chat, pipeline, learning, toast)
- Keep stores flat — avoid deep nesting
- Use selectors for derived state
- Never put React components or JSX in stores
- Use `useCallback` in components subscribing to store actions
- Middleware: `persist` for localStorage, `devtools` for debugging

### React Query (@tanstack/react-query)
```typescript
const queryClient = new QueryClient({
  defaultOptions: {
    queries: { retry: 1, staleTime: 5 * 60 * 1000, refetchOnWindowFocus: false },
  },
});

// Usage
const { data, isLoading, error } = useQuery({
  queryKey: ['customers', filters],
  queryFn: () => api.getCustomers(filters),
});

// Mutations
const mutation = useMutation({
  mutationFn: (data) => api.createCustomer(data),
  onSuccess: () => queryClient.invalidateQueries({ queryKey: ['customers'] }),
});
```

### React Context (Auth & Theme)
```typescript
// AuthContext pattern
const AuthContext = createContext<AuthContextType | null>(null);

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [token, setToken] = useState(localStorage.getItem('token'));
  
  const login = async (email, password) => {
    const res = await api.post('/auth/login', { email, password });
    setToken(res.data.token);
    setUser(res.data.user);
    localStorage.setItem('token', res.data.token);
  };
  
  return <AuthContext.Provider value={{ user, token, login, logout }}>{children}</AuthContext.Provider>;
}

export const useAuth = () => useContext(AuthContext);
```

## 3. Styling Patterns

### Tailwind CSS Best Practices
- Use utility classes, avoid arbitrary values like `h-[600px]`
- Use `cn()` utility for conditional classes:
```typescript
import { clsx } from 'clsx';
import { twMerge } from 'tailwind-merge';
export function cn(...inputs) { return twMerge(clsx(inputs)); }
```
- Custom theme extension in `tailwind.config.js`:
```javascript
theme: {
  extend: {
    colors: {
      'pablo-bg': '#0D0F12',
      'pablo-panel': '#13161B',
      'pablo-border': '#1E2128',
      'pablo-gold': '#F5B800',
      'pablo-text': '#E6E8EB',
    },
    fontFamily: {
      ui: ['Inter', 'system-ui', 'sans-serif'],
      mono: ['JetBrains Mono', 'Fira Code', 'monospace'],
    },
  },
}
```

### Glassmorphism Pattern
```css
.glass {
  background: rgba(255, 255, 255, 0.05);
  backdrop-filter: blur(12px);
  border: 1px solid rgba(255, 255, 255, 0.08);
  border-radius: 12px;
}
```

### Dark Mode Implementation
```typescript
// CSS variables approach
:root { --bg: #ffffff; --text: #000000; }
.dark { --bg: #0D0F12; --text: #E6E8EB; }

// Tailwind dark mode
<div className="bg-white dark:bg-gray-900 text-black dark:text-white">

// Context-based theme switching
const ThemeContext = createContext({ theme: 'dark', toggle: () => {} });
```

## 4. Component Patterns

### Resizable Panel (IDE Layout)
```typescript
interface PanelResizerProps {
  direction: 'horizontal' | 'vertical';
  onResize: (delta: number) => void;
}

function PanelResizer({ direction, onResize }: PanelResizerProps) {
  const handleMouseDown = (e: React.MouseEvent) => {
    const start = direction === 'horizontal' ? e.clientX : e.clientY;
    const handleMove = (e: MouseEvent) => {
      const current = direction === 'horizontal' ? e.clientX : e.clientY;
      onResize(current - start);
    };
    const handleUp = () => {
      document.removeEventListener('mousemove', handleMove);
      document.removeEventListener('mouseup', handleUp);
    };
    document.addEventListener('mousemove', handleMove);
    document.addEventListener('mouseup', handleUp);
  };
  
  return <div onMouseDown={handleMouseDown} className="cursor-col-resize w-1 hover:bg-blue-500" />;
}
```

### Command Palette (Cmd+K)
```typescript
// Register keyboard shortcut
useEffect(() => {
  const handler = (e: KeyboardEvent) => {
    if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
      e.preventDefault();
      toggleCommandPalette();
    }
  };
  window.addEventListener('keydown', handler);
  return () => window.removeEventListener('keydown', handler);
}, []);
```

### Toast Notification System
```typescript
interface Toast { id: string; message: string; type: 'success' | 'error' | 'info'; }

const useToastStore = create<{
  toasts: Toast[];
  addToast: (t: Omit<Toast, 'id'>) => void;
  removeToast: (id: string) => void;
}>((set) => ({
  toasts: [],
  addToast: (t) => {
    const id = crypto.randomUUID();
    set((s) => ({ toasts: [...s.toasts, { ...t, id }] }));
    setTimeout(() => set((s) => ({ toasts: s.toasts.filter(x => x.id !== id) })), 4000);
  },
  removeToast: (id) => set((s) => ({ toasts: s.toasts.filter(x => x.id !== id) })),
}));
```

### Infinite Scroll / Virtualization
```typescript
// For long lists (1000+ items), use virtualization
import { useVirtualizer } from '@tanstack/react-virtual';

const virtualizer = useVirtualizer({
  count: items.length,
  getScrollElement: () => parentRef.current,
  estimateSize: () => 50,
});
```

## 5. Data Fetching Patterns

### Axios Client with Interceptors
```typescript
const api = axios.create({ baseURL: import.meta.env.VITE_API_URL });

// Request interceptor — attach JWT
api.interceptors.request.use((config) => {
  const token = localStorage.getItem('token');
  if (token) config.headers.Authorization = `Bearer ${token}`;
  return config;
});

// Response interceptor — handle 401, refresh token
api.interceptors.response.use(
  (res) => res,
  async (error) => {
    if (error.response?.status === 401) {
      // Try token refresh
      const refreshToken = localStorage.getItem('refreshToken');
      const res = await axios.post('/auth/refresh', { refreshToken });
      localStorage.setItem('token', res.data.token);
      error.config.headers.Authorization = `Bearer ${res.data.token}`;
      return axios(error.config);
    }
    return Promise.reject(error);
  }
);
```

### SSE (Server-Sent Events) Streaming
```typescript
async function streamChat(message: string, onChunk: (text: string) => void) {
  const res = await fetch('/api/chat', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ message }),
  });
  
  const reader = res.body!.getReader();
  const decoder = new TextDecoder();
  let buffer = '';
  
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    
    buffer += decoder.decode(value, { stream: true });
    const lines = buffer.split('\n');
    buffer = lines.pop() || '';
    
    for (const line of lines) {
      if (line.startsWith('data: ')) {
        const data = line.slice(6);
        if (data === '[DONE]') return;
        try {
          const parsed = JSON.parse(data);
          onChunk(parsed.choices?.[0]?.delta?.content ?? '');
        } catch { /* partial JSON, skip */ }
      }
    }
  }
}
```

**Critical SSE Gotchas:**
- Buffer partial JSON across TCP chunks
- Handle `[DONE]` sentinel
- Guard against undefined content on abort: use `?? ''`
- Clean up intervals/readers on component unmount
- Use `AbortController` for cancellation

## 6. IDE-Specific Components

### Monaco Editor Integration
```typescript
import Editor from '@monaco-editor/react';

<Editor
  height="100%"
  language={language}
  theme="pablo-dark"
  value={code}
  onChange={(v) => setCode(v ?? '')}
  options={{
    fontSize: 13,
    fontFamily: "'JetBrains Mono', 'Fira Code', monospace",
    minimap: { enabled: false },
    scrollBeyondLastLine: false,
    lineNumbers: 'on',
    renderLineHighlight: 'line',
    tabSize: 2,
    wordWrap: 'on',
    automaticLayout: true,
  }}
/>
```

### xterm.js Terminal
```typescript
import { Terminal } from '@xterm/xterm';
import { FitAddon } from '@xterm/addon-fit';

const term = new Terminal({
  theme: { background: '#0D0F12', foreground: '#E6E8EB', cursor: '#F5B800' },
  fontFamily: "'JetBrains Mono', monospace",
  fontSize: 13,
  cursorBlink: true,
});
const fitAddon = new FitAddon();
term.loadAddon(fitAddon);
term.open(containerRef.current);
fitAddon.fit();
```

## 7. Form Handling

### React Hook Form + Zod Validation
```typescript
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';

const schema = z.object({
  name: z.string().min(1, 'Required'),
  email: z.string().email('Invalid email'),
  amount: z.number().positive('Must be positive'),
});

type FormData = z.infer<typeof schema>;

const { register, handleSubmit, formState: { errors } } = useForm<FormData>({
  resolver: zodResolver(schema),
});
```

## 8. Navigation Patterns

### Mega Menu (Enterprise)
```typescript
const categories = [
  { name: 'Financial', icon: DollarSign, items: [
    { label: 'General Ledger', path: '/gl', permission: 'gl.view' },
    { label: 'Accounts Receivable', path: '/ar', permission: 'ar.view' },
  ]},
  { name: 'Operations', icon: Truck, items: [...] },
];
```

### Protected Routes
```typescript
function ProtectedRoute({ children, requiredRoles }) {
  const { isAuthenticated, user } = useAuth();
  if (!isAuthenticated) return <Navigate to="/login" />;
  if (requiredRoles && !requiredRoles.includes(user.role)) return <Navigate to="/unauthorized" />;
  return children;
}
```

### Module-Based Navigation
- Fetch `/module-settings` on mount to show/hide features dynamically
- Filter navigation items based on user permissions
- Support for role hierarchy: super-admin > admin > manager > user

## 9. PWA / Offline-First

### Service Worker (Workbox)
```javascript
// vite.config.ts with vite-plugin-pwa
VitePWA({
  registerType: 'autoUpdate',
  workbox: {
    globPatterns: ['**/*.{js,css,html,ico,png,svg}'],
    runtimeCaching: [
      { urlPattern: /^https:\/\/api\./, handler: 'NetworkFirst', options: { cacheName: 'api-cache' } },
    ],
  },
})
```

### Offline Detection
```typescript
const [isOnline, setIsOnline] = useState(navigator.onLine);
useEffect(() => {
  const handleOnline = () => setIsOnline(true);
  const handleOffline = () => setIsOnline(false);
  window.addEventListener('online', handleOnline);
  window.addEventListener('offline', handleOffline);
  return () => { /* cleanup */ };
}, []);
```

## 10. Performance Patterns

### Memoization
```typescript
const expensiveValue = useMemo(() => computeExpensive(data), [data]);
const stableCallback = useCallback((id) => handleClick(id), [handleClick]);
const MemoizedComponent = React.memo(ExpensiveComponent);
```

### Image Optimization
- Use `next/image` in Next.js (automatic optimization)
- Use `loading="lazy"` for below-fold images
- WebP format for smaller file sizes
- Responsive images with `srcSet`

### Bundle Size
- Dynamic imports for heavy components
- Tree-shaking: import specific functions, not entire libraries
- `import { format } from 'date-fns'` instead of `import * as dateFns from 'date-fns'`

## 11. Charts & Data Visualization

### Recharts
```typescript
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts';

<ResponsiveContainer width="100%" height={300}>
  <LineChart data={data}>
    <CartesianGrid strokeDasharray="3 3" />
    <XAxis dataKey="name" />
    <YAxis />
    <Tooltip />
    <Line type="monotone" dataKey="value" stroke="#F5B800" />
  </LineChart>
</ResponsiveContainer>
```

### Chart.js + react-chartjs-2
```typescript
import { Line, Bar, Doughnut } from 'react-chartjs-2';
// Register required components
import { Chart, CategoryScale, LinearScale, PointElement, LineElement } from 'chart.js';
Chart.register(CategoryScale, LinearScale, PointElement, LineElement);
```

### Map Visualizations (Leaflet)
```typescript
import { MapContainer, TileLayer, Marker, Popup } from 'react-leaflet';
import 'leaflet/dist/leaflet.css';

<MapContainer center={[-26.2, 28.0]} zoom={10} style={{ height: '400px' }}>
  <TileLayer url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png" />
  {markers.map(m => <Marker position={[m.lat, m.lng]}><Popup>{m.label}</Popup></Marker>)}
</MapContainer>
```

## 12. Testing

### Playwright E2E
```typescript
import { test, expect } from '@playwright/test';

test('login flow', async ({ page }) => {
  await page.goto('/login');
  await page.fill('[name="email"]', 'test@example.com');
  await page.fill('[name="password"]', 'password');
  await page.click('button[type="submit"]');
  await expect(page).toHaveURL('/dashboard');
});
```

### Vitest Unit Tests
```typescript
import { render, screen, fireEvent } from '@testing-library/react';
import { describe, it, expect } from 'vitest';

describe('Button', () => {
  it('calls onClick when clicked', () => {
    const onClick = vi.fn();
    render(<Button onClick={onClick}>Click me</Button>);
    fireEvent.click(screen.getByText('Click me'));
    expect(onClick).toHaveBeenCalled();
  });
});
```
