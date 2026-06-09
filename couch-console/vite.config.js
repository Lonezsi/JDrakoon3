import { defineConfig, loadEnv } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";

export default defineConfig(({ mode, command }) => {
  // Vite 8 sets config.isProduction = process.env.NODE_ENV === "production".
  // If NODE_ENV leaks in from a parent shell (e.g. start.ps1), the React Fast
  // Refresh preamble is skipped while component transforms still run, causing
  // "$RefreshSig$ is not defined". Force development when serving.
  // eslint-disable-next-line no-undef
  if (command === "serve") process.env.NODE_ENV = "development";
  // Load env from .env file (and override with process.env)
  // eslint-disable-next-line no-undef
  const env = loadEnv(mode, process.cwd(), "");

  return {
    plugins: [react(), tailwindcss()],
    server: {
      port: 5173,
    },
    define: {
      __UPDATE_SECRET__: JSON.stringify(env.UPDATE_SECRET || ""),
    },
  };
});
