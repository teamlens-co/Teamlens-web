/** Shared design tokens so screens never invent one-off colours. */
export const theme = {
  color: {
    bg: "#f6f7f9",
    surface: "#ffffff",
    border: "#e3e6ea",
    text: "#111827",
    muted: "#6b7280",
    primary: "#2563eb",
    success: "#059669",
    warning: "#b45309",
    danger: "#dc2626",
    dangerBg: "#fef2f2",
    warningBg: "#fffbeb",
    successBg: "#ecfdf5",
  },
  space: (n: number) => n * 4,
  radius: { sm: 8, md: 12, lg: 16 },
} as const;
