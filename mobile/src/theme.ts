// TeamLens mobile theme matched to frontend/app/globals.css.
export const colors = {
  brand: '#E2553D',
  brandLight: '#FFF1ED',
  brandDark: '#B93A28',
  brandTint: '#FFF1ED',

  bg: '#F8F5F2', // Slightly warmer and lighter
  surface: '#FFFFFF',
  surface2: '#FAF8F6',
  card: '#FFFFFF',
  sidebar: '#FAF8F6',

  text: '#1A1817',
  muted: '#726A64',
  mutedLight: '#A69E97',

  border: '#E8E1DA',
  input: '#E8E1DA',
  divider: '#F0EBE6',

  success: '#10B981',
  successTint: '#ECFDF5',
  warning: '#F59E0B',
  warningTint: '#FFFBEB',
  danger: '#EF4444',
  dangerTint: '#FEF2F2',
  info: '#3B82F6',
  infoTint: '#EFF6FF',

  white: '#FFFFFF',
  black: '#1A1817',
  overlay: 'rgba(0,0,0,0.4)',

  tabActive: '#E2553D',
  tabInactive: '#A69E97',
  tabBg: '#FFFFFF',
  tabBorder: '#E8E1DA',
} as const;

export const spacing = {
  xs: 4,
  sm: 8,
  md: 12,
  lg: 16,
  xl: 24,
  xxl: 32,
} as const;

export const borderRadius = {
  xs: 4,
  sm: 8,
  md: 12,
  lg: 16,
  xl: 24,
  full: 9999,
} as const;

export const shadow = {
  sm: {
    shadowColor: '#000',
    shadowOpacity: 0.05,
    shadowRadius: 2,
    shadowOffset: { width: 0, height: 1 },
    elevation: 1,
  },
  md: {
    shadowColor: '#000',
    shadowOpacity: 0.08,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 4 },
    elevation: 3,
  },
  lg: {
    shadowColor: '#000',
    shadowOpacity: 0.12,
    shadowRadius: 16,
    shadowOffset: { width: 0, height: 8 },
    elevation: 6,
  },
} as const;

export const typography = {
  h1: { fontSize: 32, fontWeight: '600' as const, color: colors.text, letterSpacing: -0.5 },
  h2: { fontSize: 24, fontWeight: '600' as const, color: colors.text, letterSpacing: -0.3 },
  h3: { fontSize: 18, fontWeight: '500' as const, color: colors.text },
  body: { fontSize: 16, color: colors.text, lineHeight: 24 },
  bodySm: { fontSize: 14, color: colors.text, lineHeight: 20 },
  caption: { fontSize: 13, color: colors.muted },
  small: { fontSize: 12, color: colors.mutedLight },
  label: { fontSize: 12, fontWeight: '500' as const, color: colors.muted, textTransform: 'uppercase' as const, letterSpacing: 0.5 },
} as const;
