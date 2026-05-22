import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig(() => {
  const isVercel  = process.env.VERCEL === "1";
  const isDist    = process.env.ELECTRON_DIST === "1";
  return {
    plugins: [react()],
    // Vercel (web) needs absolute "/", Electron needs relative "./"
    base: isVercel ? "/" : "./",
    build: {
      minify: "terser",
      terserOptions: {
        compress: {
          drop_console: isDist,
          drop_debugger: isDist,
        },
      },
      rollupOptions: {
        output: {
          manualChunks: {
            react:     ["react", "react-dom"],
            settings:  ["./src/pages/SettingsPage"],
            movie:     ["./src/pages/MoviePage"],
            tv:        ["./src/pages/TVPage"],
            downloads: ["./src/pages/DownloadsPage"],
          },
        },
      },
    },
  };
});