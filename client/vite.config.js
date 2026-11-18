import { defineConfig, loadEnv } from 'vite'
import react from '@vitejs/plugin-react'
import { fileURLToPath, URL } from 'node:url'

/* The site's own address in index.html's platform-level share tags. Set
   VITE_PUBLIC_WEB_URL when the site moves to its final domain; until then it
   is the current production address. */
const SITE_FALLBACK = 'https://video-monetization-platform-chi.vercel.app'
const siteUrl = (mode) => (loadEnv(mode, process.cwd(), 'VITE_').VITE_PUBLIC_WEB_URL || process.env.VITE_PUBLIC_WEB_URL || SITE_FALLBACK).replace(/\/$/, '')

/* One id per build: stamped into the bundle (__BUILD_ID__) and published as
   /build.json, so a tab left open across a deploy can tell it is out of date
   (see src/lib/staleBuild.js). */
const BUILD_ID = Date.now().toString(36)

export default defineConfig(({ mode }) => ({
  plugins: [
    react(),
    { name: 'mtonyo-site-url', transformIndexHtml: (html) => html.replaceAll('%SITE_URL%', siteUrl(mode)) },
    {
      name: 'mtonyo-build-id',
      generateBundle() {
        this.emitFile({ type: 'asset', fileName: 'build.json', source: JSON.stringify({ id: BUILD_ID }) })
      },
    },
  ],
  // Changes on every build, so each deploy registers a distinct service worker
  // and the previous build's caches are cleared instead of living forever.
  define: { __BUILD_ID__: JSON.stringify(BUILD_ID) },
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./src', import.meta.url)),
    },
  },
  server: {
    // host:true so you can open the app from a phone/tablet on the same Wi-Fi
    host: true,
    port: 5173,
  },
  preview: {
    port: 4173,
  },
}))
