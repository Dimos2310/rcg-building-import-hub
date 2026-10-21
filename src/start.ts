import { createStart } from "@tanstack/react-start";

export const startInstance = createStart(() => ({
  // SSR disabled app-wide: every page renders in the browser only (see vite.config.ts, SPA mode).
  defaultSsr: false,
}));
