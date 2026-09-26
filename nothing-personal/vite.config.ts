import { defineConfig, type Plugin } from 'vite';
import react from '@vitejs/plugin-react';
import { existsSync, readdirSync, statSync } from 'node:fs';
import { resolve } from 'node:path';

// Lists the official images present in public/np/real so the client only
// requests files that exist (no 404 noise in the console during a recording).
function realAssets(): Plugin {
  const id = 'virtual:np-real';
  const dir = resolve(__dirname, 'public/np/real');
  return {
    name: 'np-real-assets',
    resolveId: (s) => (s === id ? '\0' + id : null),
    load(s) {
      if (s !== '\0' + id) return null;
      const files = existsSync(dir)
        ? readdirSync(dir).filter((f) => statSync(resolve(dir, f)).size > 1024)
        : [];
      return `export default ${JSON.stringify(files)};`;
    },
  };
}

export default defineConfig({
  plugins: [react(), realAssets()],
  server: { port: 5173, host: true },
  preview: { port: 4173, host: true },
});
