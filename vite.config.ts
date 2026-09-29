import { defineConfig, Plugin } from 'vite';

/* the bundle is emitted as a classic IIFE, so the module flag (and the CORS
   mode it triggers) must be stripped — old WebViews refuse type="module". */
const classicScriptTag = (): Plugin => ({
  name: 'classic-script-tag',
  transformIndexHtml: (html: string) =>
    html.replace(/<script type="module"(\s+crossorigin)?\s+src=/g, '<script defer src='),
});

export default defineConfig({
  base: './',
  plugins: [classicScriptTag()],
  build: {
    chunkSizeWarningLimit: 4000,
    modulePreload: false,
    rollupOptions: {
      output: {
        format: 'iife',
        inlineDynamicImports: true,
        entryFileNames: 'assets/[name]-[hash].js',
        chunkFileNames: 'assets/[name]-[hash].js',
        assetFileNames: 'assets/[name]-[hash][extname]',
      },
    },
  },
});
