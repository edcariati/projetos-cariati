import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// A demonstração vira um arquivo único (sem carregamento sob demanda); o app de verdade carrega cada tela quando é aberta.
const demo = Boolean((globalThis as { process?: { env?: Record<string, string> } }).process?.env?.VITE_DEMO);
export default defineConfig({
  plugins: [react()],
  build: { assetsInlineLimit: demo ? 100000000 : 4096, cssCodeSplit: !demo, rollupOptions: { output: { inlineDynamicImports: demo } } },
});
