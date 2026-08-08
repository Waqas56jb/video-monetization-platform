import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { fileURLToPath, URL } from 'node:url'

export default defineConfig({
  plugins: [react()],
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
})
