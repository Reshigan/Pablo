export const T = {
  // Backgrounds
  bg: '#0B0F19',
  bgPanel: '#111827',
  bgHover: '#1F2937',
  bgActive: '#263248',
  bgInput: '#0D1117',

  // Borders
  border: '#1E293B',
  borderHov: '#334155',

  // Brand
  gold: '#D4A843',
  goldDim: '#B8942F',

  // Text
  text: '#E2E8F0',
  textDim: '#94A3B8',
  textMuted: '#64748B',

  // Semantic
  green: '#22C55E',
  red: '#EF4444',
  blue: '#3B82F6',
  orange: '#F59E0B',
  purple: '#A78BFA',

  // Purple background for reasoning trace
  purpleBg: 'rgba(167, 139, 250, 0.08)',

  // Gold background for user messages
  goldBg: 'rgba(212, 168, 67, 0.08)',

  // Typography
  fontUI: "'DM Sans', system-ui, sans-serif",
  fontCode: "'JetBrains Mono', 'Fira Code', monospace",

  // Layout dimensions
  topBar: 44,
  statusBar: 28,
  sidebar: 260,
  sidebarCollapsed: 48,
  chatMin: 380,

  // Border radius
  radiusSm: 4,
  radiusMd: 6,
  radiusLg: 8,
  radiusXl: 12,
  radiusFull: 9999,

  // Animation durations (ms)
  durationFast: 100,
  durationNormal: 150,
  durationSlow: 200,
  durationSlowest: 300,
} as const;

export type DesignTokens = typeof T;
