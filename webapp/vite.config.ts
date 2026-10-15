import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vite.dev/config/
export default defineConfig({
  // Absolute asset paths: with "./", deep links like /watch/:id requested /watch/assets/*.js and rendered blank
  base: "/",
  build: {
    outDir: 'dist',
  },
  plugins: [react()],
  preview: {
    host: '0.0.0.0',
    port: process.env.PORT ? parseInt(process.env.PORT) : 3000,
    allowedHosts: [
      'watch-engine.onrender.com',
      'localhost',
      '127.0.0.1'
    ]
  },
  server: {
    host: '0.0.0.0',
    port: process.env.PORT ? parseInt(process.env.PORT) : 3000,
    allowedHosts: [
      'watch-engine.onrender.com',
      'localhost',
      '127.0.0.1'
    ]
  }
})
