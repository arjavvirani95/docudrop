import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

// In development, proxy /api to a deployed stack: VITE_API_PROXY=https://<api-id>.execute-api.<region>.amazonaws.com
export default defineConfig({
  plugins: [react()],
  server: process.env.VITE_API_PROXY
    ? { proxy: { "/api": { target: process.env.VITE_API_PROXY, changeOrigin: true } } }
    : undefined,
});
