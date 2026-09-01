/**
 * Build config for the render smoke.
 *
 * Separate from vite.config.js because it swaps `@/lib/api` for a stub — the
 * pages must not reach the network to answer "does this throw when rendered".
 * Everything else (JSX, the `@` alias) comes from the same toolchain the app
 * already builds with, which is what keeps this dependency-free: no jsdom, no
 * second test runner.
 */
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { fileURLToPath } from 'node:url'

export default defineConfig({
  plugins: [
    react(),
    {
      /* Swap react-dom for the portal-free shim everywhere EXCEPT inside the
         shim itself, which has to reach the real package. A plain alias cannot
         express that exception — it rewrites the shim's own import and rollup
         rejects the self-reference. */
      name: 'smoke-portal-shim',
      enforce: 'pre',
      resolveId(source, importer) {
        if (source !== 'react-dom' || !importer || importer.includes('reactDomShim')) return null
        return fileURLToPath(new URL('./reactDomShim.js', import.meta.url))
      },
    },
  ],
  resolve: {
    alias: [
      { find: /^@\/lib\/api$/, replacement: fileURLToPath(new URL('./apiStub.js', import.meta.url)) },
      { find: /^@\/hooks\/useApi$/, replacement: fileURLToPath(new URL('./useApiStub.js', import.meta.url)) },
      { find: '@', replacement: fileURLToPath(new URL('../src', import.meta.url)) },
    ],
  },
  build: {
    ssr: fileURLToPath(new URL('./renderSmoke.jsx', import.meta.url)),
    outDir: fileURLToPath(new URL('../.smoke-out', import.meta.url)),
    emptyOutDir: true,
    minify: false,
    rollupOptions: { output: { entryFileNames: 'renderSmoke.mjs' } },
  },
  /* Vite externalises node_modules in an SSR build, so react-dom would never
     reach the resolver above and the portal shim would silently do nothing —
     which is exactly what happened first time round. */
  ssr: { noExternal: true },
  logLevel: 'error',
})
