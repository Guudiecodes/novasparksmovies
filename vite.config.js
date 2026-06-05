import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { obfuscator } from 'rollup-obfuscator';

export default defineConfig(() => {
  const isVercel  = process.env.VERCEL === "1";
  const isDist    = process.env.ELECTRON_DIST === "1";
  const isProd    = isDist || isVercel;

  return {
    plugins: [
      react(),
      ...(isProd ? [obfuscator({
        global: true,
        options: {
          compact: true,
          controlFlowFlattening: true,
          controlFlowFlatteningThreshold: 0.75,
          deadCodeInjection: true,
          deadCodeInjectionThreshold: 0.4,
          debugProtection: true,
          debugProtectionInterval: 2000,
          disableConsoleOutput: true,
          rotateStringArray: true,
          selfDefending: true,
          stringArray: true,
          stringArrayThreshold: 0.75,
        }
      })] : []),
    ],
    base: isVercel ? "/" : "./",
    build: {
      sourcemap: isProd ? false : true,
      minify: "terser",
      terserOptions: {
        compress: {
          drop_console: isProd,
          drop_debugger: isProd,
        },
        mangle: {
          safari10: true,
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
            nsai:     ["./src/pages/NSAIPage"],
          },
        },
      },
    },
  };
});