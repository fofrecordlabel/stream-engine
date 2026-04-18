import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  server: {
    // Prefer 5173; if busy, Vite picks the next port so `npm run dev` always starts.
    port: 5173,
    strictPort: false,
    host: true,
    open: process.env.CI !== 'true',
    proxy: {
      // Use 127.0.0.1 to avoid IPv6 localhost (::1) vs IPv4 listen mismatches; changeOrigin helps Host header.
      '/api': {
        target: 'http://127.0.0.1:3333',
        changeOrigin: true,
        secure: false,
      },
    },
  },
})
