// TeamLens Web theme (light/warm)
// Matches frontend/app/globals.css brand colors
export const colors = {
  // Brand
  brand: '#B8860B',        // oklch(0.652 0.176 35) → warm amber
  brandLight: '#FDF4E6',   // oklch(0.95 0.035 35) → light amber tint
  brandDark: '#8B6914',    // oklch(0.58 0.176 35) → darker amber

  // Backgrounds
  bg: '#F7F5F2',           // oklch(0.969 0.012 75) → warm white
  surface: '#FAF9F7',      // oklch(0.98 0.008 75) → slightly lighter
  surface2: '#FCFBFA',     // oklch(0.992 0.005 75) → white with warmth
  card: '#FFFFFF',
  sidebar: '#FAF9F7',      // oklch(0.98 0.008 75)

  // Text
  text: '#2D2A26',         // warm dark gray (from TeamLensLogo)
  muted: '#8B8580',        // oklch(0.55 0.012 65)
  mutedLight: '#B5B0AB',   // lighter muted

  // Borders
  border: '#E8E4E0',       // oklch(0.9 0.01 70)
  input: '#E8E4E0',

  // Status
  success: '#4CAF50',
  warning: '#F5A623',
  danger: '#E53935',
  info: '#5C6BC0',

  // White / overlay
  white: '#FFFFFF',
  black: '#1A1817',
  overlay: 'rgba(0,0,0,0.5)',

  // Tab bar
  tabActive: '#B8860B',
  tabInactive: '#B5B0AB',
  tabBg: '#FFFFFF',
  tabBorder: '#E8E4E0',
} as const;

export const spacing = {
  xs: 4,
  sm: 8,
  md: 12,
  lg: 16,
  xl: 20,
  xxl: 24,
} as const;

export const borderRadius = {
  sm: 8,
  md: 12,
  lg: 16,
  xl: 20,
} as const;

export const typography = {
  h1: { fontSize: 28, fontWeight: '700' as const, color: colors.text },
  h2: { fontSize: 24, fontWeight: '700' as const, color: colors.text },
  h3: { fontSize: 18, fontWeight: '600' as const, color: colors.text },
  body: { fontSize: 15, color: colors.text },
  caption: { fontSize: 13, color: colors.muted },
  small: { fontSize: 11, color: colors.mutedLight },
  label: { fontSize: 12, color: colors.muted, textTransform: 'uppercase' as const, letterSpacing: 1 },
} as const;
