/**
 * Zentrip Design System & Theme Tokens
 * Aesthetic: Warm, calm editorial luxury for India slow travel.
 * Palettes blend terracotta clay, forest sage, warm sand/paper, gold accents, and deep ink.
 */

export const colors = {
  // Base backgrounds
  background: '#FAF8F5',
  backgroundWarm: '#F5F1E8',
  backgroundCard: '#FFFFFF',
  card: '#FFFFFF',
  cardSubtle: '#FDFBF7',
  cardWarm: '#F7F3EB',

  // Primary Terracotta / Clay Brand
  primary: '#9E3D24',
  primaryLight: '#B84E32',
  primaryDark: '#7A2E1A',
  primarySoft: '#F9EDE9',
  primaryMuted: '#D97A62',

  // Sage / Forest Nature
  sage: '#3B5949',
  sageLight: '#537562',
  sageDark: '#263D31',
  sageSoft: '#EDF4EF',
  sageMuted: '#8EAA99',

  // Sand / Paper
  sand: '#EDE5D5',
  sandLight: '#F5EFE4',
  sandDark: '#DDD2BD',
  sandSoft: '#FAF6EF',

  // Gold / Saffron Accents
  gold: '#C98B2C',
  goldLight: '#E5A948',
  goldDark: '#9E6A1B',
  goldSoft: '#FBF5E8',

  // Neutral Inks & Typography
  ink: '#14181B',
  textPrimary: '#14181B',
  inkLight: '#262D35',
  inkMuted: '#5C6672',
  textSecondary: '#5C6672',
  inkSubtle: '#8893A0',
  slate400: '#94A3B8',
  white: '#FFFFFF',

  // Borders & Dividers
  border: '#E8E3D8',
  borderLight: '#F3EFE7',
  borderDark: '#D5CEC0',
  borderFocus: '#9E3D24',

  // Status & Feedback
  success: '#2E7D32',
  successBg: '#EAF5EB',
  warning: '#D97706',
  warningBg: '#FEF3C7',
  error: '#B91C1C',
  errorBg: '#FEE2E2',
  info: '#1D4ED8',
  infoBg: '#EFF6FF',
};
export const typography = {
  fontSize: {
    hero: 32,
    display: 26,
    title1: 22,
    title2: 18,
    headline: 16,
    body: 14,
    caption: 12,
    micro: 10,
  },
  lineHeight: {
    hero: 38,
    display: 32,
    title1: 28,
    title2: 24,
    headline: 22,
    body: 20,
    caption: 16,
    micro: 14,
  },
};

export const radii = {
  xs: 6,
  sm: 10,
  md: 14,
  lg: 18,
  xl: 24,
  xxl: 32,
  full: 9999,
};

export const spacing = {
  xxs: 2,
  xs: 4,
  sm: 8,
  md: 12,
  lg: 16,
  xl: 20,
  xxl: 28,
  xxxl: 36,
};

export const shadows = {
  none: {
    shadowColor: 'transparent',
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0,
    shadowRadius: 0,
    elevation: 0,
  },
  sm: {
    shadowColor: '#14181B',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.04,
    shadowRadius: 4,
    elevation: 1,
  },
  md: {
    shadowColor: '#14181B',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.07,
    shadowRadius: 10,
    elevation: 3,
  },
  lg: {
    shadowColor: '#14181B',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.1,
    shadowRadius: 20,
    elevation: 6,
  },
};
