import { defineConfig } from "vite";
import vue from "@vitejs/plugin-vue";

export default defineConfig({
  plugins: [vue()],
  // Android's generated asset copies and Gradle reports are not web entries.
  optimizeDeps: { entries: ["index.html"] },
  build: {
    rollupOptions: {
      output: {
        // Keep voice processing separate so its code can be cached across UI changes.
        manualChunks(id) {
          if (id.includes("/src/voice/")) return "voice";
        },
      },
    },
  },
  server: {
    port: 5173,
    proxy: {
      "/api": "http://localhost:3040",
      "/ws": {
        target: "ws://localhost:3040",
        ws: true,
      },
    },
  },
});
