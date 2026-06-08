import { defineConfig, loadEnv } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import fs from "fs";

export default defineConfig(({ mode }) => {
  // Load env from .env file (and override with process.env)
  // eslint-disable-next-line no-undef
  const env = loadEnv(mode, process.cwd(), "");
  const pkg = JSON.parse(fs.readFileSync("./package.json", "utf-8"));

  return {
    plugins: [react(), tailwindcss()],
    define: {
      __APP_VERSION__: JSON.stringify(pkg.version || "0.1.0"),
      __UPDATE_SECRET__: JSON.stringify(env.UPDATE_SECRET || ""),
    },
  };
});
