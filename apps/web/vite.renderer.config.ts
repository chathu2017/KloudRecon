/**
 * Builds the report diagram renderer (src/features/diagrams/renderer.ts) as one IIFE script into
 * the backend package: `npm run build:renderer` (decision 0036). Only the icons the diagrams use
 * are embedded; ELK runs in-thread (no web worker in the report page).
 */
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { defineConfig, type Plugin } from 'vite';

const root = path.dirname(fileURLToPath(import.meta.url));
const OUT = path.resolve(root, '../../backend/src/kloudrecon/reports/assets');

function reportIcons(): Plugin {
  const id = 'virtual:report-icons';
  return {
    name: 'report-icons',
    resolveId: (source) => (source === id ? `\0${id}` : null),
    load(resolved) {
      if (resolved !== `\0${id}`) return null;
      const src = readFileSync(path.join(root, 'src/features/diagrams/icons.ts'), 'utf8');
      const files = new Set(src.match(/[a-z0-9-]+\/[a-z0-9-]+\.svg/g) ?? []);
      const icons: Record<string, string> = {};
      for (const f of files) {
        try {
          icons[f] = readFileSync(path.join(root, 'public/azure-icons', f), 'utf8');
        } catch {
          /* missing icon: the diagram falls back to shapes */
        }
      }
      return `export default ${JSON.stringify(icons)};`;
    },
  };
}

/** The in-app layout uses a web worker; the report page runs ELK in-thread. */
function noElkWorker(): Plugin {
  return {
    name: 'no-elk-worker',
    enforce: 'pre',
    resolveId: (source) => (source.includes('elk-worker') ? '\0elk-worker-stub' : null),
    load: (resolved) => (resolved === '\0elk-worker-stub' ? 'export default "";' : null),
  };
}

export default defineConfig({
  plugins: [noElkWorker(), reportIcons()],
  resolve: { alias: { '@': path.resolve(root, 'src') } },
  define: { 'process.env.NODE_ENV': '"production"' },
  build: {
    outDir: OUT,
    emptyOutDir: false,
    copyPublicDir: false,
    lib: {
      entry: path.resolve(root, 'src/features/diagrams/renderer.ts'),
      name: 'KRDiagramBundle',
      formats: ['iife'],
      fileName: () => 'diagram-renderer.js',
    },
    rollupOptions: { output: { inlineDynamicImports: true } },
    minify: true,
    sourcemap: false,
  },
});
