// These hex values are the email-safe equivalents of the app's light theme tokens
// from app/globals.css. We resolve them here because email clients should not rely
// on CSS variables or OKLCH support.
export const emailTheme = {
  background: "#ffffff",
  foreground: "#0a0a0a",
  mutedForeground: "#737373",
  link: "#0a0a0a",
  mutedLink: "#737373",
  buttonBackground: "#009869",
  buttonForeground: "#edfdf5",
  buttonBorder: "#009869",
} as const;
